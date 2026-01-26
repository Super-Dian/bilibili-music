import fs from "fs";
import path from "path";
import process from "process";

import { vitePluginForArco } from "@arco-plugins/vite-vue";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import { ArcoResolver } from "unplugin-vue-components/resolvers";
import Components from "unplugin-vue-components/vite";
import { defineConfig, loadEnv } from "vite";
import monkey, { cdn, util } from "vite-plugin-monkey";

const pathSrc = path.resolve(__dirname, "src");
const rootDir = process.cwd();

// https://vitejs.dev/config/
export default defineConfig(() => {
  const env = loadEnv("", process.cwd(), "");
  const _VITE_RELEASE_MODE = env.VITE_RELEASE_MODE ?? "dev";
  const VITE_VERSION = env.VITE_VERSION ?? "dev";
  return {
    plugins: [
      vue(),
      vitePluginForArco({
        style: "css",
      }),
      AutoImport({
        dts: true,
        imports: ["vue"],
        resolvers: [ArcoResolver()],
      }),
      Components({
        dts: true,
        dirs: ["src/steps", "src/components"],
        include: /.vue$/,
        resolvers: [
          ArcoResolver({
            sideEffect: false,
          }),
        ],
      }),
      {
        name: "replace-url",
        apply: "build",
        transform(code, id) {
          if (id.includes("@ffmpeg/ffmpeg/dist/esm/classes.js")) {
            // this will prevent vite create chunk for worker.js
            const header = `import MyWorker from '@ffmpeg/ffmpeg/worker?worker&inline';\n`;
            return (
              header +
              code.replace(`new Worker(new URL("./worker.js", import.meta.url), `, `new MyWorker(`)
            );
          }
        },
      },
      monkey({
        entry: "src/main.ts",
        format: {
          generate(uOptions) {
            if (uOptions.mode === "build") {
              const filePath = path.join(rootDir, "update.log");
              const fileContent = fs.readFileSync(filePath, "utf-8");
              const lines = fileContent.trim().split("\n");
              const lastTenLines = lines.slice(-30);
              const log = lastTenLines
                .reverse()
                .map((line) => `// ${line}`)
                .join("\n");
              return (
                uOptions.userscript +
                `\n// 更新日志[只显示最新的10条,🌟🤡 分别代表新功能和bug修复]\n${log}`
              );
            } else {
              return uOptions.userscript;
            }
          },
        },
        userscript: {
          name: "Wasm🎶音乐姬",
          version: VITE_VERSION,
          description: "仅帮助用户从视频页下载音乐(封面,Tags,歌词,字幕 写入支持)的油猴脚本",
          author: "Ocyss",
          grant: ["unsafeWindow"],
          "run-at": "document-start",
          icon: " https://static.hdslb.com/images/favicon.ico",
          namespace: "https://github.com/Ocyss/wasm-music",
          homepage: "https://github.com/Ocyss/wasm-music",
          match: [
            "https://www.bilibili.com/video/*",
            "https://www.bilibili.com/list/*",
            "*://www.bilibili.com",
          ],
          connect: [
            "api.bilibili.com",
            "bilibili.com",
            "hdslb.com",
            "mxnzp.com",
            "bilivideo.com",
            "www.hhlqilongzhu.cn",
            "api.52vmy.cn",
          ],
          downloadURL: "https://update.greasyfork.org/scripts/498677.user.js",
          updateURL: "https://update.greasyfork.org/scripts/498677.user.js",
        },
        build: {
          externalGlobals: {
            vue: cdn
              .jsdelivr("Vue", "dist/vue.global.prod.js")
              .concat(util.dataUrl(";window.Vue=Vue;")),
            "@arco-design/web-vue": cdn.jsdelivr("ArcoVue", "dist/arco-vue.min.js"),
            // "@ffmpeg/ffmpeg": cdn.jsdelivr(
            //   "@ffmpeg/ffmpeg",
            //   "dist/umd/ffmpeg.js"
            // ),
            // "@ffmpeg/util": cdn.jsdelivr(
            //   "@ffmpeg/util",
            //   "dist/umd/index.js"
            // ),
          },
        },
        server: {
          prefix: false,
        },
      }),
    ],
    resolve: {
      alias: {
        "@": pathSrc,
      },
    },
    build: {
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === "UNUSED_EXTERNAL_IMPORT") return;
          if (warning.message.includes("resolveComponent")) return;
          warn(warning);
        },
      },
    },
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
  };
});
