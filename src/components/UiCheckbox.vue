<script lang="ts" setup>
const props = withDefaults(
  defineProps<{
    modelValue?: boolean | string | number;
    value?: string | number;
    disabled?: boolean;
    indeterminate?: boolean;
  }>(),
  {
    modelValue: false,
    disabled: false,
    indeterminate: false,
  },
);

const emit = defineEmits(["update:modelValue", "change"]);

function handleChange(event: Event) {
  if (props.disabled) return;
  const target = event.target as HTMLInputElement;
  emit("update:modelValue", target.checked);
  emit("change", event);
}
</script>

<template>
  <label :class="['ui-checkbox', disabled && 'ui-checkbox-disabled']">
    <input
      type="checkbox"
      class="ui-checkbox-input"
      :checked="modelValue === true || modelValue === value"
      :disabled="disabled"
      @change="handleChange"
    />
    <span class="ui-checkbox-mark">
      <svg v-if="modelValue === true || modelValue === value" viewBox="0 0 12 12" fill="none">
        <path
          d="M10 3L4.5 8.5L2 6"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span v-else-if="indeterminate" class="ui-checkbox-indeterminate"></span>
    </span>
    <span class="ui-checkbox-content">
      <slot />
    </span>
  </label>
</template>

<style scoped>
.ui-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1.5715;
  color: #18191c;
  user-select: none;
}

.ui-checkbox-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.ui-checkbox-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 2px solid #c9ccd0;
  border-radius: 4px;
  background: #fff;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.ui-checkbox-mark svg {
  width: 10px;
  height: 10px;
  color: #fff;
}

.ui-checkbox-indeterminate {
  width: 8px;
  height: 2px;
  background: #00aeec;
  border-radius: 1px;
}

/* Checked */
.ui-checkbox-input:checked + .ui-checkbox-mark {
  background: #00aeec;
  border-color: #00aeec;
}

/* Hover */
.ui-checkbox:hover .ui-checkbox-mark {
  border-color: #00aeec;
}

/* Focus */
.ui-checkbox-input:focus + .ui-checkbox-mark {
  box-shadow: 0 0 0 2px rgba(0, 174, 236, 0.15);
}

/* Disabled */
.ui-checkbox-disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ui-checkbox-disabled .ui-checkbox-mark {
  background: #f5f5f5;
  border-color: #e3e5e7;
}

.ui-checkbox-disabled.ui-checkbox-input:checked + .ui-checkbox-mark,
.ui-checkbox-disabled .ui-checkbox-input:checked + .ui-checkbox-mark {
  background: #c9ccd0;
  border-color: #c9ccd0;
}
</style>

<style>
/* 深色模式 */
body[arco-theme="dark"] .ui-checkbox,
body[data-theme="dark"] .ui-checkbox {
  color: #e0e0e0;
}

body[arco-theme="dark"] .ui-checkbox-mark,
body[data-theme="dark"] .ui-checkbox-mark {
  background: #2a2a2a;
  border-color: #555;
}

body[arco-theme="dark"] .ui-checkbox-input:checked + .ui-checkbox-mark,
body[data-theme="dark"] .ui-checkbox-input:checked + .ui-checkbox-mark {
  background: #00aeec;
  border-color: #00aeec;
}

body[arco-theme="dark"] .ui-checkbox:hover .ui-checkbox-mark,
body[data-theme="dark"] .ui-checkbox:hover .ui-checkbox-mark {
  border-color: #00aeec;
}
</style>
