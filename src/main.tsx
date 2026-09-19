import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { NotificationProvider } from './context/NotificationContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import './index.css';

// Service worker registration: ONLY in production builds. In development (Vite dev server / HMR), unregister any stale SW to avoid caching blank screens or outdated chunks
if ('serviceWorker' in navigator) {
  // import.meta.hot is present exclusively in Vite dev server. In production builds, import.meta.hot is undefined/stripped.
  const isDevServer = Boolean(import.meta.hot);
  if (isDevServer) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
    if ('caches' in window) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          if (key.startsWith('koinonia-')) {
            caches.delete(key);
          }
        }
      });
    }
  } else {
    const registerSW = () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('ServiceWorker registration successful with scope: ', reg.scope);
        })
        .catch((err) => {
          console.log('ServiceWorker registration failed: ', err);
        });
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </ThemeProvider>
  </StrictMode>,
);
