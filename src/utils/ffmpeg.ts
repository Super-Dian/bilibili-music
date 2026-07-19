/**
 * FFmpeg WASM 加载器
 *
 * 负责从 unpkg CDN 下载 FFmpeg 核心文件 (JS + WASM) 并初始化 WASM 运行时。
 * 支持两种模式:
 *   - 多线程: 需要 crossOriginIsolated (COOP/COEP 头), 性能更优
 *   - 单线程: 降级方案, 无需特殊 HTTP 头, 但编码速度较慢
 *
 * 单线程模式下的已知问题:
 *   - AAC 编码较慢, 大文件处理耗时长
 *   - progressive JPEG 解码可能卡死 (已通过 -c:v copy 绕过)
 *   -https://ffmpegwasm.netlify.app/docs/getting-started/usage/
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

import { logger } from "./logger";

/** FFmpeg 实例, 全局单例, 在 exec/writeFile/readFile 等操作中使用 */
export const ffmpeg = new FFmpeg();

/**
 * 加载 FFmpeg WASM 运行时
 *
 * 依次下载 core.js → core.wasm → (worker.js) 并初始化。
 * 每个阶段通过 onProgress 回调报告进度, 用于前端 UI 显示。
 *
 * @param onProgress - 可选的进度回调, 参数为当前阶段的中文描述文本
 */
export const ffmpegLoad = async (onProgress?: (msg: string) => void) => {
  let tryMultiThread = true;

  // --- CDN 地址 ---
  // const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd'
  // const baseFFmpegUrl = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm";
  /** 单线程版 core 文件 CDN 基础路径 */
  const baseCoreUrl = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
  /** 多线程版 core 文件 CDN 基础路径 (含 worker) */
  const baseCoreMTUrl = "https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm";

  // 监听 FFmpeg 内部日志输出 (debug 级别, 默认不显示)
  ffmpeg.on("log", ({ message }) => {
    logger.debug("[ffmpeg]", message);
  });

  // 判断是否使用多线程模式
  const isMT = tryMultiThread && window.crossOriginIsolated;
  const mode = isMT ? "多" : "单";
  logger.info("[ffmpeg] " + mode + "线程模式");
  onProgress?.(`${mode}线程模式, 下载 core.js...`);

  // --- 步骤 1: 下载 core.js (FFmpeg 主入口脚本) ---
  const t0 = Date.now();
  const coreURL = await toBlobURL(
    `${isMT ? baseCoreMTUrl : baseCoreUrl}/ffmpeg-core.js`,
    "text/javascript",
  );
  const dt0 = Date.now() - t0;
  logger.info("[ffmpeg] core.js 下载完成 " + dt0 + "ms");
  onProgress?.(`core.js 下载完成 (${(dt0 / 1000).toFixed(1)}s), 下载 core.wasm...`);

  // --- 步骤 2: 下载 core.wasm (FFmpeg 核心 WASM 二进制, 通常最大) ---
  const t1 = Date.now();
  const wasmURL = await toBlobURL(
    `${isMT ? baseCoreMTUrl : baseCoreUrl}/ffmpeg-core.wasm`,
    "application/wasm",
  );
  const dt1 = Date.now() - t1;
  logger.info("[ffmpeg] core.wasm 下载完成 " + dt1 + "ms");
  onProgress?.(`core.wasm 下载完成 (${(dt1 / 1000).toFixed(1)}s), 初始化 WASM...`);

  // --- 步骤 3: 加载到 FFmpeg 实例 (含可选的 worker.js) ---
  const t2 = Date.now();
  const loadOpts: any = { coreURL, wasmURL };
  if (isMT) {
    // 多线程模式需要额外下载 worker 脚本
    loadOpts.workerURL = await toBlobURL(
      `${baseCoreMTUrl}/ffmpeg-core.worker.js`,
      "application/javascript",
    );
    onProgress?.(`worker.js 下载完成, 初始化 WASM...`);
  }

  // 实际初始化 WASM 运行时 (编译 + 实例化)
  await ffmpeg.load(loadOpts);
  const dt2 = Date.now() - t2;
  logger.info("[ffmpeg] WASM 初始化完成 " + dt2 + "ms");
  onProgress?.(`初始化完成 (总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};
