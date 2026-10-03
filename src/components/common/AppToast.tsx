import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { ToastNotification } from '../../context/NotificationContext';

interface AppToastProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

export const AppToast: React.FC<AppToastProps> = ({ toasts, onDismiss }) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const getIcon = (type: ToastNotification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-[#B89047] flex-shrink-0 mt-0.5" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-[#DC2626] flex-shrink-0 mt-0.5" />;
      case 'info':
        return <Info className="w-5 h-5 text-[#B89047] flex-shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-[#D97706] flex-shrink-0 mt-0.5" />;
    }
  };

  const getCardStyle = (type: ToastNotification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-[#FAF9F6] border border-[#E5E2DA] text-[#18181B] shadow-md';
      case 'error':
        return 'bg-[#FAF9F6] border border-[#FCA5A5] text-[#18181B] shadow-md';
      case 'info':
        return 'bg-[#FAF9F6] border border-[#E5E2DA] text-[#18181B] shadow-md';
      case 'warning':
        return 'bg-[#FAF6EB] border border-[#FDE68A] text-[#18181B] shadow-md';
    }
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 pointer-events-none flex flex-col gap-2 items-center md:items-end md:top-6 md:right-6 md:left-auto md:bottom-auto max-w-sm mx-auto md:mx-0">
      <AnimatePresence>
        {toasts.map((toast) => {
          const isError = toast.type === 'error';
          const initialMotion = prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 };
          const animateMotion = prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 };
          const exitMotion = prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 };

          return (
            <motion.div
              key={toast.id}
              initial={initialMotion}
              animate={animateMotion}
              exit={exitMotion}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              role={isError ? 'alert' : 'status'}
              aria-live={isError ? 'assertive' : 'polite'}
              className={`pointer-events-auto w-full p-3.5 rounded-lg flex items-start justify-between gap-3 ${getCardStyle(toast.type)}`}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {getIcon(toast.type)}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-semibold text-[#18181B] leading-snug">
                    {toast.message}
                  </span>
                  {toast.description && (
                    <span className="text-xs text-[#52525B] mt-0.5 leading-normal break-words">
                      {toast.description}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss notification"
                className="text-[#71717A] hover:text-[#18181B] p-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-[#B89047]"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
