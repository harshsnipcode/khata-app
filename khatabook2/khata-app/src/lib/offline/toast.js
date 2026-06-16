let toastContainer = null;
let toastTimeout = null;

function createToastContainer() {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.id = 'khata-toast-container';
  toastContainer.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;
  document.body.appendChild(toastContainer);
  return toastContainer;
}

export function showToast(message, type = 'info', duration = 3000) {
  const container = createToastContainer();
  const toast = document.createElement('div');
  toast.style.cssText = `
    pointer-events: auto;
    padding: 12px 20px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    animation: slideUp 0.3s ease-out;
    max-width: 90vw;
    text-align: center;
  `;
  
  const bgColors = {
    info: '#5cbdb9',
    success: '#52b788',
    error: '#e76f51',
    warning: '#f4a261'
  };
  toast.style.backgroundColor = bgColors[type] || bgColors.info;
  toast.textContent = message;

  if (!document.getElementById('khata-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'khata-toast-styles';
    style.textContent = `
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes slideDown {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(20px); }
      }
    `;
    document.head.appendChild(style);
  }

  container.appendChild(toast);

  toastTimeout = setTimeout(() => {
    toast.style.animation = 'slideDown 0.3s ease-in forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline-saved', (e) => {
    showToast(e.detail?.message || 'Saved offline. Will sync automatically.', 'info', 4000);
  });
}