<script lang="ts" setup>
withDefaults(
  defineProps<{
    vertical?: boolean;
  }>(),
  {
    vertical: false,
  },
);
</script>

<template>
  <div :class="['ui-btn-group', vertical && 'ui-btn-group-vertical']">
    <slot />
  </div>
</template>

<style scoped>
.ui-btn-group {
  display: inline-flex;
}

.ui-btn-group-vertical {
  flex-direction: column;
}

.ui-btn-group > :deep(.ui-btn) {
  border-radius: 0;
}

.ui-btn-group > :deep(.ui-btn:first-child) {
  border-radius: 6px 0 0 6px;
}

.ui-btn-group > :deep(.ui-btn:last-child) {
  border-radius: 0 6px 6px 0;
}

.ui-btn-group-vertical > :deep(.ui-btn:first-child) {
  border-radius: 6px 6px 0 0;
}

.ui-btn-group-vertical > :deep(.ui-btn:last-child) {
  border-radius: 0 0 6px 6px;
}

.ui-btn-group > :deep(.ui-btn + .ui-btn) {
  margin-left: -1px;
}

.ui-btn-group-vertical > :deep(.ui-btn + .ui-btn) {
  margin-left: 0;
  margin-top: -1px;
}
</style>
