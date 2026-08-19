<script lang="ts" setup>
import { ref, nextTick, onBeforeUnmount } from "vue";

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
const menuStyle = ref<{ right?: string | number; left?: string | number; top?: string; bottom?: string }>({});

// 全局状态：记录当前打开的下拉菜单实例，确保同时只有一个打开
let currentOpenDropdown: { close: () => void } | null = null;

function handleSelect(option: DropdownOption) {
  if (option.disabled) return;
  emit("select", option.value);
  close();
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest(".ui-dropdown")) {
    close();
  }
}

function close() {
  isVisible.value = false;
  document.removeEventListener("mousedown", handleClickOutside);
  if (currentOpenDropdown?.close === close) {
    currentOpenDropdown = null;
  }
}

async function toggle() {
  // 如果有其他下拉菜单打开，先关闭它
  if (currentOpenDropdown && currentOpenDropdown.close !== close) {
    currentOpenDropdown.close();
  }

  isVisible.value = !isVisible.value;
  if (isVisible.value) {
    await nextTick();
    updateMenuPosition();
    document.addEventListener("mousedown", handleClickOutside);
    currentOpenDropdown = { close };
  } else {
    document.removeEventListener("mousedown", handleClickOutside);
    if (currentOpenDropdown?.close === close) {
      currentOpenDropdown = null;
    }
  }
}

function updateMenuPosition() {
  if (!menuRef.value) return;
  const parent = menuRef.value.parentElement;
  if (!parent) return;

  const parentRect = parent.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 12; // 边距，避免菜单贴边

  // 计算菜单位置
  const menuWidth = menuRef.value.offsetWidth;
  const menuHeight = menuRef.value.offsetHeight;

  // 默认在父元素下方左对齐
  let left: string | number = 0;
  let right: string | number = "auto";

  // 如果菜单超出右边界，则右对齐
  if (parentRect.left + menuWidth > viewportWidth - margin) {
    left = "auto";
    right = 0;
  }
  // 如果菜单超出左边界，则左对齐（保持默认）
  else if (parentRect.left < margin) {
    left = 0;
    right = "auto";
  }

  // 检查下方空间是否足够，如果不够则向上弹出
  const spaceBelow = viewportHeight - parentRect.bottom;
  const spaceAbove = parentRect.top;

  if (spaceBelow < menuHeight + margin && spaceAbove > spaceBelow) {
    // 上方空间更多，向上弹出
    menuStyle.value = { left, right, bottom: "100%", top: "auto" };
  } else {
    // 默认向下弹出
    menuStyle.value = { left, right, top: "100%", bottom: "auto" };
  }
}

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleClickOutside);
  if (currentOpenDropdown?.close === close) {
    currentOpenDropdown = null;
  }
});
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
