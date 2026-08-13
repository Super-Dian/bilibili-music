<script lang="ts" setup>
import UiButton from "./UiButton.vue";

type ButtonProps = InstanceType<typeof UiButton>["$props"];
withDefaults(
  defineProps<{
    prev?: ButtonProps;
    prevLabel?: string;
    next?: ButtonProps;
    nextLabel?: string;
  }>(),
  {
    prevLabel: "上一步",
    nextLabel: "下一步",
  },
);
</script>

<template>
  <div class="btn-group">
    <UiButton v-bind="prev" @click="$emit('prev')" style="margin-right: 10px">
      {{ prevLabel }}
    </UiButton>
    <UiButton v-bind="next" @click="$emit('next')">{{ nextLabel }}</UiButton>
  </div>
</template>

<style scoped>
.btn-group {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 20px 0;
}
</style>
