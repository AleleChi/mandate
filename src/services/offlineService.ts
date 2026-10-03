import { api } from './api';

export interface OfflinePass {
  childEventEntryId: string;
  passReference: string;
  passHash: string;
  status: string;
  entryStatus: string;
  child: {
    id: string;
    fullName: string;
    dateOfBirth: string;
    gender: string;
    calculatedAge: number;
    ageGroup: string;
    photoUrl: string;
    medicalNotes: string;
    hasMedicalNotes: boolean;
    needsExtraSupport: boolean;
    supportNotes: string;
  };
  parent: {
    fullName: string;
    phone: string;
  };
  pickup: Array<{
    id: string;
    fullName: string;
    relationship: string;
    phone: string;
    photoUrl: string;
  }>;
}

export interface OutboxAction {
  idempotencyKey: string;
  actionType: 'check_in';
  actionTime: string;
  childEventEntryId: string;
  childName: string;
  passReference: string;
  gateLocation: string;
  status: 'pending' | 'processing' | 'failed' | 'conflict';
  error?: string;
}

// Fallback in case of iframe constraints blocking IndexedDB
let useFallbackStore = false;
const fallbackStore: {
  manifest: Record<string, OfflinePass>;
  outbox: Record<string, OutboxAction>;
} = {
  manifest: {},
  outbox: {}
};

// Safe localStorage persistence for fallback outbox actions
const loadFallbackOutbox = () => {
  try {
    const raw = localStorage.getItem('koinonia_fallback_outbox');
    if (raw) {
      fallbackStore.outbox = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[OfflineService] Failed to load fallback outbox:', e);
  }
};

const saveFallbackOutbox = () => {
  try {
    localStorage.setItem('koinonia_fallback_outbox', JSON.stringify(fallbackStore.outbox));
  } catch (e) {
    console.warn('[OfflineService] Failed to save fallback outbox:', e);
  }
};

// Load initial fallback state
loadFallbackOutbox();

// Open IndexedDB safely
const DB_NAME = 'koinonia_offline_db';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      useFallbackStore = true;
      reject(new Error('IndexedDB not supported'));
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('manifest')) {
          db.createObjectStore('manifest', { keyPath: 'childEventEntryId' });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'idempotencyKey' });
        }
        if (!db.objectStoreNames.contains('sync_logs')) {
          db.createObjectStore('sync_logs', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event: any) => {
        resolve(event.target.result);
      };

      request.onerror = (event: any) => {
        console.warn('[OfflineService] IndexedDB blocked/failed, falling back to localStorage:', event.target.error);
        useFallbackStore = true;
        resolve(null as any); // Resolve with null so we know to use fallback
      };
    } catch (err) {
      console.warn('[OfflineService] IndexedDB crashed on open, falling back:', err);
      useFallbackStore = true;
      resolve(null as any);
    }
  });
}

// Wrapper to perform DB actions or fallback
async function withStore<T>(
  storeName: 'manifest' | 'outbox' | 'sync_logs',
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T> | IDBRequest
): Promise<T> {
  if (useFallbackStore) {
    return handleFallback(storeName, mode, callback as any);
  }

  const db = await openDB();
  if (!db) {
    return handleFallback(storeName, mode, callback as any);
  }

  return new Promise<T>((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(db.transaction(storeName, mode).objectStore(storeName).name);
      const request = callback(store);

      if (request instanceof IDBRequest) {
        request.onsuccess = (event: any) => {
          resolve(event.target.result);
        };
        request.onerror = (event: any) => {
          reject(event.target.error);
        };
      } else {
        // Callback returns a promise itself
        (request as Promise<T>).then(resolve).catch(reject);
      }
    } catch (err) {
      console.warn(`[OfflineService] Transaction error on ${storeName}, reverting to fallback:`, err);
      useFallbackStore = true;
      resolve(handleFallback(storeName, mode, callback as any));
    }
  });
}

