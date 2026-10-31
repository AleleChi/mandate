import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Check, 
  AlertCircle, 
  AlertTriangle, 
  Clock, 
  UserCheck, 
  ListFilter, 
  Users, 
  Loader2, 
  CheckCircle2, 
  HelpCircle,
  RotateCcw
} from 'lucide-react';
import { api, extractApiError } from '../../../services/api';
import { useNotification } from '../../../context/NotificationContext';

export type BulkChildActionType = 'select_for_event' | 'approve' | 'waitlist' | 'not_selected' | 'return_draft';

export interface ConnectedChildRecord {
  id: string;
  applicationId?: string | null;
  fullName: string;
  age?: number | null;
  gender?: string | null;
  ageGroup?: string | null;
  entryStatus?: string;
  checkedInAt?: string | null;
  pickedUpAt?: string | null;
  parentId: string;
  parentName: string;
  parentEmail?: string;
  parentPhone?: string;
}

export interface BulkChildEventActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionType: BulkChildActionType;
  activeEvent: any;
  selectedParents: any[];
  allChildren: ConnectedChildRecord[];
  onSuccess: (updatedIds: string[], newStatus: string) => void;
}

export const BulkChildEventActionModal: React.FC<BulkChildEventActionModalProps> = ({
  isOpen,
  onClose,
  actionType,
  activeEvent,
  selectedParents,
  allChildren,
  onSuccess
}) => {
  const { showError, showSuccess } = useNotification();
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');
  const [resultsSummary, setResultsSummary] = useState<{
    updatedCount: number;
    failedItems: { id: string; childName?: string; reason: string }[];
  } | null>(null);

  // Parents with zero connected children
  const parentsWithNoChildren = useMemo(() => {
    return selectedParents.filter(p => !p.children || p.children.length === 0);
  }, [selectedParents]);

  // Evaluate eligibility and reasons for skipping
  const { eligibleChildren, skippedChildren } = useMemo(() => {
    const eligible: ConnectedChildRecord[] = [];
    const skipped: { child: ConnectedChildRecord; reason: string }[] = [];

    allChildren.forEach(child => {
      const status = child.entryStatus || 'not_registered';
      const isAttending = ['checked_in', 'inside', 'picked_up'].includes(status) || 
                          Boolean(child.checkedInAt && !child.pickedUpAt);

      if (actionType === 'select_for_event') {
        if (isAttending) {
          skipped.push({ child, reason: 'Child is currently attending the event' });
        } else if (status === 'pass_ready') {
          skipped.push({ child, reason: 'Pass already issued for current event' });
        } else if (status === 'selected') {
          skipped.push({ child, reason: 'Already selected for current event' });
        } else if (status === 'under_review' || status === 'review_reopened') {
          skipped.push({ child, reason: 'Already entered and awaiting review' });
        } else if (status === 'withdrawn') {
          skipped.push({ child, reason: 'Application is withdrawn' });
        } else {
          // not_registered, not_selected, incomplete, draft
          eligible.push(child);
        }
      } else if (actionType === 'approve') {
        if (!child.applicationId || status === 'not_registered') {
          skipped.push({ child, reason: 'No current-event application (Select for event first)' });
        } else if (status === 'pass_ready') {
          skipped.push({ child, reason: 'Already Pass Ready' });
        } else if (status === 'selected') {
          skipped.push({ child, reason: 'Already approved and selected' });
        } else if (isAttending) {
          skipped.push({ child, reason: 'Child is currently attending the event' });
        } else if (status === 'withdrawn') {
          skipped.push({ child, reason: 'Application is withdrawn' });
        } else if (status === 'not_selected') {
          skipped.push({ child, reason: 'Marked not selected (Select for event first)' });
        } else if (status === 'incomplete' || status === 'draft') {
          skipped.push({ child, reason: 'Application is an incomplete draft' });
        } else if (status === 'under_review' || status === 'review_reopened' || status === 'waiting_list') {
          eligible.push(child);
        } else {
          skipped.push({ child, reason: `Status '${status}' cannot be approved directly` });
        }
      } else if (actionType === 'waitlist') {
        if (!child.applicationId || status === 'not_registered') {
          skipped.push({ child, reason: 'No current-event application' });
        } else if (status === 'waiting_list') {
          skipped.push({ child, reason: 'Already on waiting list' });
        } else if (status === 'pass_ready') {
          skipped.push({ child, reason: 'Already Pass Ready' });
        } else if (isAttending) {
          skipped.push({ child, reason: 'Child is currently attending the event' });
        } else if (status === 'withdrawn') {
          skipped.push({ child, reason: 'Application is withdrawn' });
        } else if (status === 'incomplete' || status === 'draft') {
          skipped.push({ child, reason: 'Application is an incomplete draft' });
        } else {
          // under_review, review_reopened, selected, not_selected
          eligible.push(child);
        }
      } else if (actionType === 'not_selected') {
        if (!child.applicationId || status === 'not_registered') {
          skipped.push({ child, reason: 'No current-event application' });
        } else if (status === 'not_selected') {
          skipped.push({ child, reason: 'Already marked as not selected' });
        } else if (isAttending) {
          skipped.push({ child, reason: 'Child is currently attending the event' });
        } else if (status === 'pass_ready') {
          skipped.push({ child, reason: 'Already Pass Ready' });
        } else if (status === 'withdrawn') {
          skipped.push({ child, reason: 'Application is withdrawn' });
        } else if (status === 'incomplete' || status === 'draft') {
          skipped.push({ child, reason: 'Application is an incomplete draft' });
        } else {
          eligible.push(child);
        }
      } else if (actionType === 'return_draft') {
        if (!child.applicationId || status === 'not_registered') {
          skipped.push({ child, reason: 'No current-event application' });
        } else if (status === 'draft' || status === 'incomplete') {
          skipped.push({ child, reason: 'Application is already in draft status' });
        } else if (isAttending) {
          skipped.push({ child, reason: 'Child is currently attending the event' });
        } else if (status === 'pass_ready') {
          skipped.push({ child, reason: 'Pass already issued' });
        } else if (status === 'withdrawn') {
          skipped.push({ child, reason: 'Application is withdrawn' });
        } else {
          eligible.push(child);
        }
      }
    });

    return { eligibleChildren: eligible, skippedChildren: skipped };
  }, [allChildren, actionType]);

  // Action title, description and button label
  const config = useMemo(() => {
    switch (actionType) {
      case 'select_for_event':
        return {
          title: 'Select Children for Event',
          description: `Enter eligible children into ${activeEvent?.title || 'the active event'} so they can be reviewed.`,
          targetStatusLabel: 'Awaiting Review',
          actionBtnText: `Select ${eligibleChildren.length} ${eligibleChildren.length === 1 ? 'Child' : 'Children'}`,
          badgeClass: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40',
          btnClass: 'bg-[#C59B27] hover:bg-[#B08921] text-white',
          requiresReason: false,
          reasonPlaceholder: ''
        };
      case 'approve':
        return {
          title: 'Approve Child Applications',
          description: `Authorize attendance for eligible applications. Passes will be generated for children with verified photos, and parents will be notified.`,
          targetStatusLabel: 'Selected / Pass Ready',
          actionBtnText: `Approve ${eligibleChildren.length} ${eligibleChildren.length === 1 ? 'Child' : 'Children'}`,
          badgeClass: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40',
          btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          requiresReason: false,
          reasonPlaceholder: 'Optional note to registration team...'
        };
      case 'waitlist':
        return {
          title: 'Move Children to Waiting List',
          description: `Place eligible children on the event waiting list due to room capacity or safety thresholds. Parents will be notified of their waitlist position.`,
          targetStatusLabel: 'Waiting List',
          actionBtnText: `Move ${eligibleChildren.length} ${eligibleChildren.length === 1 ? 'Child' : 'Children'} to Waitlist`,
          badgeClass: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/40',
          btnClass: 'bg-indigo-600 hover:bg-indigo-700 text-white',
          requiresReason: false,
          reasonPlaceholder: 'Optional internal note...'
        };
      case 'not_selected':
        return {
          title: 'Mark Children as Not Selected',
          description: `Mark eligible applications as not selected for this event session. Parents will receive an official update.`,
          targetStatusLabel: 'Not Selected',
          actionBtnText: `Mark ${eligibleChildren.length} ${eligibleChildren.length === 1 ? 'Child' : 'Children'} Not Selected`,
          badgeClass: 'bg-zinc-100 dark:bg-[#262520] text-zinc-600 dark:text-[#7A7570] border-zinc-200 dark:border-[#3A3835]',
          btnClass: 'bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white',
          requiresReason: true,
          reasonPlaceholder: 'Reason for non-selection (e.g. Venue capacity reached)...'
        };
      case 'return_draft':
        return {
          title: 'Return Applications to Parent',
          description: `Send eligible submitted applications back to draft status so parents can make corrections or provide missing details.`,
          targetStatusLabel: 'Draft / Incomplete',
          actionBtnText: `Return ${eligibleChildren.length} ${eligibleChildren.length === 1 ? 'Application' : 'Applications'}`,
          badgeClass: 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/40',
          btnClass: 'bg-rose-600 hover:bg-rose-700 text-white',
          requiresReason: true,
          reasonPlaceholder: 'Reason for returning to draft (e.g. Please upload clear photo)...'
        };
    }
  }, [actionType, activeEvent, eligibleChildren.length]);

  const handleConfirm = async () => {
    if (eligibleChildren.length === 0) return;
    if (config.requiresReason && !reason.trim()) {
      showError('Reason Required', 'Please provide a reason or note for this action.');
      return;
    }

    setSubmitting(true);
    try {
      if (actionType === 'select_for_event') {
        let updatedCount = 0;
        const failedItems: { id: string; childName?: string; reason: string }[] = [];
        const updatedChildIds: string[] = [];

        for (const child of eligibleChildren) {
          try {
            const res = await api.admin.reviewApplication(child.applicationId || child.id, {
              status: 'under_review',
              eventId: activeEvent?.id,
              sendNotification: false
            });
            if (res.success) {
              updatedCount++;
              updatedChildIds.push(child.id);
            } else {
              failedItems.push({
                id: child.id,
                childName: child.fullName,
                reason: res.error || 'Server rejected selection'
              });
            }
          } catch (err: any) {
            const parsed = extractApiError(err);
            failedItems.push({
              id: child.id,
              childName: child.fullName,
              reason: parsed.message || 'Operation failed'
            });
          }
        }

        if (failedItems.length > 0) {
          setResultsSummary({ updatedCount, failedItems });
          onSuccess(updatedChildIds, 'under_review');
        } else {
          showSuccess('Bulk Selection Complete', `Successfully entered ${updatedCount} ${updatedCount === 1 ? 'child' : 'children'} for ${activeEvent?.title || 'the event'}.`);
          onSuccess(updatedChildIds, 'under_review');
          onClose();
        }
      } else if (actionType === 'return_draft') {
        let updatedCount = 0;
        const failedItems: { id: string; childName?: string; reason: string }[] = [];
        const updatedChildIds: string[] = [];

        for (const child of eligibleChildren) {
          try {
            const targetAppId = child.applicationId || child.id;
            const res = await api.admin.returnApplicationToDraft(targetAppId, {
              reason: reason.trim() || 'Returned to draft by administrator during bulk review'
            });
            if (res.success) {
              updatedCount++;
              updatedChildIds.push(child.id);
            } else {
              failedItems.push({
                id: child.id,
                childName: child.fullName,
                reason: res.error || 'Could not return application'
              });
            }
          } catch (err: any) {
            const parsed = extractApiError(err);
            failedItems.push({
              id: child.id,
              childName: child.fullName,
              reason: parsed.message || 'Operation failed'
            });
          }
        }

        if (failedItems.length > 0) {
          setResultsSummary({ updatedCount, failedItems });
          onSuccess(updatedChildIds, 'draft');
        } else {
          showSuccess('Applications Returned', `Successfully returned ${updatedCount} ${updatedCount === 1 ? 'application' : 'applications'} to draft.`);
          onSuccess(updatedChildIds, 'draft');
          onClose();
        }
      } else {
        // Canonical Review Module Bulk Endpoint: 'approve' ('selected'), 'waitlist' ('waiting_list'), 'not_selected'
        const decision = actionType === 'approve' ? 'selected'
          : actionType === 'waitlist' ? 'waiting_list'
          : 'not_selected';

        const applicationIds = eligibleChildren.map(c => c.applicationId).filter(Boolean) as string[];

        const res = await api.admin.bulkReviewApplications({
          applicationIds,
          decision,
          note: reason.trim() || undefined
        });

        if (res.success) {
          const updatedCount = res.updatedCount || applicationIds.length;
          const failures = res.failures || [];
          const updatedChildIds = eligibleChildren
            .filter(c => !failures.some((f: any) => f.id === c.applicationId))
            .map(c => c.id);

          const targetEntryStatus = decision === 'selected' ? 'selected' : decision;

          if (failures.length > 0) {
            setResultsSummary({
              updatedCount,
              failedItems: failures
            });
            onSuccess(updatedChildIds, targetEntryStatus);
          } else {
            showSuccess('Bulk Action Complete', `Successfully updated ${updatedCount} ${updatedCount === 1 ? 'child application' : 'child applications'}.`);
            onSuccess(updatedChildIds, targetEntryStatus);
            onClose();
          }
        } else {
          showError('Bulk Action Failed', res.error || 'Could not process bulk event action.');
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action Failed', parsed.message || 'Server error while executing bulk action.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10060] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div 
        className="fixed inset-0 -z-10" 
        onClick={() => { if (!submitting) onClose(); }} 
      />

      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-between gap-3 bg-white dark:bg-[#21211E] shrink-0">
          <div>
            <h3 className="font-semibold text-base text-[#18181B] dark:text-[#F0EBE3]">
              {resultsSummary ? 'Bulk Update Summary' : config.title}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-[#8E877D] mt-0.5">
              Event: <span className="font-medium text-zinc-800 dark:text-[#F0EBE3]">{activeEvent?.title || activeEvent?.name || 'Active Event'}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-[#F0EBE3] hover:bg-zinc-100 dark:hover:bg-[#262520] transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5 text-left">
          
          {/* RESULTS SUMMARY SCREEN (Shown if partial failures occurred) */}
          {resultsSummary ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm text-amber-900 dark:text-amber-300">
                      Bulk operation completed with skipped records
                    </h4>
                    <p className="text-xs text-amber-800 dark:text-amber-400 mt-1">
                      <strong>{resultsSummary.updatedCount}</strong> {resultsSummary.updatedCount === 1 ? 'child was' : 'children were'} updated successfully.{' '}
                      <strong>{resultsSummary.failedItems.length}</strong> {resultsSummary.failedItems.length === 1 ? 'record was' : 'records were'} unchanged.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                  Unchanged / Rejected Records ({resultsSummary.failedItems.length})
                </h5>
                <div className="divide-y divide-[#EAE8E1] dark:divide-[#2A2926] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl overflow-hidden bg-white dark:bg-[#20201E] max-h-60 overflow-y-auto">
                  {resultsSummary.failedItems.map((item, idx) => (
                    <div key={item.id || idx} className="p-3 text-xs flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">{item.childName || 'Child record'}</p>
                        <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">{item.reason}</p>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/40 shrink-0">
                        Skipped
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* OPERATION CONTEXT & METRICS STRIP */}
              <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#2A2926] flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    {selectedParents.length} {selectedParents.length === 1 ? 'parent selected' : 'parents selected'}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {allChildren.length} connected {allChildren.length === 1 ? 'child profile' : 'child profiles'} found across selected families
                  </p>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                    {eligibleChildren.length} eligible
                  </span>
                  {skippedChildren.length > 0 && (
                    <span className="px-2.5 py-1 text-xs font-medium rounded-md bg-neutral-100 dark:bg-[#2A2926] text-neutral-600 dark:text-neutral-400 border border-[#EAE8E1] dark:border-[#3A3835]">
                      {skippedChildren.length} skipped
                    </span>
                  )}
                </div>
              </div>

              {/* PARENTS WITH NO CHILDREN NOTICE */}
              {parentsWithNoChildren.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{parentsWithNoChildren.length} {parentsWithNoChildren.length === 1 ? 'parent has' : 'parents have'} no linked children: </span>
                    <span>{parentsWithNoChildren.map(p => p.fullName || p.full_name).join(', ')}. Their records will be excluded without affecting other families.</span>
                  </div>
                </div>
              )}

              {/* REASON INPUT (If required or optional) */}
              {(config.requiresReason || actionType === 'approve' || actionType === 'waitlist') && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block">
                    {config.requiresReason ? 'Reason for Decision *' : 'Review Note (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={config.reasonPlaceholder}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#EAE8E1] dark:border-[#2A2926] bg-white dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27]"
                  />
                </div>
              )}

              {/* LIST 1: WILL BE UPDATED */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Will be updated ({eligibleChildren.length})</span>
                  </h4>
                  <span className="text-[11px] text-neutral-400">Target status: {config.targetStatusLabel}</span>
                </div>

                {eligibleChildren.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-[#EAE8E1] dark:border-[#2A2926] text-center text-xs text-neutral-400 dark:text-neutral-500">
                    No connected children are eligible for this action.
                  </div>
                ) : (
                  <div className="divide-y divide-[#EAE8E1] dark:divide-[#2A2926] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl overflow-hidden bg-white dark:bg-[#20201E] max-h-48 overflow-y-auto">
                    {eligibleChildren.map(child => (
                      <div key={child.id} className="p-2.5 px-3 text-xs flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">{child.fullName}</p>
                          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
                            Parent: {child.parentName} · {child.age ? `${child.age}y` : 'Age N/A'} {child.ageGroup ? `(${child.ageGroup})` : ''}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 shrink-0 capitalize">
                          {child.entryStatus ? child.entryStatus.replace(/_/g, ' ') : 'Not registered'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* LIST 2: WILL BE SKIPPED */}
              {skippedChildren.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Will be skipped ({skippedChildren.length})</span>
                    </h4>
                    <span className="text-[11px] text-neutral-400">Records will remain unchanged</span>
                  </div>

                  <div className="divide-y divide-[#EAE8E1] dark:divide-[#2A2926] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl overflow-hidden bg-neutral-50/50 dark:bg-[#1B1B18] max-h-40 overflow-y-auto">
                    {skippedChildren.map(({ child, reason: skipReason }) => (
                      <div key={child.id} className="p-2.5 px-3 text-xs flex items-center justify-between gap-3 opacity-80">
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-700 dark:text-neutral-300 truncate">{child.fullName}</p>
                          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
                            Parent: {child.parentName}
                          </p>
                        </div>
                        <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 text-right shrink-0">
                          {skipReason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3.5 border-t border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-end gap-3 bg-white dark:bg-[#21211E] shrink-0">
          {resultsSummary ? (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#C59B27] hover:bg-[#B08921] rounded-lg transition-colors cursor-pointer"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-3.5 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-[#262520] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || eligibleChildren.length === 0}
                onClick={handleConfirm}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs ${config.btnClass}`}
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{config.actionBtnText}</span>
              </button>
            </>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
};
