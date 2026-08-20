<script lang="ts" setup>
import { fromData } from "@/data";
import { onMounted, onUnmounted, ref, computed, watch } from "vue";
import Btn from "@/components/btn.vue";
import UiButton from "@/components/UiButton.vue";
import UiSpin from "@/components/UiSpin.vue";
import { episodeSession } from "@/episode";

interface DeletedSection {
  start: number;
  end: number;
  id: number;
}

let video: HTMLVideoElement | null = null;
let timelineEl: HTMLElement | null = null;
let ratechangeHandler: ((this: HTMLVideoElement, ev: Event) => any) | null = null;
let rafId = 0;
let seekTarget: number | null = null;
const currentTime = ref(0);
const duration = ref(0);
// 虚拟位置：驱动蓝色指针，与 video.currentTime 解耦
const displayTime = ref(0);
const deletedSections = ref<DeletedSection[]>([]);
const isRecording = ref(false);
const tempStart = ref(0);
const isAuditioning = ref(false);
const isPlaying = ref(false);

// 倍速控制
const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];
const selectedSpeed = ref<number>(1);

// 添加时间提示和拖动状态
const isDragging = ref(false);
const hoverTime = ref<number | null>(null);
// 复用 tooltipStyle 对象，避免每次创建新对象
const tooltipState = { left: "0px", display: "none" };
const tooltipStyle = ref({ ...tooltipState });

// timeupdate 驱动：播放时由视频自身通知时间变化，同步到 displayTime
const handleTimeSync = () => {
  if (video) {
    const t = video.currentTime;
    displayTime.value = t;
    currentTime.value = t;
  }
};

// 格式化时间显示
const formatTime = (time: number) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

// 计算时间位置
const calculateTimeFromEvent = (event: MouseEvent, element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  return (offsetX / rect.width) * duration.value;
};

// 处理鼠标移动（节流：使用 requestAnimationFrame）
const handleTimelineMouseMove = (event: MouseEvent) => {
  const timeline = (event.currentTarget as HTMLElement) || timelineEl;
  if (!timeline) return;

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    const time = calculateTimeFromEvent(event, timeline);
    hoverTime.value = time;

    // 复用 tooltipState 对象，只更新变化的属性
    tooltipState.left = `${event.clientX}px`;
    tooltipState.display = "block";
    tooltipStyle.value = { ...tooltipState };

    // 拖动时：立即移动指针（视觉响应），记录 seek 目标（mouseup 后 seek）
    if (isDragging.value) {
      displayTime.value = time;
      currentTime.value = time;
      seekTarget = time;
    }
  });
};

// 处理鼠标离开
const handleTimelineMouseLeave = () => {
  if (!isDragging.value) {
    hoverTime.value = null;
    tooltipStyle.value.display = "none";
  }
};

// 处理鼠标按下
const handleTimelineMouseDown = (event: MouseEvent) => {
  isDragging.value = true;
  document.addEventListener("mousemove", handleDocumentMouseMove);
  document.addEventListener("mouseup", handleDocumentMouseUp);
};

// 处理文档鼠标移动（拖动时，使用缓存的 timelineEl）
const handleDocumentMouseMove = (event: MouseEvent) => {
  if (isDragging.value && timelineEl) {
    handleTimelineMouseMove({
      ...event,
      currentTarget: timelineEl,
    } as MouseEvent);
  }
};

// 处理文档鼠标松开（拖动结束后一次性 seek）
const handleDocumentMouseUp = () => {
  isDragging.value = false;
  hoverTime.value = null;
  tooltipStyle.value.display = "none";
  // 拖动结束后执行实际 seek
  if (seekTarget !== null && video) {
    video.currentTime = seekTarget;
    seekTarget = null;
  }
  document.removeEventListener("mousemove", handleDocumentMouseMove);
  document.removeEventListener("mouseup", handleDocumentMouseUp);
};

