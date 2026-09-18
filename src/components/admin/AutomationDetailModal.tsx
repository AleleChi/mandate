import React, { useState } from 'react';
import { X, ExternalLink, CheckCircle2, AlertCircle, Info, Clock, Check } from 'lucide-react';
import { Button } from '../common/Button';

export interface AutomationRecordItem {
  id: string;
  event_id: string;
  rule_id: string;
  signal_type: string;
  title: string;
  summary: string;
  description: string | null;
  severity: 'information' | 'attention' | 'urgent';
  status: 'active' | 'resolved' | 'acknowledged' | 'dismissed';
  entity_type: string | null;
  entity_id: string | null;
  payload_json: string;
  proposed_action_key: string | null;
  action_target_route: string | null;
  action_target_label: string | null;
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
}

interface AutomationDetailModalProps {
  automation: AutomationRecordItem | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (route: string) => void;
  onReviewAction?: (automation: AutomationRecordItem) => void;
  onAcknowledge?: (automationId: string) => Promise<void>;
}

export const AutomationDetailModal: React.FC<AutomationDetailModalProps> = ({
  automation,
  isOpen,
  onClose,
  onNavigate,
  onReviewAction,
  onAcknowledge
}) => {
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isOpen || !automation) return null;

  let payload: any = {};
  try {
    payload = JSON.parse(automation.payload_json || '{}');
  } catch {}

  const formatTimeOnly = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const handleAcknowledge = async () => {
    if (!onAcknowledge || acknowledging) return;
    setAcknowledging(true);
    try {
      await onAcknowledge(automation.id);
      setAcknowledged(true);
      setTimeout(() => {
        onClose();
        setAcknowledged(false);
      }, 800);
    } finally {
      setAcknowledging(false);
    }
  };

  const isResolved = automation.status === 'resolved';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 text-left">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {automation.severity === 'urgent' && (
              <span className="text-[11px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                Urgent
              </span>
            )}
            {automation.severity === 'attention' && (
              <span className="text-[11px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                Attention
              </span>
            )}
            {automation.severity === 'information' && (
              <span className="text-[11px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200">
                Information
              </span>
            )}
            {isResolved && (
              <span className="text-[11px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                Resolved
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          <div>
            <h3 className="font-serif text-lg font-bold text-zinc-900 leading-snug">
              {automation.title}
            </h3>
            <p className="text-sm text-zinc-600 mt-1">
              {automation.summary}
            </p>
          </div>

          {/* Structured factual breakdown */}
          <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200/80 space-y-3">
            {automation.signal_type === 'LOCATION_UNDERSTAFFED' && (
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-zinc-400 block uppercase font-medium tracking-wider text-[10px]">
                    Current coverage
                  </span>
                  <span className="text-zinc-900 font-medium text-sm mt-0.5 block">
                    {payload.assignedCount ?? payload.assigned ?? 0} assigned of {payload.requiredCount ?? payload.required ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block uppercase font-medium tracking-wider text-[10px]">
                    Missing
                  </span>
                  <span className="text-zinc-900 font-medium text-sm mt-0.5 block">
                    {payload.gap ?? 0} volunteers
                  </span>
                </div>
              </div>
            )}

            {automation.signal_type === 'VOLUNTEER_NO_SHOW' && (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Scheduled post:</span>
                  <span className="font-medium text-zinc-900">{payload.locationName || 'Duty post'}</span>
                </div>
                {payload.hasReliableReportingTime && payload.scheduledStart && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Scheduled time:</span>
                    <span className="font-medium text-zinc-900">{formatTimeOnly(payload.scheduledStart)}</span>
                  </div>
                )}
                {payload.minutesLate > 0 && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Time overdue:</span>
                    <span className="font-medium text-rose-700">{payload.minutesLate} minutes</span>
                  </div>
                )}
              </div>
            )}

            {automation.signal_type === 'PASS_NOT_READY' && (
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-zinc-400 block uppercase font-medium tracking-wider text-[10px]">
                    Selected children
                  </span>
                  <span className="text-zinc-900 font-medium text-sm mt-0.5 block">
                    {payload.selectedCount ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block uppercase font-medium tracking-wider text-[10px]">
                    Missing passes
                  </span>
                  <span className="text-zinc-900 font-medium text-sm mt-0.5 block text-amber-700">
                    {payload.withoutPassCount ?? payload.missingPassCount ?? 0}
                  </span>
                </div>
              </div>
            )}

            {automation.signal_type === 'REGISTRATION_CLOSING_SOON' && (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Closing deadline:</span>
                  <span className="font-medium text-zinc-900">{formatTimeOnly(payload.closesAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Hours remaining:</span>
                  <span className="font-medium text-zinc-900">{payload.hoursRemaining} hours</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Registrations submitted:</span>
                  <span className="font-medium text-zinc-900">{payload.currentRegistrations ?? 0}</span>
                </div>
              </div>
            )}

            {automation.signal_type === 'REPORT_EXPIRED' && (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Report type:</span>
                  <span className="font-medium text-zinc-900 capitalize">{payload.reportType || 'Operational report'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Expired at:</span>
                  <span className="font-medium text-zinc-900">{formatTimeOnly(payload.expiredAt)}</span>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="pt-3 border-t border-zinc-200/60 grid grid-cols-2 gap-4 text-xs text-zinc-500">
              <div>
                <span className="text-zinc-400 block text-[10px] uppercase font-medium">First detected</span>
                <span className="text-zinc-700 mt-0.5 block">{formatTimeOnly(automation.first_detected_at)}</span>
              </div>
              <div>
                <span className="text-zinc-400 block text-[10px] uppercase font-medium">Updated</span>
                <span className="text-zinc-700 mt-0.5 block">{formatTimeOnly(automation.last_detected_at)}</span>
              </div>
            </div>

            {automation.resolved_at && (
              <div className="pt-2 border-t border-zinc-200/60 text-xs text-emerald-700 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                <span>Resolved at {formatTimeOnly(automation.resolved_at)}</span>
              </div>
            )}
          </div>

          {/* Relevant Actions */}
          <div className="space-y-2.5">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
              Relevant actions
            </span>
            <div className="flex flex-wrap gap-2">
              {automation.action_target_route && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigate(automation.action_target_route!);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-zinc-300 text-xs font-medium text-zinc-800 hover:bg-zinc-50 transition-colors cursor-pointer"
                >
                  <span>{automation.action_target_label || 'Open details →'}</span>
                </button>
              )}

              {automation.proposed_action_key && onReviewAction && !isResolved && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onReviewAction(automation);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#9A7326] text-white text-xs font-medium hover:bg-[#836220] transition-colors cursor-pointer shadow-2xs"
                >
                  <span>
                    {automation.proposed_action_key === 'SEND_DUTY_REMINDERS' && 'Review reminder →'}
                    {automation.proposed_action_key === 'REGENERATE_REPORT' && 'Regenerate report →'}
                    {automation.proposed_action_key === 'CREATE_ADMIN_OPERATIONS_ALERT' && 'Review Admin alert →'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
          {!isResolved && onAcknowledge ? (
            <button
              type="button"
              disabled={acknowledging || acknowledged}
              onClick={handleAcknowledge}
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer"
            >
              {acknowledged ? 'Acknowledged' : acknowledging ? 'Acknowledging...' : 'Acknowledge (cooldown)'}
            </button>
          ) : (
            <div />
          )}

          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
