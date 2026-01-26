<script lang="ts" setup>
import { ClipRanges, fromData, Lyrics } from "@/data";
import { request } from "@/utils/requests";
import Btn from "@/components/btn.vue";
import FileSaver from "file-saver";
import { GM_setValue } from "$";
import { fetchFile } from '@ffmpeg/util';
import { ffmpeg,ffmpegLoad } from "@/utils/ffmpeg";

const steps = [
  "获取音频",
  "下载音频",
  "解码音频\n可能出现假死,耐心等待解码耗时长",
  "下载封面",
  "开始内嵌",
  "准备下载",
];
const stepIndex = ref(0);
const error = ref<string | null>();

const fileBlob = ref<string | Blob>();
const status = computed(() =>
  error.value ? "error" : fileBlob.value ? "success" : null
);

function formatLrc(ms:number) {
  const m = Math.floor(ms / 60000).toString().padStart(2, '0');
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return `[${m}:${s}]`;
}
function getKeepRanges(deleteRanges: ClipRanges, totalDurationMs: number = Infinity) {
  // 1. 合并 & 排序删除区间 (复用你的 Rust 逻辑思想)
  const sorted = [...deleteRanges].sort((a, b) => a[0] - b[0]);
  const merged: ClipRanges = [];
  if (sorted.length > 0) {
    let curr = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i][0] <= curr[1]) curr[1] = Math.max(curr[1], sorted[i][1]);
      else { merged.push(curr); curr = sorted[i]; }
    }
    merged.push(curr);
  }

  // 2. 反转逻辑：生成保留区间
  const keep: Array<{ start: number; end?: number }> = [];
  let lastPos = 0;
  
  for (const [dStart, dEnd] of merged) {
    if (dStart > lastPos) {
      keep.push({ start: lastPos / 1000, end: dStart / 1000 }); // 转换为秒
    }
    lastPos = dEnd;
  }
  // 添加最后一段 (到文件结束)
  keep.push({ start: lastPos / 1000 }); 
  
  return { keepRanges: keep, mergedDeleteRanges: merged };
}

function processLyrics(lyrics: Lyrics, deleteRanges: ClipRanges, speed: number) {
  const { mergedDeleteRanges } = getKeepRanges(deleteRanges); 

  return lyrics.reduce<Lyrics>((acc, [ms, text]) => {
  let time = ms;
  // 1. 减去被删掉的长度 (只计算在该歌词时间戳之前的删除区间)
  const deletedBefore = mergedDeleteRanges
    .filter(([start]) => ms >= start)
    .reduce((sum, [start, end]) => {
      const actualEnd = Math.min(ms, end);
      return sum + (actualEnd - start);
    }, 0);
  
  time -= deletedBefore;
  
  // 2. 检查歌词是否在删除区间内
  const isDeleted = mergedDeleteRanges.some(([start, end]) => ms >= start && ms < end);
  
  if (!isDeleted) {
    acc.push([time / speed, text]);
  }
  return acc;
}, []);
}

