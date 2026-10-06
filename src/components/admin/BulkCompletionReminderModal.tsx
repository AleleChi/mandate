import React, { useState } from 'react';
import {
  Clock,
  Send,
  X,
  AlertCircle,
  CheckCircle2,
  Lock,
  MessageSquare,
  Smartphone,
  Users
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../common/Button';

interface BulkApplicationItem {
  id: string; // entry id
  childName: string;
  parentName: string;
}

interface BulkCompletionReminderModalProps {
  isOpen: boolean;
  applications: BulkApplicationItem[];
  onClose: () => void;
  onSuccess?: () => void;
}

interface ResultItem {
  entryId: string;
  childName: string;
  parentName?: string;
  portalStatus?: 'pending' | 'sent' | 'failed' | 'cooldown' | 'skipped';
  whatsappStatus?: 'pending' | 'sent' | 'failed' | 'cooldown' | 'skipped';
  portalError?: string;
  whatsappError?: string;
}

export const BulkCompletionReminderModal: React.FC<BulkCompletionReminderModalProps> = ({
  isOpen,
  applications,
  onClose,
  onSuccess
}) => {
  const { showSuccess } = useNotification();

  const [sendPortal, setSendPortal] = useState(true);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ResultItem[] | null>(null);
  const [summaryStats, setSummaryStats] = useState<{
    portalSent: number;
    portalFailed: number;
    whatsappSent: number;
    whatsappSkipped: number;
    whatsappFailed: number;
  } | null>(null);

  if (!isOpen) return null;

  const handleSendBulk = async () => {
    if (!sendPortal && !sendWhatsApp) return;

    setIsProcessing(true);
    const initialResults: ResultItem[] = applications.map(app => ({
      entryId: app.id,
      childName: app.childName,
      parentName: app.parentName,
      portalStatus: sendPortal ? 'pending' : 'skipped',
      whatsappStatus: sendWhatsApp ? 'pending' : 'skipped'
    }));
    setResults(initialResults);

    const channel: 'portal' | 'whatsapp' | 'both' =
      sendPortal && sendWhatsApp ? 'both' : (sendWhatsApp ? 'whatsapp' : 'portal');

    let pSent = 0;
    let pFailed = 0;
    let waSent = 0;
    let waSkipped = 0;
    let waFailed = 0;

    const updatedResults = [...initialResults];

    for (let i = 0; i < applications.length; i++) {
      const app = applications[i];
      try {
        const res = await api.admin.sendCompletionReminder(app.id, undefined, channel);
        if (res && res.success) {
          let pStatus: ResultItem['portalStatus'] = 'skipped';
          let waStatus: ResultItem['whatsappStatus'] = 'skipped';
          let pErr: string | undefined;
          let waErr: string | undefined;

          if (sendPortal) {
            if (res.portal?.sent) {
              pStatus = 'sent';
              pSent++;
            } else {
              pStatus = 'failed';
              pErr = res.portal?.error || 'Failed';
              pFailed++;
            }
          }

          if (sendWhatsApp) {
            if (res.whatsapp?.sent) {
              waStatus = 'sent';
              waSent++;
            } else if (res.whatsapp?.skipped) {
              waStatus = 'skipped';
              waErr = res.whatsapp?.reason || 'No opt-in';
              waSkipped++;
            } else {
              waStatus = 'failed';
              waErr = res.whatsapp?.error || 'Failed';
              waFailed++;
            }
          }

          updatedResults[i] = {
            ...updatedResults[i],
            portalStatus: pStatus,
            whatsappStatus: waStatus,
            portalError: pErr,
            whatsappError: waErr
          };
        } else {
          if (sendPortal) {
            updatedResults[i].portalStatus = 'failed';
            updatedResults[i].portalError = 'Failed';
            pFailed++;
          }
          if (sendWhatsApp) {
            updatedResults[i].whatsappStatus = 'failed';
            updatedResults[i].whatsappError = 'Failed';
            waFailed++;
          }
        }
      } catch (err: any) {
        const extracted = extractApiError(err);
        const isCooldown = err?.code === 'APPLICATION_REMINDER_COOLDOWN' || extracted.code === 'APPLICATION_REMINDER_COOLDOWN';

        if (sendPortal) {
          updatedResults[i].portalStatus = isCooldown ? 'cooldown' : 'failed';
          updatedResults[i].portalError = isCooldown ? 'Throttled (cooldown)' : (extracted.description || extracted.message || 'Error');
          pFailed++;
        }
        if (sendWhatsApp) {
          updatedResults[i].whatsappStatus = 'failed';
          updatedResults[i].whatsappError = extracted.description || extracted.message || 'Error';
          waFailed++;
        }
      }
      setResults([...updatedResults]);
    }

    setSummaryStats({
      portalSent: pSent,
      portalFailed: pFailed,
      whatsappSent: waSent,
      whatsappSkipped: waSkipped,
      whatsappFailed: waFailed
    });

    setIsProcessing(false);
    if (pSent > 0 || waSent > 0) {
      showSuccess(`Dispatched reminders: ${pSent} portal, ${waSent} WhatsApp.`);
      if (onSuccess) onSuccess();
    }
  };

  const isDone = results !== null && !isProcessing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
      <div
        className="w-full max-w-lg bg-white dark:bg-[#1D1D1A] rounded-2xl border border-[#EAE8E1] dark:border-[#302F2A] shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#EAE8E1] dark:border-[#302F2A] flex items-center justify-between bg-[#FCFBF8] dark:bg-[#21211E]">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-[#C59B27]" />
            <h3 className="font-serif-koinonia font-bold text-sm text-[#18181B] dark:text-[#F0EBE3]">
              Send Bulk Completion Reminders ({applications.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Privacy & Safety Guarantee */}
          <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 space-y-1.5 leading-relaxed">
            <div className="flex items-center space-x-1.5 font-bold">
              <Lock className="w-3.5 h-3.5 text-[#9A7326]" />
              <span>Private Child-Linked Dispatch</span>
            </div>
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              Each recipient receives their own isolated 1-to-1 operational thread. Recipient lists are never shared, and per-child draft links cannot be cross-accessed. Cooldown rules are enforced individually.
            </p>
          </div>

          {/* Delivery Channels Selection */}
          {!results && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                Select Delivery Channels
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  sendPortal
                    ? 'border-[#C59B27] bg-[#FCFBF8] dark:bg-[#26241E] ring-1 ring-[#C59B27]/20'
                    : 'border-[#EAE8E1] dark:border-[#302F2A] bg-white dark:bg-[#24231F] opacity-75'
                }`}>
                  <input
                    type="checkbox"
                    checked={sendPortal}
                    onChange={e => setSendPortal(e.target.checked)}
                    className="mt-0.5 text-[#C59B27] rounded focus:ring-[#C59B27]"
                  />
                  <div className="space-y-0.5 text-xs">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5 text-[#C59B27]" />
                      Portal Reminders
                    </span>
                    <p className="text-[10px] text-zinc-500">
                      Standard portal messages with resume draft action
                    </p>
                  </div>
                </label>

                <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  sendWhatsApp
                    ? 'border-emerald-600 bg-emerald-50/20 dark:bg-emerald-950/20 ring-1 ring-emerald-600/20'
                    : 'border-[#EAE8E1] dark:border-[#302F2A] bg-white dark:bg-[#24231F] opacity-75'
                }`}>
                  <input
                    type="checkbox"
                    checked={sendWhatsApp}
                    onChange={e => setSendWhatsApp(e.target.checked)}
                    className="mt-0.5 text-emerald-600 rounded focus:ring-emerald-600"
                  />
                  <div className="space-y-0.5 text-xs">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                      WhatsApp reminders
                    </span>
                    <p className="text-[10px] text-zinc-500">
                      Privacy-safe reminder to opted-in parents only
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Aggregated Result Reporting Strip (Section 15) */}
          {summaryStats && (
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#24231F] border border-[#EAE8E1] dark:border-[#302F2A] text-xs space-y-1">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">
                Dispatch Summary:
              </span>
              <div className="space-y-0.5 text-[11px] text-zinc-600 dark:text-[#B8B0A5]">
                {sendPortal && (
                  <p>
                    • <strong className="text-zinc-800 dark:text-zinc-200">{summaryStats.portalSent}</strong> portal reminders sent
                    {summaryStats.portalFailed > 0 && <span className="text-rose-600 ml-1">({summaryStats.portalFailed} failed/throttled)</span>}
                  </p>
                )}
                {sendWhatsApp && (
                  <>
                    <p>
                      • <strong className="text-zinc-800 dark:text-zinc-200">{summaryStats.whatsappSent}</strong> WhatsApp reminders sent
                    </p>
                    {summaryStats.whatsappSkipped > 0 && (
                      <p className="text-amber-700 dark:text-amber-400">
                        • <strong>{summaryStats.whatsappSkipped}</strong> WhatsApp skipped — updates not enabled
                      </p>
                    )}
                    {summaryStats.whatsappFailed > 0 && (
                      <p className="text-rose-600">
                        • <strong>{summaryStats.whatsappFailed}</strong> WhatsApp delivery failed
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Recipients List or Progress Results */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
              {results ? 'Recipient Outcomes' : `Selected Incomplete Registrations (${applications.length})`}
            </span>

            <div className="max-h-56 overflow-y-auto divide-y divide-[#EAE8E1] dark:divide-[#302F2A] border border-[#EAE8E1] dark:border-[#302F2A] rounded-xl bg-white dark:bg-[#24231F]">
              {(results || applications).map((item: any) => {
                const childTitle = item.childName || 'Child';
                const pStatus = item.portalStatus as string | undefined;
                const waStatus = item.whatsappStatus as string | undefined;

                return (
                  <div key={item.entryId || item.id} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">{childTitle}</span>
                      {item.parentName && (
                        <span className="text-[10px] text-zinc-400">Parent: {item.parentName}</span>
                      )}
                      {item.portalError && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5">Portal: {item.portalError}</span>
                      )}
                      {item.whatsappError && (
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">WA: {item.whatsappError}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {sendPortal && pStatus && (
                        <span className="text-[10px]">
                          {pStatus === 'pending' && <span className="text-zinc-400">Portal...</span>}
                          {pStatus === 'sent' && <span className="text-emerald-600 font-medium">Portal: Sent</span>}
                          {pStatus === 'cooldown' && <span className="text-amber-600 font-medium">Portal: Cooldown</span>}
                          {pStatus === 'failed' && <span className="text-rose-600 font-medium">Portal: Failed</span>}
                        </span>
                      )}
                      {sendWhatsApp && waStatus && (
                        <span className="text-[10px]">
                          {waStatus === 'pending' && <span className="text-zinc-400">WA...</span>}
                          {waStatus === 'sent' && <span className="text-emerald-600 font-medium">WA: Sent</span>}
                          {waStatus === 'skipped' && <span className="text-zinc-500 font-medium">WA: Skipped</span>}
                          {waStatus === 'failed' && <span className="text-rose-600 font-medium">WA: Failed</span>}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-2.5">
            {isDone ? (
              <Button
                type="button"
                variant="primary"
                onClick={onClose}
                className="text-xs px-4 py-1.5 rounded-xl cursor-pointer"
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="text-xs px-3.5 py-1.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSendBulk}
                  disabled={isProcessing || (!sendPortal && !sendWhatsApp) || applications.length === 0}
                  className="text-xs px-4 py-1.5 rounded-xl cursor-pointer"
                >
                  {isProcessing ? (
                    <div className="flex items-center space-x-1.5">
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5">
                      <span>Send Reminders</span>
                      <Send className="w-3.5 h-3.5" />
                    </div>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
