import React, { useEffect, useRef } from 'react';
import { X, RefreshCw, AlertCircle, Send, CheckCircle2, ArrowRight, ChevronRight } from 'lucide-react';
import {
  GroundedQueryResult,
  ActionExecutionResult,
  DeepLinkItem,
  ActionRecipient
} from './OperationsAssistantPanel';

export interface OperationsAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: string | null;
  queryResult: GroundedQueryResult | null;
  queryLoading?: boolean;
  actionLoading?: boolean;
  actionResult?: ActionExecutionResult | null;
  actionError?: string | null;
  onConfirmAction?: (token: string) => void;
  onCancelAction?: () => void;
  onDeepLinkClick?: (link: DeepLinkItem) => void;
  onSelectRelatedQuestion?: (question: string) => void;
}

export const OperationsAssistantModal: React.FC<OperationsAssistantModalProps> = ({
  isOpen,
  onClose,
  question,
  queryResult,
  queryLoading = false,
  actionLoading = false,
  actionResult,
  actionError,
  onConfirmAction,
  onCancelAction,
  onDeepLinkClick,
  onSelectRelatedQuestion
}) => {
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
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
      if (e.key === 'Escape' && !actionLoading) {
        if (queryResult?.actionPreview && onCancelAction) {
          onCancelAction();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Auto focus confirm button if action exists, otherwise close button
    if (queryResult?.actionPreview && confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    } else if (closeBtnRef.current) {
      closeBtnRef.current.focus();
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, actionLoading, queryResult?.actionPreview, onCancelAction, onClose]);

  if (!isOpen || (!queryResult && !queryLoading)) return null;

  // Backdrop click handler
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !actionLoading) {
      if (queryResult?.actionPreview && onCancelAction) {
        onCancelAction();
      } else {
        onClose();
      }
    }
  };

  const preview = queryResult?.actionPreview;
  const isDutyReminders = preview?.actionKey === 'SEND_DUTY_REMINDERS';
  const totalNotReported = preview?.totalTargetsCount ?? (preview?.recipients ? preview.recipients.length : (preview?.affectedCount ?? 0));
  const availableCount = preview?.affectedCount ?? 0;
  const unavailableCount = preview?.unavailableCount ?? Math.max(0, totalNotReported - availableCount);

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
      aria-labelledby="assistant-modal-title"
      aria-describedby="assistant-modal-description"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        ref={modalContainerRef}
        className="bg-white w-full max-w-2xl sm:max-w-3xl rounded-2xl sm:rounded-3xl border border-[#EAE8E1] shadow-xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh] my-auto text-left"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#EAE8E1] bg-[#FAF8F4] flex items-center justify-between shrink-0">
          <div className="space-y-0.5 pr-4">
            <h3 id="assistant-modal-title" className="font-serif text-base sm:text-lg font-semibold text-[#18181B]">
              Operations Assistant
            </h3>
            <p className="text-[11px] text-zinc-500">
              Live operational inquiry
            </p>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            disabled={actionLoading}
            onClick={() => {
              if (preview && onCancelAction) {
                onCancelAction();
              } else {
                onClose();
              }
            }}
            aria-label="Close dialog"
            className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer shrink-0 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 min-h-0">
          {/* In-Modal Loading State (e.g. When asking related questions) */}
          {queryLoading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-xs text-zinc-500">
              <RefreshCw className="w-5 h-5 animate-spin text-[#C59B27]" />
              <span className="font-medium">Analyzing current operational data...</span>
            </div>
          )}

          {!queryLoading && queryResult && (
            <>
              {/* 1. YOUR QUESTION */}
              {question && (
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                    YOUR QUESTION
                  </span>
                  <p className="text-xs sm:text-sm font-medium text-zinc-900 leading-snug">
                    {question}
                  </p>
                </div>
              )}

              {/* 2. ANSWER */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9A7326] block">
                  ANSWER
                </span>
                <div
                  id="assistant-modal-description"
                  className="bg-[#FAF9F6] rounded-xl p-3.5 sm:p-4 border-l-2 border-[#C59B27] space-y-3"
                >
                  <p className="text-xs sm:text-[13px] font-medium text-zinc-900 leading-relaxed">
                    {queryResult.answer}
                  </p>

                  {/* Desktop & Mobile Table Display */}
                  {queryResult.table && queryResult.table.rows && queryResult.table.rows.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {/* Desktop Table View */}
                      <div className="hidden sm:block overflow-x-auto rounded-xl border border-[#EAE8E1] bg-white">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#FAF9F6] border-b border-[#EAE8E1] text-[11px] text-zinc-500 font-medium">
                              {queryResult.table.columns.map((col, cIdx) => (
                                <th key={cIdx} className="py-2.5 px-3.5 whitespace-nowrap">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#EAE8E1]/60">
                            {queryResult.table.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-[#FAF9F6]/50 transition-colors">
                                {row.map((val, cellIdx) => (
                                  <td key={cellIdx} className="py-2 px-3.5 text-zinc-800 whitespace-nowrap text-xs">
                                    {val !== null && val !== undefined ? String(val) : '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Stacked Responsive Cards */}
                      <div className="sm:hidden space-y-2">
                        {queryResult.table.rows.map((row, rIdx) => (
                          <div
                            key={rIdx}
                            className="p-3 bg-white border border-[#EAE8E1] rounded-xl space-y-1.5 text-xs shadow-2xs"
                          >
                            <div className="flex items-center justify-between pb-1 border-b border-[#EAE8E1]/60 font-semibold text-zinc-900">
                              <span>{row[0] !== null && row[0] !== undefined ? String(row[0]) : '—'}</span>
                              {row.length > 4 && row[4] && (
                                <span className="text-[10px] px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-md font-medium">
                                  {String(row[4])}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 pt-0.5 text-[11px]">
                              {queryResult.table!.columns.slice(1, row.length > 4 ? 4 : undefined).map((col, cIdx) => (
                                <div key={cIdx} className="flex flex-col">
                                  <span className="text-zinc-500">{col}</span>
                                  <span className="font-medium text-zinc-800">
                                    {row[cIdx + 1] !== null && row[cIdx + 1] !== undefined ? String(row[cIdx + 1]) : '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {queryResult.table.totalCount !== undefined &&
                        queryResult.table.displayedCount !== undefined &&
                        queryResult.table.totalCount > queryResult.table.displayedCount && (
                          <p className="text-[11px] text-zinc-400 text-right">
                            Showing {queryResult.table.displayedCount} of {queryResult.table.totalCount} records
                          </p>
                        )}
                    </div>
                  )}

                  {/* Structured Breakdown / Summary Display */}
                  {queryResult.breakdown && queryResult.breakdown.items && queryResult.breakdown.items.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {queryResult.breakdown.title && (
                        <span className="text-[10px] font-semibold text-zinc-500 block uppercase tracking-wider">
                          {queryResult.breakdown.title}
                        </span>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {queryResult.breakdown.items.map((item, bIdx) => (
                          <div
                            key={bIdx}
                            className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#EAE8E1] text-xs shadow-2xs"
                          >
                            <span className="font-medium text-zinc-800">{item.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-900 font-semibold">{item.primary}</span>
                              {item.secondary && (
                                <span className="text-[11px] text-[#9A7326] font-medium">
                                  ({item.secondary})
                                </span>
                              )}
                              {item.meta && (
                                <span className="text-[11px] text-zinc-400">
                                  · {item.meta}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. PROPOSED ACTION SECTION (When Action Preview Exists) */}
              {preview && !actionResult && (
                <div className="space-y-3 pt-2 border-t border-[#EAE8E1]">
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                      PROPOSED ACTION
                    </span>
                    <h4 className="font-serif text-sm sm:text-base font-semibold text-zinc-900">
                      {preview.title}
                    </h4>

                    {isDutyReminders ? (
                      <div className="space-y-0.5 text-xs text-zinc-600">
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
                      <p className="text-xs text-zinc-600">
                        {preview.description}
                      </p>
                    )}
                  </div>

                  {/* Action Error Banner */}
                  {actionError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 font-medium">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{actionError}</span>
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

                  {/* Duty Reminders Recipients List */}
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

                  {/* Generic Action Preview Items */}
                  {!isDutyReminders && preview.items && preview.items.length > 0 && (
                    <div className="border border-[#EAE8E1] rounded-xl overflow-hidden divide-y divide-[#EAE8E1]/60 bg-[#FAF9F6]/40">
                      {preview.items.map((item, idx) => (
                        <div key={idx} className="p-3 flex items-center justify-between text-xs">
                          <span className="text-zinc-600 font-medium">{item.label}</span>
                          <span className="text-zinc-900 font-semibold">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. CONFIRMED ACTION COMPLETED RESULT */}
              {actionResult && (
                <div className="pt-2 border-t border-[#EAE8E1]">
                  <div className="bg-[#FAF9F6] rounded-xl p-4 border-l-2 border-emerald-600 space-y-2">
                    <h4 className="text-xs sm:text-sm font-semibold text-zinc-900">
                      {actionResult.title}
                    </h4>
                    <p className="text-xs text-zinc-700 font-medium">
                      {actionResult.message}
                    </p>
                    <div className="pt-0.5 text-[11px] text-zinc-400">
                      Updated {actionResult.updatedAt}
                    </div>
                    {actionResult.deepLink && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (onDeepLinkClick) onDeepLinkClick(actionResult.deepLink!);
                            onClose();
                          }}
                          className="text-xs inline-flex items-center gap-1 font-medium text-[#9A7326] hover:text-[#7A5B1C] transition-colors cursor-pointer"
                        >
                          <span>{actionResult.deepLink.label}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5. METADATA & DEEP LINKS */}
              {(queryResult.provenance || (queryResult.deepLinks && queryResult.deepLinks.length > 0)) && (
                <div className="pt-3 border-t border-[#EAE8E1]/80 space-y-2">
                  {queryResult.provenance && (
                    <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Source: <span className="text-zinc-600 font-normal">{queryResult.provenance.source}</span></span>
                      <span>·</span>
                      <span>Updated {queryResult.provenance.updatedAt}</span>
                    </div>
                  )}

                  {queryResult.deepLinks && queryResult.deepLinks.length > 0 && (
                    <div className="flex flex-wrap gap-3 pt-0.5">
                      {queryResult.deepLinks.map((link, lIdx) => (
                        <button
                          key={lIdx}
                          type="button"
                          onClick={() => {
                            if (onDeepLinkClick) onDeepLinkClick(link);
                            onClose();
                          }}
                          className="text-xs inline-flex items-center gap-1 font-medium text-[#9A7326] hover:text-[#7A5B1C] transition-colors cursor-pointer"
                        >
                          <span>{link.label}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 6. RELATED QUESTIONS (In-Modal Query Trigger) */}
              {queryResult.suggestedQuestions && queryResult.suggestedQuestions.length > 0 && (
                <div className="pt-3 border-t border-[#EAE8E1]/80 space-y-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    You may also want to ask
                  </h4>
                  <div className="flex flex-col gap-1">
                    {queryResult.suggestedQuestions.slice(0, 3).map((sq, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          if (onSelectRelatedQuestion) onSelectRelatedQuestion(sq);
                        }}
                        className="text-xs text-left text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer py-1 flex items-center justify-between group"
                      >
                        <span className="group-hover:underline underline-offset-2">{sq}</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-[#C59B27] transition-opacity shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions (Sticky bottom on mobile, right-aligned on desktop) */}
        <div className="p-3.5 sm:p-4 border-t border-[#EAE8E1] bg-[#FAF8F4]/80 backdrop-blur-xs flex items-center justify-end gap-2.5 shrink-0">
          {preview && !actionResult ? (
            <>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  if (onCancelAction) onCancelAction();
                }}
                className="px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl transition-colors cursor-pointer disabled:opacity-40 min-h-[40px] sm:min-h-[36px]"
              >
                {preview.cancelLabel || 'Cancel'}
              </button>

              <button
                ref={confirmBtnRef}
                type="button"
                disabled={actionLoading || availableCount === 0}
                onClick={() => {
                  if (onConfirmAction) onConfirmAction(preview.confirmationToken);
                }}
                className="px-5 py-2 text-xs font-semibold bg-[#18181B] hover:bg-zinc-800 disabled:opacity-40 text-white rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] shadow-2xs"
              >
                {actionLoading ? (
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
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-medium text-zinc-700 hover:text-zinc-900 border border-[#EAE8E1] bg-white hover:bg-zinc-50 rounded-xl transition-colors cursor-pointer min-h-[40px] sm:min-h-[36px]"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
