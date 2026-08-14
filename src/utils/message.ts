/**
 * 简单的消息提示工具
 */

type MessageType = "info" | "success" | "warning" | "error";

interface MessageOptions {
  type: MessageType;
  content: string;
  duration?: number;
}

const container = (() => {
  if (typeof document === "undefined") return null;
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
  document.body.appendChild(el);
  return el;
})();

function showMessage(options: MessageOptions) {
  if (!container) return;

  const { type, content, duration = 3000 } = options;

  const icons: Record<MessageType, string> = {
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  };

  const colors: Record<MessageType, string> = {
    info: "#1890ff",
    success: "#52c41a",
    warning: "#faad14",
    error: "#ff4d4f",
  };

  const el = document.createElement("div");
  el.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: #fff;
    border: 1px solid ${colors[type]}20;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-size: 14px;
    color: #18191c;
    pointer-events: auto;
    opacity: 0;
    transform: translateY(-10px);
    transition: all 0.3s ease;
  `;
  el.innerHTML = `<span style="color: ${colors[type]}">${icons[type]}</span><span>${content}</span>`;

  container.appendChild(el);

  // 动画进入
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });

  // 自动消失
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-10px)";
    setTimeout(() => el.remove(), 300);
  }, duration);
}

export const Message = {
  info: (content: string, duration?: number) => showMessage({ type: "info", content, duration }),
  success: (content: string, duration?: number) => showMessage({ type: "success", content, duration }),
  warning: (content: string, duration?: number) => showMessage({ type: "warning", content, duration }),
  error: (content: string, duration?: number) => showMessage({ type: "error", content, duration }),
};
