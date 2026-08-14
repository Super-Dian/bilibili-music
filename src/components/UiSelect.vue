<script lang="ts" setup>
interface Option {
  label: string;
  value: string | number;
  disabled?: boolean;
}

withDefaults(
  defineProps<{
    modelValue?: string | number;
    options?: Option[];
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    modelValue: "",
    options: () => [],
    placeholder: "请选择",
    disabled: false,
  },
);

defineEmits(["update:modelValue", "change"]);
</script>

<template>
  <select
    :class="['ui-select', disabled && 'ui-select-disabled']"
    :value="modelValue"
    :disabled="disabled"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value); $emit('change', $event)"
  >
    <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
    <option
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :disabled="option.disabled"
    >
      {{ option.label }}
    </option>
    <slot />
  </select>
</template>

<style scoped>
.ui-select {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.5715;
  color: #18191c;
  background: #fff;
  border: 1px solid #c9ccd0;
  border-radius: 6px;
  outline: none;
  cursor: pointer;
  transition: all 0.2s ease;
  box-sizing: border-box;
  appearance: auto;
}

.ui-select:focus {
  border-color: #00aeec;
  box-shadow: 0 0 0 2px rgba(0, 174, 236, 0.15);
}

.ui-select-disabled {
  background: #f5f5f5;
  border-color: #e3e5e7;
  color: #c9ccd0;
  cursor: not-allowed;
}

/* 深色模式 */
:global([arco-theme="dark"]) .ui-select,
:global([data-theme="dark"]) .ui-select {
  color: #e0e0e0;
  background: #2a2a2a;
  border-color: #555;
}

:global([arco-theme="dark"]) .ui-select:focus,
:global([data-theme="dark"]) .ui-select:focus {
  border-color: #00aeec;
}

:global([arco-theme="dark"]) .ui-select-disabled,
:global([data-theme="dark"]) .ui-select-disabled {
  background: #1f1f1f;
  border-color: #444;
  color: #666;
}
</style>
