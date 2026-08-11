<script lang="ts" setup>
import { ClipRanges, fromData, Lyrics } from "@/data";
import { request } from "@/utils/requests";
import { logger } from "@/utils/logger";
import Btn from "@/components/btn.vue";
import { GM_setValue } from "$";
import { saveAs } from "file-saver";
import {
  cleanupFFmpegFiles,
  ffmpegLoad,
  getFFmpeg,
  getFFmpegDiagnostics,
  terminateFFmpeg,
} from "@/utils/ffmpeg";
import { Message } from "@arco-design/web-vue";
import {
  episodeSession,
  failEpisodeDownload,
  finishEpisodeDownload,
  getEpisodeSourceUrl,
  registerActiveEpisodeOperationCanceller,
} from "@/episode";
import { clone } from "@/utils/deepmerge";
import {
  beginDownloadTask,
  setDownloadTaskRule,
  updateDownloadTask,
  updateTaskCenterRuntime,
} from "@/taskCenter";
import { downloadBinary, isAbortError } from "@/utils/download";

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
const loadMsg = ref("");
const status = computed(() => (error.value ? "error" : fileBlob.value ? "success" : null));
let downloadTriggered = false;
let operationController: AbortController | null = null;

function activeTaskId() {
  return episodeSession.activeVideoData?._wasmMusicTaskId;
}

function reportTask(stage: string, progress?: number | null) {
  updateDownloadTask(activeTaskId(), { stage, progress });
}

function cancelCurrentOperation() {
  operationController?.abort();
  terminateFFmpeg();
  updateTaskCenterRuntime({
    ffmpegStatus: "idle",
    ffmpegMessage: "当前 FFmpeg 操作已终止，下次任务会重新初始化",
  });
}

function handleAudioFailure(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason || "未知错误");
  logger.error("[audio]", reason);
  error.value = message;
  loadMsg.value = "";
  failEpisodeDownload(message);
}

