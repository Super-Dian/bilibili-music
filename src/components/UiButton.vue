<script lang="ts" setup>
withDefaults(
  defineProps<{
    type?: "primary" | "secondary" | "outline" | "text";
    size?: "small" | "medium" | "large";
    status?: "normal" | "danger" | "success" | "warning";
    disabled?: boolean;
    loading?: boolean;
  }>(),
  {
    type: "secondary",
    size: "medium",
    status: "normal",
    disabled: false,
    loading: false,
  },
);

defineEmits(["click"]);
</script>

<template>
  <button
    :class="[
      'ui-btn',
      `ui-btn-${type}`,
      `ui-btn-${size}`,
      `ui-btn-${status}`,
      disabled && 'ui-btn-disabled',
      loading && 'ui-btn-loading',
    ]"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="ui-btn-spinner"></span>
    <slot name="icon" v-if="$slots.icon && !loading" />
    <slot />
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  white-space: nowrap;
}

/* Sizes */
.ui-btn-small {
  padding: 4px 12px;
  font-size: 12px;
}

.ui-btn-medium {
  padding: 8px 16px;
  font-size: 14px;
}

.ui-btn-large {
  padding: 10px 20px;
  font-size: 16px;
}

/* Types */
.ui-btn-primary {
  background: #00aeec;
  color: white;
  border-color: #00aeec;
}

.ui-btn-primary:hover:not(.ui-btn-disabled) {
  background: #00a1d6;
  border-color: #00a1d6;
}

.ui-btn-secondary {
  background: white;
  color: #18191c;
  border-color: #c9ccd0;
}

.ui-btn-secondary:hover:not(.ui-btn-disabled) {
  color: #00aeec;
  border-color: #00aeec;
}

.ui-btn-outline {
  background: transparent;
  color: #00aeec;
  border-color: #00aeec;
}

.ui-btn-outline:hover:not(.ui-btn-disabled) {
  background: #00aeec;
  color: white;
}

.ui-btn-text {
  background: transparent;
  color: #00aeec;
  border-color: transparent;
}

.ui-btn-text:hover:not(.ui-btn-disabled) {
  background: rgba(0, 174, 236, 0.1);
}

/* Status */
.ui-btn-danger {
  background: #ff4d4f;
  color: white;
  border-color: #ff4d4f;
}

.ui-btn-danger:hover:not(.ui-btn-disabled) {
  background: #ff7875;
  border-color: #ff7875;
}

.ui-btn-danger.ui-btn-secondary {
  background: white;
  color: #ff4d4f;
  border-color: #ff4d4f;
}

.ui-btn-danger.ui-btn-secondary:hover:not(.ui-btn-disabled) {
  background: #ff4d4f;
  color: white;
}

/* Disabled */
.ui-btn-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Loading */
.ui-btn-loading {
  position: relative;
}

.ui-btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ui-btn-spin 0.6s linear infinite;
}

@keyframes ui-btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<style>
body[arco-theme="dark"] .ui-btn-secondary,
body[data-theme="dark"] .ui-btn-secondary {
  background: #2a2a2a;
  color: #e0e0e0;
  border-color: #555;
}

body[arco-theme="dark"] .ui-btn-secondary:hover:not(.ui-btn-disabled),
body[data-theme="dark"] .ui-btn-secondary:hover:not(.ui-btn-disabled) {
  color: #00aeec;
  border-color: #00aeec;
}
</style>
