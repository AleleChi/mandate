import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Users,
  X,
  AlertCircle,
  Loader2,
  Check
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../common/Button';

export type BulkReviewDecision = 'selected' | 'waiting_list' | 'not_selected' | 'under_review';

export interface BulkReviewApplicationItem {
  id: string;
  childName: string;
  parentName?: string;
  age?: number | string | null;
  ageGroup?: string | null;
  currentStatus?: string;
  photoUrl?: string | null;
}

interface BulkApplicationReviewModalProps {
  isOpen: boolean;
  applications: BulkReviewApplicationItem[];
  initialDecision?: BulkReviewDecision;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ReviewResultItem {
  id: string;
  childName: string;
  parentName?: string;
  status: 'pending' | 'success' | 'failed';
  decisionApplied?: BulkReviewDecision;
  errorMessage?: string;
}

export const BulkApplicationReviewModal: React.FC<BulkApplicationReviewModalProps> = ({
  isOpen,
  applications,
  initialDecision = 'selected',
  onClose,
  onSuccess
}) => {
  const { showSuccess, showError } = useNotification();

  const [decision, setDecision] = useState<BulkReviewDecision>(initialDecision);
  const [teamNote, setTeamNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [results, setResults] = useState<ReviewResultItem[] | null>(null);
  const [summaryStats, setSummaryStats] = useState<{
    totalUpdated: number;
    totalFailed: number;
  } | null>(null);

  if (!isOpen) return null;

  const getDecisionMeta = (d: BulkReviewDecision) => {
    switch (d) {
      case 'selected':
        return {
          title: 'Approve & Select for Event',
          badgeText: 'Selected',
          icon: CheckCircle2,
          colorClass: 'emerald',
          description:
            'Selected children are approved to attend the event. If required emergency pickup contacts and photos are verified, digital passes are issued immediately. Parents receive confirmation via email, portal inbox, and WhatsApp.'
        };
      case 'waiting_list':
        return {
          title: 'Place on Waiting List',
          badgeText: 'Waiting List',
          icon: Clock,
          colorClass: 'amber',
          description:
            'These registrations will be moved to the waiting list. Parents receive an encouraging update explaining that venue capacity is currently full and they will be contacted if a spot becomes available.'
        };
      case 'not_selected':
        return {
          title: 'Mark as Not Selected',
          badgeText: 'Not Selected',
          icon: XCircle,
          colorClass: 'zinc',
          description:
            'Parents will receive a gentle update explaining that room capacity and safety limits have been reached for this session.'
        };
      case 'under_review':
        return {
          title: 'Reset to Awaiting Review',
          badgeText: 'Awaiting Review',
          icon: RotateCcw,
          colorClass: 'blue',
          description:
            'These applications will be returned to the review queue for further administrative consideration.'
        };
    }
  };

  const currentMeta = getDecisionMeta(decision);
  const BannerIcon = currentMeta.icon;

  const handleRunBulkReview = async () => {
    if (applications.length === 0) return;

    setIsProcessing(true);
    const initialResults: ReviewResultItem[] = applications.map(app => ({
      id: app.id,
      childName: app.childName,
      parentName: app.parentName,
      status: 'pending'
    }));
    setResults(initialResults);

    let updated = 0;
    let failed = 0;
    const workingResults = [...initialResults];

    for (let i = 0; i < applications.length; i++) {
      setCurrentIndex(i);
      const app = applications[i];

      try {
        const res = await api.admin.bulkReviewApplications({
          applicationIds: [app.id],
          decision,
          note: teamNote.trim() || undefined
        });

        if (res && res.success) {
          if (res.failures && res.failures.length > 0) {
            const failReason = res.failures[0].reason || 'Could not update record';
            workingResults[i] = {
              ...workingResults[i],
              status: 'failed',
              errorMessage: failReason
            };
            failed++;
          } else {
            workingResults[i] = {
              ...workingResults[i],
              status: 'success',
              decisionApplied: decision
            };
            updated++;
          }
        } else {
          workingResults[i] = {
            ...workingResults[i],
            status: 'failed',
            errorMessage: res?.error || 'Review action failed'
          };
          failed++;
        }
      } catch (err: any) {
        const parsed = extractApiError(err);
        workingResults[i] = {
          ...workingResults[i],
          status: 'failed',
          errorMessage: parsed.message || 'Network error'
        };
        failed++;
      }

      setResults([...workingResults]);
    }

    setSummaryStats({
      totalUpdated: updated,
      totalFailed: failed
    });
    setIsProcessing(false);
    setCurrentIndex(-1);

    if (updated > 0) {
      showSuccess(
        'Bulk Review Complete',
        `Successfully updated ${updated} registration${updated === 1 ? '' : 's'}.`
      );
      if (onSuccess) {
        onSuccess();
      }
    } else {
      showError('Bulk Review Failed', 'None of the selected registrations could be updated.');
    }
  };

  const isDone = results !== null && !isProcessing;

  const getStatusBadge = (resItem: ReviewResultItem) => {
    if (resItem.status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400">
          <Loader2 className="w-3 h-3 animate-spin text-[#C59B27]" />
          <span>Updating...</span>
        </span>
      );
    }

    if (resItem.status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
          <AlertCircle className="w-3 h-3" />
          <span>{resItem.errorMessage || 'Failed'}</span>
        </span>
      );
    }

    // Success
    switch (resItem.decisionApplied) {
      case 'selected':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="w-3 h-3" />
            <span>Selected &amp; Approved</span>
          </span>
        );
      case 'waiting_list':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            <Clock className="w-3 h-3" />
            <span>Waiting List</span>
          </span>
        );
      case 'not_selected':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
            <X className="w-3 h-3" />
            <span>Not Selected</span>
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600">
            <RotateCcw className="w-3 h-3" />
            <span>Awaiting Review</span>
          </span>
        );
      default:
        return <span className="text-[11px] font-semibold text-emerald-600">Updated</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
      <div
        className="w-full max-w-lg bg-white dark:bg-[#1D1D1A] rounded-2xl border border-[#EAE8E1] dark:border-[#302F2A] shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#EAE8E1] dark:border-[#302F2A] flex items-center justify-between bg-[#FCFBF8] dark:bg-[#21211E]">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-[#C59B27]" />
            <h3 className="font-serif-koinonia font-bold text-sm text-[#18181B] dark:text-[#F0EBE3]">
              Bulk Review Registrations ({applications.length})
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
          {/* Decision Explanation Callout */}
          <div
            className={`p-3.5 rounded-xl border text-xs space-y-1.5 leading-relaxed transition-all ${
              decision === 'selected'
                ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/70 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-200'
                : decision === 'waiting_list'
                ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/70 dark:border-amber-900/40 text-amber-900 dark:text-amber-200'
                : decision === 'not_selected'
                ? 'bg-zinc-50 dark:bg-[#262520] border-zinc-200 dark:border-[#3A3835] text-zinc-800 dark:text-zinc-300'
                : 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200/70 dark:border-blue-900/40 text-blue-900 dark:text-blue-200'
            }`}
          >
            <div className="flex items-center space-x-1.5 font-bold">
              <BannerIcon className="w-3.5 h-3.5" />
              <span>{currentMeta.title}</span>
            </div>
            <p
              className={`text-[11px] ${
                decision === 'selected'
                  ? 'text-emerald-800 dark:text-emerald-300'
                  : decision === 'waiting_list'
                  ? 'text-amber-800 dark:text-amber-300'
                  : decision === 'not_selected'
                  ? 'text-zinc-600 dark:text-zinc-400'
                  : 'text-blue-800 dark:text-blue-300'
              }`}
            >
              {currentMeta.description}
            </p>
          </div>

          {/* Decision Pill Selector (Active before submitting) */}
          {!results && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                Select Decision for {applications.length} Children
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDecision('selected')}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    decision === 'selected'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/20'
                      : 'bg-white dark:bg-[#24231F] border-[#EAE8E1] dark:border-[#302F2A] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-[#2A2926]'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Select for event</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDecision('waiting_list')}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    decision === 'waiting_list'
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/20'
                      : 'bg-white dark:bg-[#24231F] border-[#EAE8E1] dark:border-[#302F2A] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-[#2A2926]'
                  }`}
                >
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Waiting list</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDecision('not_selected')}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    decision === 'not_selected'
                      ? 'bg-zinc-100 dark:bg-[#2A2926] border-zinc-400 text-zinc-800 dark:text-zinc-200 ring-1 ring-zinc-400/20'
                      : 'bg-white dark:bg-[#24231F] border-[#EAE8E1] dark:border-[#302F2A] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-[#2A2926]'
                  }`}
                >
                  <XCircle className="w-4 h-4 text-zinc-500 shrink-0" />
                  <span>Not selected</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDecision('under_review')}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    decision === 'under_review'
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-800 dark:text-blue-300 ring-1 ring-blue-500/20'
                      : 'bg-white dark:bg-[#24231F] border-[#EAE8E1] dark:border-[#302F2A] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-[#2A2926]'
                  }`}
                >
                  <RotateCcw className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>Awaiting review</span>
                </button>
              </div>

              {/* Team Audit Note */}
              <div className="pt-2">
                <label className="text-[11px] font-medium text-zinc-500 dark:text-[#7A7570] block mb-1">
                  Team note (optional):
                </label>
                <input
                  type="text"
                  value={teamNote}
                  onChange={(e) => setTeamNote(e.target.value)}
                  placeholder="e.g. Approved during admissions review"
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-[#FCFBF8] dark:bg-[#262520] px-3 py-2 text-zinc-800 dark:text-[#F0EBE3] placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                />
              </div>
            </div>
          )}

          {/* Summary Strip Once Completed */}
          {summaryStats && (
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#24231F] border border-[#EAE8E1] dark:border-[#302F2A] text-xs space-y-1">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">
                Review Summary:
              </span>
              <div className="space-y-0.5 text-[11px] text-zinc-600 dark:text-[#B8B0A5]">
                <p>
                  • <strong className="text-zinc-800 dark:text-zinc-200">{summaryStats.totalUpdated}</strong> registration{summaryStats.totalUpdated === 1 ? '' : 's'} updated to <strong>{currentMeta.badgeText}</strong>
                </p>
                {summaryStats.totalFailed > 0 && (
                  <p className="text-rose-600">
                    • <strong>{summaryStats.totalFailed}</strong> registration{summaryStats.totalFailed === 1 ? '' : 's'} could not be updated
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Children Queue / Progress Results */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {results ? 'Review Outcomes' : `Selected Registrations (${applications.length})`}
              </span>
              {isProcessing && currentIndex >= 0 && (
                <span className="text-[11px] font-medium text-[#C59B27] animate-pulse">
                  Updating {currentIndex + 1} of {applications.length}...
                </span>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-[#EAE8E1] dark:divide-[#302F2A] border border-[#EAE8E1] dark:border-[#302F2A] rounded-xl bg-white dark:bg-[#24231F]">
              {results
                ? results.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate">
                          {item.childName}
                        </span>
                        {item.parentName && (
                          <span className="text-[10px] text-zinc-400 block truncate">
                            Parent: {item.parentName}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0">{getStatusBadge(item)}</div>
                    </div>
                  ))
                : applications.map((app) => {
                    const ageText =
                      app.age !== undefined && app.age !== null
                        ? app.age === 0
                          ? 'Under 1 yr'
                          : `${app.age} yrs`
                        : null;

                    return (
                      <div
                        key={app.id}
                        className="p-2.5 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          {/* Avatar */}
                          <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-[#2A2926] border border-[#EAE8E1] dark:border-[#3A3835] flex items-center justify-center shrink-0 overflow-hidden text-[11px] font-semibold text-zinc-500">
                            {app.photoUrl ? (
                              <img
                                src={app.photoUrl}
                                alt={app.childName}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              app.childName.charAt(0) || 'C'
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate">
                              {app.childName}
                            </span>
                            <span className="text-[10px] text-zinc-400 block truncate">
                              {app.parentName ? `Parent: ${app.parentName}` : ''}
                              {ageText ? ` · ${ageText}` : ''}
                              {app.ageGroup ? ` · ${app.ageGroup}` : ''}
                            </span>
                          </div>
                        </div>

                        {app.currentStatus && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md font-medium capitalize bg-zinc-100 dark:bg-[#2A2926] text-zinc-600 dark:text-zinc-400 shrink-0">
                            {app.currentStatus.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    );
                  })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-2.5 border-t border-[#EAE8E1] dark:border-[#302F2A]">
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
                  onClick={handleRunBulkReview}
                  disabled={isProcessing || applications.length === 0}
                  className="text-xs px-4 py-1.5 rounded-xl cursor-pointer"
                >
                  {isProcessing ? (
                    <div className="flex items-center space-x-1.5">
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Applying Decision...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5">
                      <span>Confirm {currentMeta.badgeText} ({applications.length})</span>
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
