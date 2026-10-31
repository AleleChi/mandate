import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  AlertCircle, 
  AlertTriangle, 
  Loader2, 
  CheckCircle2, 
  HelpCircle,
  RotateCcw,
  Check
} from 'lucide-react';
import { api, extractApiError } from '../../../services/api';
import { useNotification } from '../../../context/NotificationContext';

export type BulkChildActionType = 
  | 'select_for_event' 
  | 'review_sequence'
  | 'approve' 
  | 'waitlist' 
  | 'not_selected' 
  | 'return_draft'
  | 'restore';

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
  onStartReviewSequence?: (childrenToReview: ConnectedChildRecord[]) => void;
}

const formatStatus = (raw?: string): string => {
  if (!raw || raw === 'not_registered') return 'Not selected';
  if (raw === 'under_review') return 'Awaiting Review';
  if (raw === 'review_reopened') return 'Review Reopened';
  if (raw === 'pass_ready') return 'Pass Ready';
  if (raw === 'selected') return 'Selected';
  if (raw === 'waiting_list') return 'Waiting List';
  if (raw === 'not_selected') return 'Not selected';
  if (raw === 'checked_in') return 'Checked In';
  if (raw === 'inside') return 'Inside Event';
  if (raw === 'picked_up') return 'Picked Up';
  if (raw === 'withdrawn') return 'Withdrawn';
  if (raw === 'draft') return 'Draft';
  if (raw === 'incomplete') return 'Incomplete';
  return raw.replace(/_/g, ' ');
};

