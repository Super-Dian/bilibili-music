<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";

interface Message {
  id: number;
  type: "info" | "success" | "warning" | "error";
  content: string;
}

const messages = ref<Message[]>([]);
let nextId = 0;

function addMessage(type: Message["type"], content: string, duration = 3000) {
  const id = nextId++;
  messages.value.push({ id, type, content });
  setTimeout(() => {
    messages.value = messages.value.filter((m) => m.id !== id);
  }, duration);
}

function info(content: string, duration?: number) {
  addMessage("info", content, duration);
}

function success(content: string, duration?: number) {
  addMessage("success", content, duration);
}

function warning(content: string, duration?: number) {
  addMessage("warning", content, duration);
}

function error(content: string, duration?: number) {
  addMessage("error", content, duration);
}

defineExpose({ info, success, warning, error });
</script>

<template>
  <Teleport to="body">
    <div class="ui-message-container">
      <TransitionGroup name="ui-message">
        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="['ui-message', `ui-message-${msg.type}`]"
        >
          <span class="ui-message-icon">
            <svg v-if="msg.type === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <svg v-else-if="msg.type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <svg v-else-if="msg.type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </span>
          <span class="ui-message-content">{{ msg.content }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-message-container {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.ui-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-size: 14px;
  pointer-events: auto;
}

.ui-message-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.ui-message-icon svg {
  width: 100%;
  height: 100%;
}

.ui-message-info {
  border: 1px solid #91d5ff;
}

.ui-message-info .ui-message-icon {
  color: #1890ff;
}

.ui-message-success {
  border: 1px solid #b7eb8f;
}

.ui-message-success .ui-message-icon {
  color: #52c41a;
}

.ui-message-warning {
  border: 1px solid #ffe58f;
}

.ui-message-warning .ui-message-icon {
  color: #faad14;
}

.ui-message-error {
  border: 1px solid #ffccc7;
}

.ui-message-error .ui-message-icon {
  color: #ff4d4f;
}

/* 动画 */
.ui-message-enter-active,
.ui-message-leave-active {
  transition: all 0.3s ease;
}

.ui-message-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.ui-message-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

</style>

<style>
/* 深色模式 */
body[arco-theme="dark"] .ui-message,
body[data-theme="dark"] .ui-message {
  background: #2a2a2a;
  color: #e0e0e0;
}

body[arco-theme="dark"] .ui-message-info,
body[data-theme="dark"] .ui-message-info {
  border-color: #15395b;
}

body[arco-theme="dark"] .ui-message-success,
body[data-theme="dark"] .ui-message-success {
  border-color: #274916;
}

body[arco-theme="dark"] .ui-message-warning,
body[data-theme="dark"] .ui-message-warning {
  border-color: #4b3808;
}

body[arco-theme="dark"] .ui-message-error,
body[data-theme="dark"] .ui-message-error {
  border-color: #58181c;
}
</style>