// 从当前开始删除（删除从当前到结尾的部分）
const startFromCurrent = () => {
  deletedSections.value.push({
    start: currentTime.value,
    end: duration.value,
    id: Date.now(),
  });
  sortSections();
  mergeSections();
};

// 删除到当前（删除从开始到当前的部分）
const endAtCurrent = () => {
  deletedSections.value.push({
    start: 0,
    end: currentTime.value,
    id: Date.now(),
  });
  sortSections();
  mergeSections();
};

// 开始记录要删除的片段
const startRecording = () => {
  isRecording.value = true;
  tempStart.value = currentTime.value;
};

// 结束记录要删除的片段
const endRecording = () => {
  if (currentTime.value === tempStart.value) {
    isRecording.value = false;
    return;
  }
  if (isRecording.value) {
    deletedSections.value.push({
      start: tempStart.value,
      end: currentTime.value,
      id: Date.now(),
    });
    isRecording.value = false;
    sortSections();
    mergeSections();
  }
};

// 删除标记的删除片段
const removeSection = (id: number) => {
  deletedSections.value = deletedSections.value.filter((section) => section.id !== id);
};

// 按时间排序删除片段
const sortSections = () => {
  deletedSections.value.sort((a, b) => a.start - b.start);
};

// 合并重叠的删除片段
const mergeSections = () => {
  if (deletedSections.value.length <= 1) return;

  const merged: DeletedSection[] = [];
  let current = { ...deletedSections.value[0] };

  for (let i = 1; i < deletedSections.value.length; i++) {
    const section = deletedSections.value[i];
    if (section.start <= current.end) {
      // 有重叠，合并片段
      current.end = Math.max(current.end, section.end);
    } else {
      // 无重叠，保存当前片段并开始新片段
      merged.push(current);
      current = { ...section };
    }
  }
  merged.push(current);

  deletedSections.value = merged;
};

function seekTo(time: number) {
  if (video) {
    video.currentTime = time;
  }
}

// 添加临时记录片段的显示
const tempSection = computed(() => {
  if (!isRecording.value) return null;
  return {
    start: tempStart.value,
    end: currentTime.value,
  };
});

// 预计算合并后的删除区间（已排序、无重叠），用于试听时二分查找
const mergedDeletedRanges = computed(() => {
  const sections = deletedSections.value;
  if (sections.length === 0) return [];
  const sorted = [...sections].sort((a, b) => a.start - b.start);
  const merged: [number, number][] = [];
  let cur: [number, number] = [sorted[0].start, sorted[0].end];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= cur[1]) {
      cur = [cur[0], Math.max(cur[1], sorted[i].end)];
    } else {
      merged.push(cur);
      cur = [sorted[i].start, sorted[i].end];
    }
  }
  merged.push(cur);
  return merged;
});

// 二分查找：判断时间是否在某个删除区间内，返回跳转目标或 -1
const findSkipTarget = (time: number): number => {
  const ranges = mergedDeletedRanges.value;
  let lo = 0,
    hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [s, e] = ranges[mid];
    if (time < s) {
      hi = mid - 1;
    } else if (time >= e) {
      lo = mid + 1;
    } else {
      // time 在 [s, e) 内，跳转到 e
      return e;
    }
  }
  return -1;
};

// 修改试听功能，添加跳过删除片段的逻辑
const startAudition = () => {
  if (isAuditioning.value) {
    if (video) {
      video.pause();
      isAuditioning.value = false;
    }
  } else {
    isAuditioning.value = true;
    if (video) {
      video.currentTime = 0;
      video.play().catch((error) => {
        console.error("视频播放失败:", error);
        isAuditioning.value = false;
      });
    }
  }
};

// 添加视频时间更新处理函数（主要用于试听跳转，指针由 rAF 驱动）
const handleTimeUpdate = () => {
  if (!video) return;

  // 试听时检查是否在删除片段中（二分查找优化）
  if (isAuditioning.value) {
    const target = findSkipTarget(video.currentTime);
    if (target !== -1) {
      video.currentTime = target;
    }
  }
};

