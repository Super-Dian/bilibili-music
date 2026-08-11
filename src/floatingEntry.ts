import { logger } from "@/utils/logger";

const ENTRY_ID = "wasm-music-floating-entry";

export function initFloatingEntry(onOpen: () => void) {
  if (window.self !== window.top) return () => undefined;

  let disposed = false;
  let observer: MutationObserver | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const isSupportedRoute = () => /^\/(?:video|list)\//i.test(location.pathname);

  const ensureEntry = () => {
    if (disposed || !document.documentElement) return;
    const existing = document.getElementById(ENTRY_ID);
    if (existing) {
      existing.style.display = isSupportedRoute() ? "flex" : "none";
      return;
    }

    const button = document.createElement("button");
    button.id = ENTRY_ID;
    button.type = "button";
    button.className = "wasm-music-floating-entry";
    button.dataset.testid = "wasm-music-floating-entry";
    button.setAttribute("aria-label", "打开 Wasm 音乐姬");
    button.title = "打开 Wasm 音乐姬";
    button.style.display = isSupportedRoute() ? "flex" : "none";

    const icon = document.createElement("span");
    icon.className = "wasm-music-floating-entry-icon";
    icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v10.55A4 4 0 1 0 16 17V7h4V3h-6ZM8 19a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/></svg>`;
    const text = document.createElement("span");
    text.className = "wasm-music-floating-entry-text";
    text.textContent = "音乐姬";
    button.append(icon, text);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onOpen();
    });
    document.documentElement.appendChild(button);
    logger.debug("永久悬浮入口已挂载", location.href);
  };

  ensureEntry();
  if (document.documentElement) {
    observer = new MutationObserver(() => ensureEntry());
    observer.observe(document.documentElement, { childList: true });
  }
  timer = setInterval(ensureEntry, 1500);
  window.addEventListener("popstate", ensureEntry);
  window.addEventListener("hashchange", ensureEntry);

  return () => {
    disposed = true;
    observer?.disconnect();
    if (timer) clearInterval(timer);
    window.removeEventListener("popstate", ensureEntry);
    window.removeEventListener("hashchange", ensureEntry);
    document.getElementById(ENTRY_ID)?.remove();
  };
}
