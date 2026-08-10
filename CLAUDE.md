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

### Key Files

- `src/data.ts` — Centralized reactive state (fromData, userConfig)
- `src/utils/requests.ts` — HTTP request layer (GM_xmlhttpRequest wrapper)
- `src/utils/ffmpeg.ts` — FFmpeg WASM loader with multi-thread detection and progress logging
- `src/utils/lyricsCorrector.ts` — AI subtitle correction via character-level diff against online lyrics
- `src/utils/drop.ts` — Drag-and-drop: parses dropped .wav ID3 tags to find source URL
- `src/utils/gpt.ts` — OpenAI-compatible API wrapper for AI lyrics correction