function main() {
  stepIndex.value = 0;
  const avid = fromData.playerData?.aid;
  const cid = fromData.playerData?.cid;
  error.value = null;
  fileBlob.value = undefined;
  request
    .get({
      url: `https://api.bilibili.com/x/player/playurl?qn=120&otype=json&fourk=1&fnver=0&fnval=4048&avid=${avid}&cid=${cid}`,
    })
    .then(async (res: any) => {
      await ffmpegLoad()
      let audioUrl = undefined;
      let dash = res.data.dash;
      if (!dash) {
        error.value = "未找到音频";
        return;
      }
      /*
      优先检测 flac：如果存在 Hi-Res 无损，取其 baseUrl。
      其次检测 dolby：如果是杜比全景声，取其 base_url。
      最后降级到 audio 数组：取该数组最大 bandwidth。
      */
      if (dash.flac && dash.flac.audio) {
        audioUrl = dash.flac.audio.base_url || dash.flac.audio.baseUrl;
      }
      if (!audioUrl && dash.dolby && dash.dolby.audio) {
        audioUrl = dash.dolby.audio[0].base_url;
      }
      if (!audioUrl && dash.audio) {
        const bestAudio = dash.audio.reduce((prev:any, current:any) => 
          (prev.bandwidth > current.bandwidth) ? prev : current
        );
        audioUrl =  bestAudio.base_url||bestAudio.baseUrl;
      }
      stepIndex.value++;
      await ffmpeg.writeFile("input.m4s",await fetchFile(audioUrl))
      // https://wiki.multimedia.cx/index.php/FFmpeg_Metadata
      const inputArgs = ['-i', 'input.m4s'];
      const processArgs = [];
      let filterChains:string[] = [];
      let lastStreamLabel = '[0:a]';
      const { keepRanges } = getKeepRanges(fromData.clipRanges||[]);
      if (keepRanges.length > 0) {
        const segmentLabels:string[] = [];
        keepRanges.forEach((r, i) => {
          const endStr = r.end ? `:end=${r.end}` : '';
          const label = `[a${i}]`;
          filterChains.push(`[0:a]atrim=start=${r.start}${endStr},asetpts=PTS-STARTPTS${label}`);
          segmentLabels.push(label);
        });
        if (segmentLabels.length > 1) {
          const concatLabel = '[out_clip]';
          filterChains.push(`${segmentLabels.join('')}concat=n=${segmentLabels.length}:v=0:a=1${concatLabel}`);
          lastStreamLabel = concatLabel;
        } else {
          // 如果只有一个片段，不需要 concat，直接指向该片段
          lastStreamLabel = segmentLabels[0];
        }
      }
      if (fromData.speed !== 1) {
        const speedLabel = '[final_a]';
        filterChains.push(`${lastStreamLabel}atempo=${fromData.speed}${speedLabel}`);
        lastStreamLabel = speedLabel;
        processArgs.push('-c:a', 'aac', '-q:a', '2');
      } else {
        if (filterChains.length > 0) {
          processArgs.push('-c:a', 'aac', '-q:a', '2');
        } else {
          processArgs.push('-c:a', 'copy');
        }
      }
      if (filterChains.length > 0) {
        processArgs.push('-filter_complex', filterChains.join(';'));
      }
      processArgs.push('-map', lastStreamLabel === '[0:a]' ? '0:a' : lastStreamLabel);
      const metadataArgs = [
        '-metadata', `title=${fromData.title}`,
        '-metadata', `artist=${fromData.author}`,
        '-metadata', `source_url=${location.href.split("?")[0]}`,
        '-metadata', `publisher=${location.href.split("?")[0]}`,
        '-metadata', `encoded_by=ocyss/wasm-music`,
        '-metadata', `comment=Wasm🎶音乐姬下载,仅供个人学习使用,严谨售卖和其他侵权行为`,
      ];
      if (fromData.coverUrl) {
        await ffmpeg.writeFile("cover.jpg",await fetchFile(fromData.coverUrl!.replace("http://", "https://")))
        inputArgs.push('-i', 'cover.jpg');
        processArgs.push('-map', '1:0');
        processArgs.push('-c:v', 'mjpeg');
        processArgs.push('-disposition:v', 'attached_pic');
      }
      
      if (fromData.lyricsData && fromData.lyricsData.length>0){
        const finalLyrics = processLyrics(
            fromData.lyricsData, 
            fromData.clipRanges || [], 
            fromData.speed || 1
          );
        const header = [
          `[ti:${fromData.title}]`,              // 标题
          `[ar:${fromData.author}]`,             // 艺术家
          `[al:${fromData.data?.album || ""}]`,  // 专辑
          `[re:ocyss/wasm-music]`,               // 制作工具
          `[ve:1.0.0]`,                          // 版本
          `[url: ${location.href.split("?")[0]}]`,

        ].filter(line => !line.includes(": ]"));

        const lrcString = [...header,...finalLyrics
          .map(item => `${formatLrc(item[0])} ${item[1]}`)]
          .join("\n");
          
        metadataArgs.push('-metadata', `lyrics=${lrcString}`);
      }
      if (fromData.data?.album){
        metadataArgs.push(...[
          '-metadata', `album=${fromData.data.album}`,
        ])
      }
      if (fromData.data?.music_publish){
        metadataArgs.push(...[
          '-metadata', `date=${fromData.data.music_publish}`,
        ])
      }
      await ffmpeg.exec([
          ...inputArgs,
          ...processArgs,
          ...metadataArgs,
          'output.m4a'
      ]);
      const fileData = await ffmpeg.readFile('output.m4a');
      
      fileBlob.value = typeof fileData==='string' ? fileData : new Blob([fileData as Uint8Array<ArrayBuffer>], { type:"audio/m4a"});
      stepIndex.value = steps.length - 1
    })
}

const download = () => {
  if (!fileBlob.value) {
    error.value = "文件为空";
    return;
  }
  FileSaver.saveAs(fileBlob.value, fromData.file ?? "bilibili_music.m4a");
};

onMounted(() => {
  main();
});


