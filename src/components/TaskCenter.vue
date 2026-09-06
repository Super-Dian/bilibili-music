<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  getTaskCenterState,
  getTaskCenterRuntime,
  getTaskCenterActions,
  subscribeTaskCenter,
  clearFinishedDownloadTasks,
} from "@/taskCenter";
import type { DownloadTaskStatus } from "@/taskCenter";

const panelOpen = ref(false);
const state = ref(getTaskCenterState());
const runtime = ref(getTaskCenterRuntime());

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  unsubscribe = subscribeTaskCenter(() => {
    state.value = getTaskCenterState();
    runtime.value = getTaskCenterRuntime();
  });
  window.addEventListener("wasm-music-close-task-panel", handleClosePanelEvent);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
});

onUnmounted(() => {
  unsubscribe?.();
  window.removeEventListener("wasm-music-close-task-panel", handleClosePanelEvent);
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
});

const unfinishedCount = computed(
  () =>
    state.value.tasks.filter((task) => ["queued", "running", "paused"].includes(task.status))
      .length,
);

const failedCount = computed(
  () => state.value.tasks.filter((task) => task.status === "failed").length,
);

const badgeText = computed(() =>
  String(failedCount.value || unfinishedCount.value || state.value.tasks.length),
);

const hasError = computed(() => failedCount.value > 0);

const successCount = computed(
  () => state.value.tasks.filter((task) => task.status === "success").length,
);

const terminalCount = computed(
  () =>
    state.value.tasks.filter((task) => ["success", "failed", "cancelled"].includes(task.status))
      .length,
);

const overallProgress = computed(() =>
  state.value.tasks.length ? (terminalCount.value / state.value.tasks.length) * 100 : 0,
);

const hasActive = computed(() => state.value.tasks.some((task) => task.status === "running"));

const hasPending = computed(() =>
  state.value.tasks.some((task) => ["queued", "paused"].includes(task.status)),
);

const hasFailed = computed(() => state.value.tasks.some((task) => task.status === "failed"));

// 动作处理
function handlePause() {
  getTaskCenterActions().pause();
}

function handleResume() {
  const actions = getTaskCenterActions();
  const snapshot = state.value;
  const active = snapshot.tasks.some((task) => task.status === "running");
  const hasInterrupted =
    !actions.hasLiveSession() && !active && snapshot.tasks.some((task) => task.status === "paused");
  if (hasInterrupted) actions.resumeInterrupted();
  else actions.resume();
}

function handleRetry() {
  getTaskCenterActions().retryFailed();
}

function handleCancel() {
  getTaskCenterActions().cancel();
}

function statusLabel(status: DownloadTaskStatus) {
  return {
    queued: "等待",
    running: "处理中",
    paused: "暂停",
    success: "成功",
    failed: "失败",
    cancelled: "取消",
  }[status];
}

function togglePanel() {
  panelOpen.value = !panelOpen.value;
}

function closePanel() {
  panelOpen.value = false;
}

function handleClearAndClose() {
  panelOpen.value = false;
  // 等待退出动画完成后再清除任务
  setTimeout(() => {
    clearFinishedDownloadTasks();
  }, 200);
}

// ---- 主窗口打开时自动关闭面板 ----
function handleClosePanelEvent() {
  panelOpen.value = false;
}

// ---- 拖拽功能 ----
const panelRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });
const panelStyle = ref<Record<string, string>>({});

function handleHeaderMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;
  // 排除按钮点击
  if ((event.target as HTMLElement).closest(".wasm-music-task-close")) return;

  const panel = panelRef.value;
  if (!panel) return;

  isDragging.value = true;
  const rect = panel.getBoundingClientRect();
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  panelStyle.value = {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    right: "auto",
    bottom: "auto",
  };
  event.preventDefault();
}

function handleMouseMove(event: MouseEvent) {
  if (!isDragging.value) return;
  const newX = event.clientX - dragOffset.value.x;
  const newY = event.clientY - dragOffset.value.y;
  panelStyle.value = {
    ...panelStyle.value,
    left: `${newX}px`,
    top: `${newY}px`,
  };
}

function handleMouseUp() {
  isDragging.value = false;
}
</script>

