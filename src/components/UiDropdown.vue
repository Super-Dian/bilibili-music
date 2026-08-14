<script lang="ts" setup>
import { ref } from "vue";

interface DropdownOption {
  label: string;
  value: string | number;
  disabled?: boolean;
}

withDefaults(
  defineProps<{
    options?: DropdownOption[];
    trigger?: "click" | "hover";
  }>(),
  {
    options: () => [],
    trigger: "click",
  },
);

const emit = defineEmits(["select"]);
const isVisible = ref(false);

function handleSelect(option: DropdownOption) {
  if (option.disabled) return;
  emit("select", option.value);
  isVisible.value = false;
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest(".ui-dropdown")) {
    isVisible.value = false;
  }
}

function toggle() {
  isVisible.value = !isVisible.value;
  if (isVisible.value) {
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);
  } else {
    document.removeEventListener("click", handleClickOutside);
  }
}
</script>

<template>
  <div class="ui-dropdown" @click="trigger === 'click' && toggle()">
    <slot />
    <div v-if="isVisible" class="ui-dropdown-menu">
      <div
        v-for="option in options"
        :key="option.value"
        :class="['ui-dropdown-item', option.disabled && 'ui-dropdown-item-disabled']"
        @click="handleSelect(option)"
      >
        {{ option.label }}
      </div>
      <slot name="content" />
    </div>
  </div>
</template>

<style scoped>
.ui-dropdown {
  position: relative;
  display: inline-block;
}

.ui-dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 120px;
  padding: 4px 0;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  margin-top: 4px;
}

.ui-dropdown-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  color: #18191c;
  transition: background 0.2s ease;
}

.ui-dropdown-item:hover {
  background: #f5f5f5;
}

.ui-dropdown-item-disabled {
  color: #c9ccd0;
  cursor: not-allowed;
}

.ui-dropdown-item-disabled:hover {
  background: transparent;
}

/* 深色模式 */
:global([arco-theme="dark"]) .ui-dropdown-menu,
:global([data-theme="dark"]) .ui-dropdown-menu {
  background: #2a2a2a;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}

:global([arco-theme="dark"]) .ui-dropdown-item,
:global([data-theme="dark"]) .ui-dropdown-item {
  color: #e0e0e0;
}

:global([arco-theme="dark"]) .ui-dropdown-item:hover,
:global([data-theme="dark"]) .ui-dropdown-item:hover {
  background: #3a3a3a;
}

:global([arco-theme="dark"]) .ui-dropdown-item-disabled,
:global([data-theme="dark"]) .ui-dropdown-item-disabled {
  color: #666;
}
</style>
