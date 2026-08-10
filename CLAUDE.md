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
4. **lyrics.vue** — Lyrics selection, editing, online search, AI correction (OpenAI-compatible API)
5. **audio.vue** — FFmpeg WASM pipeline: fetch audio → transcode M4S→M4A → embed clip/speed/metadata/cover/lyrics → download via FileSaver

### State Management

No Vuex/Pinia. `src/data.ts` holds all wizard state in a single `reactive()` object (`fromData`) and a `userConfig` object persisted via GM_getValue/GM_setValue with auto-save on change.

### Auto-imports

Vue APIs (`ref`, `computed`, `watch`, etc.) are auto-imported via `unplugin-auto-import` — do NOT add explicit imports in `.vue` files. Components from `src/steps/` and `src/components/` are auto-registered via `unplugin-vue-components`.

### Path Alias

`@` → `./src` (configured in both tsconfig and vite config).

### API Layer

`src/utils/requests.ts` wraps `GM_xmlhttpRequest` into a Promise-based API with automatic cookie injection. Bilibili APIs are called directly (no proxy server).

### WASM Backends

- **FFmpeg WASM** (`src/utils/ffmpeg.ts`): Primary audio processing. Loaded from unpkg CDN, with multi-thread support when `crossOriginIsolated`.
- **Rust WASM** (`backend/`): Earlier implementation for ID3 tag writing and WAV clipping via wasm-pack. Build with `cd backend && make build` (requires Rust + wasm-pack). The compiled output is patched to `@ocyss/wasm-music-backend`.

### Key Files

- `src/data.ts` — Centralized reactive state (fromData, userConfig)
- `src/utils/requests.ts` — HTTP request layer (GM_xmlhttpRequest wrapper)
- `src/utils/ffmpeg.ts` — FFmpeg WASM loader with multi-thread detection
- `src/utils/drop.ts` — Drag-and-drop: parses dropped .wav ID3 tags to find source URL
- `src/utils/gpt.ts` — OpenAI-compatible API for lyrics correction