const saveDefault = () => {
  GM_setValue("default_rule", JSON.parse(JSON.stringify(fromData.record)));
};
</script>

<template>
  <div class="audio">
    <a-result
      :status="status"
      :title="error ?? `${stepIndex + 1}/${steps.length}:${steps[stepIndex]}`"
    >
      <template #icon v-if="status === null">
        <div class="loader">
          <svg class="circle-outer" viewBox="0 0 86 86">
            <circle class="back" cx="43" cy="43" r="40"></circle>
            <circle class="front" cx="43" cy="43" r="40"></circle>
            <circle class="new" cx="43" cy="43" r="40"></circle>
          </svg>
          <svg class="circle-middle" viewBox="0 0 60 60">
            <circle class="back" cx="30" cy="30" r="27"></circle>
            <circle class="front" cx="30" cy="30" r="27"></circle>
          </svg>
          <svg class="circle-inner" viewBox="0 0 34 34">
            <circle class="back" cx="17" cy="17" r="14"></circle>
            <circle class="front" cx="17" cy="17" r="14"></circle>
          </svg>
        </div>
      </template>
      <template #extra>
        <a-space v-if="stepIndex === steps.length - 1">
          <a-tooltip
            content="点击无反应/卡死/闪退,可去油猴配置(初学,高级)下更换下载模式尝试"
            position="top"
          >
            <a-button @click="download">开始下载</a-button>
          </a-tooltip>
        </a-space>
      </template>
    </a-result>
    <a-button @click="saveDefault">保存为默认规则</a-button>
    <Btn
      @prev="$emit('prev')"
      @next="main"
      :next="{ disabled: !fileBlob }"
      nextLabel="重试"
    />
  </div>
</template>

<style scoped>
* {
  white-space: pre-wrap;
}
.audio {
  display: flex;
  align-items: center;
  flex-direction: column;
}

.loader {
  --front-color: var(--brand_blue);
  --back-color: #c3c8de;
  --text-color: #414856;
  width: 100%;
  height: 64px;
  border-radius: 50px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 15px;
  svg {
    position: absolute;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  svg circle {
    position: absolute;
    fill: none;
    stroke-width: 6px;
    stroke-linecap: round;
    stroke-linejoin: round;
    transform: rotate(-100deg);
    transform-origin: center;
  }
  svg circle.back {
    stroke: var(--back-color);
  }

  svg circle.front {
    stroke: var(--front-color);
  }
  svg.circle-outer {
    height: 86px;
    width: 86px;
  }
  svg.circle-outer circle {
    stroke-dasharray: 62.75 188.25;
  }
  svg.circle-outer circle.back {
    animation: circle-outer135 1.8s ease infinite 0.3s;
  }
  svg.circle-outer circle.front {
    animation: circle-outer135 1.8s ease infinite 0.15s;
  }
  svg.circle-middle {
    height: 60px;
    width: 60px;
  }
  svg.circle-middle circle {
    stroke-dasharray: 42.5 127.5;
  }
  svg.circle-middle circle.back {
    animation: circle-middle6123 1.8s ease infinite 0.25s;
  }
  svg.circle-middle circle.front {
    animation: circle-middle6123 1.8s ease infinite 0.1s;
  }
  svg.circle-inner {
    height: 34px;
    width: 34px;
  }
  svg.circle-inner circle {
    stroke-dasharray: 22 66;
  }
  svg.circle-inner circle.back {
    animation: circle-inner162 1.8s ease infinite 0.2s;
  }
  svg.circle-inner circle.front {
    animation: circle-inner162 1.8s ease infinite 0.05s;
  }
}

@keyframes circle-outer135 {
  0% {
    stroke-dashoffset: 25;
  }

  25% {
    stroke-dashoffset: 0;
  }

  65% {
    stroke-dashoffset: 301;
  }

  80% {
    stroke-dashoffset: 276;
  }

  100% {
    stroke-dashoffset: 276;
  }
}

@keyframes circle-middle6123 {
  0% {
    stroke-dashoffset: 17;
  }

  25% {
    stroke-dashoffset: 0;
  }

  65% {
    stroke-dashoffset: 204;
  }

  80% {
    stroke-dashoffset: 187;
  }

  100% {
    stroke-dashoffset: 187;
  }
}

@keyframes circle-inner162 {
  0% {
    stroke-dashoffset: 9;
  }

  25% {
    stroke-dashoffset: 0;
  }

  65% {
    stroke-dashoffset: 106;
  }

  80% {
    stroke-dashoffset: 97;
  }

  100% {
    stroke-dashoffset: 97;
  }
}
</style>
