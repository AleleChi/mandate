import React, { useState, useEffect } from 'react';
import {
  Clock,
  Send,
  X,
  AlertCircle,
  CheckCircle2,
  Lock,
  MessageSquare,
  Smartphone,
  Info
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../common/Button';

interface CompletionReminderModalProps {
  isOpen: boolean;
  entryId: string | null;
  childName?: string;
  parentName?: string;
  onClose: () => void;
  onSuccess?: (entryId: string, sentAt: string) => void;
}

export const CompletionReminderModal: React.FC<CompletionReminderModalProps> = ({
  isOpen,
  entryId,
  childName,
  parentName,
  onClose,
  onSuccess
}) => {
  const { showError, showSuccess, showWarning } = useNotification();

  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Channels
  const [sendPortal, setSendPortal] = useState(true);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);

  // Portal state
  const [subject, setSubject] = useState("Complete your child's application");
  const [bodyText, setBodyText] = useState('');
  const [canSendPortal, setCanSendPortal] = useState(true);
  const [lastReminderSentAt, setLastReminderSentAt] = useState<string | null>(null);
  const [cooldownEndsAt, setCooldownEndsAt] = useState<string | null>(null);

  // Missing sections
  const [missingSections, setMissingSections] = useState<string[]>([]);
  const [workflow, setWorkflow] = useState<'incomplete' | 'correction'>('incomplete');
  const [nextStepLabel, setNextStepLabel] = useState<string>('Continue application');

  // WhatsApp state
  const [whatsappInfo, setWhatsappInfo] = useState<{
    eligible: boolean;
    reason?: string;
    phone: string | null;
    consentStatus: string;
    lastSentAt: string | null;
    cooldownEndsAt: string | null;
    canSend: boolean;
    defaultBody: string;
  } | null>(null);
  const [whatsappBodyText, setWhatsappBodyText] = useState('');

  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Load preview whenever modal opens with entryId
  useEffect(() => {
    if (!isOpen || !entryId) {
      setBodyText('');
      setWhatsappBodyText('');
      setPreviewError(null);
      setSendError(null);
      setSendPortal(true);
      setSendWhatsApp(false);
      setMissingSections([]);
      setWhatsappInfo(null);
      setWorkflow('incomplete');
      setNextStepLabel('Continue application');
      return;
    }

    let isMounted = true;
    const fetchPreview = async () => {
      setIsLoadingPreview(true);
      setPreviewError(null);
      setSendError(null);
      try {
        const res = await api.admin.previewCompletionReminder(entryId);
        if (!isMounted) return;

        if (res && res.success) {
          if (!res.eligible) {
            setPreviewError(res.reason || 'This application is not an incomplete draft.');
            setCanSendPortal(false);
          } else {
            setSubject(res.subject || "Complete your child's application");
            setBodyText(res.body || res.prefilledBody || '');
            setCanSendPortal(res.canSend !== false);
            setLastReminderSentAt(res.lastReminderSentAt || null);
            setCooldownEndsAt(res.cooldownEndsAt || null);
            setMissingSections(res.missingSections || []);
            setWorkflow((res as any).workflow || ((res as any).actionType === 'update_application_details' ? 'correction' : 'incomplete'));
            setNextStepLabel((res as any).nextStepLabel || ((res as any).actionType === 'update_application_details' ? 'Update application details' : 'Continue application'));

            if (res.whatsapp) {
              setWhatsappInfo(res.whatsapp);
              setWhatsappBodyText(res.whatsapp.defaultBody || '');
            } else {
              setWhatsappInfo(null);
            }
          }
        }
      } catch (err) {
        if (!isMounted) return;
        const extracted = extractApiError(err);
        setPreviewError(extracted.description || extracted.message || 'Unable to load reminder preview.');
        setCanSendPortal(false);
      } finally {
        if (isMounted) setIsLoadingPreview(false);
      }
    };

    fetchPreview();

    return () => {
      isMounted = false;
    };
  }, [isOpen, entryId]);

  if (!isOpen) return null;

  const isFormValid = () => {
    if (!sendPortal && !sendWhatsApp) return false;
    if (sendPortal) {
      if (!canSendPortal) return false;
      if (!bodyText.trim() || bodyText.length > 5000) return false;
    }
    if (sendWhatsApp) {
      if (!whatsappInfo?.canSend) return false;
      if (!whatsappBodyText.trim() || whatsappBodyText.length > 1000) return false;
    }
    return true;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryId || isSending || !isFormValid()) return;

    setIsSending(true);
    setSendError(null);

    const channel: 'portal' | 'whatsapp' | 'both' =
      sendPortal && sendWhatsApp ? 'both' : (sendWhatsApp ? 'whatsapp' : 'portal');

    try {
      const res = await api.admin.sendCompletionReminder(
        entryId,
        sendPortal ? bodyText.trim() : undefined,
        channel,
        sendWhatsApp ? whatsappBodyText.trim() : undefined
      );

      if (res && res.success) {
        const portalResult = res.portal;
        const waResult = res.whatsapp;

        if (channel === 'both') {
          if (portalResult?.sent && waResult?.sent) {
            showSuccess('Portal reminder and WhatsApp nudge sent successfully.');
          } else if (portalResult?.sent && !waResult?.sent) {
            showSuccess('Portal reminder sent.');
            showWarning('WhatsApp nudge failed: ' + (waResult?.error || 'Provider error'));
          } else if (!portalResult?.sent && waResult?.sent) {
            showSuccess('WhatsApp nudge sent.');
            showWarning('Portal reminder failed: ' + (portalResult?.error || 'System error'));
          }
        } else if (channel === 'whatsapp') {
          if (waResult?.sent) {
            showSuccess('WhatsApp completion nudge sent to parent.');
          } else {
            setSendError(waResult?.error || 'Failed to deliver WhatsApp message.');
            return;
          }
        } else {
          if (portalResult?.sent) {
            showSuccess('Portal completion reminder sent to parent.');
          } else {
            setSendError(portalResult?.error || 'Failed to deliver portal message.');
            return;
          }
        }

        if (onSuccess) {
          const sentTimestamp = res.lastReminderSentAt || res.lastWhatsAppSentAt || new Date().toISOString();
          onSuccess(entryId, sentTimestamp);
        }
        onClose();
      } else {
        setSendError('Failed to send reminder. Please check application status.');
      }
    } catch (err: any) {
      const extracted = extractApiError(err);
      if (err?.code === 'APPLICATION_REMINDER_COOLDOWN' || extracted.code === 'APPLICATION_REMINDER_COOLDOWN') {
        setCanSendPortal(false);
        setSendError('A reminder was recently sent for this registration. Please allow cooldown before sending another.');
      } else {
        setSendError(extracted.description || extracted.message || 'Failed to send completion reminder.');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
      <div
        className="w-full max-w-lg bg-white dark:bg-[#1D1D1A] rounded-2xl border border-[#EAE8E1] dark:border-[#302F2A] shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#EAE8E1] dark:border-[#302F2A] flex items-center justify-between bg-[#FCFBF8] dark:bg-[#21211E]">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-[#C59B27]" />
            <h3 className="font-serif-koinonia font-bold text-sm text-[#18181B] dark:text-[#F0EBE3]">
              Contact parent
            </h3>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40">
              {workflow === 'correction' ? 'Missing required details' : 'Incomplete draft'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoadingPreview ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-6 h-6 mx-auto border-2 border-[#C59B27] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-zinc-500">Preparing notification preview...</span>
            </div>
          ) : previewError ? (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-start space-x-2.5 text-xs text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to send notification</p>
                <p className="mt-0.5 text-amber-800 dark:text-amber-300">{previewError}</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-4">
              {/* Context Box */}
              <div className="p-3 rounded-xl bg-[#FAF9F6] dark:bg-[#24231F] border border-[#EAE8E1] dark:border-[#302F2A] space-y-2 text-xs">
                <div className="flex items-center justify-between text-zinc-500">
                  <span>Parent:</span>
                  <strong className="text-zinc-800 dark:text-zinc-200">{parentName || 'Parent'}</strong>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span>Child:</span>
                  <strong className="text-zinc-800 dark:text-zinc-200">{childName || 'Child'}</strong>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span>Next step:</span>
                  <span className="inline-flex items-center space-x-1 text-[#9A7326] dark:text-[#C59B27] font-semibold">
                    <span>{nextStepLabel}</span>
                  </span>
                </div>
              </div>

              {/* Authoritative Missing Sections (Audit notice for Admin) */}
              {missingSections.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-semibold text-[11px]">
                    <Info className="w-3.5 h-3.5 text-amber-600" />
                    <span>Authoritative Outstanding Sections:</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-zinc-600 dark:text-[#B8B0A5] pl-1 space-y-0.5">
                    {missingSections.map((sec, idx) => (
                      <li key={idx}>{sec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Delivery Channel Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Delivery Channels
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Channel: Parent portal */}
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
                        Parent portal
                      </span>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        In-app message with direct link for parent action
                      </p>
                    </div>
                  </label>

                  {/* Channel: WhatsApp reminder */}
                  <label className={`flex items-start gap-2.5 p-3 rounded-xl border transition-all ${
                    !whatsappInfo?.eligible
                      ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 opacity-60 cursor-not-allowed'
                      : sendWhatsApp
                        ? 'border-emerald-600 bg-emerald-50/20 dark:bg-emerald-950/20 ring-1 ring-emerald-600/20 cursor-pointer'
                        : 'border-[#EAE8E1] dark:border-[#302F2A] bg-white dark:bg-[#24231F] opacity-75 cursor-pointer'
                  }`}>
                    <input
                      type="checkbox"
                      checked={sendWhatsApp}
                      disabled={!whatsappInfo?.eligible}
                      onChange={e => setSendWhatsApp(e.target.checked)}
                      className="mt-0.5 text-emerald-600 rounded focus:ring-emerald-600 disabled:opacity-40"
                    />
                    <div className="space-y-0.5 text-xs">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                        WhatsApp reminder
                      </span>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        {whatsappInfo?.eligible
                          ? 'Outbound reminder sent to parent\'s WhatsApp'
                          : 'WhatsApp updates are not enabled for this parent.'}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Portal Message Configuration */}
              {sendPortal && (
                <div className="space-y-3 pt-1 border-t border-[#EAE8E1] dark:border-[#302F2A]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-[#C59B27]" />
                      Parent Portal Message
                    </span>
                    {!canSendPortal && (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded">
                        Throttled
                      </span>
                    )}
                  </div>

                  {/* Cooldown Notice if Active */}
                  {!canSendPortal && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-start space-x-2.5 text-xs text-amber-900 dark:text-amber-200">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Portal Cooldown Active</p>
                        <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                          A completion reminder was already sent for this child. To avoid messaging fatigue, repeat reminders are throttled.
                          {cooldownEndsAt && (
                            <span className="block mt-1">
                              Expires: <strong>{new Date(cooldownEndsAt).toLocaleString()}</strong>
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Subject Field (Read-only semantic subject) */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={subject}
                      disabled
                      className="w-full px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-[#24231F] border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 cursor-not-allowed"
                    />
                  </div>

                  {/* Message Body Field (Admin editable) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        Portal Message Body
                      </label>
                      <span className="text-[10px] text-zinc-400">
                        {bodyText.length} / 5000
                      </span>
                    </div>
                    <textarea
                      value={bodyText}
                      onChange={e => setBodyText(e.target.value)}
                      disabled={!canSendPortal || isSending}
                      rows={5}
                      maxLength={5000}
                      className="w-full p-3 rounded-xl border border-[#EAE8E1] dark:border-[#302F2A] bg-white dark:bg-[#24231F] text-xs text-[#18181B] dark:text-[#F0EBE3] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40 resize-none leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* WhatsApp Reminder Configuration */}
              {sendWhatsApp && (
                <div className="space-y-3 pt-2 border-t border-[#EAE8E1] dark:border-[#302F2A]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                      WhatsApp reminder
                    </span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40 px-2 py-0.5 rounded-full font-medium">
                      Consent: Opted In
                    </span>
                  </div>

                  {/* WhatsApp Cooldown Notice if Active */}
                  {whatsappInfo && !whatsappInfo.canSend && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-800 dark:text-amber-300">
                      <p className="font-semibold">WhatsApp Cooldown Active</p>
                      <p className="text-[11px] mt-0.5">
                        A WhatsApp nudge was sent recently to avoid rapid duplicate messages.
                        {whatsappInfo.cooldownEndsAt && (
                          <span className="block mt-0.5">
                            Available after: <strong>{new Date(whatsappInfo.cooldownEndsAt).toLocaleString()}</strong>
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Target Phone */}
                  <div className="text-[11px] text-zinc-500">
                    Recipient number: <span className="font-medium text-zinc-800 dark:text-zinc-200">{whatsappInfo?.phone || 'E.164'}</span>
                  </div>

                  {/* Nudge Body */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        Nudge Copy (Privacy-Safe)
                      </label>
                      <span className="text-[10px] text-zinc-400">
                        {whatsappBodyText.length} / 1000
                      </span>
                    </div>
                    <textarea
                      value={whatsappBodyText}
                      onChange={e => setWhatsappBodyText(e.target.value)}
                      disabled={!whatsappInfo?.canSend || isSending}
                      rows={3}
                      maxLength={1000}
                      className="w-full p-3 rounded-xl border border-[#EAE8E1] dark:border-[#302F2A] bg-white dark:bg-[#24231F] text-xs text-[#18181B] dark:text-[#F0EBE3] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none leading-relaxed"
                    />
                    <p className="text-[10px] text-zinc-400">
                      Strict privacy rule: Sensitive medical, DOB, application IDs, and pickup details are strictly excluded.
                    </p>
                  </div>
                </div>
              )}

              {/* Send Error Notice */}
              {sendError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-xs text-rose-700 dark:text-rose-300">
                  {sendError}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSending}
                  className="text-xs px-3.5 py-1.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!isFormValid() || isSending}
                  className="text-xs px-4 py-1.5 rounded-xl cursor-pointer"
                >
                  {isSending ? (
                    <div className="flex items-center space-x-1.5">
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5">
                      <span>Send notification</span>
                      <Send className="w-3.5 h-3.5" />
                    </div>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
