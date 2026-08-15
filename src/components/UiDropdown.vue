<script lang="ts" setup>
import { ref, nextTick } from "vue";

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
const menuRef = ref<HTMLDivElement | null>(null);
const menuStyle = ref<{ right?: string; left?: string }>({});

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

async function toggle() {
  isVisible.value = !isVisible.value;
  if (isVisible.value) {
    await nextTick();
    updateMenuPosition();
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);
  } else {
    document.removeEventListener("click", handleClickOutside);
  }
}

function updateMenuPosition() {
  if (!menuRef.value) return;
  const rect = menuRef.value.getBoundingClientRect();
  const viewportWidth = window.innerWidth;

  // 如果菜单超出右边界，则向左对齐
  if (rect.right > viewportWidth) {
    menuStyle.value = { right: "0", left: "auto" };
  } else {
    menuStyle.value = { left: "0", right: "auto" };
  }
}
</script>

<template>
  <div class="ui-dropdown" @click="trigger === 'click' && toggle()">
    <slot />
    <div v-if="isVisible" ref="menuRef" class="ui-dropdown-menu" :style="menuStyle">
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
  min-width: 80px;
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

</style>

<style>
/* 深色模式 */
body[arco-theme="dark"] .ui-dropdown-menu,
body[data-theme="dark"] .ui-dropdown-menu {
  background: #2a2a2a;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}

body[arco-theme="dark"] .ui-dropdown-item,
body[data-theme="dark"] .ui-dropdown-item {
  color: #e0e0e0;
}

body[arco-theme="dark"] .ui-dropdown-item:hover,
body[data-theme="dark"] .ui-dropdown-item:hover {
  background: #3a3a3a;
}

body[arco-theme="dark"] .ui-dropdown-item-disabled,
body[data-theme="dark"] .ui-dropdown-item-disabled {
  color: #666;
}
</style>
