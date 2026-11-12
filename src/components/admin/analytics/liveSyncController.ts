export type LiveConnectionState = 'connecting' | 'connected' | 'reconnecting';

export interface LiveSyncAdapter {
  createEventSource: (url: string) => {
    addEventListener: (type: string, listener: (evt?: any) => void) => void;
    close: () => void;
    onopen: ((evt?: any) => void) | null;
    onerror: ((evt?: any) => void) | null;
  };
  setIntervalFn: (fn: () => void, ms: number) => any;
  clearIntervalFn: (id: any) => void;
}

export interface LiveSyncController {
  start: () => void;
  stop: () => void;
  getState: () => LiveConnectionState;
  isPollingActive: () => boolean;
}

export function createAnalyticsLiveSyncController(params: {
  streamUrl: string;
  pollIntervalMs?: number;
  onRefresh: (silent: boolean) => void;
  onStateChange: (state: LiveConnectionState) => void;
  adapter?: Partial<LiveSyncAdapter>;
}): LiveSyncController {
  const pollMs = params.pollIntervalMs ?? 5000;
  let state: LiveConnectionState = 'connecting';
  let destroyed = false;
  let eventSource: ReturnType<LiveSyncAdapter['createEventSource']> | null = null;
  let pollTimer: any = null;

  const setIntervalFn =
    params.adapter?.setIntervalFn || ((fn: () => void, ms: number) => window.setInterval(fn, ms));
  const clearIntervalFn =
    params.adapter?.clearIntervalFn || ((id: any) => window.clearInterval(id));
  const createES =
    params.adapter?.createEventSource ||
    ((url: string) => new EventSource(url));

  const setState = (next: LiveConnectionState) => {
    if (state !== next) {
      state = next;
      params.onStateChange(next);
    }
  };

  const stopPolling = () => {
    if (pollTimer !== null) {
      clearIntervalFn(pollTimer);
      pollTimer = null;
    }
  };

  const startPolling = () => {
    if (destroyed || pollTimer !== null) return;
    pollTimer = setIntervalFn(() => {
      if (!destroyed) {
        params.onRefresh(true);
      }
    }, pollMs);
  };

  const start = () => {
    if (destroyed) return;
    setState('connecting');
    try {
      eventSource = createES(params.streamUrl);

      eventSource.onopen = () => {
        if (destroyed) return;
        stopPolling();
        setState('connected');
      };

      eventSource.addEventListener('connected', () => {
        if (destroyed) return;
        stopPolling();
        setState('connected');
      });

      eventSource.addEventListener('analytics_update', () => {
        if (destroyed) return;
        stopPolling();
        setState('connected');
        params.onRefresh(true);
      });

      eventSource.onerror = () => {
        if (destroyed) return;
        setState('reconnecting');
        startPolling();
      };
    } catch {
      setState('reconnecting');
      startPolling();
    }
  };

  const stop = () => {
    destroyed = true;
    stopPolling();
    if (eventSource) {
      try {
        eventSource.close();
      } catch {}
      eventSource = null;
    }
  };

  return {
    start,
    stop,
    getState: () => state,
    isPollingActive: () => pollTimer !== null
  };
}

