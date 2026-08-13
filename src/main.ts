import "@/style.css";

import { GM_getResourceURL, GM_registerMenuCommand, unsafeWindow } from "$";
import { createApp } from "vue";

import App from "@/App.vue";
import { defaultData } from "@/data";
import { configureEpisodeAppLauncher, openMusicApp } from "@/episode";
import { initFloatingEntry } from "@/floatingEntry";
import { initTaskCenterUI, updateTaskCenterRuntime } from "@/taskCenter";
import { drop } from "@/utils/drop";
import { preflightFFmpegEnvironment } from "@/utils/ffmpeg";
import { logger } from "@/utils/logger";

import elmGetter from "./utils/elmGetter";

/** 检测页面是否处于深色模式 */
function detectDarkMode(): boolean {
  const html = document.documentElement;
  const body = document.body;

  // 检查 html 的 class
  const htmlClasses = html.className;
  const bodyClasses = body?.className || "";

  // 检查各种可能的深色模式标识
  const isDark =
    htmlClasses.includes("dark") ||
    htmlClasses.includes("night") ||
    htmlClasses.includes("theme-dark") ||
    bodyClasses.includes("dark") ||
    bodyClasses.includes("night") ||
    html.getAttribute("data-theme") === "dark" ||
    html.getAttribute("data-color-mode") === "dark" ||
    html.getAttribute("data-dark-mode") === "true" ||
    body?.getAttribute("data-theme") === "dark" ||
    body?.getAttribute("data-color-mode") === "dark";

  // 调试信息
  logger.debug("[DarkMode] detect:", {
    htmlClasses,
    bodyClasses,
    dataTheme: html.getAttribute("data-theme"),
    dataColorMode: html.getAttribute("data-color-mode"),
    result: isDark,
  });

  return isDark;
}

/** 同步深色模式到 Arco 主题 */
function syncDarkMode() {
  if (document.body) {
    const isDark = detectDarkMode();
    document.body.setAttribute("arco-theme", isDark ? "dark" : "light");
    logger.debug("[DarkMode] synced:", isDark ? "dark" : "light");
  }
}

// 监听页面 class 变化（html 和 body）
const darkModeObserver = new MutationObserver(syncDarkMode);
darkModeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["class", "data-theme", "data-color-mode", "data-dark-mode"],
});

// 也监听 body 的变化
const bodyObserver = new MutationObserver(syncDarkMode);

// 初始同步（DOM 就绪后）
if (document.body) {
  syncDarkMode();
  bodyObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-color-mode", "data-dark-mode"],
  });
} else {
  document.addEventListener("DOMContentLoaded", () => {
    syncDarkMode();
    if (document.body) {
      bodyObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "data-color-mode", "data-dark-mode"],
      });
    }
  });
}

GM_getResourceURL("wasm_music_backend_bg");

configureEpisodeAppLauncher(() => {
  const el = document.createElement("div");
  el.id = "bilibili-music-vue";
  document.body.appendChild(el);
  const app = createApp(App);
  app.mount(el);
  return { app, root: el };
});

const main = () => void openMusicApp();

initFloatingEntry(main);
initTaskCenterUI();
const ffmpegPreflight = preflightFFmpegEnvironment();
updateTaskCenterRuntime({
  ffmpegStatus: ffmpegPreflight.supported ? "ready" : "error",
  ffmpegMessage: ffmpegPreflight.message,
  ffmpegMode: ffmpegPreflight.mode,
  cacheAvailable: ffmpegPreflight.cacheAvailable,
});

elmGetter.each(".tag-panel .tag .bgm-tag", (elm) => {
  const download = document.createElement("a");
  download.classList.add("bilibili-music-root");
  download.innerHTML = `<svg t="1718115268538" class="icon" viewBox="0 0 1264 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9046" width="20" height="20"><path d="M992.171444 312.62966C975.189616 137.155482 827.415189 0 647.529412 0 469.849434 0 323.616239 133.860922 303.679205 306.210218 131.598564 333.839271 0 482.688318 0 662.588235c0 199.596576 161.815189 361.411765 361.411765 361.411765h572.235294v-1.555371c185.470975-15.299199 331.294118-170.426291 331.294117-359.856394 0-168.969898-116.101408-310.367302-272.769732-349.958575zM632.470588 963.764706L294.530793 602.352941h244.278155V271.058824h180.705882V602.352941H970.410384z" p-id="9047"></path></svg>`;
  download.onclick = (event) => {
    event.preventDefault();
    main();
  };
  logger.info({ msg: "音乐姬注入成功!", elm, download });

  elm.appendChild(download);
  return true;
});

const initFileOpen = () => {
  if (window.self !== window.top) {
    return;
  }

  const file = document.createElement("div");
  logger.debug("开始初始化 File 拖选框", file);
  file.id = "bilibili-music-file";
  file.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 9999;
    pointer-events: none;
    display: none;
    color: white;
    font-size: 24px;
    display: flex;
    justify-content: center;
    align-items: center;
    display: none;
  `;
  file.innerHTML = `
    <div style="text-align: center;">
      <svg style="width: 64px; height: 64px; margin-bottom: 16px;" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M544 864V672h192L512 448 288 672h192v192H544zM512 384l224-224H544V0H480v160H288l224 224z"/>
      </svg>
      <div>拖放打开对应视频</div>
    </div>
  `;

  document.documentElement.appendChild(file);

  document.documentElement.addEventListener(
    "dragenter",
    function (e) {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      file.style.display = "flex";
    },
    false,
  );

  document.documentElement.addEventListener(
    "dragover",
    function (e) {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      file.style.display = "flex";
    },
    false,
  );

  document.documentElement.addEventListener(
    "dragleave",
    function (e) {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      file.style.display = "none";
    },
    false,
  );

  document.documentElement.addEventListener("drop", async function (e) {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    file.style.display = "none";
    const droppedFiles = e.dataTransfer?.files;
    await drop(droppedFiles);
  });
};

GM_registerMenuCommand("打开音乐姬🎶", main);

initFileOpen();

unsafeWindow._bilibili_music_open = main;
unsafeWindow._bilibili_music_fileOpen = initFileOpen;

declare global {
  interface Window {
    _bilibili_music_fromData: typeof defaultData;
    _bilibili_music_userConfig: any;
    _bilibili_music_open: () => void;
    _bilibili_music_fileOpen: () => void;
  }
}