// 添加播放/暂停功能
const togglePlay = () => {
  if (!video) return;

  if (isPlaying.value) {
    video.pause();
  } else {
    video.play().catch((error) => {
      console.error("视频播放失败:", error);
    });
  }
};

// 提取事件处理函数
const handlePlay = () => {
  isPlaying.value = true;
};

const handlePause = () => {
  isPlaying.value = false;
};

const handleEnded = () => {
  isAuditioning.value = false;
};

onMounted(() => {
  video = document.querySelector(`.bpx-player-video-wrap video`);
  timelineEl = document.querySelector(`.timeline`);
  if (video) {
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("timeupdate", handleTimeSync);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    currentTime.value = video.currentTime;
    duration.value = video.duration;
    displayTime.value = video.currentTime;

    // 初始化倍速值，尝试读取 B 站播放器的 playbackRate
    selectedSpeed.value = video.playbackRate || 1;
    fromData.speed = selectedSpeed.value;

    // 监听外部倍速变化（例如用户在原播放器界面修改）
    ratechangeHandler = () => {
      selectedSpeed.value = video?.playbackRate ?? selectedSpeed.value;
      fromData.speed = selectedSpeed.value;
    };
    video.addEventListener("ratechange", ratechangeHandler);
  }
  if (fromData.usedefaultconfig) {
    next();
  }
});

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId);
  timelineEl = null;
  if (video) {
    video.removeEventListener("timeupdate", handleTimeUpdate);
    video.removeEventListener("timeupdate", handleTimeSync);
    video.removeEventListener("ended", handleEnded);
    video.removeEventListener("play", handlePlay);
    video.removeEventListener("pause", handlePause);
    if (ratechangeHandler) video.removeEventListener("ratechange", ratechangeHandler);
  }
  document.removeEventListener("mousemove", handleDocumentMouseMove);
  document.removeEventListener("mouseup", handleDocumentMouseUp);
});

// 当选择的倍速发生变化时，同步到 video 与 fromData
watch(selectedSpeed, (val) => {
  if (video) video.playbackRate = val;
  fromData.speed = val;
});

// 时间输入框
const timeInput = ref("0:00");
const isTimeInputFocused = ref(false);

// 将秒数格式化为 mm:ss
const formatTimeInput = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// 解析 mm:ss 或 m:ss 或纯秒数，返回秒数；无效返回 NaN
const parseTimeInput = (val: string): number => {
  const trimmed = val.trim();
  // 纯数字视为秒数
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  // mm:ss 或 m:ss
  const match = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (match) {
    return Number(match[1]) * 60 + Number(match[2]);
  }
  return Number.NaN;
};

// displayTime 变化时同步到输入框（输入框聚焦时不同步，避免干扰用户输入）
watch(displayTime, (t) => {
  if (!isTimeInputFocused.value) {
    timeInput.value = formatTimeInput(t);
  }
});

// 用户按下回车或失焦时跳转
const seekToTimeInput = () => {
  const sec = parseTimeInput(timeInput.value);
  if (Number.isNaN(sec)) {
    // 输入无效，回退为当前时间
    timeInput.value = formatTimeInput(displayTime.value);
    return;
  }
  // 溢出判断：钳制到 [0, duration]
  const clamped = Math.max(0, Math.min(sec, duration.value));

  displayTime.value = clamped;
  currentTime.value = clamped;

  if (video) {
    requestAnimationFrame(() => {
      video!.currentTime = clamped;
    });
  }
  // 回退为格式化后的值
  timeInput.value = formatTimeInput(clamped);
};

// 添加进度条点击跳转（立即移动指针，异步 seek 不阻塞 UI）
const handleTimelineClick = (event: MouseEvent) => {
  const timeline = event.currentTarget as HTMLElement;
  const rect = timeline.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const percentage = offsetX / rect.width;
  const newTime = percentage * duration.value;

  // 立即移动指针（视觉响应）
  displayTime.value = newTime;
  currentTime.value = newTime;

  // 异步 seek（不阻塞 UI）
  if (video) {
    requestAnimationFrame(() => {
      video!.currentTime = newTime;
    });
  }
};