// Fallback logic in case of iframe restrictions
function handleFallback(
  storeName: 'manifest' | 'outbox' | 'sync_logs',
  mode: IDBTransactionMode,
  callback: (store: any) => any
): any {
  if (storeName === 'manifest') {
    if (mode === 'readwrite') {
      return {
        add: (item: OfflinePass) => {
          fallbackStore.manifest[item.childEventEntryId] = item;
        },
        put: (item: OfflinePass) => {
          fallbackStore.manifest[item.childEventEntryId] = item;
        },
        clear: () => {
          fallbackStore.manifest = {};
        },
        getAll: () => Object.values(fallbackStore.manifest),
        get: (key: string) => fallbackStore.manifest[key] || null
      };
    } else {
      return {
        get: (key: string) => fallbackStore.manifest[key] || null,
        getAll: () => Object.values(fallbackStore.manifest)
      };
    }
  } else if (storeName === 'outbox') {
    if (mode === 'readwrite') {
      return {
        add: (item: OutboxAction) => {
          fallbackStore.outbox[item.idempotencyKey] = item;
          saveFallbackOutbox();
        },
        put: (item: OutboxAction) => {
          fallbackStore.outbox[item.idempotencyKey] = item;
          saveFallbackOutbox();
        },
        delete: (key: string) => {
          delete fallbackStore.outbox[key];
          saveFallbackOutbox();
        },
        clear: () => {
          fallbackStore.outbox = {};
          saveFallbackOutbox();
        },
        getAll: () => Object.values(fallbackStore.outbox),
        get: (key: string) => fallbackStore.outbox[key] || null
      };
    } else {
      return {
        get: (key: string) => fallbackStore.outbox[key] || null,
        getAll: () => Object.values(fallbackStore.outbox)
      };
    }
  } else {
    // sync_logs
    return {
      add: () => {},
      put: () => {},
      getAll: () => [],
      clear: () => {}
    };
  }
}

