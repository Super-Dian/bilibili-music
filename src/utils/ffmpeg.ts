/** FFmpeg WASM 单例加载器：缓存核心文件、CDN 降级、超时和可取消初始化。 */

import { FFmpeg } from "@ffmpeg/ffmpeg";

import { logger } from "./logger";

const CORE_VERSION = "0.12.10";
const CACHE_NAME = `wasm-music-ffmpeg-core-${CORE_VERSION}`;
const ASSET_TIMEOUT_MS = 45_000;

export interface FFmpegProvider {
  name: string;
  singleThreadBase: string;
  multiThreadBase: string;
}

export interface FFmpegPreflightResult {
  supported: boolean;
  webAssembly: boolean;
  worker: boolean;
  blobUrl: boolean;
  cacheAvailable: boolean;
  crossOriginIsolated: boolean;
  mode: "single-thread" | "multi-thread";
  message: string;
}

export interface FFmpegLoadDiagnostics extends FFmpegPreflightResult {
  loaded: boolean;
  provider?: string;
  loadedFromCache?: boolean;
  lastError?: string;
}

export const FFMPEG_CDN_PROVIDERS: FFmpegProvider[] = [
  {
    name: "unpkg",
    singleThreadBase: `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
    multiThreadBase: `https://unpkg.com/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`,
  },
  {
    name: "jsDelivr",
    singleThreadBase: `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
    multiThreadBase: `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`,
  },
];

export function preflightFFmpegEnvironment(): FFmpegPreflightResult {
  const webAssembly = typeof WebAssembly !== "undefined";
  const worker = typeof Worker !== "undefined";
  const blobUrl =
    typeof Blob !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function";
  const cacheAvailable = typeof caches !== "undefined";
  const isolated = typeof window !== "undefined" && Boolean(window.crossOriginIsolated);
  const supported = webAssembly && worker && blobUrl;
  return {
    supported,
    webAssembly,
    worker,
    blobUrl,
    cacheAvailable,
    crossOriginIsolated: isolated,
    mode: isolated ? "multi-thread" : "single-thread",
    message: supported
      ? `${isolated ? "多" : "单"}线程可用${cacheAvailable ? "，支持离线缓存" : "，无 Cache Storage"}`
      : "浏览器缺少 WebAssembly、Worker 或 Blob URL 支持",
  };
}

let diagnostics: FFmpegLoadDiagnostics = {
  ...preflightFFmpegEnvironment(),
  loaded: false,
};

export function getFFmpegDiagnostics() {
  return { ...diagnostics };
}

export async function tryFFmpegProviders<T>(
  providers: FFmpegProvider[],
  attempt: (provider: FFmpegProvider, index: number) => Promise<T>,
  shouldStop: () => boolean = () => false,
) {
  const failures: string[] = [];
  for (let index = 0; index < providers.length; index++) {
    const provider = providers[index];
    logger.info(`[FFmpeg] 尝试 CDN 源 ${index + 1}/${providers.length}: ${provider.name}`);
    try {
      const result = await attempt(provider, index);
      logger.info(`[FFmpeg] CDN 源 ${provider.name} 加载成功`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${provider.name}: ${message}`);
      logger.warn(`[FFmpeg] CDN 源 ${provider.name} 加载失败: ${message}`);
      if (shouldStop()) throw error;
    }
  }
  throw new Error(`所有 FFmpeg CDN 均不可用（${failures.join("；")}）`);
}

