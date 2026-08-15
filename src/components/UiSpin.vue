<script lang="ts" setup>
withDefaults(
  defineProps<{
    loading?: boolean;
    tip?: string;
    size?: "small" | "medium" | "large";
  }>(),
  {
    loading: false,
    tip: "",
    size: "medium",
  },
);
</script>

<template>
  <div :class="['ui-spin-wrapper', loading && 'ui-spin-loading']">
    <div v-if="loading" class="ui-spin-mask">
      <div :class="['ui-spin', `ui-spin-${size}`]">
        <div class="ui-spin-dot">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <div v-if="tip" class="ui-spin-tip">{{ tip }}</div>
    </div>
    <div class="ui-spin-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.ui-spin-wrapper {
  position: relative;
}

.ui-spin-loading .ui-spin-content {
  opacity: 0.5;
  pointer-events: none;
}

.ui-spin-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.ui-spin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ui-spin-dot {
  position: relative;
  display: inline-block;
  font-size: 0;
}

.ui-spin-dot span {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00aeec;
  animation: ui-spin-bounce 1.2s infinite ease-in-out;
}

.ui-spin-dot span:nth-child(1) {
  animation-delay: -0.32s;
}

.ui-spin-dot span:nth-child(2) {
  animation-delay: -0.16s;
}

.ui-spin-dot span:nth-child(3) {
  animation-delay: 0s;
}

.ui-spin-dot span:nth-child(4) {
  animation-delay: 0.16s;
}

.ui-spin-small .ui-spin-dot span {
  width: 6px;
  height: 6px;
}

.ui-spin-large .ui-spin-dot span {
  width: 10px;
  height: 10px;
}

.ui-spin-tip {
  margin-top: 8px;
  color: #666;
  font-size: 14px;
}

@keyframes ui-spin-bounce {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

</style>

<style>
/* 深色模式 */
body[arco-theme="dark"] .ui-spin-dot span,
body[data-theme="dark"] .ui-spin-dot span {
  background: #00aeec;
}

body[arco-theme="dark"] .ui-spin-tip,
body[data-theme="dark"] .ui-spin-tip {
  color: #999;
}
</style>
