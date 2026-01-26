import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { logger } from "./logger";

export const ffmpeg = new FFmpeg();

export const ffmpegLoad = async () => {
        let tryMultiThread = true
        // const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd'
        const baseFFmpegUrl = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm'
        const baseCoreUrl = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
        const baseCoreMTUrl = 'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/umd'
        ffmpeg.on('log', ({ message }) => {
            logger.debug('[ffmpeg]', message)
        })

        if (tryMultiThread && window.crossOriginIsolated) {
            logger.info('[ffmpeg] 多线程模式')
            await ffmpeg.load({
                coreURL: await toBlobURL(`${baseCoreMTUrl}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseCoreMTUrl}/ffmpeg-core.wasm`, 'application/wasm'),
                workerURL: await toBlobURL(`${baseCoreMTUrl}/ffmpeg-core.worker.js`, 'application/javascript'),
                // classWorkerURL:await toBlobURL(`${baseFFmpegUrl}/worker.js`, 'application/javascript'),
            })
        } else {
            logger.info('[ffmpeg] 单线程模式')
            await ffmpeg.load({
                coreURL: await toBlobURL(`${baseCoreUrl}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseCoreUrl}/ffmpeg-core.wasm`, 'application/wasm'),
                // classWorkerURL:await toBlobURL(`${baseFFmpegUrl}/worker.js`, 'application/javascript'),
            })
        }
        logger.info('[ffmpeg] load完成')
    }