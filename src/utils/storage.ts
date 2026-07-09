/**
 * Safe storage wrapper to prevent crash under iframe constraints
 * or disabled third-party cookies/storage in AI Studio preview.
 */
const inMemoryStorage: Record<string, string> = {};

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return inMemoryStorage[key] || null;
      }
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`[safeStorage] Failed to read ${key} from localStorage, using in-memory:`, e);
      return inMemoryStorage[key] || null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        inMemoryStorage[key] = value;
        return;
      }
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[safeStorage] Failed to write ${key} to localStorage, using in-memory:`, e);
      inMemoryStorage[key] = value;
    }
  },

  removeItem(key: string): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        delete inMemoryStorage[key];
        return;
      }
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[safeStorage] Failed to remove ${key} from localStorage, using in-memory:`, e);
      delete inMemoryStorage[key];
    }
  },

  clear(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        for (const key in inMemoryStorage) {
          delete inMemoryStorage[key];
        }
        return;
      }
      localStorage.clear();
    } catch (e) {
      console.warn('[safeStorage] Failed to clear localStorage, clearing in-memory:', e);
      for (const key in inMemoryStorage) {
        delete inMemoryStorage[key];
      }
    }
  }
};
