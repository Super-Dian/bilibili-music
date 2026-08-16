<script lang="ts" setup>
const props = withDefaults(
  defineProps<{
    visible?: boolean;
    title?: string;
    width?: number | string;
    fullscreen?: boolean;
    maskClosable?: boolean;
    escToClose?: boolean;
  }>(),
  {
    visible: false,
    title: "",
    width: 520,
    fullscreen: false,
    maskClosable: true,
    escToClose: true,
  },
);

const emit = defineEmits(["update:visible", "close", "ok", "cancel"]);

function close() {
  emit("update:visible", false);
  emit("close");
}

function handleOk() {
  emit("ok");
  close();
}

function handleCancel() {
  emit("cancel");
  close();
}

function handleMaskClick() {
  if (props.maskClosable) {
    close();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (props.escToClose && event.key === "Escape") {
    close();
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="ui-modal-mask" @click="handleMaskClick" @keydown="handleKeydown">
      <div
        class="ui-modal"
        :class="{ 'ui-modal-fullscreen': fullscreen }"
        :style="{ width: fullscreen ? '100%' : (typeof width === 'number' ? `${width}px` : width) }"
        @click.stop
      >
        <div class="ui-modal-header">
          <span class="ui-modal-title">{{ title }}</span>
          <button class="ui-modal-close" @click="close">×</button>
        </div>
        <div class="ui-modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="ui-modal-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.ui-modal {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.ui-modal-fullscreen {
  width: 100%;
  height: 100%;
  max-height: 100%;
  border-radius: 0;
}

.ui-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #e3e5e7;
  flex-shrink: 0;
}

.ui-modal-title {
  font-size: 16px;
  font-weight: 500;
  color: #18191c;
}

.ui-modal-close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  font-size: 18px;
  color: #666;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s ease;
}

.ui-modal-close:hover {
  background: #f5f5f5;
  color: #18191c;
}

.ui-modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.ui-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid #e3e5e7;
  flex-shrink: 0;
}

</style>

<style>
/* 深色模式 */
body[arco-theme="dark"] .ui-modal,
body[data-theme="dark"] .ui-modal {
  background: #2a2a2a;
}

body[arco-theme="dark"] .ui-modal-header,
body[data-theme="dark"] .ui-modal-header,
body[arco-theme="dark"] .ui-modal-footer,
body[data-theme="dark"] .ui-modal-footer {
  border-color: #444;
}

body[arco-theme="dark"] .ui-modal-title,
body[data-theme="dark"] .ui-modal-title {
  color: #e0e0e0;
}

body[arco-theme="dark"] .ui-modal-close,
body[data-theme="dark"] .ui-modal-close {
  color: #999;
}

body[arco-theme="dark"] .ui-modal-close:hover,
body[data-theme="dark"] .ui-modal-close:hover {
  background: #3a3a3a;
  color: #e0e0e0;
}
</style>
