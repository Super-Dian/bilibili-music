<script lang="ts" setup>
withDefaults(
  defineProps<{
    type?: "info" | "success" | "warning" | "error";
    title?: string;
    showIcon?: boolean;
    closable?: boolean;
  }>(),
  {
    type: "info",
    title: "",
    showIcon: true,
    closable: false,
  },
);

defineEmits(["close"]);
</script>

<template>
  <div
    :class="[
      'ui-alert',
      `ui-alert-${type}`,
    ]"
    role="alert"
  >
    <div v-if="showIcon" class="ui-alert-icon">
      <svg v-if="type === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4M12 8h.01"/>
      </svg>
      <svg v-else-if="type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <svg v-else-if="type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    </div>
    <div class="ui-alert-content">
      <div v-if="title" class="ui-alert-title">{{ title }}</div>
      <div class="ui-alert-description">
        <slot />
      </div>
    </div>
    <button
      v-if="closable"
      class="ui-alert-close"
      @click="$emit('close')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.ui-alert {
  display: flex;
  align-items: flex-start;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.5715;
}

.ui-alert-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-right: 8px;
  margin-top: 2px;
}

.ui-alert-icon svg {
  width: 100%;
  height: 100%;
}

.ui-alert-content {
  flex: 1;
  min-width: 0;
}

.ui-alert-title {
  font-weight: 500;
  margin-bottom: 4px;
}

.ui-alert-description {
  color: inherit;
  opacity: 0.85;
}

.ui-alert-close {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-left: 8px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.ui-alert-close:hover {
  opacity: 1;
}

.ui-alert-close svg {
  width: 100%;
  height: 100%;
}

/* Types */
.ui-alert-info {
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  color: #1890ff;
}

.ui-alert-success {
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  color: #52c41a;
}

.ui-alert-warning {
  background: #fffbe6;
  border: 1px solid #ffe58f;
  color: #faad14;
}

.ui-alert-error {
  background: #fff2f0;
  border: 1px solid #ffccc7;
  color: #ff4d4f;
}

</style>

<style>
/* 深色模式 */
body[arco-theme="dark"] .ui-alert-info,
body[data-theme="dark"] .ui-alert-info {
  background: #112636;
  border-color: #15395b;
  color: #177dc0;
}

body[arco-theme="dark"] .ui-alert-success,
body[data-theme="dark"] .ui-alert-success {
  background: #162312;
  border-color: #274916;
  color: #49aa19;
}

body[arco-theme="dark"] .ui-alert-warning,
body[data-theme="dark"] .ui-alert-warning {
  background: #2b2111;
  border-color: #4b3808;
  color: #d89614;
}

body[arco-theme="dark"] .ui-alert-error,
body[data-theme="dark"] .ui-alert-error {
  background: #2c1618;
  border-color: #58181c;
  color: #dc2224;
}
</style>
