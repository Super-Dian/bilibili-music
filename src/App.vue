<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import StepAudio from "@/steps/audio.vue";
import StepCover from "@/steps/cover.vue";
import StepInfo from "@/steps/info.vue";
import StepMontage from "@/steps/clip.vue";
import StepLyrics from "@/steps/lyrics.vue";
import UiButton from "@/components/UiButton.vue";
import UiSteps from "@/components/UiSteps.vue";
import UiResult from "@/components/UiResult.vue";
import UiModal from "@/components/UiModal.vue";
import { fromData, normalizeRecordProcessingRule, reset, userConfig } from "./data";
import type { RecordData } from "./data";
import { clone } from "./utils/deepmerge";
import { GM_getValue, GM_setValue } from "$";
import { Message } from "@arco-design/web-vue";
import { logger } from "./utils/logger";
import {
  episodeSession,
  getActiveDefaultRule,
  registerEpisodeAppTransitionHandler,
  openMusicApp,
  stopEpisodeSession,
} from "./episode";
import type { EpisodeVideoData } from "./episode";
const visible = ref(true);
const current = ref(1);
const preparing = ref(true);
const preparingLabel = ref("正在准备下载信息…");
const batchStatus = ref("");
const steps = [StepMontage, StepInfo, StepCover, StepLyrics, StepAudio];
let initializationSequence = 0;
let unregisterTransitionHandler: (() => void) | null = null;

function applyProcessingRule(rule: RecordData) {
  const processing = normalizeRecordProcessingRule(rule);
  fromData.clipRanges = clone(processing.clipRanges);
  fromData.speed = processing.speed;
  fromData.record.clipRanges = clone(processing.clipRanges);
  fromData.record.speed = processing.speed;
}

const handleOk = () => {
  const defaultRule = getActiveDefaultRule();
  console.log("默认规则:", defaultRule);
  //return false;
  if (!defaultRule) {
    Message.error("未找到默认规则");
    return false;
  }
  applyProcessingRule(defaultRule);
  fromData.usedefaultconfig = true;
  onNext();
  // visible.value = false;
  //return false;
};

const handleCancel = () => {
  visible.value = false;
  setTimeout(() => stopEpisodeSession(true), 0);
};

const handleBackToPicker = async () => {
  visible.value = false;
  // 等待弹窗关闭后再打开选择页面
  setTimeout(async () => {
    stopEpisodeSession(false);
    await openMusicApp();
  }, 100);
};

function setCurrent(v: number) {
  current.value = v;
}

function onPrev() {
  current.value = Math.max(1, current.value - 1);
}

function onNext() {
  current.value = Math.min(steps.length, current.value + 1);
}

const sideShow = ref(true);
const fullscreen = ref(false);

function checkSide() {
  sideShow.value = !sideShow.value;
  GM_setValue("sideShow", sideShow.value);
}

function getEpisodeLabel(videoData: EpisodeVideoData | null) {
  return (
    videoData?._wasmMusicPickerTitle ||
    videoData?.part ||
    videoData?.title ||
    videoData?.bvid ||
    "当前视频"
  );
}

