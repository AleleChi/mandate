import { useEffect, useRef } from 'react';
import { safeStorage } from '../utils/storage';
import { buildApiUrl } from '../utils/urlHelper';

export interface SSEMessagePayload {
  type: string;
  data?: any;
  timestamp?: string;
  [key: string]: any;
}

type RealtimeListener = (data: any) => void;

class RealtimeService {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<RealtimeListener>> = new Map();
  private isConnected = false;
  private reconnectTimer: any = null;
  private reconnectAttempts = 0;
  private token: string | null = null;
  private wasDisconnected = false;

  public connect(explicitToken?: string) {
    const token = explicitToken || safeStorage.getItem('koinonia_token');
    if (!token) {
      this.disconnect();
      return;
    }

    if (this.eventSource && this.token === token && (this.eventSource.readyState === EventSource.OPEN || this.eventSource.readyState === EventSource.CONNECTING)) {
      return; // Already connecting or connected
    }

    this.disconnect();
    this.token = token;

    try {
      const streamPath = `/api/notifications/stream?token=${encodeURIComponent(token)}`;
      const streamUrl = typeof window !== 'undefined' ? buildApiUrl(streamPath) : streamPath;

      this.eventSource = new EventSource(streamUrl);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        if (this.wasDisconnected) {
          this.wasDisconnected = false;
          this.notify('sse-reconnected', { timestamp: new Date().toISOString() });
        }
      };

      this.eventSource.onmessage = (event) => {
        try {
          const payload: SSEMessagePayload = JSON.parse(event.data);
          if (payload.type === 'handshake') {
            this.isConnected = true;
            if (this.wasDisconnected) {
              this.wasDisconnected = false;
              this.notify('sse-reconnected', payload);
            }
            return;
          }

          // Broadcast through internal registry
          this.notify(payload.type, payload.data || payload);

          // Dispatch window custom event for broad UI compatibility
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('koinonia:sse', { detail: payload }));
            window.dispatchEvent(new CustomEvent(`koinonia:${payload.type}`, { detail: payload.data || payload }));
          }
        } catch (e) {
          // Keep-alive comments or non-JSON messages safely ignored
        }
      };

      this.eventSource.onerror = () => {
        this.isConnected = false;
        this.wasDisconnected = true;
        this.scheduleReconnect();
      };
    } catch (err) {
      console.warn('[Realtime] Failed to initialize EventSource:', err);
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnected = false;
    this.token = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 5);
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.token || safeStorage.getItem('koinonia_token')) {
        this.connect();
      }
    }, delay);
  }

  public subscribe(eventType: string, listener: RealtimeListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    // Auto-connect if authenticated and not yet connected
    if (!this.isConnected && !this.eventSource) {
      this.connect();
    }

    return () => {
      const set = this.listeners.get(eventType);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(eventType);
        }
      }
    };
  }

  private notify(eventType: string, data: any) {
    const directSet = this.listeners.get(eventType);
    if (directSet) {
      directSet.forEach(cb => {
        try { cb(data); } catch (err) { console.error(`[Realtime] Listener error on ${eventType}:`, err); }
      });
    }

    const wildcardSet = this.listeners.get('*');
    if (wildcardSet) {
      wildcardSet.forEach(cb => {
        try { cb({ type: eventType, data }); } catch (err) { console.error(`[Realtime] Wildcard listener error:`, err); }
      });
    }
  }

  public getConnected(): boolean {
    return this.isConnected;
  }
}

export const realtime = new RealtimeService();

/**
 * React hook to subscribe to specific realtime SSE events
 */
export function useRealtimeSubscription(
  eventTypes: string | string[],
  callback: (data: any) => void
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    const unsubs = types.map(type => {
      return realtime.subscribe(type, (data) => {
        cbRef.current(data);
      });
    });

    return () => {
      unsubs.forEach(u => u());
    };
  }, [JSON.stringify(eventTypes)]);
}

/**
 * React hook for invalidation resync on SSE reconnect or periodic fallback
 */
export function useRealtimeResync(onResync: () => void, fallbackIntervalMs = 25000) {
  const resyncRef = useRef(onResync);
  resyncRef.current = onResync;

  useEffect(() => {
    // 1. Listen for reconnect event
    const unsub = realtime.subscribe('sse-reconnected', () => {
      resyncRef.current();
    });

    // 2. Fallback polling only when SSE is not connected or as secondary safety (pauses when page is hidden)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      if (!realtime.getConnected()) {
        resyncRef.current();
      }
    }, fallbackIntervalMs);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [fallbackIntervalMs]);
}
