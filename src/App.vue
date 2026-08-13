<script setup lang="ts">
import { onMounted, ref } from "vue";
import StepAudio from "@/steps/audio.vue";
import StepCover from "@/steps/cover.vue";
import StepInfo from "@/steps/info.vue";
import StepMontage from "@/steps/clip.vue";
import StepLyrics from "@/steps/lyrics.vue";
import { fromData, normalizeRecordProcessingRule, reset, type RecordData } from "./data";
import { clone } from "./utils/deepmerge";
import { GM_getValue, GM_setValue } from "$";
import { Message } from "@arco-design/web-vue";
import { logger } from "./utils/logger";
import {
  episodeSession,
  getActiveDefaultRule,
  openMusicApp,
  stopEpisodeSession,
  type EpisodeVideoData,
} from "./episode";
const visible = ref(true);
const current = ref(1);
const steps = [StepMontage, StepInfo, StepCover, StepLyrics, StepAudio];

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

onMounted(async () => {
  sideShow.value = GM_getValue("sideShow") !== false;
  //每次运行都重置数据
  reset();
  const activeEpisode = episodeSession.activeVideoData;
  const bgmTag = activeEpisode?._wasmMusicSkipDomMetadata
    ? null
    : document.querySelector<HTMLDivElement & { __vue__: any }>(".tag .bgm-tag");
  const playerWrap = document.querySelector<HTMLDivElement & { __vue__: any }>("#playerWrap");
  const playerVideoData = playerWrap?.__vue__?.videoData as EpisodeVideoData | undefined;

  fromData.videoData = clone(activeEpisode || playerVideoData || null);
  if (!fromData.videoData) {
    fromData.err = "未找到视频数据，后续操作无法继续";
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
      fromData.data = data.data;
    } catch (error) {
      logger.warn("获取音乐信息失败，将按无音乐信息继续", error);
    }
  }

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
});

function onOpen() {
  document.body.style.overflow = "unset";
}
</script>

<template>
  <a-modal
    v-model:visible="visible"
    @open="onOpen"
    :maskClosable="false"
    :escToClose="false"
    :closable="false"
    :mask="false"
    :fullscreen="fullscreen"
    draggable
  >
    <template #title
      >音乐姬{{ ">_<" }}下载服务🎶
      <a-button
        style="position: absolute; right: 20px"
        @click="fullscreen = !fullscreen"
        size="small"
      >
        <template #icon>
          <icon-expand v-if="fullscreen" />
          <icon-shrink v-else />
        </template>
      </a-button>
    </template>
    <template #footer>
      <div style="display: flex; justify-content: space-between">
        <a-space>
          <a-button @click="checkSide"> 侧栏 </a-button>
        </a-space>
        <a-space>
          <a-button @click="handleCancel"> 取消 </a-button>
          <a-button type="primary" @click="handleOk"> 默认下载 </a-button>
        </a-space>
      </div>
    </template>
    <div
      style="display: flex; justify-content: space-between; align-items: center; max-height: 75vh"
    >
      <a-steps :current="current" @change="setCurrent" direction="vertical" small v-show="sideShow">
        <a-step>音频剪辑</a-step>
        <a-step>基本信息</a-step>
        <a-step>封面获取</a-step>
        <a-step>歌词获取</a-step>
        <a-step>音频内嵌</a-step>
      </a-steps>
      <div
        class="step-content"
        :style="{
          flex: 1,
          textAlign: 'center',
          minWidth: 0,
        }"
      >
        <a-result
          v-if="fromData.err"
          status="error"
          :title="fromData.err"
          subtitle="您可以重新打开弹窗, 重新获取数据, 或者刷新页面. 如果多次且更换视频也无法使用请联系开发者"
        />
        <component
          :is="steps[current - 1]"
          @prev="onPrev"
          @next="onNext"
          @backToPicker="handleBackToPicker"
        />
      </div>
    </div>
  </a-modal>
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
</style>