function formatLrc(ms: number) {
  const m = Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0");
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `[${m}:${s}]`;
}
function getKeepRanges(deleteRanges: ClipRanges, totalDurationMs: number = Infinity) {
  const durationLimit =
    Number.isFinite(totalDurationMs) && totalDurationMs > 0 ? totalDurationMs : Infinity;
  // 1. 根据当前分集时长裁剪、合并并排序删除区间
  const sorted = deleteRanges
    .map(
      ([start, end]) =>
        [
          Math.max(0, Math.min(durationLimit, Number(start))),
          Math.max(0, Math.min(durationLimit, Number(end))),
        ] as [number, number],
    )
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0]);
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

  if (merged.length === 0) {
    return { keepRanges: [], mergedDeleteRanges: merged };
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
  if (!Number.isFinite(durationLimit) || lastPos < durationLimit) {
    keep.push({ start: lastPos / 1000 });
  }

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

async function main() {
  stepIndex.value = 0;
  const avid = fromData.playerData?.aid || fromData.videoData?.aid;
  const cid = fromData.playerData?.cid || fromData.videoData?.cid;
  error.value = null;
  fileBlob.value = undefined;
  downloadTriggered = false;
  operationController?.abort();
  const controller = new AbortController();
  operationController = controller;
  registerActiveEpisodeOperationCanceller(cancelCurrentOperation);
  beginDownloadTask(activeTaskId(), "获取音轨信息");
  reportTask("获取音轨信息", 2);
  if (!avid || !cid) {
    handleAudioFailure("未找到当前分集的 aid/cid");
    operationController = null;
    registerActiveEpisodeOperationCanceller(null);
    return;
  }
  try {
    const res: any = await request.get({
      url: `https://api.bilibili.com/x/player/playurl?qn=120&otype=json&fourk=1&fnver=0&fnval=4048&avid=${avid}&cid=${cid}`,
      signal: controller.signal,
    });
    let audioUrl: string | undefined;
    const dash = res?.data?.dash;
    if (!dash) {
      throw new Error("playurl 未返回可用音轨");
    }
    /* 优先无损，其次杜比，最后选择普通音轨中码率最高的一条。 */
    if (dash.flac?.audio) {
      audioUrl = dash.flac.audio.base_url || dash.flac.audio.baseUrl;
    }
    if (!audioUrl && Array.isArray(dash.dolby?.audio) && dash.dolby.audio.length > 0) {
      audioUrl = dash.dolby.audio[0].base_url || dash.dolby.audio[0].baseUrl;
    }
    if (!audioUrl && Array.isArray(dash.audio) && dash.audio.length > 0) {
      const bestAudio = dash.audio.reduce((prev: any, current: any) =>
        prev.bandwidth > current.bandwidth ? prev : current,
      );
      audioUrl = bestAudio.base_url || bestAudio.baseUrl;
    }
    if (!audioUrl) {
      throw new Error("playurl 音轨缺少下载地址");
    }

    reportTask("检查 FFmpeg 缓存与运行环境", 5);
    updateTaskCenterRuntime({
      ffmpegStatus: "loading",
      ffmpegMessage: "正在检查缓存并初始化",
    });
    const ffmpeg = await ffmpegLoad((message) => {
      loadMsg.value = message;
      reportTask(message, 8);
      updateTaskCenterRuntime({ ffmpegStatus: "loading", ffmpegMessage: message });
    }, controller.signal);
    const ffmpegDiagnostics = getFFmpegDiagnostics();
    updateTaskCenterRuntime({
      ffmpegStatus: "ready",
      ffmpegMessage: `已就绪（${ffmpegDiagnostics.provider || "未知来源"}${
        ffmpegDiagnostics.loadedFromCache ? " / 本地缓存" : ""
      }）`,
      ffmpegProvider: ffmpegDiagnostics.provider,
      ffmpegMode: ffmpegDiagnostics.mode,
      cacheAvailable: ffmpegDiagnostics.cacheAvailable,
    });
    loadMsg.value = "";
    stepIndex.value++;
    reportTask("下载音频", 15);
    const audioBytes = await downloadBinary(audioUrl, {
      signal: controller.signal,
      onProgress: ({ loaded, percent }) => {
        const megabytes = (loaded / 1024 / 1024).toFixed(1);
        reportTask(
          `下载音频${percent === null ? `（${megabytes} MB）` : `（${Math.round(percent)}%）`}`,
          percent === null ? 20 : 15 + percent * 0.4,
        );
      },
    });
    if (controller.signal.aborted) return;
    await cleanupFFmpegFiles(["input.m4s", "cover.jpg", "output.m4a"]);
    await ffmpeg.writeFile("input.m4s", audioBytes);
    stepIndex.value++;
    reportTask("分析剪辑、倍速与元数据", 58);
    // https://wiki.multimedia.cx/index.php/FFmpeg_Metadata
    const inputArgs = ["-i", "input.m4s"];
    const processArgs = [];
    let filterChains: string[] = [];
    let lastStreamLabel = "[0:a]";
    const totalDurationMs = Math.max(0, Number(fromData.videoData?.duration) || 0) * 1000;
    const { keepRanges, mergedDeleteRanges } = getKeepRanges(
      fromData.clipRanges || [],
      totalDurationMs,
    );
    if (mergedDeleteRanges.length > 0 && keepRanges.length === 0) {
      throw new Error("剪辑范围覆盖了当前分集的全部音频");
    }
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
    const episodeSourceUrl = getEpisodeSourceUrl();
    const metadataArgs = [
      "-metadata",
      `title=${fromData.title}`,
      "-metadata",
      `artist=${fromData.author}`,
      "-metadata",
      `source_url=${episodeSourceUrl}`,
      "-metadata",
      `publisher=${episodeSourceUrl}`,
      "-metadata",
      `encoded_by=ocyss/wasm-music`,
      "-metadata",
      `comment=Wasm🎶音乐姬下载,仅供个人学习使用,严谨售卖和其他侵权行为`,
    ];
    if (fromData.coverUrl) {
      stepIndex.value = 3;
      reportTask("下载封面", 62);
      const coverBytes = await downloadBinary(fromData.coverUrl.replace("http://", "https://"), {
        signal: controller.signal,
        onProgress: ({ percent }) =>
          reportTask("下载封面", percent === null ? 64 : 62 + percent * 0.04),
      });
      await ffmpeg.writeFile("cover.jpg", coverBytes);
      inputArgs.push("-i", "cover.jpg");
      processArgs.push("-map", "1:0");
      processArgs.push("-c:v", "copy");
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
        `[url: ${episodeSourceUrl}]`,
      ].filter((line) => !line.includes(": ]"));

      const lrcString = [
        ...header,
        ...finalLyrics.map((item) => `${formatLrc(item[0])} ${item[1]}`),
      ].join("\n");

      if (fromData.externalLyrics) {
        // 外置歌词：单独下载 .lrc 文件，不嵌入音频
        const lrcBlob = new Blob([lrcString], { type: "text/lrc;charset=utf-8" });
        const lrcFileName = (fromData.file ?? "bilibili_music").replace(/\.\w+$/, "") + ".lrc";
        saveAs(lrcBlob, lrcFileName);
      } else {
        metadataArgs.push("-metadata", `lyrics=${lrcString}`);
      }
    }
    if (fromData.data?.album) {
      metadataArgs.push("-metadata", `album=${fromData.data.album}`);
    }
    if (fromData.data?.music_publish) {
      metadataArgs.push("-metadata", `date=${fromData.data.music_publish}`);
    }
    stepIndex.value = 4;
    reportTask("FFmpeg 正在处理音频", 68);
    const progressHandler = ({ progress }: { progress: number }) => {
      if (Number.isFinite(progress)) {
        reportTask("FFmpeg 正在处理音频", 68 + Math.max(0, Math.min(1, progress)) * 27);
      }
    };
    ffmpeg.on("progress", progressHandler);
    let exitCode: number;
    try {
      exitCode = await ffmpeg.exec([...inputArgs, ...processArgs, ...metadataArgs, "output.m4a"]);
    } finally {
      ffmpeg.off("progress", progressHandler);
    }
    if (exitCode !== 0) {
      throw new Error(`FFmpeg 处理失败，退出码 ${exitCode}`);
    }
    const fileData = await ffmpeg.readFile("output.m4a");
    if (
      (typeof fileData === "string" && fileData.length === 0) ||
      (typeof fileData !== "string" && fileData.byteLength === 0)
    ) {
      throw new Error("FFmpeg 未生成有效的音频文件");
    }

    fileBlob.value =
      typeof fileData === "string"
        ? fileData
        : new Blob([fileData as BlobPart], { type: "audio/m4a" });
    stepIndex.value = steps.length - 1;
    reportTask("音频已生成，等待保存", 98);
    if (episodeSession.isBatch && episodeSession.auto) {
      const activeVideoData = episodeSession.activeVideoData;
      setTimeout(() => {
        if (
          episodeSession.isBatch &&
          episodeSession.auto &&
          episodeSession.activeVideoData === activeVideoData
        ) {
          download();
        }
      }, 300);
    }
  } catch (reason) {
    if (controller.signal.aborted || isAbortError(reason)) {
      error.value = "任务已取消";
      loadMsg.value = "";
      return;
    }
    const diagnostics = getFFmpegDiagnostics();
    if (!diagnostics.loaded && diagnostics.lastError) {
      updateTaskCenterRuntime({
        ffmpegStatus: "error",
        ffmpegMessage: diagnostics.lastError,
      });
    }
    handleAudioFailure(reason);
  } finally {
    if (operationController === controller) {
      operationController = null;
      registerActiveEpisodeOperationCanceller(null);
    }
    await cleanupFFmpegFiles(["input.m4s", "cover.jpg", "output.m4a"]);
  }
  if (fromData.usedefaultconfig) {
    fromData.usedefaultconfig = false;
  }
}