export const BulkChildEventActionModal: React.FC<BulkChildEventActionModalProps> = ({
  isOpen,
  onClose,
  actionType,
  activeEvent,
  selectedParents,
  allChildren,
  onSuccess,
  onStartReviewSequence
}) => {
  const { showError, showSuccess } = useNotification();
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [resultsSummary, setResultsSummary] = useState<{
    updatedCount: number;
    failedItems: { id: string; childName?: string; reason: string }[];
  } | null>(null);

  // Parents with zero connected children
  const parentsWithNoChildren = useMemo(() => {
    return selectedParents.filter(p => !p.children || p.children.length === 0);
  }, [selectedParents]);

  // Evaluate action eligibility for each child
  const evaluateChildEligibility = (child: ConnectedChildRecord): { isAvailable: boolean; reason?: string } => {
    const status = child.entryStatus || 'not_registered';
    const isAttending = ['checked_in', 'inside', 'picked_up'].includes(status) || 
                        Boolean(child.checkedInAt && !child.pickedUpAt);

    switch (actionType) {
      case 'select_for_event':
        if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
        if (status === 'pass_ready') return { isAvailable: false, reason: 'Already Pass Ready' };
        if (status === 'selected') return { isAvailable: false, reason: 'Already selected for current event' };
        if (status === 'under_review' || status === 'review_reopened') return { isAvailable: false, reason: 'Already Under Review' };
        if (status === 'withdrawn') return { isAvailable: false, reason: 'Application Withdrawn' };
        return { isAvailable: true };

      case 'review_sequence':
        if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
        if (status === 'under_review' || status === 'review_reopened') return { isAvailable: true };
        if (!child.applicationId || status === 'not_registered') return { isAvailable: false, reason: 'No event application' };
        if (status === 'pass_ready') return { isAvailable: false, reason: 'Already Pass Ready' };
        if (status === 'selected') return { isAvailable: false, reason: 'Already approved' };
        if (status === 'waiting_list') return { isAvailable: false, reason: 'Currently on Waiting List' };
        if (status === 'withdrawn') return { isAvailable: false, reason: 'Application Withdrawn' };
        return { isAvailable: false, reason: 'Not Awaiting Review' };

      case 'approve':
        if (!child.applicationId || status === 'not_registered') return { isAvailable: false, reason: 'No event application' };
        if (status === 'pass_ready') return { isAvailable: false, reason: 'Already Pass Ready' };
        if (status === 'selected') return { isAvailable: false, reason: 'Already approved and selected' };
        if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
        if (status === 'withdrawn') return { isAvailable: false, reason: 'Application Withdrawn' };
        if (status === 'not_selected') return { isAvailable: false, reason: 'Marked Not Selected (Select for event first)' };
        if (status === 'incomplete' || status === 'draft') return { isAvailable: false, reason: 'Application is an incomplete draft' };
        if (status === 'under_review' || status === 'review_reopened' || status === 'waiting_list') return { isAvailable: true };
        return { isAvailable: false, reason: `Status '${status}' cannot be approved directly` };

      case 'waitlist':
        if (!child.applicationId || status === 'not_registered') return { isAvailable: false, reason: 'No event application' };
        if (status === 'waiting_list') return { isAvailable: false, reason: 'Already on Waiting List' };
        if (status === 'pass_ready') return { isAvailable: false, reason: 'Already Pass Ready' };
        if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
        if (status === 'withdrawn') return { isAvailable: false, reason: 'Application Withdrawn' };
        if (status === 'incomplete' || status === 'draft') return { isAvailable: false, reason: 'Application is an incomplete draft' };
        return { isAvailable: true };

      case 'not_selected':
        if (!child.applicationId || status === 'not_registered') return { isAvailable: false, reason: 'No event application' };
        if (status === 'not_selected') return { isAvailable: false, reason: 'Already marked Not Selected' };
        if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
        if (status === 'pass_ready') return { isAvailable: false, reason: 'Already Pass Ready' };
        if (status === 'withdrawn') return { isAvailable: false, reason: 'Application Withdrawn' };
        if (status === 'incomplete' || status === 'draft') return { isAvailable: false, reason: 'Application is an incomplete draft' };
        return { isAvailable: true };

      case 'return_draft':
        if (!child.applicationId || status === 'not_registered') return { isAvailable: false, reason: 'No event application' };
        if (status === 'draft' || status === 'incomplete') return { isAvailable: false, reason: 'Application is already in draft status' };
        if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
        if (status === 'pass_ready') return { isAvailable: false, reason: 'Pass already issued' };
        if (status === 'selected') return { isAvailable: false, reason: 'Application already approved' };
        if (status === 'withdrawn') return { isAvailable: false, reason: 'Application Withdrawn' };
        if (status === 'under_review' || status === 'review_reopened') return { isAvailable: true };
        return { isAvailable: false, reason: 'Not in a reviewable state' };

      case 'restore':
        if (!child.applicationId || status === 'not_registered') return { isAvailable: false, reason: 'No event application to restore' };
        if (isAttending) return { isAvailable: false, reason: 'Child is currently attending the event' };
        if (status === 'withdrawn' || status === 'not_selected') return { isAvailable: true };
        if (status === 'under_review' || status === 'review_reopened') return { isAvailable: false, reason: 'Already Under Review' };
        if (status === 'selected') return { isAvailable: false, reason: 'Already active and selected' };
        if (status === 'pass_ready') return { isAvailable: false, reason: 'Already Pass Ready' };
        if (status === 'waiting_list') return { isAvailable: false, reason: 'Already on Waiting List' };
        return { isAvailable: false, reason: 'Application cannot be restored' };
    }
  };

  // Group connected children by parent with availability breakdown
  const parentGroups = useMemo(() => {
    return selectedParents
      .filter(p => p.children && p.children.length > 0)
      .map(p => {
        const parentName = p.fullName || p.full_name || 'Invited Parent';
        const parentId = String(p.id);
        const children = allChildren.filter(c => c.parentId === parentId);

        const availableChildren: ConnectedChildRecord[] = [];
        const unavailableChildren: { child: ConnectedChildRecord; reason: string }[] = [];

        children.forEach(c => {
          const check = evaluateChildEligibility(c);
          if (check.isAvailable) {
            availableChildren.push(c);
          } else {
            unavailableChildren.push({ child: c, reason: check.reason || 'Not eligible' });
          }
        });

        return {
          parentId,
          parentName,
          children,
          availableChildren,
          unavailableChildren
        };
      });
  }, [selectedParents, allChildren, actionType]);

  // All available children flat list
  const availableChildren = useMemo(() => {
    return parentGroups.flatMap(g => g.availableChildren);
  }, [parentGroups]);

  // All unavailable children flat list
  const unavailableChildren = useMemo(() => {
    return parentGroups.flatMap(g => g.unavailableChildren);
  }, [parentGroups]);

  // Auto-selection rule: If exactly 1 available child, auto-select. If multiple, require explicit selection.
  useEffect(() => {
    if (isOpen) {
      if (availableChildren.length === 1) {
        setSelectedChildIds([availableChildren[0].id]);
      } else {
        setSelectedChildIds([]);
      }
      setReason('');
      setResultsSummary(null);
    }
  }, [isOpen, actionType, availableChildren.length]);

  // Action title, description, and button configuration
  const config = useMemo(() => {
    switch (actionType) {
      case 'select_for_event':
        return {
          title: 'Select Children for Event',
          actionVerb: 'Select',
          description: `Enter selected children into ${activeEvent?.title || 'the active event'} so they can be reviewed.`,
          getButtonLabel: (count: number) => count === 0 ? 'Select Children for Event' : `Select ${count} ${count === 1 ? 'Child' : 'Children'} for Event`,
          btnClass: 'bg-[#C59B27] hover:bg-[#B08921] text-white',
          requiresReason: false,
          reasonPlaceholder: ''
        };
      case 'review_sequence':
        return {
          title: 'Review Selected Children',
          actionVerb: 'Review',
          description: `Choose which awaiting-review children will enter the sequential review sequence.`,
          getButtonLabel: (count: number) => count === 0 ? 'Start Review' : `Start Review (${count} ${count === 1 ? 'Child' : 'Children'})`,
          btnClass: 'bg-amber-600 hover:bg-amber-700 text-white',
          requiresReason: false,
          reasonPlaceholder: ''
        };
      case 'approve':
        return {
          title: 'Approve Children',
          actionVerb: 'Approve',
          description: `Authorize attendance for selected child applications. Passes will be generated for children with verified photos, and parents will be notified.`,
          getButtonLabel: (count: number) => count === 0 ? 'Approve Children' : `Approve ${count} ${count === 1 ? 'Child' : 'Children'}`,
          btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          requiresReason: false,
          reasonPlaceholder: 'Optional note to registration team...'
        };
      case 'waitlist':
        return {
          title: 'Move Children to Waiting List',
          actionVerb: 'Move to Waitlist',
          description: `Place selected children on the event waiting list. Parents will be notified of their waitlist status.`,
          getButtonLabel: (count: number) => count === 0 ? 'Move Children to Waiting List' : `Move ${count} ${count === 1 ? 'Child' : 'Children'} to Waiting List`,
          btnClass: 'bg-indigo-600 hover:bg-indigo-700 text-white',
          requiresReason: false,
          reasonPlaceholder: 'Optional internal note...'
        };
      case 'not_selected':
        return {
          title: 'Mark Children as Not Selected',
          actionVerb: 'Mark Not Selected',
          description: `Mark selected applications as not selected for this event session. Parents will receive an official update.`,
          getButtonLabel: (count: number) => count === 0 ? 'Mark Children as Not Selected' : `Mark ${count} ${count === 1 ? 'Child' : 'Children'} as Not Selected`,
          btnClass: 'bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white',
          requiresReason: true,
          reasonPlaceholder: 'Reason for non-selection (e.g. Venue capacity reached)...'
        };
      case 'return_draft':
        return {
          title: 'Return Applications to Parent',
          actionVerb: 'Return to Draft',
          description: `Send selected submitted applications back to draft status so parents can make corrections or provide missing details.`,
          getButtonLabel: (count: number) => count === 0 ? 'Return Applications to Parent' : `Return ${count} ${count === 1 ? 'Application' : 'Applications'} to Parent`,
          btnClass: 'bg-rose-600 hover:bg-rose-700 text-white',
          requiresReason: true,
          reasonPlaceholder: 'Reason for returning to draft (e.g. Please upload clear photo)...'
        };
      case 'restore':
        return {
          title: 'Restore Children to Event',
          actionVerb: 'Restore',
          description: `Restore selected withdrawn or not-selected child applications back to the active event review list.`,
          getButtonLabel: (count: number) => count === 0 ? 'Restore Children to Event' : `Restore ${count} ${count === 1 ? 'Child' : 'Children'} to Event`,
          btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          requiresReason: false,
          reasonPlaceholder: 'Optional restore note...'
        };
    }
  }, [actionType, activeEvent]);

  const isAllAvailableSelected = availableChildren.length > 0 && availableChildren.every(c => selectedChildIds.includes(c.id));

  const handleToggleSelectAllAvailable = () => {
    if (isAllAvailableSelected) {
      setSelectedChildIds([]);
    } else {
      setSelectedChildIds(availableChildren.map(c => c.id));
    }
  };

  const handleToggleChild = (childId: string) => {
    setSelectedChildIds(prev =>
      prev.includes(childId) ? prev.filter(id => id !== childId) : [...prev, childId]
    );
  };

  const handleConfirm = async () => {
    if (selectedChildIds.length === 0) return;
    if (config.requiresReason && !reason.trim()) {
      showError('Reason Required', 'Please provide a reason or note for this action.');
      return;
    }

    // REVIEW SEQUENCE WORKFLOW: Open sequential review modal directly
    if (actionType === 'review_sequence') {
      const chosenChildren = allChildren.filter(c => selectedChildIds.includes(c.id));
      if (onStartReviewSequence) {
        onStartReviewSequence(chosenChildren);
      }
      onClose();
      return;
    }

    setSubmitting(true);
    const selectedChildren = allChildren.filter(c => selectedChildIds.includes(c.id));

    try {
      if (actionType === 'select_for_event') {
        let updatedCount = 0;
        const failedItems: { id: string; childName?: string; reason: string }[] = [];
        const updatedChildIds: string[] = [];

        for (const child of selectedChildren) {
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

        for (const child of selectedChildren) {
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
      } else if (actionType === 'restore') {
        let updatedCount = 0;
        const failedItems: { id: string; childName?: string; reason: string }[] = [];
        const updatedChildIds: string[] = [];

        for (const child of selectedChildren) {
          try {
            const targetAppId = child.applicationId || child.id;
            const res = await api.admin.restoreChild(targetAppId, reason.trim() || undefined);
            if (res.success) {
              updatedCount++;
              updatedChildIds.push(child.id);
            } else {
              failedItems.push({
                id: child.id,
                childName: child.fullName,
                reason: res.error || 'Could not restore child application'
              });
            }
          } catch (err: any) {
            const parsed = extractApiError(err);
            failedItems.push({
              id: child.id,
              childName: child.fullName,
              reason: parsed.message || 'Restore failed'
            });
          }
        }

        if (failedItems.length > 0) {
          setResultsSummary({ updatedCount, failedItems });
          onSuccess(updatedChildIds, 'under_review');
        } else {
          showSuccess('Children Restored', `Successfully restored ${updatedCount} ${updatedCount === 1 ? 'child' : 'children'} to active event review.`);
          onSuccess(updatedChildIds, 'under_review');
          onClose();
        }
      } else {
        // Canonical Review Module Bulk Endpoint: 'approve' ('selected'), 'waitlist' ('waiting_list'), 'not_selected'
        const decision = actionType === 'approve' ? 'selected'
          : actionType === 'waitlist' ? 'waiting_list'
          : 'not_selected';

        const applicationIds = selectedChildren.map(c => c.applicationId).filter(Boolean) as string[];

        const res = await api.admin.bulkReviewApplications({
          applicationIds,
          decision,
          note: reason.trim() || undefined
        });

        if (res.success) {
          const updatedCount = res.updatedCount || applicationIds.length;
          const failures = res.failures || [];
          const updatedChildIds = selectedChildren
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

      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-lg w-full max-w-2xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        
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
        <div className="overflow-y-auto flex-1 p-6 space-y-4 text-left">
          
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
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#2A2926] flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {selectedParents.length} {selectedParents.length === 1 ? 'parent' : 'parents'} selected · {allChildren.length} {allChildren.length === 1 ? 'child' : 'children'}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {config.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                    {availableChildren.length} available
                  </span>
                  {unavailableChildren.length > 0 && (
                    <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-neutral-100 dark:bg-[#2A2926] text-neutral-500 dark:text-neutral-400 border border-[#EAE8E1] dark:border-[#3A3835]">
                      {unavailableChildren.length} unavailable
                    </span>
                  )}
                </div>
              </div>

              {/* PARENTS WITH NO CHILDREN NOTICE */}
              {parentsWithNoChildren.length > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{parentsWithNoChildren.length} {parentsWithNoChildren.length === 1 ? 'parent has' : 'parents have'} no linked children: </span>
                    <span>{parentsWithNoChildren.map(p => p.fullName || p.full_name).join(', ')}. Excluded from this action.</span>
                  </div>
                </div>
              )}

              {/* REASON INPUT (If required or optional) */}
              {(config.requiresReason || actionType === 'approve' || actionType === 'waitlist' || actionType === 'restore') && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block">
                    {config.requiresReason ? 'Reason for Decision *' : 'Review Note (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={config.reasonPlaceholder}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#EAE8E1] dark:border-[#2A2926] bg-white dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27]"
                  />
                </div>
              )}

              {/* SELECTION HEADER BAR */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                  Select Children ({selectedChildIds.length} of {availableChildren.length} selected)
                </span>
                {availableChildren.length > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleSelectAllAvailable}
                    className="text-xs font-semibold text-[#C59B27] hover:text-[#B08921] transition-colors cursor-pointer"
                  >
                    {isAllAvailableSelected ? 'Deselect all' : 'Select all available'}
                  </button>
                )}
              </div>

              {/* CONNECTED CHILDREN GROUPED BY PARENT */}
              {availableChildren.length === 0 && unavailableChildren.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-[#EAE8E1] dark:border-[#2A2926] text-center text-xs text-neutral-400 dark:text-neutral-500">
                  No connected children found for selected parents.
                </div>
              ) : (
                <div className="space-y-4 max-h-[46vh] overflow-y-auto pr-1">
                  {parentGroups.map(group => (
                    <div 
                      key={group.parentId} 
                      className="p-3.5 rounded-xl border border-[#EAE8E1] dark:border-[#2A2926] bg-white dark:bg-[#20201E] space-y-2.5 shadow-2xs"
                    >
                      {/* Family Header */}
                      <div className="flex items-center justify-between border-b border-[#EAE8E1] dark:border-[#2A2926] pb-1.5">
                        <h4 className="font-bold text-xs text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                          <span>{group.parentName}</span>
                        </h4>
                        <span className="text-[11px] text-neutral-400">
                          {group.availableChildren.length} available · {group.unavailableChildren.length} unavailable
                        </span>
                      </div>

                      {/* Children List */}
                      <div className="space-y-1.5">
                        {/* 1. Available children with interactive checkbox */}
                        {group.availableChildren.map(child => {
                          const isChecked = selectedChildIds.includes(child.id);
                          return (
                            <label
                              key={child.id}
                              className={`flex items-center justify-between p-2 px-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-[#FAF8F2] dark:bg-[#2A271E] border-[#C59B27]/40 dark:border-[#C59B27]/60 text-neutral-900 dark:text-neutral-100 font-medium'
                                  : 'bg-[#FAF9F6]/50 dark:bg-[#1A1917]/50 border-[#EAE8E1] dark:border-[#2E2C28] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-[#252422]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleChild(child.id)}
                                  className="w-4 h-4 rounded text-[#C59B27] border-[#C59B27]/50 focus:ring-[#C59B27] cursor-pointer"
                                />
                                <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                                  {child.fullName}
                                </span>
                                <span className="text-neutral-400 font-normal">
                                  — {child.age ? `${child.age}y` : 'Age N/A'} {child.ageGroup ? `(${child.ageGroup})` : ''}
                                </span>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 dark:bg-[#262520] text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-[#3A3835] shrink-0">
                                {formatStatus(child.entryStatus)}
                              </span>
                            </label>
                          );
                        })}

                        {/* 2. Unavailable children with disabled checkbox and reason */}
                        {group.unavailableChildren.map(({ child, reason: unavailableReason }) => (
                          <div
                            key={child.id}
                            className="flex items-center justify-between p-2 px-3 rounded-lg border border-[#EAE8E1]/60 dark:border-[#2A2926]/60 bg-neutral-50/50 dark:bg-[#191917]/50 text-xs opacity-60 cursor-not-allowed"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                disabled
                                checked={false}
                                className="w-4 h-4 rounded text-neutral-300 border-neutral-300 cursor-not-allowed opacity-50"
                              />
                              <span className="font-normal text-neutral-600 dark:text-neutral-400 truncate">
                                {child.fullName}
                              </span>
                              <span className="text-neutral-400">
                                — {child.age ? `${child.age}y` : 'Age N/A'}
                              </span>
                            </div>
                            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 italic text-right shrink-0">
                              {unavailableReason}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-4 border-t border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-between gap-3 bg-white dark:bg-[#21211E] shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3.5 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-[#262520] hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {resultsSummary ? 'Done' : 'Cancel'}
          </button>

          {!resultsSummary && (
            <button
              type="button"
              disabled={submitting || selectedChildIds.length === 0}
              onClick={handleConfirm}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${config.btnClass}`}
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>{config.getButtonLabel(selectedChildIds.length)}</span>
            </button>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
};
