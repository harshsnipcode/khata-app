import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import { initDB } from './lib/offline/db';
import { initFetchInterceptor } from './lib/offline/fetchInterceptor';
import { syncPendingData } from './lib/offline/sync';
import './lib/offline/toast';

initDB();
initFetchInterceptor();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncPendingData();
  });

  // The 'online' event only fires on a connectivity TRANSITION. If the app is
  // refreshed/opened while already online, pending offline work was never
  // synced. Flush the queue on startup too (initDB opens the DB first).
  if (navigator.onLine) {
    setTimeout(() => syncPendingData(), 2000);
  }

  // Manual service worker registration (only in production, not dev)
  const isDev = import.meta.env.MODE === 'development' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isDev && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('SW registered:', registration.scope);
        })
        .catch(error => {
          console.error('SW registration failed:', error);
        });
    });
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
