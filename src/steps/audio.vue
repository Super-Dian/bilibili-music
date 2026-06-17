<script lang="ts" setup>
import { ClipRanges, fromData, Lyrics } from "@/data";
import { request } from "@/utils/requests";
import { logger } from "@/utils/logger";
import Btn from "@/components/btn.vue";
import FileSaver from "file-saver";
import { GM_setValue } from "$";
import { fetchFile } from "@ffmpeg/util";
import { ffmpeg, ffmpegLoad } from "@/utils/ffmpeg";

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
const status = computed(() => (error.value ? "error" : fileBlob.value ? "success" : null));

function formatLrc(ms: number) {
  const m = Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0");
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
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
      else {
        merged.push(curr);
        curr = sorted[i];
      }
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
  logger.info("[audio] main() 开始, avid=%s, cid=%s", avid, cid);
  request
    .get({
      url: `https://api.bilibili.com/x/player/playurl?qn=120&otype=json&fourk=1&fnver=0&fnval=4048&avid=${avid}&cid=${cid}`,
    })
    .then(async (res: any) => {
      logger.info("[audio] playurl 响应已收到, status=%s", res.status);
      logger.debug("[audio] playurl 响应 data:", JSON.stringify(res.data).slice(0, 500));
      await ffmpegLoad();
      logger.info("[audio] ffmpegLoad 完成");
      logger.info("[audio] 线程模式: %s", window.crossOriginIsolated ? "多线程" : "单线程 (性能受限)");
      logger.info("[audio] 当前处理参数: clipRanges=%s 段, speed=%s, cover=%s, lyrics=%s",
        (fromData.clipRanges || []).length, fromData.speed || 1,
        fromData.coverUrl ? "有" : "无",
        fromData.lyricsData?.length ? `${fromData.lyricsData.length}行` : "无");
      let audioUrl = undefined;
      let dash = res.data.dash;
      if (!dash) {
        logger.error("[audio] dash 为空, 无法找到音频流");
        error.value = "未找到音频";
        return;
      }
      logger.info("[audio] dash 结构: flac=%s, dolby=%s, audio数组长度=%s",
        !!dash.flac, !!dash.dolby, dash.audio?.length ?? 0);
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
        const bestAudio = dash.audio.reduce((prev: any, current: any) =>
          prev.bandwidth > current.bandwidth ? prev : current,
        );
        audioUrl = bestAudio.base_url || bestAudio.baseUrl;
        logger.debug("[audio] 选择 audio 数组最大带宽: %s, codec=%s", bestAudio.bandwidth, bestAudio.codecs);
      }
      logger.info("[audio] 选定音频URL: %s", audioUrl ? audioUrl.slice(0, 120) + "..." : "undefined");
      stepIndex.value++;
      logger.info("[audio] 开始下载音频流 (fetchFile)...");
      const audioData = await fetchFile(audioUrl);
      logger.info("[audio] 音频下载完成, 大小=%s bytes", (audioData as Uint8Array).byteLength);
      await ffmpeg.writeFile("input.m4s", audioData);
      logger.info("[audio] input.m4s 写入 ffmpeg 虚拟文件系统完成");
      // https://wiki.multimedia.cx/index.php/FFmpeg_Metadata
      const inputArgs = ["-i", "input.m4s"];
      const processArgs = [];
      let filterChains: string[] = [];
      let lastStreamLabel = "[0:a]";
      const { keepRanges } = getKeepRanges(fromData.clipRanges || []);
      if (keepRanges.length > 0) {
        const segmentLabels: string[] = [];
        keepRanges.forEach((r, i) => {
          const endStr = r.end ? `:end=${r.end}` : "";
          const label = `[a${i}]`;
          filterChains.push(`[0:a]atrim=start=${r.start}${endStr},asetpts=PTS-STARTPTS${label}`);
          segmentLabels.push(label);
        });
        if (segmentLabels.length > 1) {
          const concatLabel = "[out_clip]";
          filterChains.push(
            `${segmentLabels.join("")}concat=n=${segmentLabels.length}:v=0:a=1${concatLabel}`,
          );
          lastStreamLabel = concatLabel;
        } else {
          // 如果只有一个片段，不需要 concat，直接指向该片段
          lastStreamLabel = segmentLabels[0];
        }
      }
      if (fromData.speed !== 1) {
        const speedLabel = "[final_a]";
        filterChains.push(`${lastStreamLabel}atempo=${fromData.speed}${speedLabel}`);
        lastStreamLabel = speedLabel;
        processArgs.push("-c:a", "aac", "-q:a", "2");
      } else {
        if (filterChains.length > 0) {
          processArgs.push("-c:a", "aac", "-q:a", "2");
        } else {
          processArgs.push("-c:a", "copy");
        }
      }
      if (filterChains.length > 0) {
        processArgs.push("-filter_complex", filterChains.join(";"));
      }
      processArgs.push("-map", lastStreamLabel === "[0:a]" ? "0:a" : lastStreamLabel);
      const metadataArgs = [
        "-metadata",
        `title=${fromData.title}`,
        "-metadata",
        `artist=${fromData.author}`,
        "-metadata",
        `source_url=${location.href.split("?")[0]}`,
        "-metadata",
        `publisher=${location.href.split("?")[0]}`,
        "-metadata",
        `encoded_by=ocyss/wasm-music`,
        "-metadata",
        `comment=Wasm🎶音乐姬下载,仅供个人学习使用,严谨售卖和其他侵权行为`,
      ];
      if (fromData.coverUrl) {
        logger.info("[audio] 开始下载封面: %s", fromData.coverUrl!.slice(0, 100));
        const coverData = await fetchFile(fromData.coverUrl!.replace("http://", "https://"));
        logger.info("[audio] 封面下载完成");
        await ffmpeg.writeFile("cover.jpg", coverData);
        logger.info("[audio] cover.jpg 写入完成");
        inputArgs.push("-i", "cover.jpg");
        processArgs.push("-map", "1:0");
        processArgs.push("-c:v", "mjpeg");
        processArgs.push("-disposition:v", "attached_pic");
      }

      if (fromData.lyricsData && fromData.lyricsData.length > 0) {
        const finalLyrics = processLyrics(
          fromData.lyricsData,
          fromData.clipRanges || [],
          fromData.speed || 1,
        );
        const header = [
          `[ti:${fromData.title}]`, // 标题
          `[ar:${fromData.author}]`, // 艺术家
          `[al:${fromData.data?.album || ""}]`, // 专辑
          `[re:ocyss/wasm-music]`, // 制作工具
          `[ve:1.0.0]`, // 版本
          `[url: ${location.href.split("?")[0]}]`,
        ].filter((line) => !line.includes(": ]"));

        const lrcString = [
          ...header,
          ...finalLyrics.map((item) => `${formatLrc(item[0])} ${item[1]}`),
        ].join("\n");

        metadataArgs.push("-metadata", `lyrics=${lrcString}`);
      }
      if (fromData.data?.album) {
        metadataArgs.push("-metadata", `album=${fromData.data.album}`);
      }
      if (fromData.data?.music_publish) {
        metadataArgs.push("-metadata", `date=${fromData.data.music_publish}`);
      }
      // 探测输入文件 (会触发 ffmpeg:raw 输出到主控制台, 可看到 codec/duration)
      /*try {
        console.log("%c[audio] ffprobe: 检测输入文件...", "color:#37C5D6");
        await ffmpeg.exec(["-i", "input.m4s", "-f", "null", "-"]);
      } catch {
        // -i 输出到 stderr 然后退出, 预期行为; 信息已通过 log 事件打印
      }*/

      const execArgs = [...inputArgs, ...processArgs, ...metadataArgs, "output.m4a"];
      const hasFilters = filterChains.length > 0;
      const codecIdx = processArgs.indexOf("-c:a");
      const codecMode = codecIdx !== -1 ? processArgs[codecIdx + 1] : "copy";

      // 关键信息同步输出到主控制台
      console.log("%c[audio] === FFmpeg exec 开始 ===", "color:#EFC441;font-weight:bold");
      console.log("%c[audio] 编码模式:", "color:#EFC441", `-c:a ${codecMode}, filterComplex=${hasFilters ? "有" : "无"}, 保留段数=${keepRanges.length}`);
      console.log("%c[audio] 完整命令:", "color:#EFC441", execArgs.join(" "));

      const execStartTime = Date.now();
      // 看门狗: 每 5 秒打印到主控制台
      let watchdogCount = 0;
      const watchdog = setInterval(() => {
        watchdogCount++;
        const elapsed = ((Date.now() - execStartTime) / 1000).toFixed(1);
        const mem = (performance as any).memory;
        const memInfo = mem
          ? `JS堆=${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB/${(mem.jsHeapSizeLimit / 1048576).toFixed(0)}MB`
          : "N/A";
        console.warn(`%c[audio] ⏳ exec 仍在运行... 已等待 ${elapsed}s (第 ${watchdogCount} 次) | ${memInfo}`, "color:#FF6257");
      }, 5000);
      try {
        await ffmpeg.exec(execArgs);
      } finally {
        clearInterval(watchdog);
      }
      const execElapsed = Date.now() - execStartTime;
      console.log(`%c[audio] === FFmpeg exec 完成 === 耗时 ${(execElapsed / 1000).toFixed(1)}s`, "color:#42CA8C;font-weight:bold");
      logger.info("[audio] 开始读取 output.m4a...");
      const fileData = await ffmpeg.readFile("output.m4a");
      logger.info("[audio] output.m4a 读取完成, 大小=%s bytes", (fileData as Uint8Array).byteLength);

      fileBlob.value =
        typeof fileData === "string"
          ? fileData
          : new Blob([fileData as Uint8Array<ArrayBuffer>], { type: "audio/m4a" });
      stepIndex.value = steps.length - 1;
      logger.info("[audio] 全部完成 ✓");
    })
    .catch((e: any) => {
      logger.error("[audio] 处理过程出错:", e?.message ?? e);
      logger.error("[audio] 错误堆栈:", e?.stack);
      error.value = e?.message ?? String(e);
    });
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
    <Btn @prev="$emit('prev')" @next="main" :next="{ disabled: !fileBlob }" nextLabel="重试" />
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
