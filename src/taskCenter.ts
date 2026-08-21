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

export function getTaskCenterActions() {
  return actions;
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
