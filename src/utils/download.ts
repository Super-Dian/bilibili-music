export interface BinaryDownloadProgress {
  loaded: number;
  total: number | null;
  percent: number | null;
}

function createAbortError(message = "任务已取消") {
  if (typeof DOMException !== "undefined") {
    return new DOMException(message, "AbortError");
  }
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown) {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")
  );
}

export async function downloadBinary(
  url: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    credentials?: RequestCredentials;
    onProgress?: (progress: BinaryDownloadProgress) => void;
  } = {},
) {
  const { signal, timeoutMs = 120_000, credentials = "same-origin", onProgress } = options;
  if (signal?.aborted) throw createAbortError();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason || createAbortError());
  signal?.addEventListener("abort", abort, { once: true });
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  const refreshInactivityTimeout = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(
      () => controller.abort(new Error(`下载长时间无进度（${Math.round(timeoutMs / 1000)} 秒）`)),
      timeoutMs,
    );
  };
  refreshInactivityTimeout();

  const throwIfAborted = () => {
    if (!controller.signal.aborted) return;
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : createAbortError();
    }
    throw controller.signal.reason instanceof Error ? controller.signal.reason : createAbortError();
  };

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials,
    });
    throwIfAborted();
    refreshInactivityTimeout();
    if (!response.ok) {
      throw new Error(`下载失败：HTTP ${response.status} ${response.statusText}`);
    }
    const totalHeader = Number(response.headers.get("content-length"));
    const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null;
    if (!response.body) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      onProgress?.({ loaded: bytes.byteLength, total, percent: 100 });
      return bytes;
    }

    const reader = response.body.getReader();
    const cancelReader = () => {
      void reader.cancel(controller.signal.reason).catch(() => undefined);
    };
    controller.signal.addEventListener("abort", cancelReader, { once: true });
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    try {
      while (true) {
        throwIfAborted();
        const { done, value } = await reader.read();
        throwIfAborted();
        if (done) break;
        refreshInactivityTimeout();
        if (!value) continue;
        chunks.push(value);
        loaded += value.byteLength;
        onProgress?.({
          loaded,
          total,
          percent: total ? Math.min(100, (loaded / total) * 100) : null,
        });
      }
    } finally {
      controller.signal.removeEventListener("abort", cancelReader);
    }
    const output = new Uint8Array(loaded);
    let offset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    });
    onProgress?.({ loaded, total, percent: 100 });
    return output;
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : createAbortError();
    }
    if (controller.signal.aborted && controller.signal.reason instanceof Error) {
      throw controller.signal.reason;
    }
    throw error;
  } finally {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    signal?.removeEventListener("abort", abort);
  }
}
