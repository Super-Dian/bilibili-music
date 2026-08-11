import type { GmDownloadRequest } from "$";

export interface SaveDownloadProgress {
  loaded: number;
  total: number | null;
  percent: number | null;
}

export type SaveDownloadSource = string | Blob | File;
export type SaveDownloadExecutor = (request: GmDownloadRequest) => { abort?: () => unknown } | void;

function createAbortError(message = "保存已取消") {
  if (typeof DOMException !== "undefined") {
    return new DOMException(message, "AbortError");
  }
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function formatDownloadError(event?: { error?: string; details?: string }) {
  const reason = event?.error || "not_succeeded";
  const messages: Record<string, string> = {
    not_enabled: "油猴的下载功能尚未启用",
    not_whitelisted: "文件扩展名未加入油猴下载白名单",
    not_permitted: "浏览器尚未授予油猴下载权限",
    not_supported: "当前浏览器或油猴版本不支持此下载方式",
    not_succeeded: "浏览器未能保存文件",
  };
  const details = event?.details ? `：${event.details}` : "";
  return new Error(`${messages[reason] || "浏览器保存失败"}（${reason}）${details}`);
}

/**
 * 通过 userscript 下载 API 保存文件。只有管理器确认下载成功后 Promise 才会完成，
 * 从而避免把一次无法观测结果的 anchor.click() 误记为下载成功。
 */
export function saveDownload(
  executeDownload: SaveDownloadExecutor,
  source: SaveDownloadSource,
  fileName: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    onProgress?: (progress: SaveDownloadProgress) => void;
  } = {},
) {
  const { signal, timeoutMs = 120_000, onProgress } = options;
  if (typeof executeDownload !== "function") {
    return Promise.reject(new Error("当前油猴环境未提供 GM_download，无法确认文件是否保存成功"));
  }
  if (signal?.aborted) {
    return Promise.reject(signal.reason instanceof Error ? signal.reason : createAbortError());
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let handle: { abort?: () => unknown } | undefined;
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        handle?.abort?.();
      } catch {
        // 下载管理器可能已自行结束；调用方仍应收到标准 AbortError。
      } finally {
        reject(signal?.reason instanceof Error ? signal.reason : createAbortError());
      }
    };

    signal?.addEventListener("abort", abort, { once: true });
    try {
      handle = executeDownload({
        // Tampermonkey 5.4.6226+ supports Blob/File directly. The bundled type
        // definition still declares only string URLs, so keep this narrow cast.
        url: source as unknown as string,
        name: fileName,
        saveAs: false,
        timeout: timeoutMs,
        onload: succeed,
        onerror: (event) => fail(formatDownloadError(event)),
        ontimeout: () => fail(new Error(`浏览器保存超时（${Math.round(timeoutMs / 1000)} 秒）`)),
        onprogress: (event) => {
          if (settled) return;
          const total = event.lengthComputable && event.total > 0 ? event.total : null;
          onProgress?.({
            loaded: event.loaded,
            total,
            percent: total ? Math.min(100, (event.loaded / total) * 100) : null,
          });
        },
      } as GmDownloadRequest) as { abort?: () => unknown } | undefined;
      if (signal?.aborted) abort();
    } catch (error) {
      fail(error);
    }
  });
}