const download = () => {
  if (!fileBlob.value) {
    handleAudioFailure("文件为空");
    return;
  }
  if (episodeSession.isBatch && downloadTriggered) {
    return;
  }
  downloadTriggered = true;
  const url =
    typeof fileBlob.value === "string" ? fileBlob.value : URL.createObjectURL(fileBlob.value);
  const baseFileName = fromData.file || "bilibili_music.m4a";
  const pagePrefix =
    episodeSession.activeVideoData?._wasmMusicBatchPrefix ||
    `P${String(episodeSession.activeVideoData?.page || 1).padStart(2, "0")}`;
  const finalFileName = episodeSession.isBatch ? `${pagePrefix}_${baseFileName}` : baseFileName;

  // GM_download({
  //   url,
  //   name: fromData.file ?? "bilibili_music.m4a",
  //   downloadMode: "browser",
  // } as GmDownloadRequest & { [key: string]: any });

  try {
    const link = document.createElement("a");
    link.download = finalFileName;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (downloadError) {
    if (typeof fileBlob.value !== "string") {
      URL.revokeObjectURL(url);
    }
    handleAudioFailure(downloadError);
    return;
  }
  if (typeof fileBlob.value !== "string") {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  if (episodeSession.isBatch && !episodeSession.manualEach) {
    if (!episodeSession.rule) {
      episodeSession.rule = clone(fromData.record);
      setDownloadTaskRule(episodeSession.rule, true);
    }
    episodeSession.auto = true;
  }
  finishEpisodeDownload(finalFileName);
};

onMounted(() => {
  main();
});

const saveDefault = () => {
  GM_setValue("default_rule", JSON.parse(JSON.stringify(fromData.record)));
  Message.success("已保存为默认规则");
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
          <a-button @click="download">开始下载</a-button>
        </a-space>
      </template>
    </a-result>
    <div v-if="loadMsg" class="load-msg">{{ loadMsg }}</div>
    <a-button @click="saveDefault">保存为默认规则</a-button>
    <Btn
      @prev="$emit('prev')"
      @next="main"
      :next="{ disabled: !fileBlob && !error }"
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
.load-msg {
  font-size: 12px;
  color: #999;
  margin-top: -8px;
  margin-bottom: 8px;
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
