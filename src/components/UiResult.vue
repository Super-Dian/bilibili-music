<script lang="ts" setup>
withDefaults(
  defineProps<{
    status?: "success" | "error" | "info" | "warning" | "empty";
    title?: string;
    subtitle?: string;
  }>(),
  {
    status: "info",
    title: "",
    subtitle: "",
  },
);
</script>

<template>
  <div :class="['ui-result', `ui-result-${status}`]">
    <div class="ui-result-icon">
      <svg v-if="status === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <svg v-else-if="status === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <svg v-else-if="status === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <svg v-else-if="status === 'empty'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/>
      </svg>
      <slot name="icon" v-if="$slots.icon" />
    </div>
    <div v-if="title" class="ui-result-title">{{ title }}</div>
    <div v-if="subtitle" class="ui-result-subtitle">{{ subtitle }}</div>
    <div class="ui-result-extra">
      <slot name="extra" />
    </div>
  </div>
</template>

<style scoped>
.ui-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 24px;
  text-align: center;
}

.ui-result-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 24px;
}

.ui-result-icon svg {
  width: 100%;
  height: 100%;
}

.ui-result-title {
  font-size: 20px;
  font-weight: 500;
  color: #18191c;
  margin-bottom: 8px;
}

.ui-result-subtitle {
  font-size: 14px;
  color: #666;
  margin-bottom: 24px;
}

.ui-result-extra {
  display: flex;
  gap: 8px;
}

/* Status colors */
.ui-result-success .ui-result-icon {
  color: #52c41a;
}

.ui-result-error .ui-result-icon {
  color: #ff4d4f;
}

.ui-result-warning .ui-result-icon {
  color: #faad14;
}

.ui-result-info .ui-result-icon {
  color: #1890ff;
}

.ui-result-empty .ui-result-icon {
  color: #c9ccd0;
}

</style>

<style>
/* 深色模式 */
body[arco-theme="dark"] .ui-result-title,
body[data-theme="dark"] .ui-result-title {
  color: #e0e0e0;
}

body[arco-theme="dark"] .ui-result-subtitle,
body[data-theme="dark"] .ui-result-subtitle {
  color: #999;
}
</style>
