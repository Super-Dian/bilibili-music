<script lang="ts" setup>
withDefaults(
  defineProps<{
    label?: string;
    labelWidth?: number | string;
  }>(),
  {
    label: "",
    labelWidth: undefined,
  },
);
</script>

<template>
  <div class="ui-form-item">
    <label
      v-if="label"
      class="ui-form-item-label"
      :style="
        labelWidth
          ? { width: typeof labelWidth === 'number' ? `${labelWidth}px` : labelWidth }
          : undefined
      "
    >
      {{ label }}
    </label>
    <div class="ui-form-item-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.ui-form-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 16px;
}

.ui-form-item-label {
  flex-shrink: 0;
  width: 100px;
  padding-right: 12px;
  color: #18191c;
  font-size: 14px;
  line-height: 32px;
  text-align: right;
  white-space: nowrap;
}

.ui-form-item-content {
  flex: 1;
  min-width: 0;
}
</style>

<style>
/* 深色模式 */
body[arco-theme="dark"] .ui-form-item-label,
body[data-theme="dark"] .ui-form-item-label {
  color: #e0e0e0;
}
</style>
