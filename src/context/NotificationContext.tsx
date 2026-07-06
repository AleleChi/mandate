import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AppToast } from '../components/common/AppToast';

export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  description?: string;
  duration?: number;
}

export interface NotificationContextType {
  showSuccess: (message: string, description?: string) => void;
  showError: (message: string, description?: string) => void;
  showInfo: (message: string, description?: string) => void;
  showWarning: (message: string, description?: string) => void;
  dismiss: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const timersRef = useRef<Record<string, NodeJS.Timeout>>({});

  const dismiss = useCallback((id: string) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastNotification['type'], message: string, description?: string, duration?: number) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const toastDuration = duration ?? (type === 'error' ? 6000 : 3500);

      setToasts((prev) => {
        const next = [...prev, { id, type, message, description, duration: toastDuration }];
        // Keep maximum 3 toasts stacked
        return next.slice(-3);
      });

      if (toastDuration > 0) {
        timersRef.current[id] = setTimeout(() => {
          dismiss(id);
        }, toastDuration);
      }
    },
    [dismiss]
  );

  const showSuccess = useCallback((message: string, description?: string) => {
    addToast('success', message, description, 3500);
  }, [addToast]);

  const showError = useCallback((message: string, description?: string) => {
    addToast('error', message, description, 6000);
  }, [addToast]);

  const showInfo = useCallback((message: string, description?: string) => {
    addToast('info', message, description, 3500);
  }, [addToast]);

  const showWarning = useCallback((message: string, description?: string) => {
    addToast('warning', message, description, 3500);
  }, [addToast]);

  return (
    <NotificationContext.Provider value={{ showSuccess, showError, showInfo, showWarning, dismiss }}>
      {children}
      <AppToast toasts={toasts} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