function createAbortError(message = "任务已取消") {
  if (typeof DOMException !== "undefined") {
    return new DOMException(message, "AbortError");
  }
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

async function fetchWithTimeout(url: string, signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason || createAbortError());
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error(`下载超时（${Math.round(ASSET_TIMEOUT_MS / 1000)} 秒）`)),
    ASSET_TIMEOUT_MS,
  );
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const bytes = await response.arrayBuffer();
    return {
      bytes,
      responseInit: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      } satisfies ResponseInit,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function readAsset(
  url: string,
  mimeType: string,
  signal: AbortSignal | undefined,
  onProgress?: (message: string) => void,
) {
  let response: Response | undefined;
  let bytes: ArrayBuffer;
  let fromCache = false;
  let cache: Cache | undefined;
  const fileName = url.split("/").pop() || url;
  // 用文件名+版本号作为统一缓存 key，不同 CDN 源共享同一份缓存
  const cacheKey = `ffmpeg-core/${CORE_VERSION}/${fileName}`;
  logger.info(`[FFmpeg] 读取资源: ${fileName} (${url})`);
  if (typeof caches !== "undefined") {
    try {
      cache = await caches.open(CACHE_NAME);
      response = (await cache.match(cacheKey)) || undefined;
      fromCache = Boolean(response);
      logger.info(`[FFmpeg] 缓存检查: ${fromCache ? "命中缓存" : "未命中缓存"} (key: ${cacheKey})`);
    } catch (error) {
      logger.warn("FFmpeg Cache Storage 不可用，将直接联网加载", error);
    }
  } else {
    logger.info("[FFmpeg] Cache Storage 不可用，跳过缓存检查");
  }

  if (!response) {
    logger.info(`[FFmpeg] 开始下载: ${fileName}`);
    const downloaded = await fetchWithTimeout(url, signal);
    bytes = downloaded.bytes;
    logger.info(
      `[FFmpeg] 下载完成: ${fileName} (${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB)`,
    );
    if (cache) {
      const cachedBytes = bytes.slice(0);
      void cache
        .put(cacheKey, new Response(cachedBytes, downloaded.responseInit))
        .then(() => logger.info(`[FFmpeg] 缓存写入成功: ${fileName}`))
        .catch((error) => logger.warn("写入 FFmpeg 缓存失败", error));
    }
  } else {
    if (signal?.aborted) throw createAbortError();
    bytes = await response.arrayBuffer();
    logger.info(
      `[FFmpeg] 从缓存读取: ${fileName} (${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB)`,
    );
  }
  if (signal?.aborted) throw createAbortError();
  onProgress?.(fromCache ? "命中本地缓存" : "下载完成，写入缓存");
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  return { objectUrl, fromCache };
}

/** FFmpeg 内部日志开关，开启后所有 ffmpeg log 输出到 console.info */
let ffmpegDebugLog = false;

/** 快捷控制 FFmpeg 内部日志打印，开启后输出到 console.info（不受 localStorage 日志级别限制） */
export function setFFmpegDebugLog(enabled: boolean) {
  ffmpegDebugLog = enabled;
  logger.info(`[FFmpeg] 内部日志已${enabled ? "开启" : "关闭"}`);
}

/** 获取当前 FFmpeg 内部日志开关状态 */
export function getFFmpegDebugLog() {
  return ffmpegDebugLog;
}

function createFFmpegInstance() {
  const instance = new FFmpeg();
  instance.on("log", ({ message }) => {
    if (ffmpegDebugLog) {
      logger.info("[ffmpeg]", message);
    } else {
      logger.debug("[ffmpeg]", message);
    }
  });
  return instance;
}

let ffmpeg = createFFmpegInstance();
let loadPromise: Promise<FFmpeg> | null = null;
let blobUrls: string[] = [];
let instanceGeneration = 0;

export function getFFmpeg() {
  return ffmpeg;
}

function revokeBlobUrls() {
  blobUrls.forEach((url) => URL.revokeObjectURL(url));
  blobUrls = [];
}

