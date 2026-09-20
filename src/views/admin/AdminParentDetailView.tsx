import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Users,
  Phone,
  MessageSquare,
  AlertCircle,
  Edit3,
  RotateCcw,
  AlertTriangle,
  Send
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { AppRoute } from '../../types';

interface AdminParentDetailViewProps {
  parentId: string;
  onNavigate: (route: AppRoute) => void;
  onBack: () => void;
  adminUser?: any;
}

export const AdminParentDetailView: React.FC<AdminParentDetailViewProps> = ({
  parentId,
  onNavigate,
  onBack
}) => {
  const { showError, showSuccess } = useNotification();

  // Data State
  const [loading, setLoading] = useState(true);
  const [parent, setParent] = useState<any | null>(null);
  const [linkedChildren, setLinkedChildren] = useState<any[]>([]);
  const [eventSummary, setEventSummary] = useState<any>({
    childrenAdded: 0,
    selected: 0,
    underReview: 0,
    passReady: 0,
    checkedIn: 0,
    pickedUp: 0
  });
  const [attention, setAttention] = useState<any>({
    hasIssue: false,
    message: 'No parent issue found',
    items: []
  });
  const [adminNotes, setAdminNotes] = useState<any[]>([]);

  // Interaction State
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [resendingInvite, setResendingInvite] = useState(false);

  // Confirmation states
  const [parentToRemove, setParentToRemove] = useState<any | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [submittingRemove, setSubmittingRemove] = useState(false);

  const [parentToRestore, setParentToRestore] = useState<any | null>(null);
  const [submittingRestore, setSubmittingRestore] = useState(false);

  // Edit Form State
  const [editForm, setEditForm] = useState({
    fullName: '',
    phone: '',
    whatsapp: '',
    homeAddress: '',
    preferredContact: 'phone',
    isKoinoniaWorker: false,
    department: '',
    country: '',
    stateRegion: '',
    city: ''
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Load Parent Record
  const fetchParentDetails = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getParentDetails(parentId);
      if (res.success) {
        setParent(res.parent);
        setLinkedChildren(res.linkedChildren || []);
        setEventSummary(res.eventSummary || {
          childrenAdded: 0,
          selected: 0,
          underReview: 0,
          passReady: 0,
          checkedIn: 0,
          pickedUp: 0
        });
        setAttention(res.attention || {
          hasIssue: false,
          message: 'No parent issue found',
          items: []
        });
        setAdminNotes(res.adminNotes || []);

        // Initialize Edit Form
        setEditForm({
          fullName: res.parent.fullName || '',
          phone: res.parent.phone || '',
          whatsapp: res.parent.whatsapp || '',
          homeAddress: res.parent.homeAddress || '',
          preferredContact: res.parent.preferredContact || 'phone',
          isKoinoniaWorker: Boolean(res.parent.isKoinoniaWorker),
          department: res.parent.department || '',
          country: res.parent.country || '',
          stateRegion: res.parent.stateRegion || '',
          city: res.parent.city || ''
        });
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Unable to load parent record', parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (parentId) {
      fetchParentDetails();
    }
  }, [parentId]);

  // Handle Note Save
  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await api.admin.saveParentNote(parentId, newNote.trim());
      if (res.success) {
        showSuccess('Note saved', 'Your note has been added to this parent record.');
        setNewNote('');
        if (res.note) {
          setAdminNotes(prev => [res.note, ...prev]);
        } else {
          fetchParentDetails();
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Unable to save note', parsed.message);
    } finally {
      setSavingNote(false);
    }
  };

  // Handle Edit Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const res = await api.admin.updateParentProfile(parentId, editForm);
      if (res.success) {
        showSuccess('Details updated', 'Parent contact details have been updated.');
        setIsEditing(false);
        await fetchParentDetails();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Update failed', parsed.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleResendInvite = async () => {
    if (!parent?.userId && !parent?.email) return;
    setResendingInvite(true);
    try {
      const res = await api.admin.resendInvite({
        userId: parent.userId,
        email: parent.email
      });
      if (res.success) {
        showSuccess('Invitation sent', res.message || 'An invitation link has been resent.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Failed to send invitation', parsed.message || 'Could not resend invitation email.');
    } finally {
      setResendingInvite(false);
    }
  };

  const handleRemoveParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentToRemove) return;
    setSubmittingRemove(true);
    try {
      const res = await api.admin.removeParent(parentId, removeReason);
      if (res.success) {
        showSuccess('Parent removed', 'Their account will move to Removed and can be restored later.');
        setParentToRemove(null);
        setRemoveReason('');
        await fetchParentDetails();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action failed', parsed.message);
    } finally {
      setSubmittingRemove(false);
    }
  };

  const handleRestoreParentSubmit = async () => {
    if (!parentToRestore) return;
    setSubmittingRestore(true);
    try {
      const res = await api.admin.restoreParent(parentId);
      if (res.success) {
        showSuccess('Parent restored', 'The parent profile has been restored to Active.');
        setParentToRestore(null);
        await fetchParentDetails();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action failed', parsed.message);
    } finally {
      setSubmittingRestore(false);
    }
  };

  const getInitials = (name: any): string => {
    if (!name || typeof name !== 'string') return 'P';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'P';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const isDomReady = typeof document !== 'undefined' && Boolean(document.body);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] w-full p-6">
        <KoinoniaInlineLoader
          variant="skeleton"
          size="lg"
          label="Loading parent record..."
          centered
        />
      </div>
    );
  }

  if (!parent) {
    return (
      <div className="text-center py-16 bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-3xl p-8 max-w-lg mx-auto mt-8">
        <Users className="w-8 h-8 stroke-[1.5] mx-auto text-zinc-300 dark:text-[#5A5550] mb-3" />
        <h3 className="text-base font-semibold text-[#18181B] dark:text-[#F0EBE3]">Parent profile not found</h3>
        <p className="text-xs text-zinc-400 dark:text-[#7A7570] mt-1">
          The requested parent record could not be found or may have been removed.
        </p>
        <Button onClick={onBack} variant="secondary" className="mt-5 text-xs px-5 py-2">
          Back to parents
        </Button>
      </div>
    );
  }

  const rawName = typeof parent.fullName === 'string' ? parent.fullName.trim() : '';
  const isInvitedPlaceholder = !rawName || rawName.toLowerCase() === 'invited user';
  const displayName = isInvitedPlaceholder ? 'Invited parent' : rawName;
  const initials = getInitials(displayName);

  const fullAddress = [parent.homeAddress, parent.city, parent.stateRegion, parent.country]
    .filter(Boolean)
    .join(', ');

  // Portal Modals
  const removeModal = (parentToRemove && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => setParentToRemove(null)}
        className="fixed inset-0 bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-3xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-base text-[#18181B] dark:text-[#F0EBE3]">
            Remove this parent?
          </h4>
        </div>
        <p className="text-xs text-zinc-500 dark:text-[#B8B0A5] mb-4 leading-relaxed">
          Their account will move to Removed and can be restored later.
        </p>
        <form onSubmit={handleRemoveParentSubmit} className="space-y-4">
          <div>
            <label className="text-zinc-500 dark:text-[#7A7570] text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
              Reason for removal (optional)
            </label>
            <textarea
              placeholder="State a reason for your records..."
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              rows={3}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] focus:outline-none focus:border-red-400 transition-all bg-zinc-50 dark:bg-[#262520] resize-none text-zinc-700 dark:text-[#F0EBE3]"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#302E29]">
            <Button
              type="button"
              onClick={() => setParentToRemove(null)}
              variant="secondary"
              className="px-4 py-2 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submittingRemove}
              disabled={submittingRemove}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 text-xs font-semibold rounded-xl focus:outline-none"
            >
              Remove parent
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  const restoreModal = (parentToRestore && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => setParentToRestore(null)}
        className="fixed inset-0 bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-3xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center gap-3 text-emerald-600 mb-4">
          <RotateCcw className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-base text-[#18181B] dark:text-[#F0EBE3]">
            Restore this parent?
          </h4>
        </div>
        <p className="text-xs text-zinc-500 dark:text-[#B8B0A5] mb-6 leading-relaxed">
          This parent will be restored and will appear under Active parents again.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#302E29]">
          <Button
            onClick={() => setParentToRestore(null)}
            variant="secondary"
            className="px-4 py-2 text-xs"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRestoreParentSubmit}
            loading={submittingRestore}
            disabled={submittingRestore}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-semibold rounded-xl focus:outline-none"
          >
            Restore parent
          </Button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="space-y-6 text-zinc-800 dark:text-[#F0EBE3] pb-12" id="admin-parent-detail-root">
      {/* Portal modals */}
      {removeModal}
      {restoreModal}

      {/* Archive Warning Banner */}
      {parent.isDeleted && (
        <div
          className="bg-red-50/70 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-900 dark:text-red-300 animate-fade-in"
          id="archived-parent-banner"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-950 dark:text-red-200">This parent account is currently removed.</p>
              <p className="text-red-700 dark:text-red-400 mt-0.5">
                Removed on{' '}
                {parent.deletedAt
                  ? new Date(parent.deletedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
                  : 'recently'}
                {parent.deletedByEmail && <> by {parent.deletedByEmail}</>}.
                {parent.deleteReason && <> Reason: "{parent.deleteReason}".</>}
              </p>
            </div>
          </div>
          <Button
            onClick={() => setParentToRestore(parent)}
            variant="primary"
            className="text-xs px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 font-medium"
            id="restore-parent-detail-banner-btn"
          >
            Restore parent
          </Button>
        </div>
      )}

      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#EAE8E1] dark:border-[#302E29]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 text-zinc-400 dark:text-[#7A7570] hover:text-[#18181B] dark:hover:text-[#F0EBE3] hover:bg-zinc-100 dark:hover:bg-[#262520] rounded-xl transition-colors cursor-pointer focus:outline-none"
            title="Back to parents"
            aria-label="Back to parents"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-[#7A7570]">
              <button
                onClick={onBack}
                className="hover:text-zinc-700 dark:hover:text-[#F0EBE3] transition-colors cursor-pointer focus:outline-none"
              >
                Parents
              </button>
              <span>/</span>
              <span className="text-zinc-600 dark:text-[#B8B0A5] font-medium truncate max-w-[200px] sm:max-w-none">
                {displayName}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {parent.isDeleted ? (
            <Button
              onClick={() => setParentToRestore(parent)}
              variant="primary"
              className="text-xs px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Restore parent
            </Button>
          ) : (
            <>
              <Button
                onClick={() => setIsEditing(!isEditing)}
                variant="secondary"
                className="text-xs px-4 py-2 border border-[#EAE8E1] dark:border-[#3A3835]"
              >
                <Edit3 className="w-3.5 h-3.5 mr-1.5 text-zinc-400 dark:text-[#7A7570]" />
                {isEditing ? 'Cancel' : 'Edit details'}
              </Button>
              <Button
                onClick={() => setParentToRemove(parent)}
                variant="secondary"
                className="text-xs px-4 py-2 text-zinc-600 dark:text-[#B8B0A5] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200 dark:hover:border-red-900/40"
                id="remove-parent-detail-btn"
              >
                Remove parent
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Edit Details Form or Balanced Profile Layout */}
      {isEditing ? (
        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-6 shadow-xs max-w-2xl mx-auto">
          <h3 className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3] border-b border-[#EAE8E1] dark:border-[#302E29] pb-3 mb-5">
            Edit contact details
          </h3>

          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-zinc-500 dark:text-[#7A7570] font-medium block mb-1">Full name</label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] dark:border-[#3A3835] bg-zinc-50 dark:bg-[#262520] text-zinc-800 dark:text-[#F0EBE3] rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div>
                <label className="text-zinc-500 dark:text-[#7A7570] font-medium block mb-1">Phone</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] dark:border-[#3A3835] bg-zinc-50 dark:bg-[#262520] text-zinc-800 dark:text-[#F0EBE3] rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div>
                <label className="text-zinc-500 dark:text-[#7A7570] font-medium block mb-1">WhatsApp</label>
                <input
                  type="text"
                  value={editForm.whatsapp}
                  onChange={(e) => setEditForm({ ...editForm, whatsapp: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] dark:border-[#3A3835] bg-zinc-50 dark:bg-[#262520] text-zinc-800 dark:text-[#F0EBE3] rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-zinc-500 dark:text-[#7A7570] font-medium block mb-1">Address</label>
                <input
                  type="text"
                  value={editForm.homeAddress}
                  onChange={(e) => setEditForm({ ...editForm, homeAddress: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] dark:border-[#3A3835] bg-zinc-50 dark:bg-[#262520] text-zinc-800 dark:text-[#F0EBE3] rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div>
                <label className="text-zinc-500 dark:text-[#7A7570] font-medium block mb-1">City</label>
                <input
                  type="text"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] dark:border-[#3A3835] bg-zinc-50 dark:bg-[#262520] text-zinc-800 dark:text-[#F0EBE3] rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div>
                <label className="text-zinc-500 dark:text-[#7A7570] font-medium block mb-1">State / Region</label>
                <input
                  type="text"
                  value={editForm.stateRegion}
                  onChange={(e) => setEditForm({ ...editForm, stateRegion: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] dark:border-[#3A3835] bg-zinc-50 dark:bg-[#262520] text-zinc-800 dark:text-[#F0EBE3] rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div>
                <label className="text-zinc-500 dark:text-[#7A7570] font-medium block mb-1">Preferred contact mode</label>
                <select
                  value={editForm.preferredContact}
                  onChange={(e) => setEditForm({ ...editForm, preferredContact: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] dark:border-[#3A3835] bg-zinc-50 dark:bg-[#262520] text-zinc-800 dark:text-[#F0EBE3] rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors cursor-pointer"
                >
                  <option value="phone">Phone calls</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                </select>
              </div>

              <div className="flex items-center pt-5 pl-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-zinc-700 dark:text-[#B8B0A5]">
                  <input
                    type="checkbox"
                    checked={editForm.isKoinoniaWorker}
                    onChange={(e) => setEditForm({ ...editForm, isKoinoniaWorker: e.target.checked })}
                    className="rounded text-[#C59B27] focus:ring-[#C59B27] w-4 h-4 border-zinc-300 dark:border-[#3A3835] cursor-pointer"
                  />
                  <span>Team member</span>
                </label>
              </div>

              {editForm.isKoinoniaWorker && (
                <div className="sm:col-span-2">
                  <label className="text-zinc-500 dark:text-[#7A7570] font-medium block mb-1">Department / Ministry</label>
                  <input
                    type="text"
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                    className="w-full px-3.5 py-2 border border-[#EAE8E1] dark:border-[#3A3835] bg-zinc-50 dark:bg-[#262520] text-zinc-800 dark:text-[#F0EBE3] rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                    placeholder="e.g. Children's ministry, Media, Hospitality"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#EAE8E1] dark:border-[#302E29] mt-6">
              <Button
                type="button"
                onClick={() => setIsEditing(false)}
                variant="secondary"
                className="px-4 py-2 text-xs"
              >
                Discard changes
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={savingEdit}
                disabled={savingEdit}
                className="px-5 py-2 text-xs font-medium"
              >
                Save changes
              </Button>
            </div>
          </form>
        </div>
      ) : (
        /* Balanced Two-Column Person Profile Layout */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT COLUMN: Identity & Contact (Narrower) */}
          <div className="lg:col-span-1 space-y-6">

            {/* Parent Identity Card */}
            <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-6">
              <div className="flex flex-col items-center text-center">
                {parent.photoUrl ? (
                  <img
                    src={parent.photoUrl}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="w-20 h-20 rounded-2xl object-cover border border-[#EAE8E1] dark:border-[#3A3835] mb-3 shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] flex items-center justify-center text-[#C59B27] font-semibold text-2xl uppercase mb-3 shrink-0">
                    {initials}
                  </div>
                )}

                <h3 className="font-sans text-xl font-bold text-[#18181B] dark:text-[#F0EBE3] tracking-tight leading-snug">
                  {displayName}
                </h3>
                <p className="text-xs text-zinc-400 dark:text-[#7A7570] mt-0.5">{parent.email || 'Not provided'}</p>

                {/* Account Status Badges */}
                <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                  {parent.isDeleted ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/40">
                      Removed
                    </span>
                  ) : parent.emailVerified ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40">
                      Verified
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40">
                      Invitation pending
                    </span>
                  )}
                  {parent.isKoinoniaWorker && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#FAF6EC] dark:bg-amber-950/30 text-[#C59B27] dark:text-amber-400 border border-[#C59B27]/20 dark:border-amber-900/40">
                      Team member{parent.department ? ` • ${parent.department}` : ''}
                    </span>
                  )}
                </div>

                {/* Primary Contact Actions (Only rendered if phone or whatsapp exists) */}
                {(parent.phone || parent.whatsapp) && (
                  <div className="grid grid-cols-2 gap-2 w-full mt-5 pt-5 border-t border-[#EAE8E1] dark:border-[#302E29]">
                    {parent.phone ? (
                      <a
                        href={`tel:${parent.phone}`}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-[#F0EBE3] bg-zinc-50 dark:bg-[#262520] hover:bg-zinc-100 dark:hover:bg-[#2A2926] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl transition-colors cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5 text-zinc-400 dark:text-[#7A7570] shrink-0" />
                        <span>Call parent</span>
                      </a>
                    ) : (
                      <div />
                    )}
                    {parent.whatsapp && (
                      <a
                        href={`https://wa.me/${parent.whatsapp.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-900/40 rounded-xl transition-colors cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Resend Invite Option if Account is Unverified */}
                {!parent.emailVerified && !parent.isDeleted && parent.email && (
                  <div className="w-full mt-3">
                    <button
                      onClick={handleResendInvite}
                      disabled={resendingInvite}
                      className="w-full py-1.5 text-xs text-amber-800 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-xl transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3 h-3 text-[#C59B27]" />
                      <span>{resendingInvite ? 'Sending invitation...' : 'Resend invitation'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Contact Details Card */}
            <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3] pb-2 border-b border-[#EAE8E1] dark:border-[#302E29]">
                Contact details
              </h4>

              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-400 dark:text-[#5A5550] block mb-0.5">Phone</span>
                  <span className="font-medium text-zinc-700 dark:text-[#F0EBE3] block">{parent.phone || 'Not provided'}</span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 dark:text-[#5A5550] block mb-0.5">WhatsApp</span>
                  <span className="font-medium text-zinc-700 dark:text-[#F0EBE3] block">{parent.whatsapp || 'Not provided'}</span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 dark:text-[#5A5550] block mb-0.5">Email</span>
                  <span className="font-medium text-zinc-700 dark:text-[#F0EBE3] block break-all">{parent.email || 'Not provided'}</span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 dark:text-[#5A5550] block mb-0.5">Address</span>
                  <span className="font-medium text-zinc-700 dark:text-[#F0EBE3] block leading-relaxed">
                    {fullAddress || 'Not provided'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 dark:text-[#5A5550] block mb-0.5">Added</span>
                  <span className="font-medium text-zinc-700 dark:text-[#F0EBE3] block">
                    {parent.createdAt
                      ? new Date(parent.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
                      : 'Not provided'}
                  </span>
                </div>
              </div>
            </div>

            {/* Attention Checklist (if issues exist) */}
            {attention.hasIssue && (
              <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 rounded-2xl p-5 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-semibold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Items requiring attention</span>
                </div>
                <ul className="space-y-1 pl-5 list-disc text-zinc-600 dark:text-[#B8B0A5]">
                  {attention.items.map((item: string, idx: number) => (
                    <li key={idx} className="leading-snug">{item}</li>
                  ))}
                </ul>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: Event, Children & Notes (Wider) */}
          <div className="lg:col-span-2 space-y-6">

            {/* Current Event Summary Strip */}
            <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3]">Current event</h4>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                <div className="p-3 bg-[#FAF9F6] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl text-center">
                  <p className="text-[10px] text-zinc-400 dark:text-[#5A5550] mb-1">Children</p>
                  <p className="text-base font-semibold text-[#18181B] dark:text-[#F0EBE3]">{eventSummary.childrenAdded}</p>
                </div>

                <div className="p-3 bg-[#FAF9F6] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl text-center">
                  <p className="text-[10px] text-zinc-400 dark:text-[#5A5550] mb-1">Awaiting review</p>
                  <p className={`text-base font-semibold ${eventSummary.underReview > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-600 dark:text-[#7A7570]'}`}>
                    {eventSummary.underReview}
                  </p>
                </div>

                <div className="p-3 bg-[#FAF9F6] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl text-center">
                  <p className="text-[10px] text-zinc-400 dark:text-[#5A5550] mb-1">Selected</p>
                  <p className={`text-base font-semibold ${eventSummary.selected > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-600 dark:text-[#7A7570]'}`}>
                    {eventSummary.selected}
                  </p>
                </div>

                <div className="p-3 bg-[#FAF9F6] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl text-center">
                  <p className="text-[10px] text-zinc-400 dark:text-[#5A5550] mb-1">Passes ready</p>
                  <p className={`text-base font-semibold ${eventSummary.passReady > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-600 dark:text-[#7A7570]'}`}>
                    {eventSummary.passReady}
                  </p>
                </div>

                <div className="p-3 bg-[#FAF9F6] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl text-center">
                  <p className="text-[10px] text-zinc-400 dark:text-[#5A5550] mb-1">Checked in</p>
                  <p className={`text-base font-semibold ${eventSummary.checkedIn > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-600 dark:text-[#7A7570]'}`}>
                    {eventSummary.checkedIn}
                  </p>
                </div>

                <div className="p-3 bg-[#FAF9F6] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl text-center">
                  <p className="text-[10px] text-zinc-400 dark:text-[#5A5550] mb-1">Picked up</p>
                  <p className={`text-base font-semibold ${eventSummary.pickedUp > 0 ? 'text-zinc-800 dark:text-[#F0EBE3]' : 'text-zinc-600 dark:text-[#7A7570]'}`}>
                    {eventSummary.pickedUp}
                  </p>
                </div>
              </div>
            </div>

            {/* Linked Children Section */}
            <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#EAE8E1] dark:border-[#302E29]">
                <h4 className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3]">Children</h4>
                {linkedChildren.length > 0 && (
                  <span className="text-xs text-zinc-400 dark:text-[#7A7570]">
                    {linkedChildren.length} {linkedChildren.length === 1 ? 'child' : 'children'}
                  </span>
                )}
              </div>

              {linkedChildren.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 dark:text-[#5A5550] space-y-1.5">
                  <Users className="w-6 h-6 stroke-[1.5] mx-auto text-zinc-300 dark:text-[#5A5550]" />
                  <p className="text-xs font-medium text-zinc-700 dark:text-[#B8B0A5]">No children added yet</p>
                  <p className="text-[11px] text-zinc-400 dark:text-[#7A7570]">This parent has not added any children yet.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {linkedChildren.map((child: any) => {
                    const statusText =
                      child.entryStatus === 'selected' ? 'Selected' :
                      child.entryStatus === 'pass_ready' ? 'Pass ready' :
                      child.entryStatus === 'under_review' ? 'Awaiting review' :
                      child.entryStatus === 'not_registered' ? 'Not registered' :
                      child.entryStatus?.replace('_', ' ') || 'Not registered';

                    const statusClass =
                      child.entryStatus === 'selected' || child.entryStatus === 'pass_ready'
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40'
                        : child.entryStatus === 'under_review'
                        ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/40'
                        : 'bg-zinc-100 dark:bg-[#262520] text-zinc-600 dark:text-[#7A7570] border-zinc-200 dark:border-[#3A3835]';

                    return (
                      <div
                        key={child.id}
                        className="p-3.5 bg-[#FAF9F6] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl flex items-center justify-between gap-4"
                        data-child-card-id={child.id}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {child.photoUrl ? (
                            <img
                              src={child.photoUrl}
                              alt={child.fullName}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-xl object-cover border border-[#EAE8E1] dark:border-[#3A3835] shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] flex items-center justify-center text-zinc-500 dark:text-[#7A7570] font-semibold text-xs shrink-0">
                              {child.fullName ? child.fullName.substring(0, 2).toUpperCase() : 'CH'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-xs text-[#18181B] dark:text-[#F0EBE3] truncate">{child.fullName}</p>
                            <p className="text-[11px] text-zinc-400 dark:text-[#7A7570] mt-0.5">
                              {[child.gender, child.ageLabel, child.ageGroup].filter(Boolean).join(' • ')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize ${statusClass}`}>
                            {statusText}
                          </span>
                          <button
                            onClick={() => onNavigate(`/admin/children/${child.id}` as AppRoute)}
                            className="px-3 py-1 text-xs font-medium text-zinc-700 dark:text-[#F0EBE3] bg-white dark:bg-[#262520] hover:bg-zinc-50 dark:hover:bg-[#2A2926] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl transition-colors cursor-pointer focus:outline-none"
                          >
                            View child
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Admin Notes Section */}
            <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3]">Admin notes</h4>

              {/* Submit a New Note Form */}
              <form onSubmit={handleSaveNote} className="space-y-3">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add an internal note about this parent account..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] focus:outline-none focus:border-[#C59B27] transition-all bg-zinc-50/50 dark:bg-[#262520] resize-none text-zinc-700 dark:text-[#F0EBE3] placeholder:text-zinc-400 dark:placeholder:text-[#5A5550]"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={savingNote}
                    disabled={savingNote || !newNote.trim()}
                    className="text-xs px-4 py-2"
                  >
                    Save note
                  </Button>
                </div>
              </form>

              {/* Notes History list */}
              <div className="space-y-3 pt-3 border-t border-[#EAE8E1] dark:border-[#302E29] max-h-[300px] overflow-y-auto">
                {adminNotes.length === 0 ? (
                  <p className="text-xs text-zinc-400 dark:text-[#7A7570] py-3 text-center">No notes have been added yet.</p>
                ) : (
                  adminNotes.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 bg-[#FAF9F6] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl text-xs space-y-1"
                      data-note-item-id={note.id}
                    >
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-[#7A7570]">
                        <span className="font-semibold text-zinc-700 dark:text-[#F0EBE3]">{note.author}</span>
                        <span>
                          {new Date(note.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="text-zinc-600 dark:text-[#B8B0A5] whitespace-pre-wrap leading-relaxed">{note.note}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
