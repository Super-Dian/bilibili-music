import { beforeEach, describe, expect, mock, test } from "bun:test";

const storage = new Map<string, unknown>();

mock.module("$", () => ({
  GM_getValue: <T>(key: string, fallback: T) => (storage.has(key) ? storage.get(key) : fallback),
  GM_setValue: (key: string, value: unknown) => storage.set(key, value),
}));
mock.module("@/utils/logger", () => ({
  logger: {
    debug: () => undefined,
    error: () => undefined,
    info: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  },
}));

const taskCenter = await import("../src/taskCenter.ts");

const seeds = ["BVONE", "BVTWO", "BVTHREE"].map((bvid, index) => ({
  bvid,
  page: index + 1,
  label: `任务 ${index + 1}`,
  prefix: `P${index + 1}`,
  payload: { bvid, cid: index + 10 },
}));

beforeEach(() => {
  storage.clear();
  taskCenter.startDownloadTaskBatch([], { title: "reset" });
  taskCenter.clearFinishedDownloadTasks();
});

describe("download task state machine", () => {
  test("persists the per-item manual confirmation mode", () => {
    taskCenter.startDownloadTaskBatch(seeds, {
      title: "逐项确认",
      manualEach: true,
    });

    const state = taskCenter.getTaskCenterState();
    expect(state.manualEach).toBe(true);
    expect(state.automatic).toBe(false);
  });

  test("tracks progress, pause-after-current, completion, and resume", () => {
    const ids = taskCenter.startDownloadTaskBatch(seeds, {
      title: "三项任务",
      automatic: true,
      rule: { speed: 1.25 },
    });
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);

    expect(taskCenter.beginDownloadTask(ids[0], "下载音频")).toBe(true);
    taskCenter.updateDownloadTask(ids[0], { progress: 140, stage: "处理中" });
    taskCenter.setDownloadTaskBatchPaused(true);
    let state = taskCenter.getTaskCenterState();
    expect(state.paused).toBe(true);
    expect(state.tasks.map((task) => task.status)).toEqual(["running", "paused", "paused"]);
    expect(state.tasks[0].progress).toBe(100);

    expect(taskCenter.completeDownloadTask(ids[0], "P01_song.m4a")).toBe(true);
    taskCenter.setDownloadTaskBatchPaused(false);
    state = taskCenter.getTaskCenterState();
    expect(state.tasks.map((task) => task.status)).toEqual(["success", "queued", "queued"]);
    expect(state.tasks[0].outputName).toBe("P01_song.m4a");
  });

  test("failed tasks can be selected and reset without touching successful tasks", () => {
    const ids = taskCenter.startDownloadTaskBatch(seeds);
    taskCenter.beginDownloadTask(ids[0]);
    taskCenter.completeDownloadTask(ids[0]);
    taskCenter.beginDownloadTask(ids[1]);
    taskCenter.failDownloadTask(ids[1], new Error("FFmpeg failed"));

    const retryable = taskCenter.getRetryableDownloadTasks();
    expect(retryable.map((task) => task.id)).toEqual([ids[1]]);
    expect(retryable[0].payload).toEqual({ bvid: "BVTWO", cid: 11 });

    taskCenter.prepareDownloadTaskRetry([ids[1]]);
    const state = taskCenter.getTaskCenterState();
    expect(state.tasks[0].status).toBe("success");
    expect(state.tasks[1].status).toBe("queued");
    expect(state.tasks[1].error).toBeUndefined();
  });

  test("cancelling marks only unfinished work and preserves completed history", () => {
    const ids = taskCenter.startDownloadTaskBatch(seeds);
    taskCenter.beginDownloadTask(ids[0]);
    taskCenter.completeDownloadTask(ids[0]);
    taskCenter.beginDownloadTask(ids[1]);
    taskCenter.cancelDownloadTaskBatch("用户取消");

    const state = taskCenter.getTaskCenterState();
    expect(state.tasks.map((task) => task.status)).toEqual(["success", "cancelled", "cancelled"]);
    expect(state.tasks[1].stage).toBe("用户取消");
  });

  test("terminal task states ignore late asynchronous callbacks", () => {
    const [id] = taskCenter.startDownloadTaskBatch(seeds.slice(0, 1));
    taskCenter.beginDownloadTask(id);
    taskCenter.completeDownloadTask(id, "done.m4a");

    expect(taskCenter.failDownloadTask(id, "late failure")).toBe(false);
    expect(taskCenter.cancelDownloadTask(id, "late cancellation")).toBe(false);
    expect(taskCenter.getTaskCenterState().tasks[0]).toMatchObject({
      status: "success",
      outputName: "done.m4a",
    });
  });

  test("a failed single-file save can re-enter running state for a manual retry", () => {
    const [id] = taskCenter.startDownloadTaskBatch(seeds.slice(0, 1));
    taskCenter.beginDownloadTask(id, "首次保存");
    taskCenter.failDownloadTask(id, "下载权限被拒绝");

    expect(taskCenter.beginDownloadTask(id, "重新保存音频文件")).toBe(true);
    const retried = taskCenter.getTaskCenterState().tasks[0];
    expect(retried).toMatchObject({
      status: "running",
      stage: "重新保存音频文件",
    });
    expect(retried.error).toBeUndefined();
    expect(retried.finishedAt).toBeUndefined();
  });

  test("frequent progress updates are persisted through the throttled writer", async () => {
    const [id] = taskCenter.startDownloadTaskBatch(seeds.slice(0, 1));
    taskCenter.beginDownloadTask(id);
    taskCenter.updateDownloadTask(id, { progress: 12 });
    taskCenter.updateDownloadTask(id, { progress: 35 });
    taskCenter.updateDownloadTask(id, { progress: 67 });
    await Bun.sleep(320);

    const stored = storage.get("wasm_music_download_tasks_v1") as {
      tasks: Array<{ progress: number }>;
    };
    expect(stored.tasks[0].progress).toBe(67);
  });
});
