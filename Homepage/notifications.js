// ─── Custom Notification Toast System ─────────────────────────────────────────
// Replaces native alert() with a styled, modern toast notification popup.
// Usage: showNotification('Message', 'success'|'error'|'info'|'warning')

(function() {
  'use strict';

  let container = null;

  function ensureContainer() {
    if (!container || !document.body.contains(container)) {
      container = document.createElement('div');
      container.id = 'notification-container';
      container.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        max-width: 420px;
        width: calc(100% - 48px);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      document.body.appendChild(container);
    }
    return container;
  }

  function removeToast(el) {
    if (!el || !el.parentNode) return;
    el.style.opacity = '0';
    el.style.transform = 'translateX(100%) scale(0.9)';
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }

  function showNotification(message, type = 'info', duration = 5000) {
    const c = ensureContainer();
    
    // Colors based on type
    const colors = {
      success: { bg: '#d4edda', border: '#c3e6cb', text: '#155724', icon: '✅' },
      error:   { bg: '#f8d7da', border: '#f5c6cb', text: '#721c24', icon: '❌' },
      info:    { bg: '#d1ecf1', border: '#bee5eb', text: '#0c5460', icon: 'ℹ️' },
      warning: { bg: '#fff3cd', border: '#ffc107', text: '#856404', icon: '⚠️' }
    };

    const config = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: ${config.bg};
      color: ${config.text};
      border: 1px solid ${config.border};
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08);
      pointer-events: auto;
      opacity: 0;
      transform: translateX(100%) scale(0.9);
      transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      position: relative;
      font-size: 14px;
      line-height: 1.5;
      max-width: 100%;
      word-break: break-word;
    `;

    // Icon
    const iconSpan = document.createElement('span');
    iconSpan.textContent = config.icon;
    iconSpan.style.cssText = `
      font-size: 18px;
      flex-shrink: 0;
      margin-top: 1px;
      line-height: 1;
    `;

    // Message
    const msgSpan = document.createElement('span');
    msgSpan.style.cssText = `
      flex: 1;
      font-weight: 500;
    `;
    msgSpan.innerHTML = message;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: inherit;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      opacity: 0.5;
      flex-shrink: 0;
      margin-left: 4px;
      transition: opacity 0.2s;
    `;
    closeBtn.onmouseenter = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseleave = () => closeBtn.style.opacity = '0.5';
    closeBtn.onclick = () => removeToast(toast);

    toast.appendChild(iconSpan);
    toast.appendChild(msgSpan);
    toast.appendChild(closeBtn);

    c.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0) scale(1)';
    });

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => removeToast(toast), duration);
    }

    return toast;
  }

  // Expose globally
  window.showNotification = showNotification;

  // Also override window.alert to use custom notifications
  const nativeAlert = window.alert;
  window.alert = function(msg) {
    showNotification(msg, 'info', 4000);
  };

})();