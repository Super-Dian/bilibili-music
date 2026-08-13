<script lang="ts" setup>
withDefaults(
  defineProps<{
    modelValue?: string | number;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    error?: boolean;
    size?: "small" | "medium" | "large";
  }>(),
  {
    modelValue: "",
    placeholder: "",
    disabled: false,
    readonly: false,
    error: false,
    size: "medium",
  },
);

defineEmits(["update:modelValue", "input", "change", "focus", "blur"]);
</script>

<template>
  <input
    :class="[
      'ui-input',
      `ui-input-${size}`,
      disabled && 'ui-input-disabled',
      readonly && 'ui-input-readonly',
      error && 'ui-input-error',
    ]"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value); $emit('input', $event)"
    @change="$emit('change', $event)"
    @focus="$emit('focus', $event)"
    @blur="$emit('blur', $event)"
  />
</template>

<style scoped>
.ui-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.5715;
  color: #18191c;
  background: #fff;
  border: 1px solid #c9ccd0;
  border-radius: 6px;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.ui-input:focus {
  border-color: #00aeec;
  box-shadow: 0 0 0 2px rgba(0, 174, 236, 0.15);
}

.ui-input::placeholder {
  color: #c9ccd0;
}

/* Sizes */
.ui-input-small {
  padding: 4px 8px;
  font-size: 12px;
}

.ui-input-large {
  padding: 10px 16px;
  font-size: 16px;
}

/* States */
.ui-input-disabled {
  background: #f5f5f5;
  border-color: #e3e5e7;
  color: #c9ccd0;
  cursor: not-allowed;
}

.ui-input-readonly {
  background: #f5f5f5;
}

.ui-input-error {
  border-color: #ff4d4f;
}

.ui-input-error:focus {
  box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.15);
}

/* 深色模式 */
:global([arco-theme="dark"]) .ui-input,
:global([data-theme="dark"]) .ui-input {
  color: #e0e0e0;
  background: #2a2a2a;
  border-color: #555;
}

:global([arco-theme="dark"]) .ui-input::placeholder,
:global([data-theme="dark"]) .ui-input::placeholder {
  color: #666;
}

:global([arco-theme="dark"]) .ui-input:focus,
:global([data-theme="dark"]) .ui-input:focus {
  border-color: #00aeec;
}

:global([arco-theme="dark"]) .ui-input-disabled,
:global([data-theme="dark"]) .ui-input-disabled {
  background: #1f1f1f;
  border-color: #444;
  color: #666;
}
</style>