<template>
  <div
    v-if="state.tasks.length > 0"
    class="wasm-music-task-center"
    data-testid="wasm-music-task-center"
  >
    <!-- FAB 按钮 -->
    <button
      class="wasm-music-task-fab"
      data-testid="wasm-music-task-fab"
      type="button"
      @click="togglePanel"
    >
      任务
      <span class="wasm-music-task-badge" :class="{ 'is-error': hasError }">
        {{ badgeText }}
      </span>
    </button>

    <!-- 任务面板 -->
    <Transition name="wasm-music-task-panel">
      <section
        v-if="panelOpen"
        ref="panelRef"
        class="wasm-music-task-panel"
        :class="{ 'is-dragging': isDragging }"
        :style="panelStyle"
        data-testid="wasm-music-task-panel"
      >
        <!-- 头部 -->
        <header class="wasm-music-task-header" @mousedown="handleHeaderMouseDown">
          <div>
            <strong>{{ state.title }}</strong>
            <small
              >成功 {{ successCount }} · 失败 {{ failedCount }} · 共 {{ state.tasks.length }}</small
            >
          </div>
          <button
            class="wasm-music-task-close"
            type="button"
            aria-label="收起任务中心"
            @click="closePanel"
          >
            ×
          </button>
        </header>

        <!-- 总进度条 -->
        <div class="wasm-music-task-overall">
          <span :style="{ width: `${overallProgress}%` }"></span>
        </div>

        <!-- FFmpeg 状态 -->
        <div class="wasm-music-task-diagnostics" :class="`is-${runtime.ffmpegStatus}`">
          FFmpeg：{{ runtime.ffmpegMessage }}
        </div>

        <!-- 控制按钮 -->
        <div class="wasm-music-task-controls">
          <button
            v-if="hasPending && !state.paused"
            class="wasm-music-task-btn"
            data-testid="wasm-music-task-pause"
            type="button"
            @click="handlePause"
          >
            当前项完成后暂停
          </button>
          <button
            v-if="state.paused && hasPending"
            class="wasm-music-task-btn is-primary"
            data-testid="wasm-music-task-resume"
            type="button"
            @click="handleResume"
          >
            继续队列
          </button>
          <button
            v-if="!hasActive && !hasPending && hasFailed"
            class="wasm-music-task-btn is-primary"
            data-testid="wasm-music-task-retry"
            type="button"
            @click="handleRetry"
          >
            重试失败项
          </button>
          <button
            v-if="hasActive || hasPending"
            class="wasm-music-task-btn is-danger"
            data-testid="wasm-music-task-cancel"
            type="button"
            @click="handleCancel"
          >
            取消任务
          </button>
          <button
            v-if="!hasActive && !hasPending"
            class="wasm-music-task-btn"
            type="button"
            @click="handleClearAndClose"
          >
            清除记录
          </button>
        </div>

        <!-- 任务列表 -->
        <div class="wasm-music-task-list">
          <article
            v-for="(task, index) in state.tasks"
            :key="task.id"
            class="wasm-music-task-row"
            :class="`is-${task.status}`"
            :data-task-id="task.id"
          >
            <div class="wasm-music-task-row-top">
              <span class="wasm-music-task-label" :title="`${task.bvid} · P${task.page}`">
                {{ index + 1 }}. {{ task.label }}
              </span>
              <span class="wasm-music-task-status">
                {{ statusLabel(task.status) }}
              </span>
            </div>
            <div class="wasm-music-task-stage">
              {{ task.error || task.stage }}
            </div>
            <div class="wasm-music-task-progress">
              <span :style="{ width: `${task.progress ?? 0}%` }"></span>
            </div>
          </article>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.wasm-music-task-center {
  position: fixed;
  right: 18px;
  bottom: 80px;
  z-index: 10070;
}

.wasm-music-task-fab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  padding: 0;
  color: #fff;
  background: linear-gradient(135deg, #00aeec, #1684d6);
  border: 0;
  border-radius: 50%;
  box-shadow: 0 6px 20px rgba(0, 102, 170, 0.3);
  cursor: pointer;
  font-family: Arial, "Microsoft YaHei", sans-serif;
  font-size: 12px;
  font-weight: 700;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.wasm-music-task-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 9px 26px rgba(0, 102, 170, 0.38);
}

.wasm-music-task-fab:focus-visible {
  outline: 3px solid rgba(0, 174, 236, 0.32);
  outline-offset: 3px;
}

.wasm-music-task-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 19px;
  height: 19px;
  padding: 0 4px;
  color: #fff;
  background: #f59e0b;
  border: 2px solid #fff;
  border-radius: 11px;
  font-size: 10px;
  line-height: 1;
}

.wasm-music-task-badge.is-error {
  background: #f04a4a;
}

