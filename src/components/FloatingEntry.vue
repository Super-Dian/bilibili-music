<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";

const props = withDefaults(
  defineProps<{
    onOpen?: () => void;
  }>(),
  {
    onOpen: () => {},
  },
);

const visible = ref(false);
const isSupportedRoute = () => /^\/(?:video|list)\//i.test(location.pathname);

function checkRoute() {
  visible.value = isSupportedRoute();
}

function handleClick(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  props.onOpen();
}

onMounted(() => {
  checkRoute();
  window.addEventListener("popstate", checkRoute);
  window.addEventListener("hashchange", checkRoute);
});

onUnmounted(() => {
  window.removeEventListener("popstate", checkRoute);
  window.removeEventListener("hashchange", checkRoute);
});
</script>

<template>
  <button
    v-if="visible"
    class="wasm-music-floating-entry"
    data-testid="wasm-music-floating-entry"
    type="button"
    aria-label="打开 Wasm 音乐姬"
    title="打开 Wasm 音乐姬"
    @click="handleClick"
  >
    <span class="wasm-music-floating-entry-icon">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 3v10.55A4 4 0 1 0 16 17V7h4V3h-6ZM8 19a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
      </svg>
    </span>
    <span class="wasm-music-floating-entry-text">音乐姬</span>
  </button>
</template>

<style scoped>
.wasm-music-floating-entry {
  position: fixed;
  right: 18px;
  bottom: 20px;
  z-index: 10070;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 108px;
  height: 46px;
  gap: 7px;
  padding: 0 16px;
  color: #fff;
  background: linear-gradient(135deg, #00aeec, #1684d6);
  border: 0;
  border-radius: 24px;
  box-shadow: 0 6px 20px rgba(0, 102, 170, 0.3);
  cursor: pointer;
  font-family: Arial, "Microsoft YaHei", sans-serif;
  font-size: 14px;
  font-weight: 700;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.wasm-music-floating-entry:hover {
  transform: translateY(-2px);
  box-shadow: 0 9px 26px rgba(0, 102, 170, 0.38);
}

.wasm-music-floating-entry:focus-visible {
  outline: 3px solid rgba(0, 174, 236, 0.32);
  outline-offset: 3px;
}

.wasm-music-floating-entry-icon {
  display: inline-flex;
  width: 22px;
  height: 22px;
}

.wasm-music-floating-entry-icon svg {
  width: 100%;
  height: 100%;
  fill: currentColor;
}

@media (max-width: 640px) {
  .wasm-music-floating-entry {
    right: 12px;
    bottom: 14px;
    min-width: 46px;
    width: 46px;
    padding: 0;
  }

  .wasm-music-floating-entry-text {
    display: none;
  }
}
</style>

<style>
html[arco-theme="dark"] .wasm-music-floating-entry,
html[data-theme="dark"] .wasm-music-floating-entry {
  background: linear-gradient(135deg, #00a1d6, #1272b8);
  box-shadow: 0 6px 20px rgba(0, 102, 170, 0.4);
}

html[arco-theme="dark"] .wasm-music-floating-entry:hover,
html[data-theme="dark"] .wasm-music-floating-entry:hover {
  box-shadow: 0 9px 26px rgba(0, 102, 170, 0.5);
}
</style>
