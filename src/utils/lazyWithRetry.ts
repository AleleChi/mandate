import React, { lazy, ComponentType, LazyExoticComponent } from 'react';
import { safeStorage } from './storage';

/**
 * Resilient lazy loader for dynamically imported chunks.
 * Automatically recovers from stale Netlify/Vite deployment chunk 404s by
 * triggering a single browser reload to fetch the latest asset manifest.
 * Guarantees no infinite reload loops via a timestamped storage guard.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkKey: string = 'component'
): LazyExoticComponent<T> {
  return lazy(async () => {
    const storageKey = `koinonia_chunk_reload_${chunkKey}`;
    try {
      const module = await factory();
      // Clear retry marker on successful load
      if (typeof window !== 'undefined') {
        try {
          safeStorage.removeItem(storageKey);
        } catch {}
      }
      return module;
    } catch (error: any) {
      console.error(`Dynamic chunk load failed for [${chunkKey}]:`, error);

      const errorMessage = error?.message || String(error || '');
      const isChunkLoadError =
        errorMessage.includes('Failed to fetch dynamically imported module') ||
        errorMessage.includes('Loading chunk') ||
        errorMessage.includes('dynamically imported module') ||
        errorMessage.includes('error loading dynamically imported module') ||
        errorMessage.includes('Failed to load module script') ||
        error?.name === 'ChunkLoadError';

      if (isChunkLoadError && typeof window !== 'undefined') {
        const lastReload = safeStorage.getItem(storageKey);
        const now = Date.now();
        // Allow at most 1 automatic reload every 15 seconds to prevent reload loops
        if (!lastReload || (now - parseInt(lastReload, 10)) > 15000) {
          safeStorage.setItem(storageKey, String(now));
          window.location.reload();
          // Return an unresolved promise to avoid flashing an error state while reloading
          return new Promise<{ default: T }>(() => {});
        }
      }

      throw error;
    }
  });
}