const emits = defineEmits(["next", "backToPicker"]);

function backToPicker() {
  emits("backToPicker");
}

function next() {
  fromData.clipRanges = deletedSections.value.map((section) => [
    Math.round(section.start * 1000),
    Math.round(section.end * 1000),
  ]);
  // 将当前倍速写入 fromData，供后续下载使用
  fromData.speed = selectedSpeed.value;
  fromData.record.clipRanges =
    fromData.clipRanges.length > 0
      ? fromData.clipRanges.map(([start, end]) => [start, end] as [number, number])
      : null;
  fromData.record.speed = fromData.speed;
  emits("next");
}
</script>

<template>
  <div class="montage-container">
    <UiSpin :loading="isAuditioning">
      <!-- 倍速控制 + 时间输入 -->
      <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 16px">
        <div style="display: flex; align-items: center; gap: 8px">
          <label style="font-size: 13px">倍速：</label>
          <select v-model.number="selectedSpeed" class="speed-select">
            <option v-for="s in speedOptions" :key="s" :value="s">{{ s }}x</option>
          </select>
        </div>
        <div style="display: flex; align-items: center; gap: 6px">
          <label style="font-size: 13px">时间：</label>
          <input
            v-model="timeInput"
            class="time-input"
            placeholder="0:00"
            @focus="isTimeInputFocused = true"
            @blur="
              isTimeInputFocused = false;
              seekToTimeInput();
            "
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
          <span style="font-size: 12px; color: #999">/ {{ formatTimeInput(duration) }}</span>
        </div>
      </div>
      <!-- 控制按钮 -->
      <div class="control-buttons">
        <div class="control-row">
          <UiButton @click="endAtCurrent">从这开头</UiButton>
          <UiButton @click="startFromCurrent">到这结尾</UiButton>
        </div>
        <div class="control-row">
          <UiButton type="primary" @click="startRecording" :disabled="isRecording">
            <template #icon>
              <svg v-if="!isPlaying" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M8 5v14l11-7z" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            </template>
            开始记录
          </UiButton>
          <UiButton @click="togglePlay">
            <template #icon>
              <svg v-if="!isPlaying" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M8 5v14l11-7z" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            </template>
          </UiButton>
          <UiButton @click="endRecording" :disabled="!isRecording" type="primary">
            <template #icon>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </template>
            结束记录
          </UiButton>
        </div>
      </div>

      <!-- 进度条 -->
      <div
        class="timeline"
        v-if="duration"
        @mousemove="handleTimelineMouseMove"
        @mouseleave="handleTimelineMouseLeave"
        @mousedown="handleTimelineMouseDown"
        @click="handleTimelineClick"
      >
        <div class="timeline-inner">
          <div
            v-for="section in deletedSections"
            :key="section.id"
            class="deleted-segment"
            :style="{
              left: `${(section.start / duration) * 100}%`,
              width: `${((section.end - section.start) / duration) * 100}%`,
            }"
          ></div>
          <div
            v-if="tempSection"
            class="recording-segment"
            :style="{
              left: `${(tempSection.start / duration) * 100}%`,
              width: `${((tempSection.end - tempSection.start) / duration) * 100}%`,
            }"
          ></div>
        </div>
        <div
          class="current-time-marker"
          :style="{ left: `calc(${(displayTime / duration) * 100}% - 1px)` }"
        ></div>
        <!-- 添加时间提示 -->
        <div v-if="hoverTime !== null" class="time-tooltip" :style="tooltipStyle">
          {{ formatTime(hoverTime) }}
        </div>
      </div>

      <!-- 删除片段列表 -->
      <div class="deleted-list" style="max-height: 200px; overflow-y: auto; margin-top: 16px">
        <div
          v-for="section in deletedSections"
          :key="section.id"
          class="deleted-list-item"
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px;
            border-bottom: 1px solid #e3e5e7;
          "
        >
          <span style="margin-right: 10px">
            <a @click="seekTo(section.start)">{{ section.start.toFixed(2) }}s</a>
            -
            <a @click="seekTo(section.end)">{{ section.end.toFixed(2) }}s</a>
          </span>
          <UiButton status="danger" @click="removeSection(section.id)">
            <template #icon>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </template>
          </UiButton>
        </div>
      </div>
    </UiSpin>
    <div
      style="display: flex; justify-content: center; align-items: center; margin: 20px 0; gap: 10px"
    >
      <UiButton v-if="episodeSession.hasMultiplePages" @click="backToPicker"> 返回选择 </UiButton>
      <UiButton @click="startAudition">
        {{ !isAuditioning ? "试听" : "暂停" }}
      </UiButton>
      <UiButton type="primary" @click="next"> 下一步 </UiButton>
    </div>
  </div>
