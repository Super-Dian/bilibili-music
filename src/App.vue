<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import StepAudio from "@/steps/audio.vue";
import StepCover from "@/steps/cover.vue";
import StepInfo from "@/steps/info.vue";
import StepMontage from "@/steps/clip.vue";
import StepLyrics from "@/steps/lyrics.vue";
import StepPicker from "@/steps/picker.vue";
import UiButton from "@/components/UiButton.vue";
import UiSteps from "@/components/UiSteps.vue";
import UiResult from "@/components/UiResult.vue";
import UiModal from "@/components/UiModal.vue";
import { fromData, normalizeRecordProcessingRule, reset, userConfig } from "./data";
import type { RecordData } from "./data";
import { clone } from "./utils/deepmerge";
import { GM_getValue, GM_setValue } from "$";
import { Message } from "@/utils/message";
import { logger } from "./utils/logger";
import {
  episodeSession,
  getActiveDefaultRule,
  registerEpisodeAppTransitionHandler,
  processEpisodeSelection,
  openMusicApp,
  stopEpisodeSession,
  launchNextEpisode,
} from "./episode";
import type { EpisodeVideoData, EpisodeSelection } from "./episode";

const visible = ref(true);
/** 0=picker(仅多集), 1=clip, 2=info, 3=cover, 4=lyrics, 5=audio */
const current = ref(1);
const preparing = ref(true);
const preparingLabel = ref("正在准备下载信息…");
const batchStatus = ref("");

/** 是否显示 picker 步骤（多集时显示） */
const hasPickerStep = computed(() => episodeSession.allEpisodes.length > 1);

/** 动态步骤数组 */
const steps = computed(() => {
  const list = [];
  if (hasPickerStep.value) list.push(StepPicker);
  list.push(StepMontage, StepInfo, StepCover, StepLyrics, StepAudio);
  return list;
});

/** 动态侧栏标签 */
const stepLabels = computed(() => {
  const labels = [];
  if (hasPickerStep.value) labels.push("选择剧集");
  labels.push("音频剪辑", "基本信息", "封面获取", "歌词获取", "音频内嵌");
  return labels;
});

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
  logger.info("[App] handleOk 调用", {
    hasDefaultRule: Boolean(defaultRule),
    isBatch: episodeSession.isBatch,
    hasActiveVideoData: Boolean(episodeSession.activeVideoData),
  });
  logger.info("默认规则:", { hasRule: Boolean(defaultRule) });
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

const handleBackToPicker = () => {
  if (hasPickerStep.value) {
    // 多集模式：回到 picker 步骤
    current.value = 0;
  } else {
    // 单集模式：关闭并重新打开
    visible.value = false;
    setTimeout(async () => {
      stopEpisodeSession(false);
      await openMusicApp();
    }, 100);
  }
};

function setCurrent(v: number) {
  current.value = v;
}

function onPrev() {
  current.value = Math.max(0, current.value - 1);
}

function onNext() {
  logger.info("[App] onNext 调用", {
    current: current.value,
    stepsLength: steps.value.length,
    nextValue: Math.min(steps.value.length - 1, current.value + 1),
  });
  current.value = Math.min(steps.value.length - 1, current.value + 1);
}

/** picker 步骤确认选择 */
async function onPickerConfirm(selection: EpisodeSelection) {
  try {
    await processEpisodeSelection(
      episodeSession.allEpisodes,
      episodeSession.pickerMeta,
      selection,
    );
    // 调用 launchNextEpisode 处理第一个剧集
    // launchNextEpisode 会设置 activeVideoData 并调用 appTransitionHandler
    // appTransitionHandler 会调用 initializeEpisode 来初始化第一个剧集
    launchNextEpisode();
  } catch (error) {
    logger.error("处理剧集选择失败", error);
    Message.error("处理选择失败");
  }
}

/** picker 步骤取消 */
function onPickerCancel() {
  visible.value = false;
  setTimeout(() => stopEpisodeSession(true), 0);
}

const sideShow = ref(true);
const fullscreen = ref(false);

/** picker 步骤时使用更大的窗口宽度 */
const modalWidth = computed(() => {
  // 只有在 picker 步骤时使用 900px，否则使用 520px
  if (hasPickerStep.value && current.value === 0) return 900;
  return 520;
});

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
  logger.info("[App] initializeEpisode 开始", {
    episodeLabel,
    isBatch: episodeSession.isBatch,
    auto: episodeSession.auto,
    completed: episodeSession.completed,
    total: episodeSession.total,
  });
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
  // 多集且未选择时停在 picker 步骤(0)，否则从 clip(1) 开始
  // 批量模式下，如果已经选择过剧集（isBatch为true），则不再显示picker步骤
  // 单个下载时，如果已经有 activeVideoData，也不再显示 picker 步骤
  const shouldShowPicker = hasPickerStep.value && !episodeSession.isBatch && !episodeSession.activeVideoData && !episodeSession.queue.length;
  // 动态步骤数组：有picker时 [picker, clip, info, ...]，无picker时 [clip, info, ...]
  // picker步骤=0，clip步骤=1（有picker时）或0（无picker时）
  current.value = shouldShowPicker ? 0 : (hasPickerStep.value ? 1 : 0);
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
    logger.info("[App] 自动模式处理", {
      completed: episodeSession.completed,
      total: episodeSession.total,
    });
    const defaultRule = getActiveDefaultRule();
    if (defaultRule) {
      applyProcessingRule(defaultRule);
    }
    fromData.usedefaultconfig = true;
    current.value = 2;
    Message.info(
      `正在自动处理 ${episodeSession.completed + 1}/${episodeSession.total}：${episodeSession.activeVideoData?.part}`,
    );
    // 自动模式下，延迟调用 handleOk 进入下一步
    setTimeout(() => {
      if (sequence !== initializationSequence) return;
      logger.info("[App] 自动模式调用 handleOk");
      handleOk();
    }, 100);
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
    :width="modalWidth"
    :fullscreen="fullscreen"
    :maskClosable="false"
    :escToClose="false"
  >
    <template #footer>
      <!-- picker 步骤时不显示 App 的 footer，由 picker 组件自己的 footer 替代 -->
      <div v-if="!(hasPickerStep && current === 0)" style="display: flex; justify-content: space-between">
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
      style="display: flex; justify-content: space-between; align-items: center; max-height: 80vh"
    >
      <UiSteps
        :current="current + 1"
        @change="setCurrent"
        direction="vertical"
        size="small"
        v-show="sideShow && !(hasPickerStep && current === 0)"
        :items="stepLabels.map(title => ({ title }))"
      />
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
          :is="steps[current]"
          v-bind="current === 0 && hasPickerStep ? {
            episodes: episodeSession.allEpisodes,
            currentIndex: episodeSession.currentEpisodeIndex,
            pickerMeta: episodeSession.pickerMeta,
            savedRule: getActiveDefaultRule(),
          } : {}"
          @prev="onPrev"
          @next="onNext"
          @backToPicker="handleBackToPicker"
          @confirm="onPickerConfirm"
          @cancel="onPickerCancel"
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