.wasm-music-task-panel {
  position: fixed;
  right: 76px;
  bottom: 80px;
  z-index: 10080;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(430px, calc(100vw - 104px));
  max-height: min(680px, calc(100vh - 40px));
  overflow: hidden;
  color: #18191c;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid #e3e5e7;
  border-radius: 14px;
  box-shadow: 0 18px 52px rgba(0, 0, 0, 0.24);
  font-family: Arial, "Microsoft YaHei", sans-serif;
  backdrop-filter: blur(12px);
}

.wasm-music-task-panel.is-dragging {
  transition: none;
  user-select: none;
}

.wasm-music-task-panel.is-dragging .wasm-music-task-header {
  cursor: grabbing;
}

.wasm-music-task-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 16px 11px;
  cursor: move;
  user-select: none;
}

.wasm-music-task-header > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.wasm-music-task-header strong {
  overflow: hidden;
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wasm-music-task-header small {
  color: #61666d;
  font-size: 12px;
}

.wasm-music-task-close {
  width: 30px;
  height: 30px;
  padding: 0;
  color: #61666d;
  background: transparent;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
}

.wasm-music-task-close:hover {
  color: #18191c;
  background: #f1f2f3;
}

.wasm-music-task-overall,
.wasm-music-task-progress {
  overflow: hidden;
  background: #e3e5e7;
}

.wasm-music-task-overall {
  height: 4px;
}

.wasm-music-task-overall span,
.wasm-music-task-progress span {
  display: block;
  height: 100%;
  background: #00aeec;
  transition: width 0.22s ease;
}

.wasm-music-task-diagnostics {
  margin: 11px 16px 0;
  padding: 8px 10px;
  color: #61666d;
  background: #f6f7f8;
  border-radius: 7px;
  font-size: 12px;
  line-height: 1.45;
}

.wasm-music-task-diagnostics.is-error {
  color: #b42318;
  background: #fff1f0;
}

.wasm-music-task-diagnostics.is-ready {
  color: #087443;
  background: #ecfdf3;
}

.wasm-music-task-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 11px 16px;
  border-bottom: 1px solid #e3e5e7;
}

.wasm-music-task-btn {
  padding: 6px 10px;
  color: #18191c;
  background: #fff;
  border: 1px solid #c9ccd0;
  border-radius: 7px;
  cursor: pointer;
  font-size: 12px;
}

.wasm-music-task-btn:hover {
  color: #00a1d6;
  border-color: #00aeec;
}

.wasm-music-task-btn.is-primary {
  color: #fff;
  background: #00aeec;
  border-color: #00aeec;
}

.wasm-music-task-btn.is-danger {
  color: #d92d20;
  border-color: #fda29b;
}

.wasm-music-task-list {
  display: flex;
  min-height: 90px;
  padding: 10px;
  overflow: auto;
  flex-direction: column;
  gap: 8px;
}

.wasm-music-task-row {
  padding: 9px 10px;
  background: #f6f7f8;
  border: 1px solid transparent;
  border-radius: 8px;
}

.wasm-music-task-row.is-running {
  background: #effaff;
  border-color: #7dd3fc;
}

.wasm-music-task-row.is-failed {
  background: #fff6f5;
  border-color: #fda29b;
}

.wasm-music-task-row.is-success {
  background: #f0fdf4;
}

