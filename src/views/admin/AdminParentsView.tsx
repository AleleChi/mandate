import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Search, 
  X, 
  Briefcase, 
  Phone, 
  MessageSquare, 
  MapPin, 
  Mail, 
  Baby, 
  Edit3, 
  Check, 
  ChevronRight,
  Filter,
  ArrowLeft,
  AlertTriangle,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';

import { AppRoute } from '../../types';

interface AdminParentsViewProps {
  onBackToOverview: () => void;
  onNavigate: (route: AppRoute) => void;
}

export const AdminParentsView: React.FC<AdminParentsViewProps> = ({ onBackToOverview, onNavigate }) => {
  const { showError, showSuccess } = useNotification();
  const [parents, setParents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Navigation active tab
  const [activeTab, setActiveTab] = useState<'active' | 'removed'>('active');

  // Confirmation modal states
  const [parentToRemove, setParentToRemove] = useState<any | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [submittingRemove, setSubmittingRemove] = useState(false);

  const [parentToRestore, setParentToRestore] = useState<any | null>(null);
  const [submittingRestore, setSubmittingRestore] = useState(false);

  // Permanent Delete states
  const [parentToDelete, setParentToDelete] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // Selected parent for detail drawer/modal
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [parentDetails, setParentDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  // Editing state
  const [isEditing, setIsEditing] = useState(false);
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

  const fetchParents = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getParents({ q: searchQuery, status: activeTab });
      if (res.success) {
        setParents(res.parents || []);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Sync Failed', parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParents();
  }, [searchQuery, activeTab]);

  const handleRemoveParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentToRemove) return;
    setSubmittingRemove(true);
    try {
      const res = await api.admin.removeParent(parentToRemove.id, removeReason);
      if (res.success) {
        showSuccess('Parent Removed', `The parent profile for ${parentToRemove.fullName} has been archived.`);
        setParentToRemove(null);
        setRemoveReason('');
        if (selectedParentId === parentToRemove.id) {
          handleCloseParent();
        }
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Archiving Failed', parsed.message);
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
        showSuccess('Parent Restored', `The parent profile for ${parentToRestore.fullName} has been successfully restored.`);
        setParentToRestore(null);
        if (selectedParentId === parentToRestore.id) {
          handleOpenParent(parentToRestore.id);
        }
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Restoration Failed', parsed.message);
    } finally {
      setSubmittingRestore(false);
    }
  };

  const handlePermanentDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentToDelete) return;
    if (deleteConfirmationText !== 'DELETE') {
      showError('Validation Error', 'Please type DELETE to confirm.');
      return;
    }
    if (!deleteReason.trim()) {
      showError('Validation Error', 'Please specify a reason for deletion.');
      return;
    }
    setSubmittingDelete(true);
    try {
      const res = await api.admin.permanentlyDeleteParent(parentToDelete.id, {
        reason: deleteReason,
        confirmation: deleteConfirmationText
      });
      if (res.success) {
        showSuccess('Deleted Permanently', `The parent profile has been anonymized, and their user login has been disabled.`);
        setParentToDelete(null);
        setDeleteReason('');
        setDeleteConfirmationText('');
        if (selectedParentId === parentToDelete.id) {
          handleCloseParent();
        }
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Deletion Failed', parsed.message);
    } finally {
      setSubmittingDelete(false);
    }
  };

  const handleOpenParent = async (id: string) => {
    setSelectedParentId(id);
    setLoadingDetails(true);
    setIsEditing(false);
    try {
      const res = await api.admin.getParentDetails(id);
      if (res.success) {
        setParentDetails(res.parent);
        setEditForm({
          fullName: res.parent.fullName || '',
          phone: res.parent.phone || '',
          whatsapp: res.parent.whatsapp || '',
          homeAddress: res.parent.homeAddress || '',
          preferredContact: res.parent.preferredContact || 'phone',
          isKoinoniaWorker: !!res.parent.isKoinoniaWorker,
          department: res.parent.department || '',
          country: res.parent.country || '',
          stateRegion: res.parent.stateRegion || '',
          city: res.parent.city || ''
        });
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Sync Failed', parsed.message);
      setSelectedParentId(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCloseParent = () => {
    setSelectedParentId(null);
    setParentDetails(null);
    setIsEditing(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParentId) return;
    setSavingEdit(true);
    try {
      const res = await api.admin.updateParentProfile(selectedParentId, editForm);
      if (res.success) {
        showSuccess('Profile Updated', 'The parent account credentials have been updated.');
        setIsEditing(false);
        // Refresh detail view
        const detailRes = await api.admin.getParentDetails(selectedParentId);
        if (detailRes.success) {
          setParentDetails(detailRes.parent);
        }
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Update Failed', parsed.message);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div 
      className="space-y-6 animate-fade-in" 
      data-view-version="admin-parents-v3-remove-restore-visible"
      id="admin-parents-module-root"
    >
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-[#EAE8E1]">
        <div>
          <h2 className="font-serif text-2xl font-bold text-[#18181B] tracking-tight">Parents</h2>
          <p className="text-xs text-zinc-500 mt-1">Manage active parent profiles, edit contact information, and review linked family members.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            onClick={onBackToOverview} 
            variant="secondary" 
            className="text-xs px-4 py-2"
          >
            Back to Overview
          </Button>
        </div>
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-[#C59B27] font-bold uppercase tracking-wider">Total parents</span>
          <span className="text-2xl font-serif font-bold text-[#18181B] mt-2">{parents.length}</span>
        </div>

        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase tracking-wider">Registered Children</span>
          <span className="text-2xl font-serif font-bold text-zinc-700 mt-2">
            {parents.reduce((sum, p) => sum + Number(p.childrenCount || 0), 0)}
          </span>
        </div>

        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-amber-600 font-bold uppercase tracking-wider">Parish staff parents</span>
          <span className="text-2xl font-serif font-bold text-amber-600 mt-2">
            {parents.filter(p => p.isKoinoniaWorker).length}
          </span>
        </div>

        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">WhatsApp active parents</span>
          <span className="text-2xl font-serif font-bold text-emerald-600 mt-2">
            {parents.filter(p => p.whatsapp).length}
          </span>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex border-b border-[#EAE8E1]" id="parents-directory-tabs">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2.5 text-xs font-serif font-bold transition-all border-b-2 cursor-pointer focus:outline-none ${
            activeTab === 'active'
              ? 'border-[#C59B27] text-[#C59B27]'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
          id="tab-active-parents"
        >
          Active Parents
        </button>
        <button
          onClick={() => setActiveTab('removed')}
          className={`px-4 py-2.5 text-xs font-serif font-bold transition-all border-b-2 cursor-pointer focus:outline-none ${
            activeTab === 'removed'
              ? 'border-[#C59B27] text-[#C59B27]'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
          id="tab-removed-parents"
        >
          Removed Parents
        </button>
      </div>

      {/* Search Filter Strip */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 flex gap-3 items-center">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search parent accounts by name, city, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all bg-zinc-50/50"
          />
        </div>

        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs font-semibold text-red-600 hover:underline shrink-0 ml-1 cursor-pointer focus:outline-none"
          >
            Clear
          </button>
        )}
      </div>

      {/* Parents Registry Index */}
      <div className="bg-white border border-[#EAE8E1] rounded-3xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8">
            <KoinoniaInlineLoader
              variant="skeleton"
              size="lg"
              label="Loading family folders..."
              centered
            />
          </div>
        ) : parents.length === 0 ? (
          <div className="text-center py-20 text-zinc-400 space-y-2">
            <Users className="w-8 h-8 stroke-[1.2] mx-auto text-zinc-300" />
            <h3 className="font-serif font-bold text-zinc-700 text-sm">No Parents Found</h3>
            <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">There are no parent records matching your query.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#FAF9F6] border-b border-[#EAE8E1] text-[#18181B] font-serif font-semibold">
                  <th className="p-4 pl-6">Parent Info</th>
                  <th className="p-4">Linked Children</th>
                  <th className="p-4">Parish worker</th>
                  <th className="p-4">Location</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8E1]">
                {parents.map((p) => (
                  <tr 
                    key={p.id} 
                    className="hover:bg-zinc-50/50 transition-colors"
                    data-parent-row-id={p.id}
                  >
                    <td className="p-4 pl-6">
                      <div className="flex items-center space-x-3">
                        {p.photoUrl ? (
                          <img
                            src={p.photoUrl}
                            alt={p.fullName}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-xl object-cover border border-zinc-200 shadow-2xs shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-[#FAF9F6] border border-[#EAE8E1] flex items-center justify-center text-[#C59B27] font-serif font-bold text-xs uppercase shrink-0">
                            {p.fullName.substring(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="font-serif font-bold text-[#18181B] block text-sm tracking-tight">{p.fullName}</span>
                          <span className="text-[10px] text-zinc-400 block truncate">{p.email}</span>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-100 font-semibold text-zinc-700 text-[10px]">
                        <Baby className="w-3.5 h-3.5 text-zinc-400" /> {p.childrenCount || 0} Children
                      </span>
                    </td>

                    <td className="p-4">
                      {p.isKoinoniaWorker ? (
                        <span className="px-2 py-0.5 rounded bg-[#FAF6EC] border border-[#C59B27]/20 text-[#C59B27] font-semibold text-[10px] uppercase">
                          {p.department || 'Staff Worker'}
                        </span>
                      ) : (
                        <span className="text-zinc-400">Regular</span>
                      )}
                    </td>

                    <td className="p-4 text-zinc-500">
                      {p.city ? `${p.city}, ${p.stateRegion || ''}` : 'Not Specified'}
                    </td>

                    <td className="p-4 pr-6 text-right space-x-2">
                      <button
                        onClick={() => onNavigate(`/admin/parents/${p.id}` as AppRoute)}
                        className="px-3.5 py-1.5 text-xs font-serif text-[#C59B27] font-bold hover:bg-[#C59B27]/5 border border-[#C59B27]/10 hover:border-[#C59B27] rounded-xl transition-all cursor-pointer focus:outline-none inline-block align-middle"
                      >
                        View Profile
                      </button>
                      {activeTab === 'active' ? (
                        <button
                          onClick={() => setParentToRemove(p)}
                          className="px-3.5 py-1.5 text-xs font-semibold text-zinc-500 hover:text-red-600 bg-white hover:bg-red-50 border border-zinc-200 hover:border-red-200 rounded-xl transition-all cursor-pointer focus:outline-none inline-block align-middle"
                          id={`remove-parent-btn-${p.id}`}
                        >
                          Remove parent
                        </button>
                      ) : (
                        <div className="inline-flex gap-2 align-middle">
                          <button
                            onClick={() => setParentToRestore(p)}
                            className="px-3.5 py-1.5 text-xs font-serif text-emerald-600 font-bold hover:text-white bg-white hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 rounded-xl transition-all cursor-pointer focus:outline-none inline-flex items-center gap-1"
                            id={`restore-parent-btn-${p.id}`}
                          >
                            <RotateCcw className="w-3 h-3" /> Restore parent
                          </button>
                          <button
                            onClick={() => setParentToDelete(p)}
                            className="px-3.5 py-1.5 text-xs font-semibold text-red-600 hover:text-white bg-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-xl transition-all cursor-pointer focus:outline-none inline-flex items-center gap-1"
                            id={`delete-parent-permanent-btn-${p.id}`}
                            data-component-version="admin-parent-permanent-delete-action-v1"
                          >
                            <Trash2 className="w-3 h-3" /> Delete permanently
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Parent Details Slide panel/modal (Phase 7, 18) */}
      {selectedParentId && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          id="parent-details-modal"
          data-testid="parent-details-modal"
        >
          <div 
            onClick={handleCloseParent}
            className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity" 
          />
          
          <div className="relative bg-white border border-[#EAE8E1] rounded-3xl w-full max-w-xl shadow-2xl animate-fade-in flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="h-16 px-6 border-b border-[#EAE8E1] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-[#C59B27]" />
                <h3 className="font-serif font-bold text-lg text-[#18181B]">
                  {isEditing ? 'Edit Parent Profile' : 'Parent details'}
                </h3>
              </div>
              <button 
                onClick={handleCloseParent}
                className="text-zinc-400 hover:text-[#18181B] p-1.5 rounded-xl hover:bg-zinc-50 transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingDetails ? (
              <div className="p-8 w-full">
                <KoinoniaInlineLoader
                  variant="logo"
                  size="md"
                  label="Loading profile..."
                  centered
                />
              </div>
            ) : !parentDetails ? (
              <div className="p-12 text-center text-zinc-400">
                Failed to load parent records.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {isEditing ? (
                  /* Form for editing parent profiles */
                  <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="text-zinc-500 font-semibold block mb-1">Full Legal Name</label>
                        <input
                          type="text"
                          required
                          value={editForm.fullName}
                          onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                          className="w-full px-3 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27]"
                        />
                      </div>

                      <div>
                        <label className="text-zinc-500 font-semibold block mb-1">Primary Phone</label>
                        <input
                          type="text"
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27]"
                        />
                      </div>

                      <div>
                        <label className="text-zinc-500 font-semibold block mb-1">WhatsApp Phone</label>
                        <input
                          type="text"
                          value={editForm.whatsapp}
                          onChange={(e) => setEditForm({ ...editForm, whatsapp: e.target.value })}
                          className="w-full px-3 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27]"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="text-zinc-500 font-semibold block mb-1">Residential Home Address</label>
                        <input
                          type="text"
                          value={editForm.homeAddress}
                          onChange={(e) => setEditForm({ ...editForm, homeAddress: e.target.value })}
                          className="w-full px-3 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27]"
                        />
                      </div>

                      <div>
                        <label className="text-zinc-500 font-semibold block mb-1">City</label>
                        <input
                          type="text"
                          value={editForm.city}
                          onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                          className="w-full px-3 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27]"
                        />
                      </div>

                      <div>
                        <label className="text-zinc-500 font-semibold block mb-1">State / Region</label>
                        <input
                          type="text"
                          value={editForm.stateRegion}
                          onChange={(e) => setEditForm({ ...editForm, stateRegion: e.target.value })}
                          className="w-full px-3 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27]"
                        />
                      </div>

                      <div>
                        <label className="text-zinc-500 font-semibold block mb-1">Preferred Contact Mode</label>
                        <select
                          value={editForm.preferredContact}
                          onChange={(e) => setEditForm({ ...editForm, preferredContact: e.target.value })}
                          className="w-full px-3 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27]"
                        >
                          <option value="phone">Phone calls</option>
                          <option value="whatsapp">WhatsApp Texting</option>
                          <option value="email">Email</option>
                        </select>
                      </div>

                      <div className="flex items-center pt-5 pl-2">
                        <label className="flex items-center space-x-2 cursor-pointer font-semibold text-[#18181B]">
                          <input
                            type="checkbox"
                            checked={editForm.isKoinoniaWorker}
                            onChange={(e) => setEditForm({ ...editForm, isKoinoniaWorker: e.target.checked })}
                            className="rounded text-[#C59B27] focus:ring-[#C59B27] w-4 h-4"
                          />
                          <span>Is Parish Staff Worker</span>
                        </label>
                      </div>

                      {editForm.isKoinoniaWorker && (
                        <div className="col-span-2">
                          <label className="text-zinc-500 font-semibold block mb-1">Staff / Ministry Department</label>
                          <input
                            type="text"
                            value={editForm.department}
                            onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                            className="w-full px-3 py-2 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:border-[#C59B27]"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#EAE8E1]">
                      <Button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        variant="secondary"
                        className="px-4 py-2"
                      >
                        Discard Changes
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        loading={savingEdit}
                        disabled={savingEdit}
                        className="px-5 py-2"
                      >
                        Save Updated Details
                      </Button>
                    </div>
                  </form>
                ) : (
                  /* Standard Read-Only Family Card display with Children Records */
                  <div className="space-y-6 text-xs">
                    {/* Header Panel card */}
                    <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start bg-[#FAF9F6] border border-[#EAE8E1] p-4.5 rounded-2xl">
                      {parentDetails.photoUrl ? (
                        <img
                          src={parentDetails.photoUrl}
                          alt={parentDetails.fullName}
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 rounded-2xl object-cover border border-zinc-200 shadow-xs"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center text-[#C59B27] font-serif font-bold text-xl border border-zinc-200 uppercase">
                          {parentDetails.fullName.substring(0, 2)}
                        </div>
                      )}

                      <div className="text-center sm:text-left space-y-1 min-w-0 flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <h4 className="font-serif font-bold text-lg text-[#18181B] leading-none">{parentDetails.fullName}</h4>
                          <button
                            onClick={() => setIsEditing(true)}
                            className="px-3 py-1 text-[11px] font-semibold text-[#C59B27] border border-[#C59B27]/20 hover:bg-[#C59B27]/5 rounded-xl cursor-pointer focus:outline-none inline-flex items-center gap-1 self-center sm:self-start transition-all"
                          >
                            <Edit3 className="w-3 h-3" /> Edit Profile
                          </button>
                        </div>
                        
                        <p className="text-[11px] text-zinc-500 font-medium flex items-center gap-1 justify-center sm:justify-start">
                          <Mail className="w-3.5 h-3.5" /> {parentDetails.email}
                        </p>
                        
                        <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start pt-1.5">
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase border bg-zinc-50 border-zinc-200 text-zinc-600">
                            {parentDetails.userRole} ACCOUNT
                          </span>
                          {parentDetails.isKoinoniaWorker && (
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase border bg-amber-50 border-amber-100 text-amber-800">
                              Parish Worker: {parentDetails.department || 'General'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Contact Details */}
                    <div className="space-y-2">
                      <h5 className="text-[10px] font-mono font-bold text-[#C59B27] uppercase tracking-wider">Parent contact details</h5>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                          <span className="text-zinc-400 block text-[9px] font-medium uppercase tracking-wider">Primary Phone</span>
                          <span className="font-semibold text-zinc-800 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3.5 h-3.5 text-zinc-400" /> {parentDetails.phone || 'N/A'}
                          </span>
                        </div>

                        <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                          <span className="text-zinc-400 block text-[9px] font-medium uppercase tracking-wider">WhatsApp Line</span>
                          <span className="font-semibold text-zinc-800 flex items-center gap-1 mt-0.5">
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-500" /> {parentDetails.whatsapp || 'N/A'}
                          </span>
                        </div>

                        <div className="col-span-2 bg-zinc-50 p-2.5 rounded-xl border border-zinc-100 flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-zinc-400 block text-[9px] font-medium uppercase tracking-wider">Residential Home Address</span>
                            <span className="font-semibold text-zinc-800 block mt-0.5">
                              {parentDetails.homeAddress || 'No Address Specified'}
                            </span>
                            {parentDetails.city && (
                              <span className="text-[10px] text-zinc-500 mt-0.5 block">
                                {parentDetails.city}, {parentDetails.stateRegion || ''} {parentDetails.country || ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Linked Children Records Folder (Phase 18, 11) */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-1.5">
                        <h5 className="text-[10px] font-mono font-bold text-[#C59B27] uppercase tracking-wider">Linked Children & Teens Roster ({parentDetails.children?.length || 0})</h5>
                        <span className="text-[9px] font-semibold text-zinc-400">Roster Folder</span>
                      </div>

                      {(!parentDetails.children || parentDetails.children.length === 0) ? (
                        <div className="text-center py-6 bg-zinc-50 border border-zinc-100 rounded-2xl text-zinc-400">
                          No child records folders are linked to this parent file.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {parentDetails.children.map((child: any) => {
                            const entryStatusClass = 
                              child.entryStatus === 'selected' || child.entryStatus === 'pass_ready' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                              child.entryStatus === 'under_review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              child.entryStatus === 'not_registered' ? 'bg-zinc-100 text-zinc-500 border-zinc-200' :
                              'bg-zinc-50 text-zinc-600 border-zinc-200';

                            return (
                              <div 
                                key={child.id} 
                                className="p-3 bg-white border border-[#EAE8E1] rounded-2xl flex items-center justify-between gap-4"
                                data-child-card-id={child.id}
                              >
                                <div className="flex items-center space-x-3.5 min-w-0">
                                  {child.photoUrl ? (
                                    <img
                                      src={child.photoUrl}
                                      alt={child.fullName}
                                      referrerPolicy="no-referrer"
                                      className="w-9 h-9 rounded-xl object-cover border border-zinc-200 shadow-2xs shrink-0"
                                    />
                                  ) : (
                                    <div className="w-9 h-9 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400 font-bold shrink-0 text-xs">
                                      {child.fullName.substring(0, 2).toUpperCase()}
                                    </div>
                                  )}

                                  <div className="min-w-0 space-y-0.5">
                                    <span className="font-serif font-bold text-[#18181B] block tracking-tight truncate">{child.fullName}</span>
                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                                      <span>{child.gender}</span>
                                      <span>•</span>
                                      <span>{child.ageGroup || `Age ${child.age}`}</span>
                                      {child.needsAgeReview && (
                                        <>
                                          <span>•</span>
                                          <span className="text-red-500 font-semibold uppercase text-[9px] bg-red-50 px-1 py-0.5 rounded border border-red-100">Review age</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="text-right space-y-1 shrink-0">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border block text-center capitalize ${entryStatusClass}`}>
                                    {child.entryStatus === 'not_registered' ? 'Unregistered' : child.entryStatus.replace('_', ' ')}
                                  </span>
                                  {child.submittedAt && (
                                    <span className="text-[9px] text-zinc-400 block font-mono">
                                      {new Date(child.submittedAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Parent Archiving Confirmation Dialog Modal */}
      {parentToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="confirm-remove-parent-modal">
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs" onClick={() => setParentToRemove(null)} />
          <div className="relative bg-white border border-[#EAE8E1] rounded-3xl w-full max-w-md p-6 shadow-2xl animate-fade-in space-y-4">
            <div className="flex items-center space-x-2 text-amber-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-serif font-bold text-lg text-zinc-900">Remove parent profile</h3>
            </div>
            
            <p className="text-xs text-zinc-600 leading-relaxed">
              Are you sure you want to remove/archive the profile of <strong>{parentToRemove.fullName}</strong>?
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              This is a soft-delete (archive) action. The parent account will be archived, but all linked children records, attendance logs, and pickup history files will remain safe for audit.
            </p>

            <form onSubmit={handleRemoveParentSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">Reason for archiving (optional)</label>
                <textarea
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="e.g., Parent requested removal, family relocated, duplicate entry..."
                  className="w-full h-20 px-3 py-2 text-xs border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all resize-none placeholder-zinc-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
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
                  variant="primary"
                  loading={submittingRemove}
                  disabled={submittingRemove}
                  className="px-5 py-2 text-xs bg-red-600 hover:bg-red-700 hover:text-white border-none text-white font-serif font-bold cursor-pointer"
                  id="confirm-remove-parent-btn"
                >
                  Remove parent
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Parent Restoration Confirmation Dialog Modal */}
      {parentToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="confirm-restore-parent-modal">
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs" onClick={() => setParentToRestore(null)} />
          <div className="relative bg-white border border-[#EAE8E1] rounded-3xl w-full max-w-md p-6 shadow-2xl animate-fade-in space-y-4">
            <div className="flex items-center space-x-2 text-emerald-600">
              <RotateCcw className="w-5 h-5 shrink-0" />
              <h3 className="font-serif font-bold text-lg text-zinc-900">Restore parent profile</h3>
            </div>
            
            <p className="text-xs text-zinc-600 leading-relaxed">
              Are you sure you want to restore the profile of <strong>{parentToRestore.fullName}</strong>?
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              This will return the parent account and linked children profiles to active status.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                onClick={() => setParentToRestore(null)}
                variant="secondary"
                className="px-4 py-2 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleRestoreParentSubmit}
                variant="primary"
                loading={submittingRestore}
                disabled={submittingRestore}
                className="px-5 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 hover:text-white border-none text-white font-serif font-bold cursor-pointer"
                id="confirm-restore-parent-btn"
              >
                Restore parent
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Parent Deletion Confirmation Modal */}
      {parentToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4" 
          id="confirm-delete-parent-modal"
          data-component-version="admin-parent-permanent-delete-modal-v1"
        >
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs" onClick={() => setParentToDelete(null)} />
          <div className="relative bg-white border border-red-200 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-fade-in space-y-4">
            <div className="flex items-center space-x-2 text-red-600">
              <Trash2 className="w-5 h-5 shrink-0 animate-pulse" />
              <h3 className="font-serif font-bold text-lg text-[#18181B]">Delete parent permanently</h3>
            </div>
            
            <p className="text-xs text-zinc-600 leading-relaxed">
              You are about to permanently delete and anonymize the parent account <strong>{parentToDelete.fullName}</strong>.
            </p>
            <div className="text-xs bg-red-50 text-red-700 p-3.5 rounded-xl border border-red-100 space-y-1.5">
              <span className="font-bold block">🚨 Danger: This action is irreversible</span>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-red-600/95">
                <li>This will permanently remove contact details (email, phone, home address).</li>
                <li>This will permanently revoke and disable login credentials.</li>
                <li>Child registration and event check-in/pickup details will be preserved as <em className="font-semibold">Deleted parent</em> for reporting purposes.</li>
              </ul>
            </div>

            <form onSubmit={handlePermanentDeleteSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">Delete Reason (Required)</label>
                <textarea
                  required
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Explain why this parent profile is being permanently deleted..."
                  className="w-full h-16 px-3 py-2 text-xs border border-red-100 bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/10 focus:border-red-400 transition-all resize-none placeholder-zinc-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">
                  Confirm by typing <span className="text-red-600 font-bold font-mono">DELETE</span>
                </label>
                <input
                  required
                  type="text"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-3 py-2 text-xs font-mono border border-red-100 bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/10 focus:border-red-400 transition-all placeholder-zinc-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
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
                  className="px-5 py-2 text-xs bg-red-600 hover:bg-red-700 hover:text-white border-none text-white font-serif font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  id="confirm-delete-parent-permanent-btn"
                >
                  Confirm Delete
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
