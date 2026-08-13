<script lang="ts" setup>
withDefaults(
  defineProps<{
    direction?: "horizontal" | "vertical";
    align?: "start" | "center" | "end";
    wrap?: boolean;
    gap?: number | string;
  }>(),
  {
    direction: "horizontal",
    align: "center",
    wrap: false,
    gap: 8,
  },
);
</script>

<template>
  <div
    :class="[
      'ui-space',
      `ui-space-${direction}`,
      `ui-space-align-${align}`,
      wrap && 'ui-space-wrap',
    ]"
    :style="{ gap: typeof gap === 'number' ? `${gap}px` : gap }"
  >
    <slot />
  </div>
</template>

<style scoped>
.ui-space {
  display: inline-flex;
}

.ui-space-horizontal {
  flex-direction: row;
}

.ui-space-vertical {
  flex-direction: column;
}

.ui-space-align-start {
  align-items: flex-start;
}

.ui-space-align-center {
  align-items: center;
}

.ui-space-align-end {
  align-items: flex-end;
}

.ui-space-wrap {
  flex-wrap: wrap;
}
</style>
