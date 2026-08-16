/** FFmpeg WASM 单例加载器：缓存核心文件、CDN 降级、超时和可取消初始化。 */

import { FFmpeg } from "@ffmpeg/ffmpeg";

import { logger } from "./logger";

const CORE_VERSION = "0.12.10";
const CACHE_NAME = `wasm-music-ffmpeg-core-${CORE_VERSION}`;
const ASSET_TIMEOUT_MS = 45_000;

const ffmpegLog = (...args: unknown[]) => console.log("%c[ffmpeg]", "color:#00aeec;font-weight:bold", ...args);
const ffmpegWarn = (...args: unknown[]) => console.warn("%c[ffmpeg]", "color:#faad14;font-weight:bold", ...args);
const ffmpegErr = (...args: unknown[]) => console.error("%c[ffmpeg]", "color:#ff4d4f;font-weight:bold", ...args);

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
  ffmpegLog("环境检测:", { webAssembly, worker, blobUrl, cacheAvailable, crossOriginIsolated: isolated, supported });
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
  ffmpegLog(`开始尝试 ${providers.length} 个 CDN 源:`, providers.map((p) => p.name).join(", "));
  for (let index = 0; index < providers.length; index++) {
    const provider = providers[index];
    ffmpegLog(`[${index + 1}/${providers.length}] 尝试 ${provider.name}...`);
    try {
      const result = await attempt(provider, index);
      ffmpegLog(`✅ ${provider.name} 加载成功`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const detail = error instanceof Error ? error.stack : "";
      ffmpegErr(`❌ ${provider.name} 失败:`, message);
      if (detail) ffmpegWarn(`   堆栈:`, detail);
      failures.push(`${provider.name}: ${message}`);
      if (shouldStop()) {
        ffmpegWarn("已取消（任务取消或实例过期），停止重试");
        throw error;
      }
    }
  }
  const errorMsg = `所有 FFmpeg CDN 均不可用（${failures.join("；")}）`;
  ffmpegErr(errorMsg);
  throw new Error(errorMsg);
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
  const startTime = Date.now();
  ffmpegLog(`   fetch 开始: ${url}`);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-cache" });
    const elapsed = Date.now() - startTime;
    ffmpegLog(`   fetch 响应: ${response.status} ${response.statusText} (${elapsed}ms) url=${url}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const contentLength = response.headers.get("content-length");
    ffmpegLog(`   下载中... content-length=${contentLength ? `${(Number(contentLength) / 1024 / 1024).toFixed(1)}MB` : "未知"}`);
    const bytes = await response.arrayBuffer();
    const totalElapsed = Date.now() - startTime;
    const sizeMB = (bytes.byteLength / 1024 / 1024).toFixed(2);
    ffmpegLog(`   下载完成: ${sizeMB}MB, 耗时 ${totalElapsed}ms`);
    return {
      bytes,
      responseInit: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      } satisfies ResponseInit,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    ffmpegErr(`   fetch 失败 (${elapsed}ms): ${message} url=${url}`);
    throw error;
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
  ffmpegLog(`   readAsset: ${fileName} (${mimeType})`);
  if (typeof caches !== "undefined") {
    try {
      cache = await caches.open(CACHE_NAME);
      response = (await cache.match(cacheKey)) || undefined;
      fromCache = Boolean(response);
      ffmpegLog(`   缓存状态: ${fromCache ? "命中缓存 ✅" : "未命中，需联网下载"} (key=${cacheKey})`);
    } catch (error) {
      ffmpegWarn("   Cache Storage 不可用，将直接联网加载", error);
    }
  } else {
    ffmpegLog("   浏览器不支持 Cache Storage，直接联网下载");
  }

  if (!response) {
    const downloaded = await fetchWithTimeout(url, signal);
    bytes = downloaded.bytes;
    if (cache) {
      const cachedBytes = bytes.slice(0);
      void cache
        .put(cacheKey, new Response(cachedBytes, downloaded.responseInit))
        .catch((error) => logger.warn("写入 FFmpeg 缓存失败", error));
    }
  } else {
    if (signal?.aborted) throw createAbortError();
    bytes = await response.arrayBuffer();
  }
  if (signal?.aborted) throw createAbortError();
  onProgress?.(fromCache ? "命中本地缓存" : "下载完成，写入缓存");
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  return { objectUrl, fromCache };
}

function createFFmpegInstance() {
  const instance = new FFmpeg();
  instance.on("log", ({ message }) => ffmpegLog("[内部]", message));
  instance.on("progress", ({ progress, time }) => ffmpegLog("[进度]", `progress=${(progress * 100).toFixed(1)}% time=${time}ms`));
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
    ffmpegLog("已加载，跳过重复初始化");
    return ffmpeg;
  }
  if (loadPromise) {
    ffmpegLog("正在加载中，返回现有 Promise");
    return loadPromise;
  }

  ffmpegLog("====== 开始加载 FFmpeg ======");
  const loadStartTime = Date.now();
  const preflight = preflightFFmpegEnvironment();
  diagnostics = { ...preflight, loaded: false };
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
          await loadingInstance.load(loadOptions);
          ensureCurrent();
          blobUrls = providerUrls;
          return {
            provider: provider.name,
            fromCache: core.fromCache && wasm.fromCache && workerFromCache,
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
    const totalMs = Date.now() - loadStartTime;
    ffmpegLog(`====== FFmpeg 加载完成 (${totalMs}ms) ======`, { provider: result.provider, fromCache: result.fromCache });
    onProgress?.(
      `FFmpeg 就绪（${result.provider} / ${modeText}${result.fromCache ? " / 本地缓存" : ""}）`,
    );
    return loadingInstance;
  })().catch((error) => {
    const totalMs = Date.now() - loadStartTime;
    ffmpegErr(`====== FFmpeg 加载失败 (${totalMs}ms) ======`, error);
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
