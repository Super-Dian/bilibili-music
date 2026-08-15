<script lang="ts" setup>
interface StepItem {
  title: string;
}

withDefaults(
  defineProps<{
    current?: number;
    direction?: "horizontal" | "vertical";
    size?: "small" | "medium";
    items?: StepItem[];
  }>(),
  {
    current: 1,
    direction: "horizontal",
    size: "medium",
    items: () => [],
  },
);

defineEmits(["change"]);
</script>

<template>
  <div :class="['ui-steps', `ui-steps-${direction}`, `ui-steps-${size}`]">
    <div
      v-for="(item, index) in items"
      :key="index"
      :class="[
        'ui-steps-item',
        (index + 1) < current && 'ui-steps-item-finish',
        (index + 1) === current && 'ui-steps-item-active',
      ]"
      @click="$emit('change', index + 1)"
    >
      <div class="ui-steps-icon">
        <span v-if="(index + 1) < current">✓</span>
        <span v-else>{{ index + 1 }}</span>
      </div>
      <div class="ui-steps-content">
        <div class="ui-steps-title">{{ item.title }}</div>
      </div>
      <div v-if="index < items.length - 1" class="ui-steps-tail"></div>
    </div>
  </div>
</template>

<style scoped>
.ui-steps {
  display: flex;
}

.ui-steps-horizontal {
  flex-direction: row;
}

.ui-steps-vertical {
  flex-direction: column;
}

.ui-steps-item {
  display: flex;
  align-items: center;
  position: relative;
  cursor: pointer;
}

.ui-steps-horizontal .ui-steps-item {
  flex: 1;
}

.ui-steps-vertical .ui-steps-item {
  padding-bottom: 24px;
}

.ui-steps-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  background: #e3e5e7;
  color: #666;
  flex-shrink: 0;
  z-index: 1;
}

.ui-steps-small .ui-steps-icon {
  width: 24px;
  height: 24px;
  font-size: 12px;
}

.ui-steps-item-finish .ui-steps-icon {
  background: #00aeec;
  color: #fff;
}

.ui-steps-item-active .ui-steps-icon {
  background: #00aeec;
  color: #fff;
}

.ui-steps-content {
  margin-left: 12px;
}

.ui-steps-title {
  font-size: 14px;
  color: #18191c;
}

.ui-steps-item-finish .ui-steps-title {
  color: #00aeec;
}

.ui-steps-item-active .ui-steps-title {
  color: #00aeec;
  font-weight: 500;
}

.ui-steps-tail {
  position: absolute;
  background: #e3e5e7;
}

.ui-steps-horizontal .ui-steps-tail {
  top: 14px;
  left: 28px;
  right: 0;
  height: 2px;
}

.ui-steps-vertical .ui-steps-tail {
  top: 28px;
  left: 13px;
  width: 2px;
  bottom: 0;
}

.ui-steps-item-finish .ui-steps-tail {
  background: #00aeec;
}

</style>

<style>
/* 深色模式 */
body[arco-theme="dark"] .ui-steps-icon,
body[data-theme="dark"] .ui-steps-icon {
  background: #444;
  color: #999;
}

body[arco-theme="dark"] .ui-steps-item-finish .ui-steps-icon,
body[data-theme="dark"] .ui-steps-item-finish .ui-steps-icon,
body[arco-theme="dark"] .ui-steps-item-active .ui-steps-icon,
body[data-theme="dark"] .ui-steps-item-active .ui-steps-icon {
  background: #00aeec;
  color: #fff;
}

body[arco-theme="dark"] .ui-steps-title,
body[data-theme="dark"] .ui-steps-title {
  color: #e0e0e0;
}

body[arco-theme="dark"] .ui-steps-tail,
body[data-theme="dark"] .ui-steps-tail {
  background: #444;
}
</style>