// Exported offline utilities
export const offlineService = {
  // Check if we are offline (with extra navigator confirmation)
  isOffline(): boolean {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  },

  // PRELOAD OFFLINE REFERENCE DATA (GET /manifest)
  async downloadManifest(deviceId: string): Promise<number> {
    try {
      const res = await api.request<{ success: boolean; passes: OfflinePass[] }>(
        `/api/staff/manifest?deviceId=${encodeURIComponent(deviceId)}`
      );

      if (res.success && Array.isArray(res.passes)) {
        // Clear old manifest first
        if (useFallbackStore) {
          fallbackStore.manifest = {};
        } else {
          await withStore('manifest', 'readwrite', (store) => store.clear());
        }

        // Save new manifest
        for (const pass of res.passes) {
          if (useFallbackStore) {
            fallbackStore.manifest[pass.childEventEntryId] = pass;
          } else {
            await withStore('manifest', 'readwrite', (store) => store.put(pass));
          }
        }
        return res.passes.length;
      }
      return 0;
    } catch (err) {
      console.error('[OfflineService] Failed to download manifest:', err);
      throw err;
    }
  },

  // GET ALL LOCAL PASSES IN MANIFEST
  async getLocalManifest(): Promise<OfflinePass[]> {
    if (useFallbackStore) {
      return Object.values(fallbackStore.manifest);
    }
    return withStore<OfflinePass[]>('manifest', 'readonly', (store) => store.getAll() as any);
  },

  // LOOKUP PASS IN LOCAL OFFLINE MANIFEST
  async lookupLocalPass(passReferenceOrCode: string): Promise<OfflinePass | null> {
    const list = await this.getLocalManifest();
    const cleanRef = passReferenceOrCode.trim().toUpperCase();
    
    // Attempt exact or partial reference match
    const matched = list.find(p => 
      p.passReference.toUpperCase() === cleanRef || 
      p.passReference.toUpperCase().endsWith(cleanRef) ||
      p.childEventEntryId === passReferenceOrCode
    );
    return matched || null;
  },

  // QUEUE CHECK-IN OFFLINE
  async queueCheckIn(
    childEventEntryId: string,
    childName: string,
    passReference: string,
    gateLocation: string = 'Gate'
  ): Promise<{ status: 'queued' | 'duplicate'; action: OutboxAction }> {
    const outbox = await this.getOutbox();
    
    // Check if check-in for this child is already pending in outbox
    const duplicate = outbox.find(a => a.childEventEntryId === childEventEntryId);
    if (duplicate) {
      return { status: 'duplicate', action: duplicate };
    }

    const idempotencyKey = 'idemp-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const action: OutboxAction = {
      idempotencyKey,
      actionType: 'check_in',
      actionTime: new Date().toISOString(),
      childEventEntryId,
      childName,
      passReference,
      gateLocation,
      status: 'pending'
    };

    if (useFallbackStore) {
      fallbackStore.outbox[idempotencyKey] = action;
      saveFallbackOutbox();
    } else {
      await withStore('outbox', 'readwrite', (store) => store.put(action));
    }

    // Trigger local events to refresh multi-tab coordination/listening components
    window.dispatchEvent(new Event('koinonia_outbox_updated'));

    return { status: 'queued', action };
  },

  // GET QUEUED ACTIONS
  async getOutbox(): Promise<OutboxAction[]> {
    if (useFallbackStore) {
      return Object.values(fallbackStore.outbox);
    }
    return withStore<OutboxAction[]>('outbox', 'readonly', (store) => store.getAll() as any);
  },

  // CANCEL QUEUED ACTION
  async cancelAction(idempotencyKey: string): Promise<void> {
    if (useFallbackStore) {
      delete fallbackStore.outbox[idempotencyKey];
      saveFallbackOutbox();
    } else {
      await withStore('outbox', 'readwrite', (store) => store.delete(idempotencyKey));
    }
    window.dispatchEvent(new Event('koinonia_outbox_updated'));
  },

  // COMPREHENSIVE OUTBOX PROCESSOR
  _isSyncing: false,
  async syncOutbox(deviceId: string): Promise<{ successCount: number; conflictCount: number; errors: string[] }> {
    if (this._isSyncing) return { successCount: 0, conflictCount: 0, errors: [] };
    if (this.isOffline()) return { successCount: 0, conflictCount: 0, errors: ['Device is offline'] };

    const actions = await this.getOutbox();
    if (actions.length === 0) return { successCount: 0, conflictCount: 0, errors: [] };

    this._isSyncing = true;
    let successCount = 0;
    let conflictCount = 0;
    const errors: string[] = [];

    try {
      // Mark all as processing
      for (const action of actions) {
        action.status = 'processing';
        if (useFallbackStore) {
          fallbackStore.outbox[action.idempotencyKey] = action;
        } else {
          await withStore('outbox', 'readwrite', (store) => store.put(action));
        }
      }
      window.dispatchEvent(new Event('koinonia_outbox_updated'));

      // Send batch to backend
      const response = await api.request<{
        success: boolean;
        processedCount: number;
        conflictCount: number;
        results: Array<{ idempotencyKey: string; status: 'success' | 'conflict' | 'error'; error?: string; message?: string }>;
      }>('/api/staff/sync', {
        method: 'POST',
        body: JSON.stringify({ deviceId, actions })
      });

      if (response && Array.isArray(response.results)) {
        for (const res of response.results) {
          if (res.status === 'success') {
            successCount++;
            // Remove from outbox
            if (useFallbackStore) {
              delete fallbackStore.outbox[res.idempotencyKey];
            } else {
              await withStore('outbox', 'readwrite', (store) => store.delete(res.idempotencyKey));
            }
          } else if (res.status === 'conflict') {
            conflictCount++;
            // Conflict means child already checked in, so remove from queue too as it's completed on backend
            if (useFallbackStore) {
              delete fallbackStore.outbox[res.idempotencyKey];
            } else {
              await withStore('outbox', 'readwrite', (store) => store.delete(res.idempotencyKey));
            }
          } else {
            errors.push(res.error || 'Unknown sync error');
            // Revert back to pending
            const action = actions.find(a => a.idempotencyKey === res.idempotencyKey);
            if (action) {
              action.status = 'failed';
              action.error = res.error;
              if (useFallbackStore) {
                fallbackStore.outbox[action.idempotencyKey] = action;
              } else {
                await withStore('outbox', 'readwrite', (store) => store.put(action));
              }
            }
          }
        }
      } else {
        // Revert all to failed
        for (const action of actions) {
          action.status = 'failed';
          if (useFallbackStore) {
            fallbackStore.outbox[action.idempotencyKey] = action;
          } else {
            await withStore('outbox', 'readwrite', (store) => store.put(action));
          }
        }
        errors.push('Invalid server response');
      }

    } catch (err: any) {
      console.error('[OfflineService] Sync batch failed:', err);
      errors.push(err?.message || 'Sync connection failed');
      // Revert processing status to failed
      for (const action of actions) {
        action.status = 'failed';
        if (useFallbackStore) {
          fallbackStore.outbox[action.idempotencyKey] = action;
        } else {
          await withStore('outbox', 'readwrite', (store) => store.put(action));
        }
      }
    } finally {
      this._isSyncing = false;
      if (useFallbackStore) {
        saveFallbackOutbox();
      }
      window.dispatchEvent(new Event('koinonia_outbox_updated'));
    }

    return { successCount, conflictCount, errors };
  }
};