async function initializeEpisode(activeEpisode: EpisodeVideoData | null) {
  const sequence = ++initializationSequence;
  const episodeLabel = getEpisodeLabel(activeEpisode);
  preparing.value = true;
  preparingLabel.value = episodeSession.isBatch
    ? `正在准备 ${episodeSession.completed + 1}/${episodeSession.total}：${episodeLabel}`
    : "正在准备下载信息…";
  batchStatus.value = episodeSession.isBatch
    ? `批量任务 ${episodeSession.completed + 1}/${episodeSession.total} · ${episodeLabel}`
    : "";

  // 先卸载上一项的步骤组件，再清空共享数据；外层 Modal 始终保留。
  await nextTick();
  if (sequence !== initializationSequence) return;
  reset();
  current.value = 1;
  const bgmTag = activeEpisode?._wasmMusicSkipDomMetadata
    ? null
    : document.querySelector<HTMLDivElement & { __vue__: any }>(".tag .bgm-tag");
  const playerWrap = document.querySelector<HTMLDivElement & { __vue__: any }>("#playerWrap");
  const playerVideoData = playerWrap?.__vue__?.videoData as EpisodeVideoData | undefined;

  fromData.videoData = clone(activeEpisode || playerVideoData || null);
  if (!fromData.videoData) {
    fromData.err = "未找到视频数据，后续操作无法继续";
    preparing.value = false;
    return;
  }

  const music_id = bgmTag?.__vue__?.$props?.info?.music_id;
  if (music_id) {
    logger.debug("获取到的Music ID:", music_id, bgmTag?.__vue__);
    try {
      const res = await fetch(
        "https://api.bilibili.com/x/copyright-music-publicity/bgm/detail?" +
          new URLSearchParams({
            music_id,
          }),
      );
      const data = await res.json();
      if (sequence !== initializationSequence) return;
      fromData.data = data.data;
    } catch (error) {
      logger.warn("获取音乐信息失败，将按无音乐信息继续", error);
    }
  }

  if (sequence !== initializationSequence) return;

  if (episodeSession.auto) {
    const defaultRule = getActiveDefaultRule();
    if (defaultRule) {
      applyProcessingRule(defaultRule);
    }
    fromData.usedefaultconfig = true;
    current.value = 2;
    Message.info(
      `正在自动处理 ${episodeSession.completed + 1}/${episodeSession.total}：${episodeSession.activeVideoData?.part}`,
    );
  } else if (activeEpisode?._wasmMusicSkipMontage) {
    current.value = 2;
    Message.info("所选视频不是当前正在播放的视频，已跳过音频剪辑步骤");
  }
  preparing.value = false;
}

onMounted(() => {
  sideShow.value = GM_getValue("sideShow") !== false;
  unregisterTransitionHandler = registerEpisodeAppTransitionHandler((videoData) =>
    initializeEpisode(videoData),
  );
  void initializeEpisode(episodeSession.activeVideoData);
});

onUnmounted(() => {
  initializationSequence++;
  unregisterTransitionHandler?.();
  unregisterTransitionHandler = null;
});

function onOpen() {
  document.body.style.overflow = "unset";
}
</script>

<template>
  <UiModal
    v-model:visible="visible"
    title="音乐姬 >_< 下载服务🎶"
    :fullscreen="fullscreen"
    :maskClosable="false"
    :escToClose="false"
  >
    <template #footer>
      <div style="display: flex; justify-content: space-between">
        <div style="display: flex; gap: 8px">
          <UiButton @click="checkSide"> 侧栏 </UiButton>
        </div>
        <div style="display: flex; gap: 8px">
          <UiButton @click="handleCancel"> 取消 </UiButton>
          <UiButton type="primary" @click="handleOk"> 默认下载 </UiButton>
        </div>
      </div>
    </template>
    <div
      style="display: flex; justify-content: space-between; align-items: center; max-height: 75vh"
    >
      <UiSteps :current="current" @change="setCurrent" direction="vertical" size="small" v-show="sideShow">
        <div>音频剪辑</div>
        <div>基本信息</div>
        <div>封面获取</div>
        <div>歌词获取</div>
        <div>音频内嵌</div>
      </UiSteps>
      <div
        class="step-content"
        :style="{
          flex: 1,
          textAlign: 'center',
          minWidth: 0,
        }"
      >
        <div v-if="batchStatus" class="wasm-music-batch-status">{{ batchStatus }}</div>
        <UiResult
          v-if="preparing"
          status="info"
          :title="preparingLabel"
          subtitle="下载窗口会保持打开，并在这里切换到下一项"
        />
        <UiResult
          v-else-if="fromData.err"
          status="error"
          :title="fromData.err"
          subtitle="您可以重新打开弹窗, 重新获取数据, 或者刷新页面. 如果多次且更换视频也无法使用请联系开发者"
        />
        <component
          v-else
          :is="steps[current - 1]"
          @prev="onPrev"
          @next="onNext"
          @backToPicker="handleBackToPicker"
        />
      </div>
    </div>
  </UiModal>
</template>

<style>
.arco-modal-container,
.arco-modal-wrapper {
  pointer-events: none;
}
.arco-modal {
  pointer-events: auto;
  box-shadow: 0 0 20px 0 rgba(0, 0, 0, 0.1);
}
.step-content .arco-spin {
  width: 100%;
}
.wasm-music-batch-status {
  margin: 0 0 12px;
  padding: 7px 12px;
  color: var(--color-text-2);
  background: var(--color-fill-2);
  border-radius: 6px;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
}
</style>