export async function ffmpegLoad(onProgress?: (message: string) => void, signal?: AbortSignal) {
  if (diagnostics.loaded) {
    logger.info("[FFmpeg] 已加载，跳过重复加载");
    return ffmpeg;
  }
  if (loadPromise) {
    logger.info("[FFmpeg] 正在加载中，等待现有加载完成");
    return loadPromise;
  }

  const preflight = preflightFFmpegEnvironment();
  diagnostics = { ...preflight, loaded: false };
  logger.info(`[FFmpeg] 环境预检: ${preflight.message}`);
  if (!preflight.supported) {
    diagnostics.lastError = preflight.message;
    throw new Error(preflight.message);
  }

  const loadingInstance = ffmpeg;
  const loadingGeneration = instanceGeneration;
  const isStale = () => loadingGeneration !== instanceGeneration || loadingInstance !== ffmpeg;
  const ensureCurrent = () => {
    if (signal?.aborted || isStale()) throw createAbortError();
  };
  const pending = (async () => {
    const multiThread = preflight.mode === "multi-thread";
    const modeText = multiThread ? "多线程" : "单线程";
    logger.info(`[FFmpeg] 开始加载 (${modeText}模式)`);
    onProgress?.(`${modeText}模式，检查 FFmpeg 缓存...`);
    const result = await tryFFmpegProviders(
      FFMPEG_CDN_PROVIDERS,
      async (provider, index) => {
        ensureCurrent();
        const base = multiThread ? provider.multiThreadBase : provider.singleThreadBase;
        onProgress?.(
          `${index > 0 ? "自动切换备用源" : "正在连接"} ${provider.name}，加载 core.js...`,
        );
        const providerUrls: string[] = [];
        try {
          const core = await readAsset(
            `${base}/ffmpeg-core.js`,
            "text/javascript",
            signal,
            (message) => onProgress?.(`core.js：${message}`),
          );
          providerUrls.push(core.objectUrl);
          ensureCurrent();
          onProgress?.(`正在通过 ${provider.name} 加载 core.wasm...`);
          const wasm = await readAsset(
            `${base}/ffmpeg-core.wasm`,
            "application/wasm",
            signal,
            (message) => onProgress?.(`core.wasm：${message}`),
          );
          providerUrls.push(wasm.objectUrl);
          ensureCurrent();
          const loadOptions: { coreURL: string; wasmURL: string; workerURL?: string } = {
            coreURL: core.objectUrl,
            wasmURL: wasm.objectUrl,
          };
          let workerFromCache = true;
          if (multiThread) {
            onProgress?.(`正在通过 ${provider.name} 加载 worker.js...`);
            const worker = await readAsset(
              `${base}/ffmpeg-core.worker.js`,
              "text/javascript",
              signal,
              (message) => onProgress?.(`worker.js：${message}`),
            );
            providerUrls.push(worker.objectUrl);
            ensureCurrent();
            loadOptions.workerURL = worker.objectUrl;
            workerFromCache = worker.fromCache;
          }
          ensureCurrent();
          onProgress?.(`正在初始化 FFmpeg（${provider.name} / ${modeText}）...`);
          logger.info(`[FFmpeg] 初始化 FFmpeg 实例 (${provider.name} / ${modeText})`);
          await loadingInstance.load(loadOptions);
          ensureCurrent();
          blobUrls = providerUrls;
          const fromCache = core.fromCache && wasm.fromCache && workerFromCache;
          logger.info(`[FFmpeg] 加载完成 (fromCache: ${fromCache})`);
          return {
            provider: provider.name,
            fromCache,
          };
        } catch (error) {
          providerUrls.forEach((url) => URL.revokeObjectURL(url));
          logger.warn(`FFmpeg CDN ${provider.name} 加载失败`, error);
          throw error;
        }
      },
      () => Boolean(signal?.aborted || isStale()),
    );
    ensureCurrent();
    diagnostics = {
      ...preflight,
      loaded: true,
      provider: result.provider,
      loadedFromCache: result.fromCache,
    };
    onProgress?.(
      `FFmpeg 就绪（${result.provider} / ${modeText}${result.fromCache ? " / 本地缓存" : ""}）`,
    );
    return loadingInstance;
  })().catch((error) => {
    if (!isStale()) {
      diagnostics = {
        ...preflight,
        loaded: false,
        lastError: error instanceof Error ? error.message : String(error),
      };
    }
    throw error;
  });
  let trackedPromise: Promise<FFmpeg>;
  trackedPromise = pending.finally(() => {
    if (loadPromise === trackedPromise) {
      loadPromise = null;
    }
  });
  loadPromise = trackedPromise;

  return trackedPromise;
}

export function terminateFFmpeg() {
  instanceGeneration++;
  try {
    ffmpeg.terminate();
  } catch (error) {
    logger.debug("FFmpeg 尚未启动或已终止", error);
  }
  revokeBlobUrls();
  ffmpeg = createFFmpegInstance();
  loadPromise = null;
  diagnostics = { ...preflightFFmpegEnvironment(), loaded: false };
}

export async function cleanupFFmpegFiles(instance: FFmpeg, fileNames: string[]) {
  await Promise.all(
    fileNames.map(async (fileName) => {
      try {
        await instance.deleteFile(fileName);
      } catch {
        // 文件可能尚未创建或已被 FFmpeg 清理。
      }
    }),
  );
}
