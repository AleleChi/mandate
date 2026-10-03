import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, AlertCircle, Send, ArrowRight, ChevronRight } from 'lucide-react';
import {
  GroundedQueryResult,
  ActionExecutionResult,
  DeepLinkItem
} from './OperationsAssistantPanel';

export interface OperationsAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: string | null;
  queryResult: GroundedQueryResult | null;
  queryLoading?: boolean;
  queryError?: string | null;
  actionLoading?: boolean;
  actionResult?: ActionExecutionResult | null;
  actionError?: string | null;
  onAskQuestion: (question: string) => void;
  onConfirmAction?: (token: string) => void;
  onCancelAction?: () => void;
  onDeepLinkClick?: (link: DeepLinkItem) => void;
  onSelectRelatedQuestion?: (question: string) => void;
}

/**
 * Humanizes raw answer text if it contains database-style parenthetical summaries.
 */
function humanizeAnswerText(text: string): string[] {
  if (!text) return [];
  // Match pattern: N children are checked in right now (M total arrivals, K picked up).
  const match = text.match(/^(\d[\d,]*) children are checked in right now \((\d[\d,]*) total arrivals, (\d[\d,]*) picked up\)\.?$/i);
  if (match) {
    const [, inside, arrivals, picked] = match;
    const pickedPart = picked === '1' ? '1 has been picked up' : `${picked} have been picked up`;
    return [
      `${inside} children are currently checked in.`,
      `${arrivals} children have arrived during the event, and ${pickedPart}.`
    ];
  }
  return [text];
}

