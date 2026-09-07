import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  Search,
  RotateCcw,
  Trash2,
  Plus,
  MoreHorizontal,
  AlertTriangle
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { AddParentModal } from '../../components/admin/modals/AddParentModal';
import { AppRoute } from '../../types';

interface AdminParentsViewProps {
  onBackToOverview?: () => void;
  onNavigate: (route: AppRoute) => void;
}

type ParentTab = 'active' | 'removed';

export const AdminParentsView: React.FC<AdminParentsViewProps> = ({ onNavigate }) => {
  const { showError, showSuccess } = useNotification();
  const [parents, setParents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ParentTab>('active');

  // Stats across active parents
  const [stats, setStats] = useState({
    parents: 0,
    childrenLinked: 0,
    teamMembers: 0,
    whatsAppAvailable: 0
  });

  // Overflow menu state per row
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  // Soft remove confirmation modal
  const [parentToRemove, setParentToRemove] = useState<any | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [submittingRemove, setSubmittingRemove] = useState(false);

  // Restore confirmation modal
  const [parentToRestore, setParentToRestore] = useState<any | null>(null);
  const [submittingRestore, setSubmittingRestore] = useState(false);

  // Permanent delete modal
  const [parentToDelete, setParentToDelete] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // Add parent modal
  const [showAddParentModal, setShowAddParentModal] = useState(false);

  const fetchParents = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getParents({ q: searchQuery, status: activeTab });
      if (res.success) {
        const list = res.parents || [];
        setParents(list);

        // Update overall summary statistics when looking at active tab without search filters
        if (activeTab === 'active' && !searchQuery.trim()) {
          setStats({
            parents: list.length,
            childrenLinked: list.reduce((sum: number, p: any) => sum + Number(p.childrenCount || 0), 0),
            teamMembers: list.filter((p: any) => p.isKoinoniaWorker).length,
            whatsAppAvailable: list.filter((p: any) => Boolean(p.whatsapp && String(p.whatsapp).trim())).length
          });
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Unable to load parents', parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParents();
  }, [searchQuery, activeTab]);

  // Close overflow action menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTabChange = (tab: ParentTab) => {
    setActiveTab(tab);
    setOpenActionMenuId(null);
  };

  const handleRemoveParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentToRemove) return;
    setSubmittingRemove(true);
    try {
      const res = await api.admin.removeParent(parentToRemove.id, removeReason);
      if (res.success) {
        showSuccess('Parent removed', 'Their account will move to Removed and can be restored later.');
        setParentToRemove(null);
        setRemoveReason('');
        setOpenActionMenuId(null);
        fetchParents();
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
      const res = await api.admin.restoreParent(parentToRestore.id);
      if (res.success) {
        showSuccess('Parent restored', 'The parent profile has been restored to Active.');
        setParentToRestore(null);
        setOpenActionMenuId(null);
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action failed', parsed.message);
    } finally {
      setSubmittingRestore(false);
    }
  };

  const handlePermanentDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentToDelete) return;
    if (deleteConfirmationText !== 'DELETE') {
      showError('Confirmation required', 'Please type DELETE to confirm.');
      return;
    }
    if (!deleteReason.trim()) {
      showError('Reason required', 'Please specify a reason for deletion.');
      return;
    }
    setSubmittingDelete(true);
    try {
      const res = await api.admin.permanentlyDeleteParent(parentToDelete.id, {
        reason: deleteReason,
        confirmation: deleteConfirmationText
      });
      if (res.success) {
        showSuccess('Parent permanently deleted', 'Contact details have been removed and login access revoked.');
        setParentToDelete(null);
        setDeleteReason('');
        setDeleteConfirmationText('');
        setOpenActionMenuId(null);
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action failed', parsed.message);
    } finally {
      setSubmittingDelete(false);
    }
  };

  const getInitials = (name: any): string => {
    if (!name || typeof name !== 'string') return 'P';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'P';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getDisplayName = (p: any): string => {
    const raw = typeof p?.fullName === 'string' ? p.fullName.trim() : '';
    if (!raw || raw.toLowerCase() === 'invited user') return 'Invited parent';
    return raw;
  };

  const formatChildrenCount = (count: number): string => {
    if (count === 1) return '1 child';
    return `${count} children`;
  };

  const isDomReady = typeof document !== 'undefined' && Boolean(document.body);

  // ---- PORTAL MODALS ----
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

  const permanentDeleteModal = (parentToDelete && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => setParentToDelete(null)}
        style={{ backdropFilter: 'blur(2px)' }}
      />
      <div className="relative bg-[#FFFDF9] border border-red-200 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-2 text-red-600">
          <Trash2 className="w-5 h-5 shrink-0" />
          <h3 className="font-semibold text-base text-[#18181B]">Delete parent permanently</h3>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">
          You are about to permanently delete and anonymise the profile for <strong>{getDisplayName(parentToDelete)}</strong>.
        </p>
        <div className="text-xs bg-red-50 text-red-700 p-3.5 rounded-xl border border-red-100 space-y-1.5">
          <span className="font-semibold block">This action is irreversible</span>
          <ul className="list-disc pl-4 space-y-1 text-[11px] text-red-600">
            <li>Contact details (email, phone, home address) will be permanently removed.</li>
            <li>Login credentials will be permanently revoked.</li>
            <li>Child registration and event records will be preserved as "Deleted parent".</li>
          </ul>
        </div>
        <form onSubmit={handlePermanentDeleteSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Reason (required)
            </label>
            <textarea
              required
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Explain why this profile is being permanently deleted..."
              className="w-full h-16 px-3 py-2 text-xs border border-red-100 bg-zinc-50 rounded-xl focus:outline-none focus:border-red-400 transition-all resize-none text-zinc-700"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Type <span className="text-red-600 font-bold">DELETE</span> to confirm
            </label>
            <input
              required
              type="text"
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 text-xs border border-red-100 bg-zinc-50 rounded-xl focus:outline-none focus:border-red-400 transition-all text-zinc-700"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
            <Button
              type="button"
              onClick={() => setParentToDelete(null)}
              variant="secondary"
              className="px-4 py-2 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submittingDelete}
              disabled={submittingDelete || deleteConfirmationText !== 'DELETE' || !deleteReason.trim()}
              className="px-5 py-2 text-xs bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold disabled:opacity-50"
            >
              Delete permanently
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div
      className="space-y-6"
      data-view-version="admin-parents-refined"
      id="admin-parents-module-root"
    >
      {/* Portal modals */}
      {removeModal}
      {restoreModal}
      {permanentDeleteModal}

      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-[#EAE8E1]">
        <div>
          <h2
            className="font-serif-koinonia text-2xl font-bold text-[#18181B] tracking-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Parents
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            View parent details, contact information and the children connected to each account.
          </p>
        </div>
        <Button
          onClick={() => setShowAddParentModal(true)}
          variant="primary"
          className="text-xs px-4 py-2 flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add parent</span>
        </Button>
      </div>

      {/* 2. Restrained Summary Strip */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl px-6 py-4">
        <div className="flex items-center divide-x divide-[#EAE8E1] overflow-x-auto">
          <div className="pr-8 shrink-0">
            <p className="text-[10px] text-zinc-400 mb-0.5">Parents</p>
            <p className="text-lg font-semibold text-[#18181B]">{stats.parents}</p>
          </div>
          <div className="px-8 shrink-0">
            <p className="text-[10px] text-zinc-400 mb-0.5">Children linked</p>
            <p className="text-lg font-semibold text-zinc-700">{stats.childrenLinked}</p>
          </div>
          <div className="px-8 shrink-0">
            <p className="text-[10px] text-zinc-400 mb-0.5">Team members</p>
            <p className="text-lg font-semibold text-zinc-700">{stats.teamMembers}</p>
          </div>
          <div className="pl-8 shrink-0">
            <p className="text-[10px] text-zinc-400 mb-0.5">WhatsApp available</p>
            <p className="text-lg font-semibold text-zinc-700">{stats.whatsAppAvailable}</p>
          </div>
        </div>
      </div>

      {/* 3. Text Tabs */}
      <div className="flex border-b border-[#EAE8E1]" id="parents-directory-tabs">
        <button
          onClick={() => handleTabChange('active')}
          className={`px-4 py-2.5 text-xs font-medium transition-all border-b-2 cursor-pointer focus:outline-none ${
            activeTab === 'active'
              ? 'border-[#C59B27] text-[#18181B]'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
          id="tab-active-parents"
        >
          Active
        </button>
        <button
          onClick={() => handleTabChange('removed')}
          className={`px-4 py-2.5 text-xs font-medium transition-all border-b-2 cursor-pointer focus:outline-none ${
            activeTab === 'removed'
              ? 'border-[#C59B27] text-[#18181B]'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
          id="tab-removed-parents"
        >
          Removed
        </button>
      </div>

      {/* 4. Search Filter */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 flex gap-3 items-center">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name, email or phone"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] transition-all bg-zinc-50/50"
          />
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0 ml-1 cursor-pointer focus:outline-none"
          >
            Clear
          </button>
        )}
      </div>

      {/* 5. Parent Table */}
      <div className="bg-white border border-[#EAE8E1] rounded-3xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8">
            <KoinoniaInlineLoader
              variant="skeleton"
              size="lg"
              label="Loading parents..."
              centered
            />
          </div>
        ) : parents.length === 0 ? (
          <div className="text-center py-16 text-zinc-400 space-y-2">
            <Users className="w-7 h-7 stroke-[1.5] mx-auto text-zinc-300" />
            <p className="text-sm text-zinc-500 font-medium">
              {activeTab === 'active' ? 'No active parents found.' : 'No removed parents.'}
            </p>
            {searchQuery && (
              <p className="text-xs text-zinc-400">No results matching "{searchQuery}".</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#FAF9F6] border-b border-[#EAE8E1] text-zinc-500">
                  <th className="p-4 pl-6 text-[11px] font-semibold">Parent</th>
                  <th className="p-4 text-[11px] font-semibold">Children</th>
                  <th className="p-4 text-[11px] font-semibold">Role</th>
                  <th className="p-4 text-[11px] font-semibold">Location</th>
                  <th className="p-4 pr-6 text-right text-[11px] font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8E1]">
                {parents.map((p) => {
                  const displayName = getDisplayName(p);
                  const isRemoved = p.isDeleted || activeTab === 'removed';

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-zinc-50/50 transition-colors"
                      data-parent-row-id={p.id}
                    >
                      {/* Parent name & email */}
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          {p.photoUrl ? (
                            <img
                              src={p.photoUrl}
                              alt={displayName}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-xl object-cover border border-[#EAE8E1] shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-[#FAF9F6] border border-[#EAE8E1] flex items-center justify-center text-zinc-400 font-semibold shrink-0 text-sm uppercase">
                              {getInitials(displayName)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-medium text-[#18181B] block text-xs leading-snug truncate">
                              {displayName}
                            </span>
                            <span className="text-[10px] text-zinc-400 block truncate">
                              {p.email || 'No email provided'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Linked Children */}
                      <td className="p-4">
                        <span className="text-zinc-600 text-xs">
                          {formatChildrenCount(Number(p.childrenCount || 0))}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="p-4">
                        {p.isKoinoniaWorker ? (
                          <span className="text-xs font-medium text-[#C59B27]">
                            Team member{p.department ? ` • ${p.department}` : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-500">Parent</span>
                        )}
                      </td>

                      {/* Location */}
                      <td className="p-4 text-zinc-500 text-xs">
                        {p.city
                          ? `${p.city}${p.stateRegion ? `, ${p.stateRegion}` : ''}`
                          : <span className="text-zinc-400 italic">Not provided</span>}
                      </td>

                      {/* Action buttons */}
                      <td className="p-4 pr-6 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => onNavigate(`/admin/parents/${p.id}` as AppRoute)}
                            className="px-3 py-1.5 text-xs font-medium text-[#18181B] bg-white hover:bg-zinc-50 border border-[#EAE8E1] hover:border-zinc-300 rounded-xl transition-all cursor-pointer focus:outline-none"
                          >
                            View profile
                          </button>

                          {/* Overflow menu trigger */}
                          <div className="relative inline-block text-left" ref={openActionMenuId === p.id ? actionMenuRef : undefined}>
                            <button
                              onClick={() => setOpenActionMenuId(openActionMenuId === p.id ? null : p.id)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer focus:outline-none"
                              aria-label="More options"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            {openActionMenuId === p.id && (
                              <div className="absolute right-0 mt-1 w-44 bg-white border border-[#EAE8E1] rounded-2xl shadow-lg py-1 z-30 animate-fade-in text-left">
                                {!isRemoved ? (
                                  <button
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      setParentToRemove(p);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Remove parent</span>
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setOpenActionMenuId(null);
                                        setParentToRestore(p);
                                      }}
                                      className="w-full text-left px-3.5 py-2 text-xs text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 transition-colors cursor-pointer"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      <span>Restore parent</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setOpenActionMenuId(null);
                                        setParentToDelete(p);
                                      }}
                                      className="w-full text-left px-3.5 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Delete permanently</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Parent Modal */}
      <AddParentModal
        isOpen={showAddParentModal}
        onClose={() => setShowAddParentModal(false)}
        onSuccess={() => fetchParents()}
      />
    </div>
  );
};