</template>

<style scoped>
.montage-container {
  padding: 20px;
}

.speed-select,
.time-input {
  padding: 6px 12px;
  font-size: 14px;
  border: 1px solid #c9ccd0;
  border-radius: 6px;
  background: #fff;
  color: #18191c;
  cursor: pointer;
  outline: none;
}

.time-input {
  width: 72px;
  font-family: monospace;
  cursor: text;
}

.speed-select:focus,
.time-input:focus {
  border-color: #00aeec;
  box-shadow: 0 0 0 2px rgba(0, 174, 236, 0.15);
}

.control-buttons {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-row {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.timeline {
  height: 30px;
  background: #52c41a;
  position: relative;
  margin: 20px 0;
  cursor: pointer;
  user-select: none; /* 防止拖动时选中文本 */
}

.timeline-inner {
  height: 100%;
  position: relative;
}

.deleted-segment {
  position: absolute;
  top: 0;
  height: 100%;
  background: #ff4d4f; /* 删除部分显示红色 */
  opacity: 0.6;
}

.current-time-marker {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  background: #1890ff;
}

.sections-list {
  margin-top: 20px;
}

.section-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.recording-segment {
  position: absolute;
  top: 0;
  height: 100%;
  background: #722ed1; /* 使用紫色表示正在记录 */
  opacity: 0.6;
}

.time-tooltip {
  position: fixed;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.75);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none; /* 防止提示框影响鼠标事件 */
  top: -30px; /* 调整提示框位置 */
  z-index: 1;
}
</style>

<style>
/* 深色模式：下拉框、时间输入 */
body[arco-theme="dark"] .speed-select,
body[data-theme="dark"] .speed-select,
body[arco-theme="dark"] .time-input,
body[data-theme="dark"] .time-input {
  background: #2a2a2a;
  color: #e0e0e0;
  border-color: #555;
}

/* 深色模式：删除片段列表项边框 */
body[arco-theme="dark"] .deleted-list-item,
body[data-theme="dark"] .deleted-list-item {
  border-color: #444 !important;
  color: #e0e0e0;
}

/* 深色模式：删除列表项链接 */
body[arco-theme="dark"] .deleted-list-item a,
body[data-theme="dark"] .deleted-list-item a {
  color: #00aeec;
}

/* 深色模式：删除按钮（x按钮）- 红色危险按钮在深色模式下使用透明背景 */
body[arco-theme="dark"] .ui-btn-secondary.ui-btn-danger,
body[data-theme="dark"] .ui-btn-secondary.ui-btn-danger {
  background: transparent;
  color: #ff4d4f;
  border-color: #ff4d4f;
}

body[arco-theme="dark"] .ui-btn-secondary.ui-btn-danger:hover:not(.ui-btn-disabled),
body[data-theme="dark"] .ui-btn-secondary.ui-btn-danger:hover:not(.ui-btn-disabled) {
  background: #ff4d4f;
  color: #fff;
}
</style>
