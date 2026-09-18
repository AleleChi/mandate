import React, { useEffect, useRef } from 'react';
import { X, RefreshCw, AlertCircle, Send, CheckCircle2 } from 'lucide-react';
import { ActionPreview } from './OperationsAssistantPanel';

interface OperationsActionModalProps {
  isOpen: boolean;
  preview: ActionPreview;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const OperationsActionModal: React.FC<OperationsActionModalProps> = ({
  isOpen,
  preview,
  loading,
  error,
  onConfirm,
  onCancel
}) => {
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Keyboard accessibility: Escape key and focus management
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Auto focus confirm button or modal container
    if (confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  // Backdrop click handler
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading) {
      onCancel();
    }
  };

  const isDutyReminders = preview.actionKey === 'SEND_DUTY_REMINDERS';
  const totalNotReported = preview.totalTargetsCount ?? (preview.recipients ? preview.recipients.length : preview.affectedCount);
  const availableCount = preview.affectedCount;
  const unavailableCount = preview.unavailableCount ?? Math.max(0, totalNotReported - availableCount);

  // Derive human-readable channel label
  const formatChannelLabel = (channel: string): string => {
    switch (channel.toLowerCase()) {
      case 'whatsapp':
        return 'WhatsApp';
      case 'email':
        return 'Email';
      case 'push':
        return 'Push';
      case 'sms':
        return 'SMS';
      default:
        return 'None';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-modal-title"
      aria-describedby="action-modal-description"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        ref={modalContainerRef}
        className="bg-white w-full max-w-xl sm:max-w-2xl rounded-2xl sm:rounded-3xl border border-[#EAE8E1] shadow-xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh] my-auto"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[#EAE8E1] bg-[#FAF8F4] flex items-start justify-between shrink-0">
          <div className="space-y-1 pr-4">
            <h3 id="action-modal-title" className="font-serif text-lg sm:text-xl font-semibold text-[#18181B]">
              {preview.title}
            </h3>

            {isDutyReminders ? (
              <div id="action-modal-description" className="space-y-0.5 text-xs text-zinc-600">
                <p className="font-medium text-zinc-800">
                  {totalNotReported} {totalNotReported === 1 ? 'volunteer has' : 'volunteers have'} not reported for duty.
                </p>
                {unavailableCount > 0 ? (
                  <p className="text-zinc-500">
                    <span className="text-zinc-700 font-medium">{availableCount}</span> can receive a reminder.{' '}
                    <span className="text-amber-800 font-medium">{unavailableCount}</span> {unavailableCount === 1 ? 'has' : 'have'} no available communication channel.
                  </p>
                ) : (
                  <p className="text-zinc-500">
                    All {availableCount} can receive a duty reminder.
                  </p>
                )}
              </div>
            ) : (
              <p id="action-modal-description" className="text-xs text-zinc-600">
                {preview.description}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            aria-label="Close modal"
            className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer shrink-0 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-left min-h-0">
          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Warnings if any */}
          {preview.warnings && preview.warnings.length > 0 && !isDutyReminders && (
            <div className="space-y-1.5">
              {preview.warnings.map((w, idx) => (
                <div key={idx} className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-900 font-medium">
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* Section: Recipients (for duty reminders) */}
          {isDutyReminders && preview.recipients && preview.recipients.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1 border-b border-[#EAE8E1]">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                  Recipients ({preview.recipients.length})
                </span>
                <span className="text-[10px] text-zinc-400">
                  {availableCount} eligible
                </span>
              </div>

              <div className="divide-y divide-[#EAE8E1]/60">
                {preview.recipients.map((rec) => (
                  <div key={rec.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-medium text-zinc-900 truncate">
                        {rec.name}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {rec.locationName || 'Assigned Location'} • {rec.responsibility || 'General Duty'}
                      </p>
                    </div>

                    <div className="shrink-0 text-right space-y-0.5">
                      {rec.eligible ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-zinc-100 border border-zinc-200/80 rounded-md text-[11px] text-zinc-800 font-medium">
                          <span className="text-zinc-500">Delivery:</span>
                          <span className="font-semibold">{formatChannelLabel(rec.channel)}</span>
                        </div>
                      ) : (
                        <div className="text-right">
                          <span className="inline-block text-[11px] text-zinc-500 bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded-md font-medium">
                            No available communication channel
                          </span>
                          {rec.ineligibilityReason && (
                            <p className="text-[10px] text-zinc-400 pt-0.5 max-w-[200px] truncate">
                              {rec.ineligibilityReason}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generic Action Preview Items (for Report Regeneration or Alert Actions) */}
          {!isDutyReminders && preview.items && preview.items.length > 0 && (
            <div className="space-y-2">
              <div className="border border-[#EAE8E1] rounded-xl overflow-hidden divide-y divide-[#EAE8E1]/60 bg-[#FAF9F6]/40">
                {preview.items.map((item, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between text-xs">
                    <span className="text-zinc-600 font-medium">{item.label}</span>
                    <span className="text-zinc-900 font-semibold">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions (Sticky bottom on mobile, right-aligned on desktop) */}
        <div className="p-4 sm:p-5 border-t border-[#EAE8E1] bg-[#FAF8F4]/80 backdrop-blur-xs flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl transition-colors cursor-pointer disabled:opacity-40 min-h-[40px] sm:min-h-[36px]"
          >
            {preview.cancelLabel || 'Cancel'}
          </button>

          <button
            ref={confirmBtnRef}
            type="button"
            disabled={loading || availableCount === 0}
            onClick={onConfirm}
            className="px-5 py-2 text-xs font-semibold bg-[#18181B] hover:bg-zinc-800 disabled:opacity-40 text-white rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] shadow-2xs"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C59B27]" />
                <span>Sending…</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 text-[#C59B27]" />
                <span>{preview.confirmLabel || 'Confirm'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