export const OperationsAssistantModal: React.FC<OperationsAssistantModalProps> = ({
  isOpen,
  onClose,
  question,
  queryResult,
  queryLoading = false,
  queryError = null,
  actionLoading = false,
  actionResult,
  actionError,
  onAskQuestion,
  onConfirmAction,
  onCancelAction,
  onDeepLinkClick,
  onSelectRelatedQuestion
}) => {
  const [modalInput, setModalInput] = useState('');
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      if (e.key === 'Escape' && !actionLoading && !queryLoading) {
        if (queryResult?.actionPreview && onCancelAction) {
          onCancelAction();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Auto focus confirm button if action exists, otherwise composer input
    if (queryResult?.actionPreview && confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    } else if (inputRef.current) {
      inputRef.current.focus();
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, actionLoading, queryLoading, queryResult?.actionPreview, onCancelAction, onClose]);

  if (!isOpen || (!queryResult && !queryLoading && !queryError)) return null;

  // Backdrop click handler
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !actionLoading && !queryLoading) {
      if (queryResult?.actionPreview && onCancelAction) {
        onCancelAction();
      } else {
        onClose();
      }
    }
  };

  const handleModalSubmit = () => {
    const q = modalInput.trim();
    if (!q || queryLoading) return;
    setModalInput('');
    onAskQuestion(q);
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
        className="bg-white dark:bg-[#181817] w-full max-w-2xl sm:max-w-3xl rounded-2xl sm:rounded-3xl border border-[#EAE8E1] dark:border-[#2A2926] shadow-xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh] my-auto text-left"
      >
        {/* Header (Minimal, No Technical Subtitle) */}
        <div className="p-4 sm:p-5 border-b border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF8F4] dark:bg-[#1C1B18] flex items-center justify-between shrink-0">
          <h3 id="assistant-modal-title" className="font-sans text-base sm:text-lg font-semibold text-[#18181B] dark:text-[#F7F4ED]">
            Operations Assistant
          </h3>

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
            className="text-zinc-400 hover:text-zinc-600 dark:text-[#938C81] dark:hover:text-[#F7F4ED] p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-[#2A2926] transition-colors cursor-pointer shrink-0 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 min-h-0">
          {/* In-Modal Loading State */}
          {queryLoading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-xs text-zinc-500 dark:text-[#938C81]">
              <RefreshCw className="w-5 h-5 animate-spin text-[#C59B27]" />
              <span className="font-medium text-zinc-700 dark:text-[#F7F4ED]">Getting the latest information…</span>
            </div>
          )}

          {/* In-Modal Friendly Error State */}
          {!queryLoading && queryError && (
            <div className="p-4 bg-red-50/90 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-800 dark:text-red-300 space-y-1">
              <p className="font-semibold">We couldn't get that information right now.</p>
              <p className="text-red-700 dark:text-red-400">Please try again.</p>
            </div>
          )}

          {!queryLoading && queryResult && (
            <>
              {/* 1. QUESTION */}
              {question && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-zinc-500 dark:text-[#938C81] block">
                    Question
                  </span>
                  <p className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-[#F7F4ED] leading-snug">
                    {question}
                  </p>
                </div>
              )}

              {/* 2. ANSWER */}
              <div className="space-y-1.5 pt-1">
                <span className="text-xs font-semibold text-[#9A7326] dark:text-[#D4AF37] block">
                  Answer
                </span>
                <div
                  id="assistant-modal-description"
                  className="bg-[#FAF9F6] dark:bg-[#121212] rounded-xl p-3.5 sm:p-4 border-l-2 border-[#C59B27] space-y-2.5"
                >
                  {humanizeAnswerText(queryResult.answer).map((paragraph, pIdx) => (
                    <p key={pIdx} className="text-xs sm:text-[13px] font-medium text-zinc-900 dark:text-[#FAF9F6]/90 leading-relaxed">
                      {paragraph}
                    </p>
                  ))}

                  {/* Desktop & Mobile Table Display */}
                  {queryResult.table && queryResult.table.rows && queryResult.table.rows.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {/* Desktop Table View */}
                      <div className="hidden sm:block overflow-x-auto rounded-xl border border-[#EAE8E1] dark:border-[#2A2926] bg-white dark:bg-[#181817]">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#FAF9F6] dark:bg-[#232220] border-b border-[#EAE8E1] dark:border-[#2A2926] text-[11px] text-zinc-500 dark:text-[#938C81] font-medium">
                              {queryResult.table.columns.map((col, cIdx) => (
                                <th key={cIdx} className="py-2.5 px-3.5 whitespace-nowrap">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#EAE8E1]/60 dark:divide-[#2A2926]">
                            {queryResult.table.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-[#FAF9F6]/50 dark:hover:bg-[#232220]/50 transition-colors">
                                {row.map((val, cellIdx) => (
                                  <td key={cellIdx} className="py-2 px-3.5 text-zinc-800 dark:text-[#F7F4ED] whitespace-nowrap text-xs">
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
                            className="p-3 bg-white dark:bg-[#181817] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl space-y-1.5 text-xs shadow-2xs"
                          >
                            <div className="flex items-center justify-between pb-1 border-b border-[#EAE8E1]/60 dark:border-[#2A2926] font-semibold text-zinc-900 dark:text-[#F7F4ED]">
                              <span>{row[0] !== null && row[0] !== undefined ? String(row[0]) : '—'}</span>
                              {row.length > 4 && row[4] && (
                                <span className="text-[10px] px-2 py-0.5 bg-zinc-100 dark:bg-[#2A2926] text-zinc-700 dark:text-[#FAF9F6] rounded-md font-medium">
                                  {String(row[4])}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 pt-0.5 text-[11px]">
                              {queryResult.table!.columns.slice(1, row.length > 4 ? 4 : undefined).map((col, cIdx) => (
                                <div key={cIdx} className="flex flex-col">
                                  <span className="text-zinc-500 dark:text-[#938C81]">{col}</span>
                                  <span className="font-medium text-zinc-800 dark:text-[#F7F4ED]">
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
                          <p className="text-[11px] text-zinc-400 dark:text-[#938C81] text-right">
                            Showing {queryResult.table.displayedCount} of {queryResult.table.totalCount} records
                          </p>
                        )}
                    </div>
                  )}

                  {/* Structured Breakdown / Summary Display */}
                  {queryResult.breakdown && queryResult.breakdown.items && queryResult.breakdown.items.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {queryResult.breakdown.title && (
                        <span className="text-xs font-semibold text-zinc-600 dark:text-[#938C81] block">
                          {queryResult.breakdown.title}
                        </span>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {queryResult.breakdown.items.map((item, bIdx) => (
                          <div
                            key={bIdx}
                            className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-[#181817] border border-[#EAE8E1] dark:border-[#2A2926] text-xs shadow-2xs"
                          >
                            <span className="font-medium text-zinc-800 dark:text-[#F7F4ED]">{item.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-900 dark:text-[#F7F4ED] font-semibold">{item.primary}</span>
                              {item.secondary && (
                                <span className="text-[11px] text-[#9A7326] dark:text-[#D4AF37] font-medium">
                                  ({item.secondary})
                                </span>
                              )}
                              {item.meta && (
                                <span className="text-[11px] text-zinc-400 dark:text-[#938C81]">
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
                <div className="space-y-3 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-zinc-500 dark:text-[#938C81] block">
                      Proposed action
                    </span>
                    <h4 className="font-sans text-sm sm:text-base font-semibold text-zinc-900 dark:text-[#F7F4ED]">
                      {preview.title}
                    </h4>

                    {isDutyReminders ? (
                      <div className="space-y-0.5 text-xs text-zinc-600 dark:text-[#938C81]">
                        <p className="font-medium text-zinc-800 dark:text-[#F7F4ED]">
                          {totalNotReported} {totalNotReported === 1 ? 'volunteer has' : 'volunteers have'} not reported for duty.
                        </p>
                        {unavailableCount > 0 ? (
                          <p className="text-zinc-500 dark:text-[#938C81]">
                            <span className="text-zinc-700 dark:text-[#F7F4ED] font-medium">{availableCount}</span> can receive a reminder.{' '}
                            <span className="text-amber-800 dark:text-amber-400 font-medium">{unavailableCount}</span> {unavailableCount === 1 ? 'has' : 'have'} no available communication channel.
                          </p>
                        ) : (
                          <p className="text-zinc-500 dark:text-[#938C81]">
                            All {availableCount} can receive a duty reminder.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-600 dark:text-[#938C81]">
                        {preview.description}
                      </p>
                    )}
                  </div>

                  {/* Action Error Banner */}
                  {actionError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300 font-medium">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{actionError}</span>
                    </div>
                  )}

                  {/* Warnings if any */}
                  {preview.warnings && preview.warnings.length > 0 && !isDutyReminders && (
                    <div className="space-y-1.5">
                      {preview.warnings.map((w, idx) => (
                        <div key={idx} className="p-2.5 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/50 rounded-xl text-xs text-amber-900 dark:text-amber-300 font-medium">
                          {w}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Duty Reminders Recipients List */}
                  {isDutyReminders && preview.recipients && preview.recipients.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between pb-1 border-b border-[#EAE8E1] dark:border-[#2A2926]">
                        <span className="text-xs font-semibold text-zinc-600 dark:text-[#938C81]">
                          Recipients ({preview.recipients.length})
                        </span>
                        <span className="text-xs text-zinc-400 dark:text-[#938C81]">
                          {availableCount} eligible
                        </span>
                      </div>

                      <div className="divide-y divide-[#EAE8E1]/60 dark:divide-[#2A2926]">
                        {preview.recipients.map((rec) => (
                          <div key={rec.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                            <div className="space-y-0.5 min-w-0">
                              <p className="font-medium text-zinc-900 dark:text-[#F7F4ED] truncate">
                                {rec.name}
                              </p>
                              <p className="text-[11px] text-zinc-500 dark:text-[#938C81] truncate">
                                {rec.locationName || 'Assigned Location'} • {rec.responsibility || 'General Duty'}
                              </p>
                            </div>

                            <div className="shrink-0 text-right space-y-0.5">
                              {rec.eligible ? (
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-zinc-100 dark:bg-[#2A2926] border border-zinc-200/80 dark:border-[#33322E] rounded-md text-[11px] text-zinc-800 dark:text-[#F7F4ED] font-medium">
                                  <span className="text-zinc-500 dark:text-[#938C81]">Delivery:</span>
                                  <span className="font-semibold">{formatChannelLabel(rec.channel)}</span>
                                </div>
                              ) : (
                                <div className="text-right">
                                  <span className="inline-block text-[11px] text-zinc-500 dark:text-[#938C81] bg-zinc-50 dark:bg-[#232220] border border-zinc-200 dark:border-[#2A2926] px-2 py-0.5 rounded-md font-medium">
                                    No available communication channel
                                  </span>
                                  {rec.ineligibilityReason && (
                                    <p className="text-[10px] text-zinc-400 dark:text-[#938C81] pt-0.5 max-w-[200px] truncate">
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
                    <div className="border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl overflow-hidden divide-y divide-[#EAE8E1]/60 dark:divide-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#121212]/40">
                      {preview.items.map((item, idx) => (
                        <div key={idx} className="p-3 flex items-center justify-between text-xs">
                          <span className="text-zinc-600 dark:text-[#938C81] font-medium">{item.label}</span>
                          <span className="text-zinc-900 dark:text-[#F7F4ED] font-semibold">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. CONFIRMED ACTION COMPLETED RESULT */}
              {actionResult && (
                <div className="pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
                  <div className="bg-[#FAF9F6] dark:bg-[#121212] rounded-xl p-4 border-l-2 border-emerald-600 dark:border-emerald-500 space-y-2">
                    <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-[#F7F4ED]">
                      {actionResult.title}
                    </h4>
                    <p className="text-xs text-zinc-700 dark:text-[#FAF9F6]/90 font-medium">
                      {actionResult.message}
                    </p>
                    <div className="pt-0.5 text-[11px] text-zinc-400 dark:text-[#938C81]">
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
                          className="text-xs inline-flex items-center gap-1 font-medium text-[#9A7326] dark:text-[#D4AF37] hover:text-[#7A5B1C] dark:hover:text-[#E2C366] transition-colors cursor-pointer"
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
                <div className="pt-3 border-t border-[#EAE8E1]/80 dark:border-[#2A2926] space-y-2">
                  {queryResult.provenance && (
                    <div className="text-[11px] text-zinc-500 dark:text-[#938C81] flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="font-medium text-zinc-700 dark:text-[#F7F4ED]">{queryResult.provenance.source}</span>
                      <span>·</span>
                      <span className="text-zinc-400 dark:text-[#938C81]">Updated {queryResult.provenance.updatedAt}</span>
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
                          className="text-xs inline-flex items-center gap-1 font-medium text-[#9A7326] dark:text-[#D4AF37] hover:text-[#7A5B1C] dark:hover:text-[#E2C366] transition-colors cursor-pointer"
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
                <div className="pt-3 border-t border-[#EAE8E1]/80 dark:border-[#2A2926] space-y-2">
                  <h4 className="text-xs font-semibold text-zinc-600 dark:text-[#938C81]">
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
                        className="text-xs text-left text-zinc-600 dark:text-[#938C81] hover:text-zinc-900 dark:hover:text-[#F7F4ED] transition-colors cursor-pointer py-1 flex items-center justify-between group"
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

        {/* Sticky Footer: Action confirmation controls OR persistent question composer */}
        <div className="p-3.5 sm:p-4 border-t border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF8F4]/95 dark:bg-[#1C1B18]/95 backdrop-blur-xs shrink-0">
          {preview && !actionResult ? (
            <div className="flex items-center justify-end gap-2.5 w-full">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  if (onCancelAction) onCancelAction();
                }}
                className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-[#938C81] hover:text-zinc-900 dark:hover:text-[#F7F4ED] border border-[#EAE8E1] dark:border-[#2A2926] hover:bg-zinc-50 dark:hover:bg-[#232220] rounded-xl transition-colors cursor-pointer disabled:opacity-40 min-h-[40px] sm:min-h-[36px]"
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
                className="px-5 py-2 text-xs font-semibold bg-[#18181B] dark:bg-[#2A2926] hover:bg-zinc-800 dark:hover:bg-[#33322E] disabled:opacity-40 text-white rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] shadow-2xs"
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
            </div>
          ) : (
            <div className="space-y-2 w-full">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-[#938C81] block">
                Ask another question
              </span>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleModalSubmit();
                }}
                className="relative flex items-center w-full"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={modalInput}
                  onChange={(e) => setModalInput(e.target.value)}
                  disabled={queryLoading}
                  placeholder="Ask about this event…"
                  className="w-full pl-3.5 pr-20 py-2.5 text-xs rounded-xl border border-[#EAE8E1] dark:border-[#2A2926] bg-white dark:bg-[#121212] focus:bg-white dark:focus:bg-[#121212] focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all text-zinc-900 dark:text-[#F7F4ED] placeholder:text-zinc-400 dark:placeholder:text-[#938C81] disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={queryLoading || !modalInput.trim()}
                  className="absolute right-1.5 px-3 py-1 bg-[#18181B] dark:bg-[#2A2926] hover:bg-zinc-800 dark:hover:bg-[#33322E] disabled:opacity-40 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {queryLoading ? (
                    <RefreshCw className="w-3 h-3 animate-spin text-[#C59B27]" />
                  ) : (
                    <Send className="w-3 h-3 text-[#C59B27]" />
                  )}
                  <span>Ask</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
