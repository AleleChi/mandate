import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft,
  Users,
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  Baby,
  FileText,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  UserCheck,
  Edit3,
  Plus,
  Save,
  ShieldAlert,
  Loader2,
  Sparkles,
  Award,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { AppRoute } from '../../types';

interface AdminParentDetailViewProps {
  parentId: string;
  onNavigate: (route: AppRoute) => void;
  onBack: () => void;
  adminUser: any;
}

export const AdminParentDetailView: React.FC<AdminParentDetailViewProps> = ({
  parentId,
  onNavigate,
  onBack,
  adminUser
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
          isKoinoniaWorker: !!res.parent.isKoinoniaWorker,
          department: res.parent.department || '',
          country: res.parent.country || '',
          stateRegion: res.parent.stateRegion || '',
          city: res.parent.city || ''
        });
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Fetch Failed', parsed.message);
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
        showSuccess('Note Saved', 'Your admin note has been permanently added.');
        setNewNote('');
        // Refresh notes list locally or refetch
        setAdminNotes(prev => [res.note, ...prev]);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Failed to Save', parsed.message);
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
        showSuccess('Profile Updated', 'Parent profile contact details successfully updated.');
        setIsEditing(false);
        await fetchParentDetails();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Update Failed', parsed.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRemoveParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentToRemove) return;
    setSubmittingRemove(true);
    try {
      const res = await api.admin.removeParent(parentId, removeReason);
      if (res.success) {
        showSuccess('Parent Removed', `The parent profile has been successfully archived.`);
        setParentToRemove(null);
        setRemoveReason('');
        await fetchParentDetails();
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
      const res = await api.admin.restoreParent(parentId);
      if (res.success) {
        showSuccess('Parent Restored', `The parent profile has been successfully restored.`);
        setParentToRestore(null);
        await fetchParentDetails();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Restoration Failed', parsed.message);
    } finally {
      setSubmittingRestore(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#C59B27] stroke-[1.5]" />
        <p className="text-sm font-serif text-zinc-500 font-medium">Retrieving Parent Record Folders...</p>
      </div>
    );
  }

  if (!parent) {
    return (
      <div className="text-center py-20 bg-white border border-[#EAE8E1] rounded-3xl p-8 max-w-xl mx-auto mt-10">
        <Users className="w-12 h-12 stroke-[1.2] mx-auto text-zinc-300 mb-4" />
        <h3 className="font-serif font-bold text-zinc-800 text-lg">Parent profile not found</h3>
        <p className="text-xs text-zinc-400 mt-2">The requested family folder could not be found or has been removed from parent records.</p>
        <Button onClick={onBack} variant="secondary" className="mt-6 text-xs px-6">
          Back to Parents
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in text-zinc-800 pb-12" id="admin-parent-detail-root">
      
      {/* Archive Warning Banner */}
      {parent.isDeleted && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in text-xs" id="archived-parent-banner">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-serif font-bold text-red-950 text-sm">Archived Parent Profile</h4>
              <p className="text-red-700 mt-1">
                This parent record is archived (soft-deleted). It was removed by <strong>{parent.deletedByEmail || 'Admin'}</strong> on <strong>{new Date(parent.deletedAt).toLocaleString()}</strong>.
              </p>
              {parent.deleteReason && (
                <p className="text-red-700 mt-1.5 italic">
                  Reason: "{parent.deleteReason}"
                </p>
              )}
            </div>
          </div>
          <Button
            onClick={() => setParentToRestore(parent)}
            variant="primary"
            className="text-xs bg-emerald-600 hover:bg-emerald-700 hover:text-white border-none text-white px-5 py-2.5 shrink-0 h-fit cursor-pointer"
            id="restore-parent-detail-banner-btn"
          >
            Restore parent
          </Button>
        </div>
      )}
      
      {/* Top Breadcrumb Header Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-[#EAE8E1] gap-4">
        <div className="flex items-center space-x-3">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 rounded-xl text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors focus:outline-none cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-[#C59B27] font-bold uppercase tracking-wider">Parent profile</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27]" />
              <span className="text-[10px] font-mono text-zinc-400">ID: {parent.id}</span>
            </div>
            <h2 className="font-serif text-2xl font-bold text-[#18181B] tracking-tight mt-0.5">Parent record</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!parent.isDeleted && (
            <Button
              onClick={() => setParentToRemove(parent)}
              variant="secondary"
              className="text-xs px-4 py-2 text-zinc-500 hover:text-red-600 hover:bg-red-50 border border-zinc-200 hover:border-red-200"
              id="remove-parent-detail-btn"
            >
              Remove parent
            </Button>
          )}
          <Button 
            onClick={() => setIsEditing(!isEditing)} 
            variant="secondary" 
            className="text-xs px-4 py-2 border border-[#EAE8E1] hover:border-[#C59B27]"
          >
            <Edit3 className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
            {isEditing ? 'Cancel Edit' : 'Update contact'}
          </Button>
        </div>
      </div>

      {/* Profile Details Edit Form / Standard Layout Grid */}
      {isEditing ? (
        <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm max-w-3xl mx-auto">
          <h3 className="font-serif font-bold text-lg text-zinc-800 border-b border-[#EAE8E1] pb-3 mb-6">Update contact information</h3>
          
          <form onSubmit={handleSaveProfile} className="space-y-6 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="text-zinc-500 font-bold block mb-1.5 uppercase tracking-wide text-[10px]">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-4 py-3 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                />
              </div>

              <div>
                <label className="text-zinc-500 font-bold block mb-1.5 uppercase tracking-wide text-[10px]">Primary Phone</label>
                <input
                  type="text"
                  required
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                />
              </div>

              <div>
                <label className="text-zinc-500 font-bold block mb-1.5 uppercase tracking-wide text-[10px]">WhatsApp Phone</label>
                <input
                  type="text"
                  value={editForm.whatsapp}
                  onChange={(e) => setEditForm({ ...editForm, whatsapp: e.target.value })}
                  className="w-full px-4 py-3 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-zinc-500 font-bold block mb-1.5 uppercase tracking-wide text-[10px]">Residential Home Address</label>
                <input
                  type="text"
                  required
                  value={editForm.homeAddress}
                  onChange={(e) => setEditForm({ ...editForm, homeAddress: e.target.value })}
                  className="w-full px-4 py-3 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                />
              </div>

              <div>
                <label className="text-zinc-500 font-bold block mb-1.5 uppercase tracking-wide text-[10px]">City</label>
                <input
                  type="text"
                  required
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  className="w-full px-4 py-3 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                />
              </div>

              <div>
                <label className="text-zinc-500 font-bold block mb-1.5 uppercase tracking-wide text-[10px]">State / Region</label>
                <input
                  type="text"
                  required
                  value={editForm.stateRegion}
                  onChange={(e) => setEditForm({ ...editForm, stateRegion: e.target.value })}
                  className="w-full px-4 py-3 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                />
              </div>

              <div>
                <label className="text-zinc-500 font-bold block mb-1.5 uppercase tracking-wide text-[10px]">Preferred Contact Mode</label>
                <select
                  value={editForm.preferredContact}
                  onChange={(e) => setEditForm({ ...editForm, preferredContact: e.target.value })}
                  className="w-full px-4 py-3 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                >
                  <option value="phone">Phone calls</option>
                  <option value="whatsapp">WhatsApp Texting</option>
                  <option value="email">Email</option>
                </select>
              </div>

              <div className="flex items-center pt-5 pl-2">
                <label className="flex items-center space-x-3.5 cursor-pointer font-semibold text-zinc-800 text-xs">
                  <input
                    type="checkbox"
                    checked={editForm.isKoinoniaWorker}
                    onChange={(e) => setEditForm({ ...editForm, isKoinoniaWorker: e.target.checked })}
                    className="rounded text-[#C59B27] focus:ring-[#C59B27] w-5.5 h-5.5 border-[#EAE8E1] transition-all"
                  />
                  <span>Is Parish Staff Worker</span>
                </label>
              </div>

              {editForm.isKoinoniaWorker && (
                <div className="md:col-span-2">
                  <label className="text-zinc-500 font-bold block mb-1.5 uppercase tracking-wide text-[10px]">Staff / Ministry Department</label>
                  <input
                    type="text"
                    required
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                    className="w-full px-4 py-3 border border-[#EAE8E1] bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                    placeholder="e.g. Ushering, Children Ministry, Choir..."
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-6 border-t border-[#EAE8E1] mt-6">
              <Button
                type="button"
                onClick={() => setIsEditing(false)}
                variant="secondary"
                className="px-5 py-2.5"
              >
                Discard Changes
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={savingEdit}
                disabled={savingEdit}
                className="px-6 py-2.5"
              >
                Save Updated Details
              </Button>
            </div>
          </form>
        </div>
      ) : (
        /* Real Parent Record Layout (Stitch design + Koinonia brand style) */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT SIDE: Parent Overview Card & Contact Cards */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Primary Profile Card */}
            <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#C59B27]/10 via-[#C59B27]/50 to-[#C59B27]/10" />
              
              <div className="flex flex-col items-center pt-2">
                {parent.photoUrl ? (
                  <img
                    src={parent.photoUrl}
                    alt={parent.fullName}
                    referrerPolicy="no-referrer"
                    className="w-24 h-24 rounded-3xl object-cover border-2 border-[#FAF9F6] shadow-md mb-4"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-3xl bg-[#FAF9F6] border border-[#EAE8E1] flex items-center justify-center text-[#C59B27] font-serif font-bold text-3xl uppercase shadow-inner mb-4">
                    {parent.fullName ? parent.fullName.substring(0, 2) : 'P'}
                  </div>
                )}

                <h3 className="font-serif font-bold text-xl text-zinc-900 leading-tight">{parent.fullName}</h3>
                <p className="text-xs text-zinc-400 mt-1">{parent.email}</p>

                {/* Account Badges */}
                <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border bg-[#FAF9F6] border-[#C59B27]/20 text-[#C59B27]">
                    Parent Profile
                  </span>
                  {parent.isKoinoniaWorker && (
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border bg-amber-50 border-amber-200 text-amber-800 flex items-center gap-1">
                      <Award className="w-3 h-3 text-[#C59B27]" />
                      Worker: {parent.department || 'Staff'}
                    </span>
                  )}
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border ${parent.emailVerified ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                    {parent.emailVerified ? 'Verified Account' : 'Unverified'}
                  </span>
                </div>
              </div>

              {/* Action Rows */}
              <div className="grid grid-cols-2 gap-2 mt-6 pt-6 border-t border-[#EAE8E1]">
                <a 
                  href={`tel:${parent.phone}`}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-serif font-medium text-zinc-700 hover:text-[#C59B27] bg-[#FAF9F6] border border-[#EAE8E1] hover:border-[#C59B27] rounded-xl transition-all cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5 text-zinc-400" />
                  Call parent
                </a>
                {parent.whatsapp && (
                  <a 
                    href={`https://wa.me/${parent.whatsapp.replace(/[^0-9]/g, '')}`}
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-serif font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>

            {/* Contact Details Card */}
            <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm space-y-4">
              <h4 className="font-serif font-bold text-xs text-[#C59B27] uppercase tracking-wider border-b border-[#FAF9F6] pb-2">Contact information</h4>
              
              <div className="space-y-3.5 text-xs">
                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-zinc-400 text-[10px] uppercase font-mono tracking-wider">Primary Phone</span>
                    <span className="block font-medium text-zinc-800 mt-0.5">{parent.phone || 'Not Specified'}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MessageSquare className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-zinc-400 text-[10px] uppercase font-mono tracking-wider">WhatsApp Line</span>
                    <span className="block font-medium text-zinc-800 mt-0.5">{parent.whatsapp || 'Not Specified'}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-zinc-400 text-[10px] uppercase font-mono tracking-wider">Account Email</span>
                    <span className="block font-medium text-zinc-800 mt-0.5">{parent.email}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-[#C59B27] mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-zinc-400 text-[10px] uppercase font-mono tracking-wider">Residential Address</span>
                    <span className="block font-medium text-zinc-800 mt-0.5 leading-relaxed">
                      {parent.homeAddress || 'No Address Specified'}
                    </span>
                    {parent.location && (
                      <span className="text-[10px] text-zinc-500 mt-0.5 block italic">{parent.location}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-zinc-400 text-[10px] uppercase font-mono tracking-wider">Folders Created</span>
                    <span className="block font-medium text-zinc-800 mt-0.5">
                      {parent.createdAt ? new Date(parent.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Issue / Attention Status Card */}
            <div className={`border rounded-3xl p-6 shadow-sm space-y-3.5 transition-all ${attention.hasIssue ? 'bg-amber-50/40 border-amber-200' : 'bg-emerald-50/30 border-emerald-100'}`}>
              <div className="flex items-center space-x-2">
                {attention.hasIssue ? (
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                )}
                <h4 className="font-serif font-bold text-sm text-zinc-900 capitalize">
                  {attention.hasIssue ? 'Needs attention' : 'No parent issue found'}
                </h4>
              </div>

              {attention.hasIssue ? (
                <div className="space-y-2 text-xs">
                  <p className="text-amber-800 font-serif">We found {attention.items.length} checklist issues requiring attention:</p>
                  <ul className="space-y-1.5 pl-5 list-disc text-zinc-600 font-medium">
                    {attention.items.map((item: string, idx: number) => (
                      <li key={idx} className="leading-snug">{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-emerald-800 leading-relaxed font-serif">
                  All family credentials, photo uploads, children ages, and contact detail parameters comply with our brand standards. No manual overrides required.
                </p>
              )}
            </div>

          </div>

          {/* MID/RIGHT SIDES: Event Summaries, Linked Children and Admin Notes */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Event Summary Grid Panel (Phase 4) */}
            <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-[#C59B27]" />
                <h4 className="font-serif font-bold text-sm text-zinc-800 uppercase tracking-wider">Event summary</h4>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 text-center">
                  <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">Children Added</span>
                  <span className="text-3xl font-serif font-bold text-zinc-800 block mt-1">{eventSummary.childrenAdded}</span>
                </div>

                <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 text-center">
                  <span className="text-[10px] font-mono text-amber-600 font-bold uppercase tracking-wider block">Under Review</span>
                  <span className="text-3xl font-serif font-bold text-amber-600 block mt-1">{eventSummary.underReview}</span>
                </div>

                <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 text-center">
                  <span className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider block">Selected</span>
                  <span className="text-3xl font-serif font-bold text-emerald-600 block mt-1">{eventSummary.selected}</span>
                </div>

                <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 text-center">
                  <span className="text-[10px] font-mono text-indigo-600 font-bold uppercase tracking-wider block">Pass Ready</span>
                  <span className="text-3xl font-serif font-bold text-indigo-600 block mt-1">{eventSummary.passReady}</span>
                </div>

                <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 text-center">
                  <span className="text-[10px] font-mono text-emerald-700 font-bold uppercase tracking-wider block">Checked In</span>
                  <span className="text-3xl font-serif font-bold text-emerald-700 block mt-1">{eventSummary.checkedIn}</span>
                </div>

                <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 text-center">
                  <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase tracking-wider block">Picked Up</span>
                  <span className="text-3xl font-serif font-bold text-zinc-600 block mt-1">{eventSummary.pickedUp}</span>
                </div>
              </div>
            </div>

            {/* Linked Children Roster Panel */}
            <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#FAF9F6]">
                <div className="flex items-center space-x-2">
                  <Baby className="w-4 h-4 text-[#C59B27]" />
                  <h4 className="font-serif font-bold text-sm text-zinc-800 uppercase tracking-wider">Linked children</h4>
                </div>
                <span className="text-[10px] font-mono text-zinc-400 uppercase">Roster folders</span>
              </div>

              {linkedChildren.length === 0 ? (
                <div className="text-center py-12 bg-zinc-50 border border-zinc-100 rounded-2xl text-zinc-400 space-y-2">
                  <Baby className="w-8 h-8 stroke-[1.2] mx-auto text-zinc-300" />
                  <h5 className="font-serif font-bold text-zinc-700 text-xs">No Linked Children</h5>
                  <p className="text-[10px] text-zinc-400 max-w-xs mx-auto">This parent profile has not created any child folders in the registry yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {linkedChildren.map((child: any) => {
                    const statusClass = 
                      child.entryStatus === 'selected' || child.entryStatus === 'pass_ready' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      child.entryStatus === 'under_review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      child.entryStatus === 'not_registered' ? 'bg-zinc-100 text-zinc-500 border-zinc-200' :
                      'bg-zinc-50 text-zinc-600 border-zinc-200';

                    const pickupClass =
                      child.pickupStatus === 'picked_up' ? 'bg-zinc-100 text-zinc-600 border-zinc-200' :
                      child.pickupStatus === 'checked_in' ? 'bg-emerald-100 text-emerald-800 border-emerald-200 font-bold animate-pulse' :
                      'bg-amber-50 text-amber-800 border-amber-100';

                    return (
                      <div 
                        key={child.id} 
                        className="p-4 bg-white border border-[#EAE8E1] hover:border-[#C59B27]/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-2xs"
                        data-child-card-id={child.id}
                      >
                        <div className="flex items-center space-x-3.5 min-w-0">
                          {child.photoUrl ? (
                            <img
                              src={child.photoUrl}
                              alt={child.fullName}
                              referrerPolicy="no-referrer"
                              className="w-11 h-11 rounded-xl object-cover border border-zinc-200 shadow-2xs shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-[#FAF9F6] border border-[#EAE8E1] flex items-center justify-center text-[#C59B27] font-bold shrink-0 text-xs">
                              {child.fullName ? child.fullName.substring(0, 2).toUpperCase() : 'C'}
                            </div>
                          )}

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-serif font-bold text-zinc-950 text-sm tracking-tight truncate block">{child.fullName}</span>
                              <span className="text-[10px] font-mono text-zinc-400">({child.id})</span>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-400 font-medium">
                              <span>{child.gender}</span>
                              <span>•</span>
                              <span>{child.ageLabel || `${child.age} years`}</span>
                              <span>•</span>
                              <span className="font-serif text-[#C59B27]">{child.ageGroup}</span>
                            </div>

                            {/* Care flags */}
                            {child.careFlags && child.careFlags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {child.careFlags.map((flag: string, idx: number) => (
                                  <span 
                                    key={idx} 
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${
                                      flag === 'medical_issue' ? 'bg-red-50 text-red-700 border-red-100' :
                                      flag === 'needs_support' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                      'bg-indigo-50 text-indigo-700 border-indigo-100'
                                    }`}
                                  >
                                    {flag.replace('_', ' ')}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Status Pillars */}
                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#FAF9F6]">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border text-center capitalize shrink-0 ${statusClass}`}>
                            {child.reviewStatus === 'not_registered' ? 'Unregistered' : child.reviewStatus.replace('_', ' ')}
                          </span>
                          
                          {child.reviewStatus !== 'not_registered' && (
                            <span className={`px-2 py-0.5 rounded text-[8px] font-mono uppercase border text-center shrink-0 ${pickupClass}`}>
                              {child.pickupStatus.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Admin Notes Section (Phase 4) */}
            <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-[#C59B27]" />
                <h4 className="font-serif font-bold text-sm text-zinc-800 uppercase tracking-wider">Admin notes</h4>
              </div>

              {/* Submit a New Note Form */}
              <form onSubmit={handleSaveNote} className="space-y-3">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Enter dynamic staff details, security overrides, or linked family parent credentials notes here..."
                  className="w-full h-24 px-4 py-3 text-xs border border-[#EAE8E1] bg-zinc-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all resize-none leading-relaxed placeholder-zinc-400"
                />
                
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={savingNote}
                    disabled={savingNote || !newNote.trim()}
                    className="text-xs px-5 py-2"
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    Save note
                  </Button>
                </div>
              </form>

              {/* Notes History list */}
              <div className="space-y-3.5 pt-4 border-t border-[#EAE8E1] max-h-[300px] overflow-y-auto pr-1">
                {adminNotes.length === 0 ? (
                  <div className="text-center py-6 text-zinc-400 text-xs italic">
                    No notes have been added to this parent record yet.
                  </div>
                ) : (
                  adminNotes.map((note) => (
                    <div 
                      key={note.id} 
                      className="p-3.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl space-y-2 text-xs relative"
                      data-note-item-id={note.id}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-serif font-bold text-zinc-800">{note.author}</span>
                          <span className="text-[10px] text-zinc-400 font-medium">•</span>
                          <span className="text-[10px] text-zinc-400 uppercase font-mono">Team Admin</span>
                        </div>
                        <span className="text-[9px] font-mono text-zinc-400">
                          {new Date(note.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>

                      <p className="text-zinc-600 leading-relaxed font-medium whitespace-pre-wrap">{note.note}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

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

    </div>
  );
};
