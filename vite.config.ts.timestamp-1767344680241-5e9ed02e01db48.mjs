// vite.config.ts
import { defineConfig, loadEnv } from "file:///D:/Diandian/Python/bilibili-music/node_modules/vite/dist/node/index.js";
import vue from "file:///D:/Diandian/Python/bilibili-music/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import monkey, { cdn, util } from "file:///D:/Diandian/Python/bilibili-music/node_modules/vite-plugin-monkey/dist/node/index.mjs";
import { vitePluginForArco } from "file:///D:/Diandian/Python/bilibili-music/node_modules/@arco-plugins/vite-vue/lib/index.js";
import process from "process";
import path from "path";
import AutoImport from "file:///D:/Diandian/Python/bilibili-music/node_modules/unplugin-auto-import/dist/vite.js";
import Components from "file:///D:/Diandian/Python/bilibili-music/node_modules/unplugin-vue-components/dist/vite.js";
import { ArcoResolver } from "file:///D:/Diandian/Python/bilibili-music/node_modules/unplugin-vue-components/dist/resolvers.js";
import wasm from "file:///D:/Diandian/Python/bilibili-music/node_modules/vite-plugin-wasm/exports/import.mjs";
import fs from "fs";
var __vite_injected_original_dirname = "D:\\Diandian\\Python\\bilibili-music";
var pathSrc = path.resolve(__vite_injected_original_dirname, "src");
var rootDir = process.cwd();
var vite_config_default = defineConfig(() => {
  const env = loadEnv("", process.cwd(), "");
  const VITE_RELEASE_MODE = env.VITE_RELEASE_MODE ?? "dev";
  const VITE_VERSION = env.VITE_VERSION ?? "dev";
  return {
    plugins: [
      wasm(),
      vue(),
      vitePluginForArco({
        style: "css"
      }),
      AutoImport({
        dts: true,
        imports: ["vue"],
        resolvers: [ArcoResolver()]
      }),
      Components({
        dts: true,
        dirs: ["src/steps", "src/components"],
        include: /.vue$/,
        resolvers: [
          ArcoResolver({
            sideEffect: false
          })
        ]
      }),
      monkey({
        entry: "src/main.ts",
        format: {
          generate(uOptions) {
            if (uOptions.mode === "build") {
              const filePath = path.join(rootDir, "update.log");
              const fileContent = fs.readFileSync(filePath, "utf-8");
              const lines = fileContent.trim().split("\n");
              const lastTenLines = lines.slice(-30);
              const log = lastTenLines.reverse().map((line) => `// ${line}`).join("\n");
              return uOptions.userscript + `
// \u66F4\u65B0\u65E5\u5FD7[\u53EA\u663E\u793A\u6700\u65B0\u768410\u6761,\u{1F31F}\u{1F921} \u5206\u522B\u4EE3\u8868\u65B0\u529F\u80FD\u548Cbug\u4FEE\u590D]
${log}`;
            } else {
              return uOptions.userscript;
            }
          }
        },
        userscript: {
          name: "Bilibili\u{1F3B6}\u97F3\u4E50\u59EC",
          version: VITE_VERSION,
          description: "\u4EC5\u5E2E\u52A9\u7528\u6237\u4ECE\u89C6\u9891\u9875\u4E0B\u8F7D\u97F3\u4E50(\u5C01\u9762,Tags,\u6B4C\u8BCD,\u5B57\u5E55 \u5199\u5165\u652F\u6301)\u7684\u6CB9\u7334\u811A\u672C",
          author: "Ocyss",
          grant: ["unsafeWindow"],
          "run-at": "document-start",
          icon: " https://static.hdslb.com/images/favicon.ico",
          namespace: "https://github.com/Ocyss/bilibili-music",
          homepage: "https://github.com/Ocyss/bilibili-music",
          match: ["https://www.bilibili.com/video/*", "https://www.bilibili.com/list/*", "*://www.bilibili.com"],
          connect: [
            "api.bilibili.com",
            "bilibili.com",
            "hdslb.com",
            "mxnzp.com",
            "bilivideo.com",
            "www.hhlqilongzhu.cn",
            "api.52vmy.cn"
          ],
          resource: {
            bilibili_music_backend_bg: "https://fastly.jsdelivr.net/npm/@ocyss/bilibili-music-backend@0.2.0/bilibili_music_backend_bg.wasm"
          },
          downloadURL: "https://update.greasyfork.org/scripts/498677/Bilibili%F0%9F%8E%B6%E9%9F%B3%E4%B9%90%E5%A7%AC.user.js",
          updateURL: "https://update.greasyfork.org/scripts/498677/Bilibili%F0%9F%8E%B6%E9%9F%B3%E4%B9%90%E5%A7%AC.user.js"
        },
        build: {
          externalGlobals: {
            vue: cdn.jsdelivr("Vue", "dist/vue.global.prod.js").concat(util.dataUrl(";window.Vue=Vue;")),
            "@arco-design/web-vue": cdn.jsdelivr(
              "ArcoVue",
              "dist/arco-vue.min.js"
            )
          }
        },
        server: {
          prefix: false
        }
      }),
      {
        name: "wasm-cdn",
        renderChunk(code) {
          let tempCode = code;
          const regx = new RegExp(/(__vite__wasmUrl = .*;)/);
          tempCode = code.replace(
            regx,
            `__vite__wasmUrl = _GM_getResourceURL("bilibili_music_backend_bg");`
          );
          return tempCode;
        }
      }
    ],
    resolve: {
      alias: {
        "@": pathSrc
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxEaWFuZGlhblxcXFxQeXRob25cXFxcYmlsaWJpbGktbXVzaWNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXERpYW5kaWFuXFxcXFB5dGhvblxcXFxiaWxpYmlsaS1tdXNpY1xcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovRGlhbmRpYW4vUHl0aG9uL2JpbGliaWxpLW11c2ljL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHZ1ZSBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tdnVlXCI7XHJcbmltcG9ydCBtb25rZXksIHsgY2RuLCB1dGlsIH0gZnJvbSBcInZpdGUtcGx1Z2luLW1vbmtleVwiO1xyXG5pbXBvcnQgeyB2aXRlUGx1Z2luRm9yQXJjbyB9IGZyb20gXCJAYXJjby1wbHVnaW5zL3ZpdGUtdnVlXCI7XHJcbmltcG9ydCBwcm9jZXNzIGZyb20gXCJwcm9jZXNzXCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCBBdXRvSW1wb3J0IGZyb20gXCJ1bnBsdWdpbi1hdXRvLWltcG9ydC92aXRlXCI7XHJcbmltcG9ydCBDb21wb25lbnRzIGZyb20gXCJ1bnBsdWdpbi12dWUtY29tcG9uZW50cy92aXRlXCI7XHJcbmltcG9ydCB7IEFyY29SZXNvbHZlciB9IGZyb20gXCJ1bnBsdWdpbi12dWUtY29tcG9uZW50cy9yZXNvbHZlcnNcIjtcclxuaW1wb3J0IHdhc20gZnJvbSBcInZpdGUtcGx1Z2luLXdhc21cIjtcclxuaW1wb3J0IGZzIGZyb20gXCJmc1wiO1xyXG5cclxuY29uc3QgcGF0aFNyYyA9IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjXCIpO1xyXG5jb25zdCByb290RGlyID0gcHJvY2Vzcy5jd2QoKTtcclxuXHJcbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoKSA9PiB7XHJcbiAgY29uc3QgZW52ID0gbG9hZEVudihcIlwiLCBwcm9jZXNzLmN3ZCgpLCBcIlwiKTtcclxuICBjb25zdCBWSVRFX1JFTEVBU0VfTU9ERSA9IGVudi5WSVRFX1JFTEVBU0VfTU9ERSA/PyBcImRldlwiO1xyXG4gIGNvbnN0IFZJVEVfVkVSU0lPTiA9IGVudi5WSVRFX1ZFUlNJT04gPz8gXCJkZXZcIjtcclxuICByZXR1cm4ge1xyXG4gICAgcGx1Z2luczogW1xyXG4gICAgICB3YXNtKCksXHJcbiAgICAgIHZ1ZSgpLFxyXG4gICAgICB2aXRlUGx1Z2luRm9yQXJjbyh7XHJcbiAgICAgICAgc3R5bGU6IFwiY3NzXCIsXHJcbiAgICAgIH0pLFxyXG4gICAgICBBdXRvSW1wb3J0KHtcclxuICAgICAgICBkdHM6IHRydWUsXHJcbiAgICAgICAgaW1wb3J0czogW1widnVlXCJdLFxyXG4gICAgICAgIHJlc29sdmVyczogW0FyY29SZXNvbHZlcigpXSxcclxuICAgICAgfSksXHJcbiAgICAgIENvbXBvbmVudHMoe1xyXG4gICAgICAgIGR0czogdHJ1ZSxcclxuICAgICAgICBkaXJzOiBbXCJzcmMvc3RlcHNcIiwgXCJzcmMvY29tcG9uZW50c1wiXSxcclxuICAgICAgICBpbmNsdWRlOiAvLnZ1ZSQvLFxyXG4gICAgICAgIHJlc29sdmVyczogW1xyXG4gICAgICAgICAgQXJjb1Jlc29sdmVyKHtcclxuICAgICAgICAgICAgc2lkZUVmZmVjdDogZmFsc2UsXHJcbiAgICAgICAgICB9KSxcclxuICAgICAgICBdLFxyXG4gICAgICB9KSxcclxuICAgICAgbW9ua2V5KHtcclxuICAgICAgICBlbnRyeTogXCJzcmMvbWFpbi50c1wiLFxyXG4gICAgICAgIGZvcm1hdDoge1xyXG4gICAgICAgICAgZ2VuZXJhdGUodU9wdGlvbnMpIHtcclxuICAgICAgICAgICAgaWYgKHVPcHRpb25zLm1vZGUgPT09IFwiYnVpbGRcIikge1xyXG4gICAgICAgICAgICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKHJvb3REaXIsIFwidXBkYXRlLmxvZ1wiKTtcclxuICAgICAgICAgICAgICBjb25zdCBmaWxlQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aCwgXCJ1dGYtOFwiKTtcclxuICAgICAgICAgICAgICBjb25zdCBsaW5lcyA9IGZpbGVDb250ZW50LnRyaW0oKS5zcGxpdChcIlxcblwiKTtcclxuICAgICAgICAgICAgICBjb25zdCBsYXN0VGVuTGluZXMgPSBsaW5lcy5zbGljZSgtMzApO1xyXG4gICAgICAgICAgICAgIGNvbnN0IGxvZyA9IGxhc3RUZW5MaW5lc1xyXG4gICAgICAgICAgICAgICAgLnJldmVyc2UoKVxyXG4gICAgICAgICAgICAgICAgLm1hcCgobGluZSkgPT4gYC8vICR7bGluZX1gKVxyXG4gICAgICAgICAgICAgICAgLmpvaW4oXCJcXG5cIik7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgICAgIHVPcHRpb25zLnVzZXJzY3JpcHQgK1xyXG4gICAgICAgICAgICAgICAgYFxcbi8vIFx1NjZGNFx1NjVCMFx1NjVFNVx1NUZEN1tcdTUzRUFcdTY2M0VcdTc5M0FcdTY3MDBcdTY1QjBcdTc2ODQxMFx1Njc2MSxcdUQ4M0NcdURGMUZcdUQ4M0VcdUREMjEgXHU1MjA2XHU1MjJCXHU0RUUzXHU4ODY4XHU2NUIwXHU1MjlGXHU4MEZEXHU1NDhDYnVnXHU0RkVFXHU1OTBEXVxcbiR7bG9nfWBcclxuICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIHJldHVybiB1T3B0aW9ucy51c2Vyc2NyaXB0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgdXNlcnNjcmlwdDoge1xyXG4gICAgICAgICAgbmFtZTogXCJCaWxpYmlsaVx1RDgzQ1x1REZCNlx1OTdGM1x1NEU1MFx1NTlFQ1wiLFxyXG4gICAgICAgICAgdmVyc2lvbjogVklURV9WRVJTSU9OLFxyXG4gICAgICAgICAgZGVzY3JpcHRpb246XHJcbiAgICAgICAgICAgIFwiXHU0RUM1XHU1RTJFXHU1MkE5XHU3NTI4XHU2MjM3XHU0RUNFXHU4OUM2XHU5ODkxXHU5ODc1XHU0RTBCXHU4RjdEXHU5N0YzXHU0RTUwKFx1NUMwMVx1OTc2MixUYWdzLFx1NkI0Q1x1OEJDRCxcdTVCNTdcdTVFNTUgXHU1MTk5XHU1MTY1XHU2NTJGXHU2MzAxKVx1NzY4NFx1NkNCOVx1NzMzNFx1ODExQVx1NjcyQ1wiLFxyXG4gICAgICAgICAgYXV0aG9yOiBcIk9jeXNzXCIsXHJcbiAgICAgICAgICBncmFudDogW1widW5zYWZlV2luZG93XCJdLFxyXG4gICAgICAgICAgXCJydW4tYXRcIjogXCJkb2N1bWVudC1zdGFydFwiLFxyXG4gICAgICAgICAgaWNvbjogXCIgaHR0cHM6Ly9zdGF0aWMuaGRzbGIuY29tL2ltYWdlcy9mYXZpY29uLmljb1wiLFxyXG4gICAgICAgICAgbmFtZXNwYWNlOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9PY3lzcy9iaWxpYmlsaS1tdXNpY1wiLFxyXG4gICAgICAgICAgaG9tZXBhZ2U6IFwiaHR0cHM6Ly9naXRodWIuY29tL09jeXNzL2JpbGliaWxpLW11c2ljXCIsXHJcbiAgICAgICAgICBtYXRjaDogW1wiaHR0cHM6Ly93d3cuYmlsaWJpbGkuY29tL3ZpZGVvLypcIiwgXCJodHRwczovL3d3dy5iaWxpYmlsaS5jb20vbGlzdC8qXCIsIFwiKjovL3d3dy5iaWxpYmlsaS5jb21cIl0sXHJcbiAgICAgICAgICBjb25uZWN0OiBbXHJcbiAgICAgICAgICAgIFwiYXBpLmJpbGliaWxpLmNvbVwiLFxyXG4gICAgICAgICAgICBcImJpbGliaWxpLmNvbVwiLFxyXG4gICAgICAgICAgICBcImhkc2xiLmNvbVwiLFxyXG4gICAgICAgICAgICBcIm14bnpwLmNvbVwiLFxyXG4gICAgICAgICAgICBcImJpbGl2aWRlby5jb21cIixcclxuICAgICAgICAgICAgXCJ3d3cuaGhscWlsb25nemh1LmNuXCIsXHJcbiAgICAgICAgICAgIFwiYXBpLjUydm15LmNuXCIsXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgICAgcmVzb3VyY2U6IHtcclxuICAgICAgICAgICAgYmlsaWJpbGlfbXVzaWNfYmFja2VuZF9iZzpcclxuICAgICAgICAgICAgICBcImh0dHBzOi8vZmFzdGx5LmpzZGVsaXZyLm5ldC9ucG0vQG9jeXNzL2JpbGliaWxpLW11c2ljLWJhY2tlbmRAMC4yLjAvYmlsaWJpbGlfbXVzaWNfYmFja2VuZF9iZy53YXNtXCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgZG93bmxvYWRVUkw6XHJcbiAgICAgICAgICAgIFwiaHR0cHM6Ly91cGRhdGUuZ3JlYXN5Zm9yay5vcmcvc2NyaXB0cy80OTg2NzcvQmlsaWJpbGklRjAlOUYlOEUlQjYlRTklOUYlQjMlRTQlQjklOTAlRTUlQTclQUMudXNlci5qc1wiLFxyXG4gICAgICAgICAgdXBkYXRlVVJMOlxyXG4gICAgICAgICAgICBcImh0dHBzOi8vdXBkYXRlLmdyZWFzeWZvcmsub3JnL3NjcmlwdHMvNDk4Njc3L0JpbGliaWxpJUYwJTlGJThFJUI2JUU5JTlGJUIzJUU0JUI5JTkwJUU1JUE3JUFDLnVzZXIuanNcIixcclxuICAgICAgICB9LFxyXG4gICAgICAgIGJ1aWxkOiB7XHJcbiAgICAgICAgICBleHRlcm5hbEdsb2JhbHM6IHtcclxuICAgICAgICAgICAgdnVlOiBjZG5cclxuICAgICAgICAgICAgICAuanNkZWxpdnIoXCJWdWVcIiwgXCJkaXN0L3Z1ZS5nbG9iYWwucHJvZC5qc1wiKVxyXG4gICAgICAgICAgICAgIC5jb25jYXQodXRpbC5kYXRhVXJsKFwiO3dpbmRvdy5WdWU9VnVlO1wiKSksXHJcbiAgICAgICAgICAgIFwiQGFyY28tZGVzaWduL3dlYi12dWVcIjogY2RuLmpzZGVsaXZyKFxyXG4gICAgICAgICAgICAgIFwiQXJjb1Z1ZVwiLFxyXG4gICAgICAgICAgICAgIFwiZGlzdC9hcmNvLXZ1ZS5taW4uanNcIlxyXG4gICAgICAgICAgICApLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHNlcnZlcjoge1xyXG4gICAgICAgICAgcHJlZml4OiBmYWxzZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9KSxcclxuICAgICAge1xyXG4gICAgICAgIG5hbWU6IFwid2FzbS1jZG5cIixcclxuICAgICAgICByZW5kZXJDaHVuayhjb2RlKSB7XHJcbiAgICAgICAgICBsZXQgdGVtcENvZGUgPSBjb2RlO1xyXG4gICAgICAgICAgY29uc3QgcmVneCA9IG5ldyBSZWdFeHAoLyhfX3ZpdGVfX3dhc21VcmwgPSAuKjspLyk7XHJcbiAgICAgICAgICB0ZW1wQ29kZSA9IGNvZGUucmVwbGFjZShcclxuICAgICAgICAgICAgcmVneCxcclxuICAgICAgICAgICAgYF9fdml0ZV9fd2FzbVVybCA9IF9HTV9nZXRSZXNvdXJjZVVSTChcImJpbGliaWxpX211c2ljX2JhY2tlbmRfYmdcIik7YFxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIHJldHVybiB0ZW1wQ29kZTtcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgXSxcclxuICAgIHJlc29sdmU6IHtcclxuICAgICAgYWxpYXM6IHtcclxuICAgICAgICBcIkBcIjogcGF0aFNyYyxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBNlIsU0FBUyxjQUFjLGVBQWU7QUFDblUsT0FBTyxTQUFTO0FBQ2hCLE9BQU8sVUFBVSxLQUFLLFlBQVk7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsT0FBTyxhQUFhO0FBQ3BCLE9BQU8sVUFBVTtBQUNqQixPQUFPLGdCQUFnQjtBQUN2QixPQUFPLGdCQUFnQjtBQUN2QixTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFVBQVU7QUFDakIsT0FBTyxRQUFRO0FBVmYsSUFBTSxtQ0FBbUM7QUFZekMsSUFBTSxVQUFVLEtBQUssUUFBUSxrQ0FBVyxLQUFLO0FBQzdDLElBQU0sVUFBVSxRQUFRLElBQUk7QUFHNUIsSUFBTyxzQkFBUSxhQUFhLE1BQU07QUFDaEMsUUFBTSxNQUFNLFFBQVEsSUFBSSxRQUFRLElBQUksR0FBRyxFQUFFO0FBQ3pDLFFBQU0sb0JBQW9CLElBQUkscUJBQXFCO0FBQ25ELFFBQU0sZUFBZSxJQUFJLGdCQUFnQjtBQUN6QyxTQUFPO0FBQUEsSUFDTCxTQUFTO0FBQUEsTUFDUCxLQUFLO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixrQkFBa0I7QUFBQSxRQUNoQixPQUFPO0FBQUEsTUFDVCxDQUFDO0FBQUEsTUFDRCxXQUFXO0FBQUEsUUFDVCxLQUFLO0FBQUEsUUFDTCxTQUFTLENBQUMsS0FBSztBQUFBLFFBQ2YsV0FBVyxDQUFDLGFBQWEsQ0FBQztBQUFBLE1BQzVCLENBQUM7QUFBQSxNQUNELFdBQVc7QUFBQSxRQUNULEtBQUs7QUFBQSxRQUNMLE1BQU0sQ0FBQyxhQUFhLGdCQUFnQjtBQUFBLFFBQ3BDLFNBQVM7QUFBQSxRQUNULFdBQVc7QUFBQSxVQUNULGFBQWE7QUFBQSxZQUNYLFlBQVk7QUFBQSxVQUNkLENBQUM7QUFBQSxRQUNIO0FBQUEsTUFDRixDQUFDO0FBQUEsTUFDRCxPQUFPO0FBQUEsUUFDTCxPQUFPO0FBQUEsUUFDUCxRQUFRO0FBQUEsVUFDTixTQUFTLFVBQVU7QUFDakIsZ0JBQUksU0FBUyxTQUFTLFNBQVM7QUFDN0Isb0JBQU0sV0FBVyxLQUFLLEtBQUssU0FBUyxZQUFZO0FBQ2hELG9CQUFNLGNBQWMsR0FBRyxhQUFhLFVBQVUsT0FBTztBQUNyRCxvQkFBTSxRQUFRLFlBQVksS0FBSyxFQUFFLE1BQU0sSUFBSTtBQUMzQyxvQkFBTSxlQUFlLE1BQU0sTUFBTSxHQUFHO0FBQ3BDLG9CQUFNLE1BQU0sYUFDVCxRQUFRLEVBQ1IsSUFBSSxDQUFDLFNBQVMsTUFBTSxJQUFJLEVBQUUsRUFDMUIsS0FBSyxJQUFJO0FBQ1oscUJBQ0UsU0FBUyxhQUNUO0FBQUE7QUFBQSxFQUE0QyxHQUFHO0FBQUEsWUFFbkQsT0FBTztBQUNMLHFCQUFPLFNBQVM7QUFBQSxZQUNsQjtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBQUEsUUFDQSxZQUFZO0FBQUEsVUFDVixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxhQUNFO0FBQUEsVUFDRixRQUFRO0FBQUEsVUFDUixPQUFPLENBQUMsY0FBYztBQUFBLFVBQ3RCLFVBQVU7QUFBQSxVQUNWLE1BQU07QUFBQSxVQUNOLFdBQVc7QUFBQSxVQUNYLFVBQVU7QUFBQSxVQUNWLE9BQU8sQ0FBQyxvQ0FBb0MsbUNBQW1DLHNCQUFzQjtBQUFBLFVBQ3JHLFNBQVM7QUFBQSxZQUNQO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRjtBQUFBLFVBQ0EsVUFBVTtBQUFBLFlBQ1IsMkJBQ0U7QUFBQSxVQUNKO0FBQUEsVUFDQSxhQUNFO0FBQUEsVUFDRixXQUNFO0FBQUEsUUFDSjtBQUFBLFFBQ0EsT0FBTztBQUFBLFVBQ0wsaUJBQWlCO0FBQUEsWUFDZixLQUFLLElBQ0YsU0FBUyxPQUFPLHlCQUF5QixFQUN6QyxPQUFPLEtBQUssUUFBUSxrQkFBa0IsQ0FBQztBQUFBLFlBQzFDLHdCQUF3QixJQUFJO0FBQUEsY0FDMUI7QUFBQSxjQUNBO0FBQUEsWUFDRjtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBQUEsUUFDQSxRQUFRO0FBQUEsVUFDTixRQUFRO0FBQUEsUUFDVjtBQUFBLE1BQ0YsQ0FBQztBQUFBLE1BQ0Q7QUFBQSxRQUNFLE1BQU07QUFBQSxRQUNOLFlBQVksTUFBTTtBQUNoQixjQUFJLFdBQVc7QUFDZixnQkFBTSxPQUFPLElBQUksT0FBTyx5QkFBeUI7QUFDakQscUJBQVcsS0FBSztBQUFBLFlBQ2Q7QUFBQSxZQUNBO0FBQUEsVUFDRjtBQUNBLGlCQUFPO0FBQUEsUUFDVDtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsSUFDQSxTQUFTO0FBQUEsTUFDUCxPQUFPO0FBQUEsUUFDTCxLQUFLO0FBQUEsTUFDUDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
