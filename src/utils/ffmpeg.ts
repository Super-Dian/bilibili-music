import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

import { logger } from "./logger";

export const ffmpeg = new FFmpeg();

// FFmpeg 内部日志直接输出到主控制台 (logger 走 iframe console, 开发者看不见)
const _fflog = (...args: any[]) => console.log("%c[ffmpeg]", "color:#EFC441;font-weight:bold", ...args);
const _ffwarn = (...args: any[]) => console.warn("%c[ffmpeg]", "color:#EFC441;font-weight:bold", ...args);

export const ffmpegLoad = async () => {
  const startTime = Date.now();
  let tryMultiThread = true;
  // FFmpeg 内部日志 → 主控制台, 实时可见
  ffmpeg.on("log", ({ message }) => {
    _fflog(message);
  });
  ffmpeg.on("progress", ({ progress, time }) => {
    _ffwarn(`progress: ${(progress * 100).toFixed(1)}%, time=${time}`);
  });
  // const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd'
  // const baseFFmpegUrl = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm";
  const baseCoreUrl = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
  const baseCoreMTUrl = "https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm";

  if (tryMultiThread && window.crossOriginIsolated) {
    logger.info("[ffmpeg] 多线程模式, crossOriginIsolated=true");
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseCoreMTUrl}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseCoreMTUrl}/ffmpeg-core.wasm`, "application/wasm"),
      workerURL: await toBlobURL(
        `${baseCoreMTUrl}/ffmpeg-core.worker.js`,
        "application/javascript",
      ),
      // classWorkerURL:await toBlobURL(`${baseFFmpegUrl}/worker.js`, 'application/javascript'),
    });
  } else {
    logger.info("[ffmpeg] 单线程模式 (crossOriginIsolated=%s)", window.crossOriginIsolated);
    const t1 = Date.now();
    const coreURL = await toBlobURL(`${baseCoreUrl}/ffmpeg-core.js`, "text/javascript");
    logger.info("[ffmpeg] core.js 下载完成, %sms", Date.now() - t1);
    const t2 = Date.now();
    const wasmURL = await toBlobURL(`${baseCoreUrl}/ffmpeg-core.wasm`, "application/wasm");
    logger.info("[ffmpeg] core.wasm 下载完成, %sms", Date.now() - t2);
    await ffmpeg.load({ coreURL, wasmURL });
  }
  const mem = (performance as any).memory;
  if (mem) {
    logger.info("[ffmpeg] load完成, 耗时 %sms | JS堆: %sMB / %sMB",
      Date.now() - startTime,
      (mem.usedJSHeapSize / 1048576).toFixed(0),
      (mem.jsHeapSizeLimit / 1048576).toFixed(0));
  } else {
    logger.info("[ffmpeg] load完成, 耗时 %sms", Date.now() - startTime);
  }
};
