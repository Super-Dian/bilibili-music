# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

bilibili-music is a Tampermonkey userscript that injects into Bilibili video pages to download audio with embedded cover art, ID3 tags, lyrics, and subtitles. It is NOT an Electron app — the Vue 3 app mounts directly into the host page's DOM.

## Commands

| Command             | Purpose                                |
| ------------------- | -------------------------------------- |
| `bun run dev`       | Start Vite dev server                  |
| `bun run build`     | Build the userscript (output: `dist/`) |
| `bun run build:tsc` | Type-check with vue-tsc, then build    |
| `bun run fmt`       | Format with oxfmt                      |
| `bun run lint`      | Lint with oxlint (type-aware)          |
| `bun run lint:fix`  | Auto-fix lint issues                   |

**Package manager**: Bun. **Linter/formatter**: oxlint + oxfmt (Oxc toolchain, not ESLint/Prettier).

## Architecture

### Injection Model

- `src/main.ts` watches for `.bgm-tag` elements on Bilibili pages via `elmGetter` (MutationObserver). On detection, injects a download button. Clicking it mounts the Vue app into a `<div id="bilibili-music-vue">`.
- Uses Tampermonkey APIs: `GM_xmlhttpRequest` (cross-origin requests), `GM_getValue`/`GM_setValue` (persistent config), `GM_cookie`, `unsafeWindow` (access to page's Vue instance).

### Wizard Flow (5 Steps)

The app is a modal with a vertical steps sidebar:

1. **clip.vue** — Audio trimming (delete ranges, speed)
2. **info.vue** — Title/author/filename metadata with template placeholders
3. **cover.vue** — Cover art selection (video cover, music cover, UP avatar)
4. **lyrics.vue** — Lyrics selection, editing, online search, AI correction, smart correction
5. **audio.vue** — FFmpeg WASM pipeline: fetch audio → transcode M4S→M4A → embed clip/speed/metadata/cover/lyrics → download via FileSaver

### State Management

No Vuex/Pinia. `src/data.ts` holds all wizard state in a single `reactive()` object (`fromData`) and a `userConfig` object persisted via GM_getValue/GM_setValue with auto-save on change.

Key `fromData` fields:

- `lyricsData: Lyrics | null` — `[timestamp_ms, text][]` pairs for audio embedding
- `clipRanges: ClipRanges | null` — `[[start_ms, end_ms], ...]` delete ranges
- `externalLyrics: boolean` — save lyrics as standalone `.lrc` file instead of embedding
- `speed: number` — playback speed multiplier
- `coverUrl: string | null` — cover image URL
- `usedefaultconfig: boolean` — auto-apply saved default rules

Key `userConfig` fields:

- `openai: { host, key, modal }` — OpenAI-compatible API for AI lyrics correction

### Auto-imports

Vue APIs (`ref`, `computed`, `watch`, etc.) are auto-imported via `unplugin-auto-import` — do NOT add explicit imports in `.vue` files. Components from `src/steps/` and `src/components/` are auto-registered via `unplugin-vue-components`.

### Path Alias

`@` → `./src` (configured in both tsconfig and vite config).

### API Layer

`src/utils/requests.ts` wraps `GM_xmlhttpRequest` into a Promise-based API with automatic cookie injection. Bilibili APIs are called directly (no proxy server).

### WASM Backends

- **FFmpeg WASM** (`src/utils/ffmpeg.ts`): Primary audio processing. Loaded from unpkg CDN, with multi-thread support when `crossOriginIsolated`.
- **Rust WASM** (`backend/`): Earlier implementation for ID3 tag writing and WAV clipping via wasm-pack. Build with `cd backend && make build` (requires Rust + wasm-pack). The compiled output is patched to `@ocyss/wasm-music-backend`.

### Lyrics System (lyrics.vue + lyricsCorrector.ts)

**Online Lyrics Search** (two-step API):

- `onlineLyricsApis` defines search sources (currently LuoXueAPI at `api.vkeys.cn`).
- Step 1: `searchOnlineLyrics()` queries `?word=歌曲名` → returns `{ data: [{ id, name }] }`.
- Step 2: Watcher on `onlineLyricsIndex` fetches lyrics via `detailUrl + ?id=songId` → returns `{ data: { lrc } }`.
- `lyricsIdMap` caches `compositeKey → songId` mapping between steps.

**Lyrics Workshop Modal** (fullscreen):

- Left panel: editable textarea (`_editBody`) for the selected subtitle track.
- Right panel tabs:
  - **在线歌词** — search, select, toggle formatting (timeAxis/blankChar/metaInfo/stripMeta), editable preview with diff view toggle, replace/undo/smart-correct buttons.
  - **AI 改写** — OpenAI-compatible API with custom prompt template (`{{onlineLyrics}}` placeholder). Strict typo correction only.
  - **结果预览** — final lyrics with ♪ note formatting.

**Smart Correction** (`src/utils/lyricsCorrector.ts`):

- `correctLyrics(aiBody, onlineText)` — character-level diff correction.
- `cleanOriginalLyrics(text)` — strips LRC tags, metadata (`key:value`/`key-value` format), title lines (`歌名 - 歌手`).
- Algorithm: `diffChars(origText, aiText)` → reconstruct by keeping unchanged+removed, skipping added → split back into AI's original line boundaries.
- **Diff Normalization** (`normalizeDiffs`): Pre-processes diff results to handle four states:
  1. `unchanged` — unchanged characters (plain object)
  2. `changed` — removed + same-length added (paired)
  3. `removed` — pure deletion (no paired added)
  4. `added` — pure addition (no paired removed)
- **Pending Line Break Logic**: When `aiCharCount` reaches line boundary, waits for pending `removed` blocks before executing line break. Only pure `removed` (not `changed`) triggers pending behavior.

**Online Lyrics with Time Axis**:

- `parseLrcToLyrics(lrcText)` — parses LRC format into `Array<[ms, text]>` with time axis.
- "使用在线歌词" switch in lyrics workshop enables automatic replacement with online lyrics time axis.
- "第一句歌词开始时间" input (mm:ss format) allows adjusting the offset between video and online lyrics.
- `useOnlineLyrics` flag controls: disables max-length validation, enables OK button, disables smart correction.

**External Lyrics** (`fromData.externalLyrics`):

- When enabled, `audio.vue` saves the LRC string as a standalone `.lrc` file via FileSaver instead of embedding in audio metadata.

### Audio Processing (audio.vue)

**FFmpeg Pipeline**:

- Cover embedding uses `-c:v copy` (not `-c:v mjpeg`) to avoid progressive JPEG decode hangs in single-thread WASM mode.
- `processLyrics()` adjusts timestamps: subtracts deleted clip ranges, applies speed multiplier, filters out lyrics in deleted ranges.
- `formatLrc(ms)` converts milliseconds to `[MM:SS.mmm]` format.
- LRC header: `[ti:...]`, `[ar:...]`, `[al:...]`, `[re:ocyss/wasm-music]`, `[url:...]`.

### Clip Timeline（剪辑时间轴）

- `src/steps/clip.vue` — 音频剪辑界面，支持区间删除、倍速、时间轴拖动
- 性能优化：鼠标移动使用 `requestAnimationFrame` 节流，避免高频 `mousemove` 导致卡顿
- 虚拟位置：`displayTime` ref 与 `video.currentTime` 解耦，由 `timeupdate` 事件驱动同步
- tooltip 复用对象引用，仅更新变化属性，减少 Vue 响应式开销

### TaskCenter（任务中心）

- `src/taskCenter.ts` — 任务队列状态管理、调度、持久化，纯逻辑层不包含 DOM 操作
- `src/components/TaskCenter.vue` — 任务中心 UI，作为独立 Vue 应用挂载到 `#bilibili-music-task-center`
- 订阅机制：`subscribeTaskCenter(listener)` 监听状态变化，组件通过 `getTaskCenterState()` / `getTaskCenterRuntime()` 获取快照
- `panelOpen` 为组件内局部 `ref`，外部（如 `clearFinishedDownloadTasks`）无法访问；调用清除时需在组件内同步重置

### FloatingEntry（悬浮入口）

- `src/components/FloatingEntry.vue` — 悬浮入口按钮，仅在 `/video/` 和 `/list/` 路径下显示
- 作为独立 Vue 应用挂载到 `#bilibili-music-floating-entry`（`document.documentElement`）

### 深色模式同步

- `syncDarkMode()` 同时设置 `document.documentElement` 和 `document.body` 的 `arco-theme` 属性
- 自定义组件的深色样式使用 `html[arco-theme="dark"]` 或 `html[data-theme="dark"]` 选择器（非 `body`）

### Key Files

- `src/data.ts` — Centralized reactive state (fromData, userConfig)
- `src/utils/requests.ts` — HTTP request layer (GM_xmlhttpRequest wrapper)
- `src/utils/ffmpeg.ts` — FFmpeg WASM loader with multi-thread detection and progress logging
- `src/utils/lyricsCorrector.ts` — AI subtitle correction via character-level diff against online lyrics
- `src/utils/drop.ts` — Drag-and-drop: parses dropped .wav ID3 tags to find source URL
- `src/utils/gpt.ts` — OpenAI-compatible API wrapper for AI lyrics correction

## Arco Design → Tailwind CSS 迁移进展

### 迁移分支

`refactor/tailwind-migration` — 渐进式替换 Arco 组件

### 已完成的组件替换

| 组件               | 替换为            | 数量 | 状态          |
| ------------------ | ----------------- | ---- | ------------- |
| `<a-button>`       | `UiButton`        | 32   | ✅ 完成       |
| `<a-input>`        | `UiInput`         | 12   | ✅ 完成       |
| `<a-textarea>`     | `UiTextarea`      | 5    | ✅ 完成       |
| `<a-checkbox>`     | 自定义 div        | 9    | ✅ 完成       |
| `<a-space>`        | CSS flex          | 7    | ✅ 完成       |
| `<a-form-item>`    | `UiFormItem`      | 8    | ✅ 完成       |
| `<a-form>`         | 原生 form         | 3    | ✅ 完成       |
| `<a-button-group>` | `UiButtonGroup`   | 3    | ✅ 已创建组件 |
| `<a-input-group>`  | `UiInputGroup`    | 3    | ✅ 已创建组件 |
| `<a-list>`         | 原生 div          | 1    | ✅ 完成       |
| `<a-collapse>`     | `details/summary` | 1    | ✅ 完成       |
| `<a-spin>`         | `UiSpin`          | 4    | ✅ 完成       |
| `<a-alert>`        | `UiAlert`         | 4    | ✅ 已创建组件 |
| `<a-result>`       | `UiResult`        | 4    | ✅ 完成       |
| `<a-select>`       | `UiSelect`        | 3    | ✅ 已创建组件 |
| `<a-modal>`        | `UiModal`         | 2    | ✅ 已创建组件 |
| `<a-tabs>`         | `UiTabs`          | 1    | ✅ 已创建组件 |
| `<a-steps>`        | `UiSteps`         | 1    | ✅ 已创建组件 |
| `<a-dropdown>`     | `UiDropdown`      | 3    | ✅ 已创建组件 |
| `<a-image>`        | `<img>`           | 1    | ✅ 完成       |
| `<a-trigger>`      | 自定义下拉        | 1    | ✅ 完成       |

### 新增的自定义组件

所有组件位于 `src/components/` 目录：

- `UiButton.vue` — 通用按钮，支持 primary/secondary/outline/text 类型
- `UiInput.vue` — 输入框，支持 v-model
- `UiTextarea.vue` — 文本域，支持 v-model
- `UiCheckbox.vue` — 复选框，支持 v-model
- `UiSpace.vue` — 间距容器
- `UiFormItem.vue` — 表单项
- `UiButtonGroup.vue` — 按钮组
- `UiInputGroup.vue` — 输入框组
- `UiSpin.vue` — 加载动画
- `UiAlert.vue` — 提示框
- `UiResult.vue` — 结果展示
- `UiSelect.vue` — 下拉选择
- `UiTabs.vue` — 标签页
- `UiSteps.vue` — 步骤条
- `UiDropdown.vue` — 下拉菜单
- `UiModal.vue` — 模态框（支持拖动功能）

### 构建结果

```
dist/wasm-music.user.js  367.19 kB │ gzip: 81.80 kB
```

### 深色模式支持

所有自定义组件都支持深色模式，通过以下选择器：

```css
:global([arco-theme="dark"]) .ui-xxx,
:global([data-theme="dark"]) .ui-xxx {
  /* 深色模式样式 */
}
```

### 迁移完成的工作

#### 1. 歌词工作台（lyrics.vue）

- 智能去除元信息：新增"智能去除元信息（纯文本）"选项，用于智能纠错对比
- `cleanOriginalLyricsPlain()` 函数：返回纯文本格式（无时间戳）
- `correctLyrics()` 函数：支持纯文本或带时间戳格式输入
- 在线歌词处理：智能纠错使用右侧编辑框内容（可能来自智能去除算法和用户手动修改）
- 成功提示：从"共修正 X 行"改为"共替换 X 个字符"

#### 2. 音频处理（ffmpeg.ts）

- 缓存日志：添加缓存命中/未命中日志输出
- 下载日志：添加下载开始/完成日志（含文件大小）
- CDN 日志：添加 CDN 源尝试/成功/失败日志
- 初始化日志：添加环境预检、加载模式、初始化状态日志

#### 3. 消息提示（message.ts）

- 深色模式适配：检测 `body` 的 `arco-theme` 或 `data-theme` 属性
- 样式变化：背景色 `#fff` → `#2a2a2a`，文字颜色 `#18191c` → `#e0e0e0`

#### 4. 剧集选择（picker.vue + App.vue）

- 接入主程序窗口：移除自定义弹窗，嵌入 App.vue 的 UiModal
- 动态宽度：picker 步骤时 900px，其他步骤 520px
- 侧栏隐藏：picker 步骤时隐藏侧栏步骤条
- Footer 替换：picker 步骤时用 picker 的 footer 替代 App 的 footer
- 高度优化：容器 `max-height: 75vh`，剧集列表可滚动
- 默认页码：打开 picker 时默认显示当前视频所在的页
- 样式统一：使用 UiAlert 替代 picker-hint

#### 5. 批量下载（episode.ts）

- 自动模式修复：修复 `activeVideoData` 未设置导致批量下载停止的问题
- 手动模式修复：修复多剧集手动模式下重复显示 picker 步骤的问题
- 日志输出：添加 `launchNextEpisode`、`finishEpisodeItem`、`finishEpisodeDownload` 等函数的日志

#### 6. 拖动功能（UiModal.vue）

- Header 拖动：按住 header 可以拖动窗口
- 状态管理：`isDragging`、`dragOffset`、`modalPosition`
- 鼠标事件：`mousedown`、`mousemove`、`mouseup`

#### 7. TaskCenter / FloatingEntry Vue 组件化

- `initTaskCenterUI()` (DOM 操作) → `TaskCenter.vue` (Vue 组件)，独立挂载到 `#bilibili-music-task-center`
- `initFloatingEntry()` (DOM 操作) → `FloatingEntry.vue` (Vue 组件)，独立挂载到 `#bilibili-music-floating-entry`
- `taskCenter.ts` 新增 `getTaskCenterActions()` 导出，移除了旧的 DOM 渲染函数
- 深色模式选择器统一使用 `html[arco-theme="dark"]` / `html[data-theme="dark"]`（非 `body`）
- `syncDarkMode()` 同时设置 `document.documentElement` 和 `document.body` 的 `arco-theme`

#### 8. 剪辑时间轴性能优化（clip.vue）

- `requestAnimationFrame` 节流鼠标移动事件，减少高频渲染
- 虚拟位置 `displayTime` 与 `video.currentTime` 解耦，由 `timeupdate` 驱动
- tooltip 对象复用引用，仅更新变化属性

#### 9. TaskCenter panelOpen 修复

- `clearFinishedDownloadTasks` 在 `taskCenter.ts` 中无法访问组件内 `panelOpen` ref
- 修复：清除按钮的 `@click` 同时执行 `panelOpen = false; clearFinishedDownloadTasks()`

### CSS 精简与维护约定

- Tailwind CSS v4 通过 `@tailwindcss/vite` 接入，入口为 `src/style.css`；自定义 UI 组件主要使用 `.ui-*` 样式，不要重新引入已删除的通用 `.btn`/`.input` 工具类。
- 多 BV 剧集选择界面的有效样式位于 `src/steps/picker.vue` 的 scoped `.picker-*` 规则；旧的 `.wasm-music-episode-*` 选择器已清理，不应恢复。
- Arco 组件已由自定义组件替换；删除 Arco 选择器前必须先做全仓引用检查。`html[arco-theme="dark"]` 和 `body[arco-theme="dark"]` 仍是宿主页面主题同步的兼容桥接，不应当作无效代码整体删除。
- TaskCenter 和 FloatingEntry 已从 `taskCenter.ts` 的 DOM 操作迁移到独立 Vue 组件；`taskCenter.ts` 仅保留状态管理和调度逻辑。
- CSS 清理须保持单集/批量流程、侧栏导航、歌词工作台、Modal 拖动和深色模式行为；至少执行 `npm run build:tsc`、`npm test`（需要 Bun 运行时）、`npm run lint`、`npm run fmt:check` 并比较构建体积。
- 当前 Code Review 已修复 `UiSteps` 零基导航契约和消息正文的 HTML 注入问题；后续维护应继续优先保证状态机和宿主页面安全。

1. ~~移除 Arco Design 依赖~~ ✅ 已完成
2. ~~完善深色模式适配~~ ✅ 已完成
3. ~~测试所有功能~~ ✅ 已完成
4. ~~优化 CSS，减少包体积~~ ✅ 已完成