.wasm-music-task-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.wasm-music-task-label {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wasm-music-task-status {
  flex: 0 0 auto;
  color: #61666d;
  font-size: 11px;
}

.wasm-music-task-stage {
  margin-top: 4px;
  overflow: hidden;
  color: #61666d;
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wasm-music-task-progress {
  height: 3px;
  margin-top: 7px;
  border-radius: 2px;
}

.wasm-music-task-row.is-failed .wasm-music-task-progress span,
.wasm-music-task-row.is-cancelled .wasm-music-task-progress span {
  background: #f04438;
}

.wasm-music-task-row.is-success .wasm-music-task-progress span {
  background: #12b76a;
}

/* 面板打开/关闭动画 */
.wasm-music-task-panel-enter-active {
  transition:
    opacity 0.2s ease-out,
    transform 0.2s ease-out;
}

.wasm-music-task-panel-leave-active {
  transition:
    opacity 0.15s ease-in,
    transform 0.15s ease-in;
}

.wasm-music-task-panel-enter-from,
.wasm-music-task-panel-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}

.wasm-music-task-panel-enter-to,
.wasm-music-task-panel-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

@media (max-width: 640px) {
  .wasm-music-task-center {
    right: 12px;
    bottom: 68px;
  }

  .wasm-music-task-panel {
    left: 10px;
    right: 10px;
    bottom: 120px;
    width: auto;
    max-height: calc(100vh - 140px);
  }
}
</style>

<style>
/* 深色模式 - 使用 html 选择器兼容 documentElement 挂载 */
html[arco-theme="dark"] .wasm-music-task-panel,
html[data-theme="dark"] .wasm-music-task-panel {
  color: #f1f2f3;
  background: #2a2a2a;
  border-color: #444;
}

html[arco-theme="dark"] .wasm-music-task-header strong,
html[data-theme="dark"] .wasm-music-task-header strong {
  color: #f1f2f3;
}

html[arco-theme="dark"] .wasm-music-task-header small,
html[arco-theme="dark"] .wasm-music-task-stage,
html[arco-theme="dark"] .wasm-music-task-status,
html[data-theme="dark"] .wasm-music-task-header small,
html[data-theme="dark"] .wasm-music-task-stage,
html[data-theme="dark"] .wasm-music-task-status {
  color: #b8c0cc;
}

html[arco-theme="dark"] .wasm-music-task-close,
html[data-theme="dark"] .wasm-music-task-close {
  color: #b8c0cc;
}

html[arco-theme="dark"] .wasm-music-task-close:hover,
html[data-theme="dark"] .wasm-music-task-close:hover {
  color: #f1f2f3;
  background: #3a3a3a;
}

html[arco-theme="dark"] .wasm-music-task-overall,
html[arco-theme="dark"] .wasm-music-task-progress,
html[data-theme="dark"] .wasm-music-task-overall,
html[data-theme="dark"] .wasm-music-task-progress {
  background: #444;
}

html[arco-theme="dark"] .wasm-music-task-diagnostics,
html[data-theme="dark"] .wasm-music-task-diagnostics {
  color: #b8c0cc;
  background: #1f1f1f;
}

html[arco-theme="dark"] .wasm-music-task-diagnostics.is-error,
html[data-theme="dark"] .wasm-music-task-diagnostics.is-error {
  color: #ff6b6b;
  background: #3a2424;
}

html[arco-theme="dark"] .wasm-music-task-diagnostics.is-ready,
html[data-theme="dark"] .wasm-music-task-diagnostics.is-ready {
  color: #6bcb77;
  background: #1a3a2a;
}

html[arco-theme="dark"] .wasm-music-task-controls,
html[data-theme="dark"] .wasm-music-task-controls {
  border-color: #444;
}

html[arco-theme="dark"] .wasm-music-task-row,
html[arco-theme="dark"] .wasm-music-task-btn,
html[data-theme="dark"] .wasm-music-task-row,
html[data-theme="dark"] .wasm-music-task-btn {
  color: #f1f2f3;
  background: #292929;
  border-color: #4b4b4b;
}

html[arco-theme="dark"] .wasm-music-task-btn:hover,
html[data-theme="dark"] .wasm-music-task-btn:hover {
  color: #00aeec;
  border-color: #00aeec;
}

html[arco-theme="dark"] .wasm-music-task-btn.is-primary,
html[data-theme="dark"] .wasm-music-task-btn.is-primary {
  color: #fff;
  background: #00aeec;
  border-color: #00aeec;
}

html[arco-theme="dark"] .wasm-music-task-btn.is-danger,
html[data-theme="dark"] .wasm-music-task-btn.is-danger {
  color: #ff6b6b;
  border-color: #ff6b6b;
}

html[arco-theme="dark"] .wasm-music-task-row.is-running,
html[data-theme="dark"] .wasm-music-task-row.is-running {
  background: #173344;
  border-color: #087ea4;
}

html[arco-theme="dark"] .wasm-music-task-row.is-failed,
html[data-theme="dark"] .wasm-music-task-row.is-failed {
  background: #3a2424;
  border-color: #b54747;
}

html[arco-theme="dark"] .wasm-music-task-row.is-success,
html[data-theme="dark"] .wasm-music-task-row.is-success {
  background: #1a3a2a;
}

html[arco-theme="dark"] .wasm-music-task-fab,
html[data-theme="dark"] .wasm-music-task-fab {
  background: linear-gradient(135deg, #00a1d6, #1272b8);
  box-shadow: 0 6px 20px rgba(0, 102, 170, 0.4);
}

html[arco-theme="dark"] .wasm-music-task-fab:hover,
html[data-theme="dark"] .wasm-music-task-fab:hover {
  box-shadow: 0 9px 26px rgba(0, 102, 170, 0.5);
}

html[arco-theme="dark"] .wasm-music-task-badge,
html[data-theme="dark"] .wasm-music-task-badge {
  border-color: #292929;
}
</style>
