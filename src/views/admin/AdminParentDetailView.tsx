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
      <div className="text-center py-16 bg-white border border-[#EAE8E1] rounded-3xl p-8 max-w-lg mx-auto mt-8">
        <Users className="w-8 h-8 stroke-[1.5] mx-auto text-zinc-300 mb-3" />
        <h3 className="text-base font-semibold text-[#18181B]">Parent profile not found</h3>
        <p className="text-xs text-zinc-400 mt-1">
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
      <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4 text-amber-600">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-base text-[#18181B]">
            Remove this parent?
          </h4>
        </div>
        <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
          Their account will move to Removed and can be restored later.
        </p>
        <form onSubmit={handleRemoveParentSubmit} className="space-y-4">
          <div>
            <label className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
              Reason for removal (optional)
            </label>
            <textarea
              placeholder="State a reason for your records..."
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              rows={3}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-red-400 transition-all bg-zinc-50 resize-none text-zinc-700"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
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
      <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center gap-3 text-emerald-600 mb-4">
          <RotateCcw className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-base text-[#18181B]">
            Restore this parent?
          </h4>
        </div>
        <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
          This parent will be restored and will appear under Active parents again.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
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
    <div className="space-y-6 text-zinc-800 pb-12" id="admin-parent-detail-root">
      {/* Portal modals */}
      {removeModal}
      {restoreModal}

      {/* Archive Warning Banner */}
      {parent.isDeleted && (
        <div
          className="bg-red-50/70 border border-red-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-900 animate-fade-in"
          id="archived-parent-banner"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-950">This parent account is currently removed.</p>
              <p className="text-red-700 mt-0.5">
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#EAE8E1]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 text-zinc-400 hover:text-[#18181B] hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer focus:outline-none"
            title="Back to parents"
            aria-label="Back to parents"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <button
                onClick={onBack}
                className="hover:text-zinc-700 transition-colors cursor-pointer focus:outline-none"
              >
                Parents
              </button>
              <span>/</span>
              <span className="text-zinc-600 font-medium truncate max-w-[200px] sm:max-w-none">
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
                className="text-xs px-4 py-2 border border-[#EAE8E1]"
              >
                <Edit3 className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                {isEditing ? 'Cancel' : 'Edit details'}
              </Button>
              <Button
                onClick={() => setParentToRemove(parent)}
                variant="secondary"
                className="text-xs px-4 py-2 text-zinc-600 hover:text-red-600 hover:bg-red-50 hover:border-red-200"
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
        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 shadow-xs max-w-2xl mx-auto">
          <h3 className="text-sm font-semibold text-[#18181B] border-b border-[#EAE8E1] pb-3 mb-5">
            Edit contact details
          </h3>

          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-zinc-500 font-medium block mb-1">Full name</label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div>
                <label className="text-zinc-500 font-medium block mb-1">Phone</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div>
                <label className="text-zinc-500 font-medium block mb-1">WhatsApp</label>
                <input
                  type="text"
                  value={editForm.whatsapp}
                  onChange={(e) => setEditForm({ ...editForm, whatsapp: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-zinc-500 font-medium block mb-1">Address</label>
                <input
                  type="text"
                  value={editForm.homeAddress}
                  onChange={(e) => setEditForm({ ...editForm, homeAddress: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div>
                <label className="text-zinc-500 font-medium block mb-1">City</label>
                <input
                  type="text"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div>
                <label className="text-zinc-500 font-medium block mb-1">State / Region</label>
                <input
                  type="text"
                  value={editForm.stateRegion}
                  onChange={(e) => setEditForm({ ...editForm, stateRegion: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div>
                <label className="text-zinc-500 font-medium block mb-1">Preferred contact mode</label>
                <select
                  value={editForm.preferredContact}
                  onChange={(e) => setEditForm({ ...editForm, preferredContact: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors cursor-pointer"
                >
                  <option value="phone">Phone calls</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                </select>
              </div>

              <div className="flex items-center pt-5 pl-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={editForm.isKoinoniaWorker}
                    onChange={(e) => setEditForm({ ...editForm, isKoinoniaWorker: e.target.checked })}
                    className="rounded text-[#C59B27] focus:ring-[#C59B27] w-4 h-4 border-zinc-300 cursor-pointer"
                  />
                  <span>Team member</span>
                </label>
              </div>

              {editForm.isKoinoniaWorker && (
                <div className="sm:col-span-2">
                  <label className="text-zinc-500 font-medium block mb-1">Department / Ministry</label>
                  <input
                    type="text"
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                    className="w-full px-3.5 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27] transition-colors"
                    placeholder="e.g. Children's ministry, Media, Hospitality"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#EAE8E1] mt-6">
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
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6">
              <div className="flex flex-col items-center text-center">
                {parent.photoUrl ? (
                  <img
                    src={parent.photoUrl}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="w-20 h-20 rounded-2xl object-cover border border-[#EAE8E1] mb-3 shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-[#FAF9F6] border border-[#EAE8E1] flex items-center justify-center text-[#C59B27] font-semibold text-2xl uppercase mb-3 shrink-0">
                    {initials}
                  </div>
                )}

                <h3
                  className="font-serif-koinonia text-xl font-bold text-[#18181B] tracking-tight leading-snug"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {displayName}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">{parent.email || 'Not provided'}</p>

                {/* Account Status Badges */}
                <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                  {parent.isDeleted ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
                      Removed
                    </span>
                  ) : parent.emailVerified ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Verified
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      Invitation pending
                    </span>
                  )}
                  {parent.isKoinoniaWorker && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#FAF6EC] text-[#C59B27] border border-[#C59B27]/20">
                      Team member{parent.department ? ` • ${parent.department}` : ''}
                    </span>
                  )}
                </div>

                {/* Primary Contact Actions (Only rendered if phone or whatsapp exists) */}
                {(parent.phone || parent.whatsapp) && (
                  <div className="grid grid-cols-2 gap-2 w-full mt-5 pt-5 border-t border-[#EAE8E1]">
                    {parent.phone ? (
                      <a
                        href={`tel:${parent.phone}`}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 bg-zinc-50 hover:bg-zinc-100 border border-[#EAE8E1] rounded-xl transition-colors cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
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
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer"
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
                      className="w-full py-1.5 text-xs text-amber-800 hover:text-amber-900 bg-amber-50/50 hover:bg-amber-50 border border-amber-200/60 rounded-xl transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3 h-3 text-[#C59B27]" />
                      <span>{resendingInvite ? 'Sending invitation...' : 'Resend invitation'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Contact Details Card */}
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-semibold text-[#18181B] pb-2 border-b border-[#EAE8E1]">
                Contact details
              </h4>

              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-400 block mb-0.5">Phone</span>
                  <span className="font-medium text-zinc-700 block">{parent.phone || 'Not provided'}</span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 block mb-0.5">WhatsApp</span>
                  <span className="font-medium text-zinc-700 block">{parent.whatsapp || 'Not provided'}</span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 block mb-0.5">Email</span>
                  <span className="font-medium text-zinc-700 block break-all">{parent.email || 'Not provided'}</span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 block mb-0.5">Address</span>
                  <span className="font-medium text-zinc-700 block leading-relaxed">
                    {fullAddress || 'Not provided'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 block mb-0.5">Added</span>
                  <span className="font-medium text-zinc-700 block">
                    {parent.createdAt
                      ? new Date(parent.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
                      : 'Not provided'}
                  </span>
                </div>
              </div>
            </div>

            {/* Attention Checklist (if issues exist) */}
            {attention.hasIssue && (
              <div className="bg-amber-50/50 border border-amber-200/70 rounded-2xl p-5 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-amber-800 font-semibold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Items requiring attention</span>
                </div>
                <ul className="space-y-1 pl-5 list-disc text-zinc-600">
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
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-semibold text-[#18181B]">Current event</h4>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl text-center">
                  <p className="text-[10px] text-zinc-400 mb-1">Children</p>
                  <p className="text-base font-semibold text-[#18181B]">{eventSummary.childrenAdded}</p>
                </div>

                <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl text-center">
                  <p className="text-[10px] text-zinc-400 mb-1">Awaiting review</p>
                  <p className={`text-base font-semibold ${eventSummary.underReview > 0 ? 'text-amber-700' : 'text-zinc-600'}`}>
                    {eventSummary.underReview}
                  </p>
                </div>

                <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl text-center">
                  <p className="text-[10px] text-zinc-400 mb-1">Selected</p>
                  <p className={`text-base font-semibold ${eventSummary.selected > 0 ? 'text-emerald-700' : 'text-zinc-600'}`}>
                    {eventSummary.selected}
                  </p>
                </div>

                <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl text-center">
                  <p className="text-[10px] text-zinc-400 mb-1">Passes ready</p>
                  <p className={`text-base font-semibold ${eventSummary.passReady > 0 ? 'text-emerald-700' : 'text-zinc-600'}`}>
                    {eventSummary.passReady}
                  </p>
                </div>

                <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl text-center">
                  <p className="text-[10px] text-zinc-400 mb-1">Checked in</p>
                  <p className={`text-base font-semibold ${eventSummary.checkedIn > 0 ? 'text-emerald-700' : 'text-zinc-600'}`}>
                    {eventSummary.checkedIn}
                  </p>
                </div>

                <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl text-center">
                  <p className="text-[10px] text-zinc-400 mb-1">Picked up</p>
                  <p className={`text-base font-semibold ${eventSummary.pickedUp > 0 ? 'text-zinc-800' : 'text-zinc-600'}`}>
                    {eventSummary.pickedUp}
                  </p>
                </div>
              </div>
            </div>

            {/* Linked Children Section */}
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#EAE8E1]">
                <h4 className="text-xs font-semibold text-[#18181B]">Children</h4>
                {linkedChildren.length > 0 && (
                  <span className="text-xs text-zinc-400">
                    {linkedChildren.length} {linkedChildren.length === 1 ? 'child' : 'children'}
                  </span>
                )}
              </div>

              {linkedChildren.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 space-y-1.5">
                  <Users className="w-6 h-6 stroke-[1.5] mx-auto text-zinc-300" />
                  <p className="text-xs font-medium text-zinc-700">No children added yet</p>
                  <p className="text-[11px] text-zinc-400">This parent has not added any children yet.</p>
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
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : child.entryStatus === 'under_review'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-zinc-100 text-zinc-600 border-zinc-200';

                    return (
                      <div
                        key={child.id}
                        className="p-3.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl flex items-center justify-between gap-4"
                        data-child-card-id={child.id}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {child.photoUrl ? (
                            <img
                              src={child.photoUrl}
                              alt={child.fullName}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-xl object-cover border border-[#EAE8E1] shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-white border border-[#EAE8E1] flex items-center justify-center text-zinc-500 font-semibold text-xs shrink-0">
                              {child.fullName ? child.fullName.substring(0, 2).toUpperCase() : 'CH'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-xs text-[#18181B] truncate">{child.fullName}</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
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
                            className="px-3 py-1 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-[#EAE8E1] rounded-xl transition-colors cursor-pointer focus:outline-none"
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
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-semibold text-[#18181B]">Admin notes</h4>

              {/* Submit a New Note Form */}
              <form onSubmit={handleSaveNote} className="space-y-3">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add an internal note about this parent account..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] transition-all bg-zinc-50/50 resize-none text-zinc-700"
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
              <div className="space-y-3 pt-3 border-t border-[#EAE8E1] max-h-[300px] overflow-y-auto">
                {adminNotes.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-3 text-center">No notes have been added yet.</p>
                ) : (
                  adminNotes.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl text-xs space-y-1"
                      data-note-item-id={note.id}
                    >
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span className="font-semibold text-zinc-700">{note.author}</span>
                        <span>
                          {new Date(note.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="text-zinc-600 whitespace-pre-wrap leading-relaxed">{note.note}</p>
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
