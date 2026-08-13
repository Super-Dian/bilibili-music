<script lang="ts" setup>
withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  {
    compact: false,
  },
);
</script>

<template>
  <div :class="['ui-input-group', compact && 'ui-input-group-compact']">
    <slot />
  </div>
</template>

<style scoped>
.ui-input-group {
  display: inline-flex;
  align-items: stretch;
}

.ui-input-group > :deep(.ui-input) {
  border-radius: 0;
}

.ui-input-group > :deep(.ui-input:first-child) {
  border-radius: 6px 0 0 6px;
}

.ui-input-group > :deep(.ui-input:last-child) {
  border-radius: 0 6px 6px 0;
}

.ui-input-group > :deep(.ui-input + .ui-input) {
  margin-left: -1px;
}

.ui-input-group-compact > :deep(.ui-btn) {
  border-radius: 0;
}

.ui-input-group-compact > :deep(.ui-btn:first-child) {
  border-radius: 6px 0 0 6px;
}

.ui-input-group-compact > :deep(.ui-btn:last-child) {
  border-radius: 0 6px 6px 0;
}
</style>
