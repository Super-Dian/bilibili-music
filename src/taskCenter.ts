import { GM_getValue, GM_setValue } from "$";

import { clone } from "@/utils/deepmerge";
import { logger } from "@/utils/logger";

const STORAGE_KEY = "wasm_music_download_tasks_v1";
const SCHEMA_VERSION = 1;

export type DownloadTaskStatus =
  | "queued"
  | "running"
  | "paused"
  | "success"
  | "failed"
  | "cancelled";

export interface DownloadTaskSeed {
  bvid: string;
  page: number;
  label: string;
  prefix?: string;
  payload: Record<string, unknown>;
}

export interface DownloadTaskItem extends DownloadTaskSeed {
  id: string;
  status: DownloadTaskStatus;
  stage: string;
  progress: number | null;
  error?: string;
  outputName?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface DownloadTaskState {
  schemaVersion: number;
  batchId: string | null;
  title: string;
  tasks: DownloadTaskItem[];
  paused: boolean;
  automatic: boolean;
  manualEach: boolean;
  rule: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface TaskCenterRuntime {
  ffmpegStatus: "idle" | "checking" | "ready" | "loading" | "error";
  ffmpegMessage: string;
  ffmpegProvider?: string;
  ffmpegMode?: "single-thread" | "multi-thread";
  cacheAvailable?: boolean;
}

interface TaskCenterActions {
  pause: () => void;
  resume: () => void;
  hasLiveSession: () => boolean;
  cancel: () => void;
  retryFailed: () => void;
  resumeInterrupted: () => void;
}

const emptyState = (): DownloadTaskState => ({
  schemaVersion: SCHEMA_VERSION,
  batchId: null,
  title: "下载任务",
  tasks: [],
  paused: false,
  automatic: false,
  manualEach: false,
  rule: null,
  createdAt: 0,
  updatedAt: 0,
});

function makeId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function normalizeProgress(progress: number | null | undefined) {
  if (progress === null || progress === undefined || !Number.isFinite(progress)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function formatError(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  if (reason === null || reason === undefined) return "未知错误";
  try {
    return JSON.stringify(reason);
  } catch {
    return "无法序列化的错误";
  }
}

function normalizeStoredState(value: unknown): DownloadTaskState {
  if (!value || typeof value !== "object") {
    return emptyState();
  }
  const raw = value as Partial<DownloadTaskState>;
  if (raw.schemaVersion !== SCHEMA_VERSION || !Array.isArray(raw.tasks)) {
    return emptyState();
  }
  const now = Date.now();
  let interrupted = false;
  const tasks = raw.tasks
    .filter((task): task is DownloadTaskItem => Boolean(task?.id && task?.bvid))
    .map((task) => {
      const status = task.status === "running" ? "paused" : task.status;
      if (task.status === "running") interrupted = true;
      return {
        ...task,
        status,
        stage: task.status === "running" ? "页面刷新中断，可继续任务" : task.stage,
        progress: normalizeProgress(task.progress),
      };
    });
  return {
    schemaVersion: SCHEMA_VERSION,
    batchId: raw.batchId || null,
    title: raw.title || "下载任务",
    tasks,
    paused:
      interrupted ||
      Boolean(raw.paused) ||
      tasks.some((task) => task.status === "paused" || task.status === "queued"),
    automatic: Boolean(raw.automatic),
    manualEach: Boolean(raw.manualEach),
    rule: raw.rule ?? null,
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now,
  };
}

let state = normalizeStoredState(GM_getValue<DownloadTaskState | null>(STORAGE_KEY, null));
let runtime: TaskCenterRuntime = {
  ffmpegStatus: "idle",
  ffmpegMessage: "尚未检查 FFmpeg 运行环境",
};
let actions: TaskCenterActions = {
  pause: () => undefined,
  resume: () => undefined,
  hasLiveSession: () => false,
  cancel: () => undefined,
  retryFailed: () => undefined,
  resumeInterrupted: () => undefined,
};
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persist(immediate = false) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const write = () => {
    persistTimer = null;
    try {
      GM_setValue(STORAGE_KEY, clone(state));
    } catch (error) {
      logger.warn("保存下载任务状态失败", error);
    }
  };
  if (immediate) {
    write();
  } else {
    persistTimer = setTimeout(write, 250);
  }
}

function notify(immediate = false) {
  state.updatedAt = Date.now();
  persist(immediate);
  listeners.forEach((listener) => listener());
}

function findTask(id: string | null | undefined) {
  return id ? state.tasks.find((task) => task.id === id) : undefined;
}

export function subscribeTaskCenter(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function configureTaskCenterActions(nextActions: Partial<TaskCenterActions>) {
  actions = { ...actions, ...nextActions };
}

export function getTaskCenterState() {
  return clone(state);
}

export function getTaskCenterRuntime() {
  return { ...runtime };
}

export function updateTaskCenterRuntime(patch: Partial<TaskCenterRuntime>) {
  runtime = { ...runtime, ...patch };
  listeners.forEach((listener) => listener());
}

export function startDownloadTaskBatch(
  seeds: DownloadTaskSeed[],
  options: { title?: string; automatic?: boolean; manualEach?: boolean; rule?: unknown } = {},
) {
  const now = Date.now();
  const batchId = makeId("batch");
  const tasks = seeds.map<DownloadTaskItem>((seed, index) => ({
    ...clone(seed),
    id: `${batchId}-${index + 1}`,
    status: "queued",
    stage: "等待开始",
    progress: 0,
  }));
  state = {
    schemaVersion: SCHEMA_VERSION,
    batchId,
    title: options.title || "下载任务",
    tasks,
    paused: false,
    automatic: Boolean(options.automatic),
    manualEach: Boolean(options.manualEach),
    rule: clone(options.rule ?? null),
    createdAt: now,
    updatedAt: now,
  };
  notify(true);
  return tasks.map((task) => task.id);
}

export function setDownloadTaskRule(rule: unknown, automatic = true) {
  state.rule = clone(rule ?? null);
  state.automatic = automatic;
  state.manualEach = false;
  notify(true);
}

export function beginDownloadTask(id: string | null | undefined, stage = "准备下载") {
  const task = findTask(id);
  if (!task || ["success", "cancelled"].includes(task.status)) return false;
  task.status = "running";
  task.stage = stage;
  task.progress = Math.max(0, task.progress || 0);
  task.error = undefined;
  task.startedAt ||= Date.now();
  task.finishedAt = undefined;
  notify(true);
  return true;
}

export function updateDownloadTask(
  id: string | null | undefined,
  patch: { stage?: string; progress?: number | null; outputName?: string },
) {
  const task = findTask(id);
  if (!task || ["success", "failed", "cancelled"].includes(task.status)) return false;
  if (patch.stage !== undefined) task.stage = patch.stage;
  if (patch.progress !== undefined) task.progress = normalizeProgress(patch.progress);
  if (patch.outputName !== undefined) task.outputName = patch.outputName;
  notify(false);
  return true;
}

export function completeDownloadTask(id: string | null | undefined, outputName?: string) {
  const task = findTask(id);
  if (!task || ["success", "failed", "cancelled"].includes(task.status)) return false;
  task.status = "success";
  task.stage = "下载完成";
  task.progress = 100;
  task.error = undefined;
  task.outputName = outputName || task.outputName;
  task.finishedAt = Date.now();
  notify(true);
  return true;
}

export function failDownloadTask(id: string | null | undefined, reason: unknown) {
  const task = findTask(id);
  if (!task || ["success", "failed", "cancelled"].includes(task.status)) return false;
  task.status = "failed";
  task.stage = "处理失败";
  task.error = formatError(reason);
  task.finishedAt = Date.now();
  notify(true);
  return true;
}

export function cancelDownloadTask(id: string | null | undefined, reason = "用户取消") {
  const task = findTask(id);
  if (!task || ["success", "failed", "cancelled"].includes(task.status)) return false;
  task.status = "cancelled";
  task.stage = reason;
  task.error = undefined;
  task.finishedAt = Date.now();
  notify(true);
  return true;
}

export function setDownloadTaskBatchPaused(paused: boolean) {
  state.paused = paused;
  state.tasks.forEach((task) => {
    if (paused && task.status === "queued") {
      task.status = "paused";
      task.stage = "队列已暂停";
    } else if (!paused && task.status === "paused") {
      task.status = "queued";
      task.stage = "等待继续";
    }
  });
  notify(true);
}

export function cancelDownloadTaskBatch(reason = "用户取消") {
  state.paused = false;
  state.tasks.forEach((task) => {
    if (["queued", "running", "paused"].includes(task.status)) {
      task.status = "cancelled";
      task.stage = reason;
      task.error = undefined;
      task.finishedAt = Date.now();
    }
  });
  notify(true);
}

export function getRetryableDownloadTasks() {
  return clone(state.tasks.filter((task) => task.status === "failed"));
}

export function getInterruptedDownloadTasks() {
  return clone(state.tasks.filter((task) => ["queued", "paused"].includes(task.status)));
}

export function prepareDownloadTaskRetry(ids: string[]) {
  const selected = new Set(ids);
  state.tasks.forEach((task) => {
    if (!selected.has(task.id)) return;
    task.status = "queued";
    task.stage = "等待重试";
    task.progress = 0;
    task.error = undefined;
    task.startedAt = undefined;
    task.finishedAt = undefined;
  });
  state.paused = false;
  notify(true);
}

export function clearFinishedDownloadTasks() {
  state.tasks = state.tasks.filter((task) => ["queued", "running", "paused"].includes(task.status));
  if (state.tasks.length === 0) {
    state = emptyState();
  }
  notify(true);
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

function createButton(label: string, className: string, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

let taskUiRoot: HTMLElement | null = null;
let panelOpen = false;

export function initTaskCenterUI() {
  if (typeof document === "undefined" || taskUiRoot?.isConnected || window.self !== window.top) {
    return;
  }

  const root = document.createElement("div");
  root.id = "wasm-music-task-center";
  root.dataset.testid = "wasm-music-task-center";
  (document.body || document.documentElement).appendChild(root);
  if (!document.body) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        if (root.isConnected && document.body) document.body.appendChild(root);
      },
      { once: true },
    );
  }
  taskUiRoot = root;

  const render = () => {
    if (!taskUiRoot?.isConnected) return;
    const snapshot = getTaskCenterState();
    const runtimeSnapshot = getTaskCenterRuntime();
    taskUiRoot.replaceChildren();
    if (snapshot.tasks.length === 0) return;

    const fab = createButton("任务", "wasm-music-task-fab", () => {
      panelOpen = !panelOpen;
      render();
    });
    fab.dataset.testid = "wasm-music-task-fab";
    const unfinished = snapshot.tasks.filter((task) =>
      ["queued", "running", "paused"].includes(task.status),
    ).length;
    const failed = snapshot.tasks.filter((task) => task.status === "failed").length;
    const badge = document.createElement("span");
    badge.className = failed > 0 ? "wasm-music-task-badge is-error" : "wasm-music-task-badge";
    badge.textContent = String(failed || unfinished || snapshot.tasks.length);
    fab.appendChild(badge);
    taskUiRoot.appendChild(fab);

    if (!panelOpen) return;
    const panel = document.createElement("section");
    panel.className = "wasm-music-task-panel";
    panel.dataset.testid = "wasm-music-task-panel";

    const header = document.createElement("header");
    header.className = "wasm-music-task-header";
    const headingWrap = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = snapshot.title;
    const totals = document.createElement("small");
    const successCount = snapshot.tasks.filter((task) => task.status === "success").length;
    const failedCount = snapshot.tasks.filter((task) => task.status === "failed").length;
    totals.textContent = `成功 ${successCount} · 失败 ${failedCount} · 共 ${snapshot.tasks.length}`;
    headingWrap.append(heading, totals);
    const close = createButton("×", "wasm-music-task-close", () => {
      panelOpen = false;
      render();
    });
    close.setAttribute("aria-label", "收起任务中心");
    header.append(headingWrap, close);

    const overall = document.createElement("div");
    overall.className = "wasm-music-task-overall";
    const terminal = snapshot.tasks.filter((task) =>
      ["success", "failed", "cancelled"].includes(task.status),
    ).length;
    const overallBar = document.createElement("span");
    overallBar.style.width = `${snapshot.tasks.length ? (terminal / snapshot.tasks.length) * 100 : 0}%`;
    overall.appendChild(overallBar);

    const diagnostics = document.createElement("div");
    diagnostics.className = `wasm-music-task-diagnostics is-${runtimeSnapshot.ffmpegStatus}`;
    diagnostics.textContent = `FFmpeg：${runtimeSnapshot.ffmpegMessage}`;

    const controls = document.createElement("div");
    controls.className = "wasm-music-task-controls";
    const active = snapshot.tasks.some((task) => task.status === "running");
    const pending = snapshot.tasks.some((task) => ["queued", "paused"].includes(task.status));
    if (pending && !snapshot.paused) {
      const pause = createButton("当前项完成后暂停", "wasm-music-task-btn", actions.pause);
      pause.dataset.testid = "wasm-music-task-pause";
      controls.appendChild(pause);
    }
    if (snapshot.paused && pending) {
      const resume = createButton("继续队列", "wasm-music-task-btn is-primary", () => {
        const hasInterrupted =
          !actions.hasLiveSession() &&
          !active &&
          snapshot.tasks.some((task) => task.status === "paused");
        if (hasInterrupted) actions.resumeInterrupted();
        else actions.resume();
      });
      resume.dataset.testid = "wasm-music-task-resume";
      controls.appendChild(resume);
    }
    if (!active && !pending && snapshot.tasks.some((task) => task.status === "failed")) {
      const retry = createButton(
        "重试失败项",
        "wasm-music-task-btn is-primary",
        actions.retryFailed,
      );
      retry.dataset.testid = "wasm-music-task-retry";
      controls.appendChild(retry);
    }
    if (active || pending) {
      const cancel = createButton("取消任务", "wasm-music-task-btn is-danger", actions.cancel);
      cancel.dataset.testid = "wasm-music-task-cancel";
      controls.appendChild(cancel);
    }
    if (!active && !pending) {
      controls.appendChild(
        createButton("清除记录", "wasm-music-task-btn", clearFinishedDownloadTasks),
      );
    }

    const list = document.createElement("div");
    list.className = "wasm-music-task-list";
    snapshot.tasks.forEach((task, index) => {
      const row = document.createElement("article");
      row.className = `wasm-music-task-row is-${task.status}`;
      row.dataset.taskId = task.id;
      const top = document.createElement("div");
      top.className = "wasm-music-task-row-top";
      const label = document.createElement("span");
      label.className = "wasm-music-task-label";
      label.textContent = `${index + 1}. ${task.label}`;
      label.title = `${task.bvid} · P${task.page}`;
      const status = document.createElement("span");
      status.className = "wasm-music-task-status";
      status.textContent = statusLabel(task.status);
      top.append(label, status);
      const stage = document.createElement("div");
      stage.className = "wasm-music-task-stage";
      stage.textContent = task.error || task.stage;
      const progress = document.createElement("div");
      progress.className = "wasm-music-task-progress";
      const progressBar = document.createElement("span");
      progressBar.style.width = `${task.progress ?? 0}%`;
      progress.appendChild(progressBar);
      row.append(top, stage, progress);
      list.appendChild(row);
    });

    panel.append(header, overall, diagnostics, controls, list);
    taskUiRoot.appendChild(panel);
  };

  subscribeTaskCenter(render);
  render();
}
