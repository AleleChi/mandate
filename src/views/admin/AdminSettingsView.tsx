import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  Mail, 
  MessageSquare, 
  Plus, 
  Edit2, 
  Check, 
  X, 
  ShieldCheck, 
  UserPlus, 
  Loader2, 
  ToggleLeft, 
  ToggleRight, 
  Settings as SettingsIcon, 
  Users, 
  CheckSquare, 
  Square,
  ShieldAlert,
  ChevronRight,
  RefreshCw,
  Phone,
  Image,
  Upload,
  Trash2
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { api } from '../../services/api';
import { AdminLandingView } from './AdminLandingView';
import { SafeImage } from '../../components/common/SafeImage';

interface AdminSettingsViewProps {
  onBackToOverview?: () => void;
  isSuperAdmin: boolean;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({ 
  onBackToOverview,
  isSuperAdmin
}) => {
  // General State
  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingMessages, setSavingMessages] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  
  // Tab/Active Panel State inside Settings
  const [activeSubTab, setActiveSubTab] = useState<'parent-access' | 'team-access' | 'message-channels' | 'landing-page' | 'app-media'>('parent-access');

  // Cover Media Settings State
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({
    parent_dashboard_hero: '',
    volunteer_dashboard_hero: '',
    default_event_hero: ''
  });
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [mediaFeedback, setMediaFeedback] = useState<string>('');
  const [mediaError, setMediaError] = useState<string>('');

  // General Settings State
  const [parentRegistrationEnabled, setParentRegistrationEnabled] = useState(true);
  const [parentLoginEnabled, setParentLoginEnabled] = useState(true);
  const [requiredChildPhoto, setRequiredChildPhoto] = useState(true);
  const [requiredParentPhoto, setRequiredParentPhoto] = useState(true);
  const [requiredMedicalNotes, setRequiredMedicalNotes] = useState(false);
  const [requiredPickupPerson, setRequiredPickupPerson] = useState(true);

  // Message Channel Settings State
  const [senderName, setSenderName] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [emailProvider, setEmailProvider] = useState<string | null>(null);
  const [whatsappProvider, setWhatsappProvider] = useState<string | null>(null);

  // Team Access / Staff Roles State
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  
  // Add Team Member Form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'super_admin' | 'team'>('team');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState('');
  const [inviteErrorMsg, setInviteErrorMsg] = useState('');

  // Editing Team Member state
  const [editRoleValue, setEditRoleValue] = useState<string>('');
  const [editPermissions, setEditPermissions] = useState({
    manageRegistrations: false,
    gateOperations: false,
    messageDispatch: false,
    fullGovernance: false
  });

  // Self Profile Security State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Status/Toast Feedback State
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 4000);
  };

  // Load All Settings Data
  const loadSettingsData = async () => {
    setLoading(true);
    try {
      // 1. Fetch General Settings
      const genRes = await api.admin.getGeneralSettings();
      if (genRes.success && genRes.settings) {
        setParentRegistrationEnabled(genRes.settings.parentRegistrationEnabled === 1);
        setParentLoginEnabled(genRes.settings.parentLoginEnabled === 1);
        setRequiredChildPhoto(genRes.settings.requiredChildPhoto === 1);
        setRequiredParentPhoto(genRes.settings.requiredParentPhoto === 1);
        setRequiredMedicalNotes(genRes.settings.requiredMedicalNotes === 1);
        setRequiredPickupPerson(genRes.settings.requiredPickupPerson === 1);
      }

      // 2. Fetch Messages Settings
      const msgRes = await api.admin.getMessagesSettings();
      if (msgRes.success) {
        setSenderName(msgRes.senderName);
        setReplyToEmail(msgRes.replyToEmail || '');
        setEmailEnabled(msgRes.emailEnabled);
        setWhatsappEnabled(msgRes.whatsappEnabled);
        setEmailProvider(msgRes.emailProvider);
        setWhatsappProvider(msgRes.whatsappProvider);
      }

      // 3. Load Team Directory
      await fetchTeamDirectory();

    } catch (err: any) {
      console.error('Failed to load settings data:', err);
      showFeedback('Failed to retrieve settings profiles from the database.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamDirectory = async () => {
    setLoadingTeam(true);
    try {
      const adminRes = await api.admin.listAdmins();
      const volRes = await api.admin.getVolunteers();

      let adminsList: any[] = [];
      if (adminRes.success && adminRes.admins) {
        adminsList = adminRes.admins;
      }

      let volsList: any[] = [];
      if (volRes.success && volRes.volunteers) {
        volsList = volRes.volunteers.filter(v => v.status === 'approved' || v.status === 'active');
      }

      setTeamMembers(adminsList);
      setVolunteers(volsList);
    } catch (err) {
      console.error('Error listing team directories:', err);
    } finally {
      setLoadingTeam(false);
    }
  };

  const loadMediaSettings = async () => {
    setLoadingMedia(true);
    setMediaError('');
    try {
      const res = await api.admin.getSettingsMedia();
      if (res.success && res.media) {
        setMediaUrls({
          parent_dashboard_hero: res.media.parent_dashboard_hero || '',
          volunteer_dashboard_hero: res.media.volunteer_dashboard_hero || '',
          default_event_hero: res.media.default_event_hero || ''
        });
      }
    } catch (err: any) {
      console.error('Failed to load media settings:', err);
      setMediaError('Failed to retrieve cover image configuration.');
    } finally {
      setLoadingMedia(false);
    }
  };

  const handleUploadMedia = async (slot: string, file: File) => {
    setUploadingSlot(slot);
    setMediaError('');
    setMediaFeedback('');
    try {
      const res = await api.admin.uploadSettingsMedia(slot, file);
      if (res.success && res.media) {
        setMediaUrls(prev => ({
          ...prev,
          [slot]: res.media.url
        }));
        setMediaFeedback('Custom image uploaded and saved successfully.');
        setTimeout(() => setMediaFeedback(''), 4000);
      }
    } catch (err: any) {
      console.error('Failed to upload settings media:', err);
      setMediaError('Could not process or upload this image file.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleResetMedia = async (slot: string) => {
    if (!window.confirm('Reset this cover image? This will return it to the default view.')) {
      return;
    }
    setUploadingSlot(slot);
    setMediaError('');
    setMediaFeedback('');
    try {
      const res = await api.admin.resetSettingsMedia(slot);
      if (res.success) {
        setMediaUrls(prev => ({
          ...prev,
          [slot]: ''
        }));
        setMediaFeedback('Custom image removed successfully.');
        setTimeout(() => setMediaFeedback(''), 4000);
      }
    } catch (err: any) {
      console.error('Failed to reset settings media:', err);
      setMediaError('Could not clear this custom image.');
    } finally {
      setUploadingSlot(null);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'app-media') {
      loadMediaSettings();
    }
  }, [activeSubTab]);

  useEffect(() => {
    loadSettingsData();
  }, []);

  // Update General Settings
  const handleSaveGeneralSettings = async () => {
    setSavingGeneral(true);
    try {
      const res = await api.admin.updateGeneralSettings({
        parentRegistrationEnabled,
        parentLoginEnabled,
        requiredChildPhoto,
        requiredParentPhoto,
        requiredMedicalNotes,
        requiredPickupPerson
      });
      if (res.success) {
        showFeedback('General settings and required registration details updated successfully.');
      } else {
        showFeedback(res.message || 'Failed to update settings.', 'error');
      }
    } catch (err: any) {
      console.error('Save General Settings Error:', err);
      showFeedback('An error occurred while saving the registration criteria.', 'error');
    } finally {
      setSavingGeneral(false);
    }
  };

  // Update Message Channel Settings
  const handleSaveMessageSettings = async () => {
    setSavingMessages(true);
    try {
      const res = await api.admin.updateMessagesSettings({
        senderName,
        replyToEmail
      });
      if (res.success) {
        showFeedback('Message channel credentials and sender defaults saved.');
      } else {
        showFeedback('Failed to update message channels settings.', 'error');
      }
    } catch (err: any) {
      console.error('Save Message Settings Error:', err);
      showFeedback('Failed to save message sender configurations.', 'error');
    } finally {
      setSavingMessages(false);
    }
  };

  // Invite Team Member
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setSendingInvite(true);
    setInviteSuccessMsg('');
    setInviteErrorMsg('');

    try {
      const res = await api.admin.inviteAdmin({
        email: inviteEmail,
        role: inviteRole
      });

      if (res.success) {
        setInviteSuccessMsg(`Onboarding link sent successfully to ${inviteEmail}.`);
        setInviteEmail('');
        fetchTeamDirectory();
      } else {
        setInviteErrorMsg(res.message || 'Failed to send team invitation.');
      }
    } catch (err: any) {
      console.error('Invite Team Member Error:', err);
      setInviteErrorMsg(err?.message || 'An error occurred during onboarding setup.');
    } finally {
      setSendingInvite(false);
    }
  };

  // Handle Selection of Team Member
  const handleSelectMember = (member: any) => {
    setSelectedMember(member);
    setEditRoleValue(member.role);
    
    // Set mock permissions based on selected role
    setEditPermissions({
      manageRegistrations: member.role === 'super_admin' || member.role === 'admin',
      gateOperations: member.role === 'super_admin' || member.role === 'admin' || member.role === 'team' || member.role === 'volunteer',
      messageDispatch: member.role === 'super_admin' || member.role === 'admin',
      fullGovernance: member.role === 'super_admin'
    });
  };

  // Save Team Member Role Assignment
  const handleSaveMemberRole = async () => {
    if (!selectedMember) return;
    setSavingRole(true);
    try {
      const res = await api.admin.updateTeamMemberRole({
        userId: selectedMember.id,
        role: editRoleValue
      });

      if (res.success) {
        showFeedback(`Role for ${selectedMember.fullName} updated to ${editRoleValue}.`);
        setSelectedMember(null);
        fetchTeamDirectory();
      } else {
        showFeedback(res.message || 'Failed to update team role.', 'error');
      }
    } catch (err: any) {
      console.error('Save Member Role Error:', err);
      showFeedback(err?.message || 'Failed to update role assignment.', 'error');
    } finally {
      setSavingRole(false);
    }
  };

  // Change Password Submission
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await api.admin.changePassword({
        currentPassword,
        newPassword
      });

      if (res.success) {
        setPasswordSuccess('Your password has been changed successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        setPasswordError(res.message || 'Incorrect current password or invalid requirements.');
      }
    } catch (err: any) {
      console.error('Change Password Error:', err);
      setPasswordError(err?.message || 'Failed to update security password.');
    } finally {
      setChangingPassword(false);
    }
  };

  // Computed Metrics
  const totalSuperAdmins = teamMembers.filter(m => m.role === 'super_admin').length;
  const totalAdmins = teamMembers.filter(m => m.role === 'admin').length;
  const totalTeamStaff = teamMembers.filter(m => m.role === 'team').length;
  const totalActiveVols = volunteers.length;

  return (
    <div 
      className="space-y-6 sm:space-y-8 max-w-7xl mx-auto px-4 sm:px-6 pb-12 text-[#18181B] bg-[#FAF9F6]"
      data-view-version="admin-settings-v2-ui-refined"
    >
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#EAE8E1] pb-5 gap-4">
        <div>
          <h2 className="font-serif text-2xl sm:text-3xl font-medium text-zinc-900 tracking-tight">
            Settings
          </h2>
          <p className="text-xs text-zinc-500 mt-1.5 max-w-xl leading-relaxed">
            Configure parent access parameters, registration requirements, event team roles, and notification channels.
          </p>
        </div>
        {onBackToOverview && (
          <button 
            onClick={onBackToOverview}
            className="self-start sm:self-center bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-[#18181B] px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs shrink-0 cursor-pointer"
          >
            Back to overview
          </button>
        )}
      </div>

      {/* FEEDBACK TOAST */}
      {feedbackMessage && (
        <div className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-lg border animate-fade-in flex items-center space-x-3 text-xs font-medium max-w-md ${
          feedbackMessage.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          <div className={`p-1.5 rounded-lg ${feedbackMessage.type === 'success' ? 'bg-emerald-100' : 'bg-red-100'}`}>
            <Check className="w-4 h-4" />
          </div>
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* QUICK STATS / METRICS BANNER */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-component-version="admin-settings-metrics-approved">
        {[
          { label: 'Super administrators', val: totalSuperAdmins, sub: 'full permissions' },
          { label: 'Admins & registrars', val: totalAdmins, sub: 'application reviews' },
          { label: 'Team members', val: totalTeamStaff, sub: 'check-in & gate operations' },
          { label: 'Active volunteers', val: totalActiveVols, sub: 'approved helpers' }
        ].map((item, idx) => (
          <div 
            key={idx} 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-xs"
          >
            <span className="text-[10px] font-medium text-zinc-400 block">
              {item.label}
            </span>
            <span className="text-2xl sm:text-3xl font-medium font-serif text-[#18181B] mt-1.5 block">
              {item.val}
            </span>
            <span className="text-[10px] text-zinc-400 block mt-1">
              {item.sub}
            </span>
            <div className="absolute top-0 right-0 h-full w-1.5 bg-[#C59B27]/10" />
          </div>
        ))}
      </div>

      {/* SETTINGS SUB-NAVIGATION TABS */}
      <div 
        className="flex border-b border-[#EAE8E1] overflow-x-auto gap-2 scrollbar-none pb-0.5"
        data-component-version="admin-settings-tabs-v2-refined"
      >
        {[
          { id: 'parent-access', label: 'Parent access & details', icon: Users },
          { id: 'team-access', label: 'Event team access', icon: ShieldCheck },
          { id: 'message-channels', label: 'Message channels', icon: MessageSquare },
          { id: 'landing-page', label: 'Landing page manager', icon: SettingsIcon },
          { id: 'app-media', label: 'App media', icon: Image }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSubTab(tab.id as any);
                setSelectedMember(null);
              }}
              className={`flex items-center space-x-2 py-3 px-4 text-xs font-medium border-b-2 transition-all whitespace-nowrap focus:outline-none cursor-pointer ${
                isActive 
                  ? 'border-[#C59B27] text-[#C59B27]' 
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#C59B27]' : 'text-zinc-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* CONTENT WORKSPACE */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="w-8 h-8 text-[#C59B27] animate-spin" />
          <p className="text-xs text-zinc-400 font-medium">Loading settings...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* MAIN SETTINGS LEFT COLUMN (7 or 12 columns depending on selection) */}
          <div className={`${activeSubTab === 'team-access' || activeSubTab === 'landing-page' || activeSubTab === 'app-media' ? 'lg:col-span-12' : 'lg:col-span-7'} space-y-6`}>
            
            {/* SUB-TAB 1: PARENT ACCESS */}
            {activeSubTab === 'parent-access' && (
              <div className="space-y-6">
                
                {/* Parent Access Toggles */}
                <div 
                  className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-5"
                  data-component-version="admin-settings-parent-access-v2-refined"
                >
                  <div className="border-b border-[#EAE8E1] pb-3">
                    <h3 className="font-serif font-medium text-[#18181B] text-lg">Parent access</h3>
                    <p className="text-xs text-zinc-500 mt-1">Choose how parents can register, sign in, and update child details.</p>
                  </div>

                  <div className="space-y-4">
                    {/* Toggle: New Registrations */}
                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-1 pr-4">
                        <span className="text-sm font-medium text-[#18181B] block">New parent registration</span>
                        <p className="text-xs text-zinc-400 leading-normal max-w-md">
                          Allow new parents to create accounts from the landing page.
                        </p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setParentRegistrationEnabled(!parentRegistrationEnabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          parentRegistrationEnabled ? 'bg-[#C59B27]' : 'bg-zinc-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            parentRegistrationEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Toggle: Parent Login */}
                    <div className="flex items-center justify-between py-4 border-t border-zinc-100">
                      <div className="space-y-1 pr-4">
                        <span className="text-sm font-medium text-[#18181B] block">Parent sign in</span>
                        <p className="text-xs text-zinc-400 leading-normal max-w-md">
                          Allow existing parents to sign in, view passes, and update allowed details.
                        </p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setParentLoginEnabled(!parentLoginEnabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          parentLoginEnabled ? 'bg-[#C59B27]' : 'bg-zinc-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            parentLoginEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Required Details Configuration */}
                <div 
                  className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-5" 
                  data-component-version="admin-settings-required-details-v2-refined"
                >
                  <div className="border-b border-[#EAE8E1] pb-3">
                    <h3 className="font-serif font-medium text-[#18181B] text-lg">Required details</h3>
                    <p className="text-xs text-zinc-500 mt-1">Choose the details parents must provide before an application can be reviewed.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      {/* Checkbox: Child photo */}
                      <button 
                        type="button"
                        onClick={() => setRequiredChildPhoto(!requiredChildPhoto)}
                        className={`flex items-start space-x-3.5 p-4 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                          requiredChildPhoto 
                            ? 'border-[#C59B27]/40 bg-[#C59B27]/5' 
                            : 'border-[#EAE8E1] bg-white hover:border-zinc-300'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {requiredChildPhoto ? (
                            <div className="w-5 h-5 rounded bg-[#C59B27] flex items-center justify-center text-white">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded border border-zinc-300 bg-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-[#18181B] block">Child photo</span>
                          <span className="text-[11px] text-zinc-500 block mt-0.5 leading-normal">
                            Required for child identification.
                          </span>
                        </div>
                      </button>

                      {/* Checkbox: Parent photo */}
                      <button 
                        type="button"
                        onClick={() => setRequiredParentPhoto(!requiredParentPhoto)}
                        className={`flex items-start space-x-3.5 p-4 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                          requiredParentPhoto 
                            ? 'border-[#C59B27]/40 bg-[#C59B27]/5' 
                            : 'border-[#EAE8E1] bg-white hover:border-zinc-300'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {requiredParentPhoto ? (
                            <div className="w-5 h-5 rounded bg-[#C59B27] flex items-center justify-center text-white">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded border border-zinc-300 bg-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-[#18181B] block">Parent photo</span>
                          <span className="text-[11px] text-zinc-500 block mt-0.5 leading-normal">
                            Required for parent profile checks.
                          </span>
                        </div>
                      </button>

                      {/* Checkbox: Authorized Pickup Person */}
                      <button 
                        type="button"
                        onClick={() => setRequiredPickupPerson(!requiredPickupPerson)}
                        className={`flex items-start space-x-3.5 p-4 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                          requiredPickupPerson 
                            ? 'border-[#C59B27]/40 bg-[#C59B27]/5' 
                            : 'border-[#EAE8E1] bg-white hover:border-zinc-300'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {requiredPickupPerson ? (
                            <div className="w-5 h-5 rounded bg-[#C59B27] flex items-center justify-center text-white">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded border border-zinc-300 bg-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-[#18181B] block">Pickup person photo</span>
                          <span className="text-[11px] text-zinc-500 block mt-0.5 leading-normal">
                            Required for safe pickup.
                          </span>
                        </div>
                      </button>

                      {/* Checkbox: Care Consent */}
                      <button 
                        type="button"
                        onClick={() => setRequiredMedicalNotes(!requiredMedicalNotes)}
                        className={`flex items-start space-x-3.5 p-4 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                          requiredMedicalNotes 
                            ? 'border-[#C59B27]/40 bg-[#C59B27]/5' 
                            : 'border-[#EAE8E1] bg-white hover:border-zinc-300'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {requiredMedicalNotes ? (
                            <div className="w-5 h-5 rounded bg-[#C59B27] flex items-center justify-center text-white">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded border border-zinc-300 bg-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-[#18181B] block">Care consent</span>
                          <span className="text-[11px] text-zinc-500 block mt-0.5 leading-normal">
                            Required before review.
                          </span>
                        </div>
                      </button>

                      {/* Checkbox: Home Address (Locked/Safety-critical) */}
                      <div 
                        className="flex items-start space-x-3.5 p-4 rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] text-left select-none relative"
                      >
                        <div className="mt-0.5 shrink-0">
                          <div className="w-5 h-5 rounded bg-zinc-300 flex items-center justify-center text-white">
                            <Lock className="w-3 h-3" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 pr-24">
                          <span className="text-xs font-semibold text-zinc-500 block">Home address</span>
                          <span className="text-[11px] text-zinc-400 block mt-0.5 leading-normal">
                            Required for parent records.
                          </span>
                        </div>
                        <span className="absolute top-4 right-4 bg-zinc-100 text-zinc-500 text-[9px] font-medium px-2 py-0.5 rounded uppercase tracking-wider">
                          Required for safety
                        </span>
                      </div>

                      {/* Checkbox: WhatsApp Number (Locked/Safety-critical) */}
                      <div 
                        className="flex items-start space-x-3.5 p-4 rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] text-left select-none relative"
                      >
                        <div className="mt-0.5 shrink-0">
                          <div className="w-5 h-5 rounded bg-zinc-300 flex items-center justify-center text-white">
                            <Lock className="w-3 h-3" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 pr-24">
                          <span className="text-xs font-semibold text-zinc-500 block">WhatsApp number</span>
                          <span className="text-[11px] text-zinc-400 block mt-0.5 leading-normal">
                            Required for event updates.
                          </span>
                        </div>
                        <span className="absolute top-4 right-4 bg-zinc-100 text-zinc-500 text-[9px] font-medium px-2 py-0.5 rounded uppercase tracking-wider">
                          Required for safety
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save button for Parent Access */}
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSaveGeneralSettings}
                    loading={savingGeneral}
                    className="px-6 py-2.5 text-xs font-semibold"
                  >
                    Save Changes
                  </Button>
                </div>

              </div>
            )}

            {/* SUB-TAB 2: EVENT TEAM ACCESS / STAFF ROLES */}
            {activeSubTab === 'team-access' && (
              <div className="space-y-6" data-component-version="admin-settings-event-team-v1">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  
                  {/* Left: Interactive Team Members Table (7 Columns) */}
                  <div className="lg:col-span-8 bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-[#EAE8E1] gap-2">
                      <div>
                        <h3 className="font-serif font-medium text-[#18181B] text-lg">Team members</h3>
                        <p className="text-xs text-zinc-500 mt-1">Manage authorized event staff and coordinators.</p>
                      </div>
                      <button 
                        onClick={fetchTeamDirectory}
                        className="self-start sm:self-center flex items-center space-x-1 text-xs text-[#C59B27] font-medium hover:underline cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Refresh list</span>
                      </button>
                    </div>

                    {loadingTeam ? (
                      <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 text-[#C59B27] animate-spin" />
                      </div>
                    ) : teamMembers.length === 0 ? (
                      <p className="text-xs text-zinc-400 text-center py-10">No active team records retrieved.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs min-w-[500px]">
                          <thead>
                            <tr className="border-b border-[#EAE8E1] bg-[#FAF9F6] text-zinc-500 font-medium text-[10px]">
                              <th className="py-3 px-4 font-medium">Member</th>
                              <th className="py-3 px-4 font-medium">Role</th>
                              <th className="py-3 px-4 font-medium">Status</th>
                              <th className="py-3 px-4 font-medium text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {teamMembers.map((member) => (
                              <tr 
                                key={member.id} 
                                className={`hover:bg-[#FAF9F6]/50 transition-colors group cursor-pointer ${
                                  selectedMember?.id === member.id ? 'bg-[#FAF9F6]' : ''
                                }`}
                                onClick={() => handleSelectMember(member)}
                              >
                                <td className="py-3 px-4">
                                  <div className="flex items-center space-x-3">
                                    <div className="w-7 h-7 rounded-full bg-[#C59B27]/15 text-[#C59B27] flex items-center justify-center font-semibold text-[10px] border border-[#C59B27]/20 uppercase">
                                      {member.fullName?.substring(0, 2) || 'AD'}
                                    </div>
                                    <div>
                                      <span className="font-semibold text-[#18181B] block">{member.fullName}</span>
                                      <span className="text-[10px] text-zinc-400 block">{member.email}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                                    member.role === 'super_admin' ? 'bg-red-50 text-red-700 border border-red-100' :
                                    member.role === 'admin' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                    'bg-zinc-50 text-zinc-600 border border-zinc-200'
                                  }`}>
                                    {member.role === 'super_admin' ? 'Super admin' : member.role === 'admin' ? 'Admin' : 'Team member'}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    member.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-800 border border-amber-100'
                                  }`}>
                                    {member.status}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectMember(member);
                                    }}
                                    className="text-zinc-400 group-hover:text-[#C59B27] p-1 hover:bg-zinc-100 rounded-lg transition-colors inline-flex cursor-pointer"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Add or Edit Details Form (4 Columns) */}
                  <div className="lg:col-span-4 space-y-6">
                    
                    {/* Add Team Member Card (Only visible to Super Admin) */}
                    {isSuperAdmin && !selectedMember && (
                      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-5">
                        <div className="flex items-center space-x-3 border-b border-[#EAE8E1] pb-3">
                          <div className="p-1.5 bg-[#C59B27]/5 rounded-lg text-[#C59B27] border border-[#C59B27]/10">
                            <UserPlus className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-serif font-medium text-[#18181B] text-base">Add team member</h3>
                            <p className="text-xs text-zinc-500 mt-1">Invite a new staff or team member.</p>
                          </div>
                        </div>

                        <form onSubmit={handleInviteSubmit} className="space-y-4">
                          {inviteSuccessMsg && (
                            <div className="bg-emerald-50 text-emerald-800 text-[11px] p-2.5 rounded-xl border border-emerald-100 font-medium">
                              {inviteSuccessMsg}
                            </div>
                          )}
                          {inviteErrorMsg && (
                            <div className="bg-red-50 text-red-800 text-[11px] p-2.5 rounded-xl border border-red-100 font-medium">
                              {inviteErrorMsg}
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[#18181B] block">
                              Email address
                            </label>
                            <input
                              type="email"
                              required
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              placeholder="invited@koinonia.org"
                              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:border-[#C59B27] transition-all"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[#18181B] block">
                              Role
                            </label>
                            <select
                              value={inviteRole}
                              onChange={(e) => setInviteRole(e.target.value as any)}
                              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:border-[#C59B27] transition-all cursor-pointer"
                            >
                              <option value="team">Team member (gate check-in)</option>
                              <option value="admin">Admin (reviews & history)</option>
                              <option value="super_admin">Super admin (full permissions)</option>
                            </select>
                          </div>

                          <Button
                            type="submit"
                            variant="primary"
                            fullWidth
                            loading={sendingInvite}
                            className="py-2.5 text-xs font-semibold"
                          >
                            Send Invitation Link
                          </Button>
                        </form>
                      </div>
                    )}

                    {/* Selected Team Member Detail & Role Assignment (Edit Mode) */}
                    {selectedMember && (
                      <div className="bg-[#FAF9F6] border border-[#C59B27]/30 rounded-2xl p-6 space-y-5 shadow-xs">
                        <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-3">
                          <div className="flex items-center space-x-2.5">
                            <div className="p-1.5 bg-[#C59B27]/10 rounded-lg text-[#C59B27] border border-[#C59B27]/15">
                              <ShieldCheck className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="font-serif font-medium text-[#18181B] text-base">Staff details</h3>
                              <p className="text-xs text-zinc-500 mt-1">Configure role permissions for this member.</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => setSelectedMember(null)}
                            className="text-zinc-400 hover:text-[#18181B] p-1 bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Details */}
                        <div className="space-y-3.5 text-xs">
                          <div className="bg-white border border-[#EAE8E1] p-3 rounded-xl space-y-1.5">
                            <span className="text-[10px] text-zinc-400 block font-medium">Currently editing</span>
                            <span className="font-semibold text-[#18181B] block text-sm">{selectedMember.fullName}</span>
                            <span className="text-zinc-500 block">{selectedMember.email}</span>
                          </div>

                          {/* Role Select */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[#18181B] block">
                              Assigned role
                            </label>
                            {isSuperAdmin ? (
                              <select
                                value={editRoleValue}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditRoleValue(val);
                                  setEditPermissions({
                                    manageRegistrations: val === 'super_admin' || val === 'admin',
                                    gateOperations: val === 'super_admin' || val === 'admin' || val === 'team' || val === 'volunteer',
                                    messageDispatch: val === 'super_admin' || val === 'admin',
                                    fullGovernance: val === 'super_admin'
                                  });
                                }}
                                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:border-[#C59B27] transition-all font-semibold cursor-pointer"
                              >
                                <option value="volunteer">Volunteer (gate team)</option>
                                <option value="team">Team member (on-site staff)</option>
                                <option value="admin">Admin (reviews & history)</option>
                                <option value="super_admin">Super admin (full permissions)</option>
                              </select>
                            ) : (
                              <div className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-500 font-medium">
                                {selectedMember.role === 'super_admin' ? 'Super admin' : selectedMember.role === 'admin' ? 'Admin' : 'Team member'}
                              </div>
                            )}
                          </div>

                          {/* Interactive Permissions Overlay */}
                          <div className="space-y-2 pt-1">
                            <label className="text-xs font-medium text-[#18181B] block">
                              Permissions
                            </label>
                            
                            <div className="bg-white border border-[#EAE8E1] rounded-xl p-3 space-y-2.5">
                              {[
                                { key: 'manageRegistrations', label: 'Manage registrations and review applications', checked: editPermissions.manageRegistrations },
                                { key: 'gateOperations', label: 'Gate operations, checking in and out children', checked: editPermissions.gateOperations },
                                { key: 'messageDispatch', label: 'Message dispatch and notification broadcasts', checked: editPermissions.messageDispatch },
                                { key: 'fullGovernance', label: 'Full administrative access and role configurations', checked: editPermissions.fullGovernance }
                              ].map((perm) => (
                                <div key={perm.key} className="flex items-start space-x-2">
                                  {perm.checked ? (
                                    <Check className="w-4 h-4 text-[#C59B27] shrink-0 mt-0.5" />
                                  ) : (
                                    <div className="w-4 h-4 border border-zinc-300 rounded shrink-0 mt-0.5" />
                                  )}
                                  <span className="text-[11px] text-zinc-600 font-medium leading-normal">{perm.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Save Actions */}
                          {isSuperAdmin ? (
                            <div className="flex items-center space-x-2 pt-2">
                              <Button
                                type="button"
                                variant="primary"
                                fullWidth
                                loading={savingRole}
                                onClick={handleSaveMemberRole}
                                className="py-2.5 text-xs font-semibold"
                              >
                                Save Changes
                              </Button>
                              <button
                                type="button"
                                onClick={() => setSelectedMember(null)}
                                className="px-4 py-2.5 text-xs font-medium border border-zinc-300 hover:bg-zinc-50 bg-white rounded-xl text-zinc-700 transition-all shrink-0 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <p className="text-[10px] text-zinc-400 text-center italic pt-2">
                              Only Super Administrators can edit role allocations.
                            </p>
                          )}

                        </div>
                      </div>
                    )}

                  </div>

                </div>
              </div>
            )}

            {/* SUB-TAB 3: MESSAGE CHANNELS */}
            {activeSubTab === 'message-channels' && (
              <div className="space-y-6" data-component-version="admin-settings-message-channels-v1">
                
                {/* Channel Provider Status Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Email Channel status */}
                  <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-3 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Mail className="w-4.5 h-4.5 text-[#C59B27]" />
                        <span className="text-xs font-semibold text-[#18181B]">Email channel</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        emailEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-zinc-100 text-zinc-500'
                      }`}>
                        {emailEnabled ? 'Active' : 'Unconfigured'}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 space-y-1">
                      <p>Provider: <strong className="text-zinc-700 font-medium">{emailProvider || 'Resend'}</strong></p>
                      <p>API key: <strong className="text-zinc-500 font-normal">••••••••••••••••</strong></p>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-normal border-t border-zinc-100 pt-2.5">
                      Used for issuing secure admin activation links and volunteer approval emails.
                    </p>
                  </div>

                  {/* WhatsApp/SMS channel status */}
                  <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-3 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <MessageSquare className="w-4.5 h-4.5 text-[#C59B27]" />
                        <span className="text-xs font-semibold text-[#18181B]">WhatsApp channel</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        whatsappEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-zinc-100 text-zinc-500'
                      }`}>
                        {whatsappEnabled ? 'Active' : 'Unconfigured'}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 space-y-1">
                      <p>Provider: <strong className="text-zinc-700 font-medium">{whatsappProvider || 'Twilio WhatsApp'}</strong></p>
                      <p>Sender ID: <strong className="text-zinc-500 font-normal">••••••••••••••••</strong></p>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-normal border-t border-zinc-100 pt-2.5">
                      Used for broadcasting attendance alerts and quick gate release notification receipts.
                    </p>
                  </div>
                </div>

                {/* Message Sender Defaults Settings */}
                <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-5">
                  <div className="border-b border-[#EAE8E1] pb-3">
                    <h3 className="font-serif font-medium text-[#18181B] text-lg">Message channels</h3>
                    <p className="text-xs text-zinc-500 mt-1">Set default sender names and reply-to email signatures.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#18181B] block">
                        Sender name
                      </label>
                      <input
                        type="text"
                        required
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        placeholder="Koinonia Children & Teens"
                        className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:border-[#C59B27] transition-all"
                      />
                      <span className="text-[10px] text-zinc-400 block">Displays as sender signature.</span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#18181B] block">
                        Reply-to email
                      </label>
                      <input
                        type="email"
                        required
                        value={replyToEmail}
                        onChange={(e) => setReplyToEmail(e.target.value)}
                        placeholder="helpdesk@koinoniaglobal.org"
                        className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:border-[#C59B27] transition-all"
                      />
                      <span className="text-[10px] text-zinc-400 block">Replies will be routed here.</span>
                    </div>
                  </div>

                  <div className="flex justify-end border-t border-zinc-100 pt-4">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleSaveMessageSettings}
                      loading={savingMessages}
                      className="px-6 py-2.5 text-xs font-semibold"
                    >
                      Save Changes
                    </Button>
                  </div>
                </div>

              </div>
            )}

            {/* SUB-TAB 4: LANDING PAGE MANAGER */}
            {activeSubTab === 'landing-page' && (
              <AdminLandingView isSuperAdmin={isSuperAdmin} />
            )}

            {/* SUB-TAB 5: APP MEDIA */}
            {activeSubTab === 'app-media' && (
              <div 
                className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-6"
                data-view-version="admin-settings-media-v1"
              >
                <div className="border-b border-[#EAE8E1] pb-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-[#C59B27]/5 rounded-xl text-[#C59B27] border border-[#C59B27]/15">
                      <Image className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-serif font-medium text-[#18181B] text-base">App media</h3>
                      <p className="text-xs text-zinc-500 mt-1">Manage coverages and high-resolution images across parent and volunteer views.</p>
                    </div>
                  </div>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={loadMediaSettings}
                    disabled={loadingMedia}
                    className="text-xs flex items-center space-x-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingMedia ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </Button>
                </div>

                {mediaFeedback && (
                  <div 
                    data-feedback="media-saved-success"
                    className="bg-emerald-50 text-emerald-800 text-xs p-3 rounded-xl border border-emerald-100 font-medium flex items-center space-x-2"
                  >
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>{mediaFeedback}</span>
                  </div>
                )}

                {mediaError && (
                  <div className="bg-red-50 text-red-800 text-xs p-3 rounded-xl border border-red-100 font-medium flex items-center space-x-2">
                    <X className="w-4 h-4 text-red-600" />
                    <span>{mediaError}</span>
                  </div>
                )}

                <div 
                  className="grid grid-cols-1 md:grid-cols-3 gap-6"
                  data-component-version="admin-media-preview-v3-secure-resolved"
                >
                  {/* Parent Dashboard Hero Card */}
                  <div 
                    className="border border-[#EAE8E1] rounded-xl overflow-hidden bg-zinc-50 flex flex-col"
                    data-slot-key="parent_dashboard_hero"
                    data-component-version="admin-media-parent-hero-v1"
                  >
                    <div className="p-4 border-b border-[#EAE8E1] bg-white">
                      <h4 className="text-xs font-semibold text-[#18181B]">Parent Hero Image</h4>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Shown on parent home screen.</p>
                    </div>
                    <div className="relative aspect-video bg-zinc-100 flex items-center justify-center border-b border-[#EAE8E1]">
                      {mediaUrls.parent_dashboard_hero ? (
                        <SafeImage 
                          src={mediaUrls.parent_dashboard_hero} 
                          alt="Parent Hero" 
                          className="w-full h-full object-cover"
                          containerClassName="w-full h-full"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-zinc-400 p-4 text-center">
                          <Image className="w-8 h-8 text-zinc-300 mb-2" />
                          <span className="text-[11px] font-medium">Default Illustration</span>
                        </div>
                      )}
                      {uploadingSlot === 'parent_dashboard_hero' && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
                          <Loader2 className="w-6 h-6 text-[#C59B27] animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex items-center justify-between gap-2 mt-auto bg-white">
                      <div className="relative">
                        <input
                          type="file"
                          id="file-parent-hero"
                          className="sr-only"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadMedia('parent_dashboard_hero', file);
                          }}
                        />
                        <label
                          htmlFor="file-parent-hero"
                          className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-[#18181B] text-[11px] font-semibold rounded-lg cursor-pointer flex items-center space-x-1 transition-all"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Upload / Replace</span>
                        </label>
                      </div>
                      {mediaUrls.parent_dashboard_hero && (
                        <button
                          onClick={() => handleResetMedia('parent_dashboard_hero')}
                          className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100"
                          title="Reset to default image"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Volunteer Dashboard Hero Card */}
                  <div 
                    className="border border-[#EAE8E1] rounded-xl overflow-hidden bg-zinc-50 flex flex-col"
                    data-slot-key="volunteer_dashboard_hero"
                    data-component-version="admin-media-volunteer-hero-v1"
                  >
                    <div className="p-4 border-b border-[#EAE8E1] bg-white">
                      <h4 className="text-xs font-semibold text-[#18181B]">Volunteer Hero Image</h4>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Shown on volunteer dashboard screen.</p>
                    </div>
                    <div className="relative aspect-video bg-zinc-100 flex items-center justify-center border-b border-[#EAE8E1]">
                      {mediaUrls.volunteer_dashboard_hero ? (
                        <SafeImage 
                          src={mediaUrls.volunteer_dashboard_hero} 
                          alt="Volunteer Hero" 
                          className="w-full h-full object-cover"
                          containerClassName="w-full h-full"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-zinc-400 p-4 text-center">
                          <Image className="w-8 h-8 text-zinc-300 mb-2" />
                          <span className="text-[11px] font-medium">Default Illustration</span>
                        </div>
                      )}
                      {uploadingSlot === 'volunteer_dashboard_hero' && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
                          <Loader2 className="w-6 h-6 text-[#C59B27] animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex items-center justify-between gap-2 mt-auto bg-white">
                      <div className="relative">
                        <input
                          type="file"
                          id="file-volunteer-hero"
                          className="sr-only"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadMedia('volunteer_dashboard_hero', file);
                          }}
                        />
                        <label
                          htmlFor="file-volunteer-hero"
                          className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-[#18181B] text-[11px] font-semibold rounded-lg cursor-pointer flex items-center space-x-1 transition-all"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Upload / Replace</span>
                        </label>
                      </div>
                      {mediaUrls.volunteer_dashboard_hero && (
                        <button
                          onClick={() => handleResetMedia('volunteer_dashboard_hero')}
                          className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100"
                          title="Reset to default image"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Default Event Cover Card */}
                  <div 
                    className="border border-[#EAE8E1] rounded-xl overflow-hidden bg-zinc-50 flex flex-col"
                    data-slot-key="default_event_hero"
                    data-component-version="admin-media-default-event-v1"
                  >
                    <div className="p-4 border-b border-[#EAE8E1] bg-white">
                      <h4 className="text-xs font-semibold text-[#18181B]">Default Event Cover</h4>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Used as backup for events.</p>
                    </div>
                    <div className="relative aspect-video bg-zinc-100 flex items-center justify-center border-b border-[#EAE8E1]">
                      {mediaUrls.default_event_hero ? (
                        <SafeImage 
                          src={mediaUrls.default_event_hero} 
                          alt="Default Event Cover" 
                          className="w-full h-full object-cover"
                          containerClassName="w-full h-full"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-zinc-400 p-4 text-center">
                          <Image className="w-8 h-8 text-zinc-300 mb-2" />
                          <span className="text-[11px] font-medium">Default Cover Image</span>
                        </div>
                      )}
                      {uploadingSlot === 'default_event_hero' && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
                          <Loader2 className="w-6 h-6 text-[#C59B27] animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex items-center justify-between gap-2 mt-auto bg-white">
                      <div className="relative">
                        <input
                          type="file"
                          id="file-event-cover"
                          className="sr-only"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadMedia('default_event_hero', file);
                          }}
                        />
                        <label
                          htmlFor="file-event-cover"
                          className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-[#18181B] text-[11px] font-semibold rounded-lg cursor-pointer flex items-center space-x-1 transition-all"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Upload / Replace</span>
                        </label>
                      </div>
                      {mediaUrls.default_event_hero && (
                        <button
                          onClick={() => handleResetMedia('default_event_hero')}
                          className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100"
                          title="Reset to default image"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* MAIN SETTINGS RIGHT COLUMN: PROFILE SECURITY CARD (Only visible for Parent Access and Message Channels) */}
          {activeSubTab !== 'team-access' && activeSubTab !== 'landing-page' && activeSubTab !== 'app-media' && (
            <div className="lg:col-span-5 space-y-6">
              
              {/* Profile Security Update Password */}
              <div 
                className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-6"
                data-component-version="admin-settings-profile-security-v2-refined"
              >
                <div className="border-b border-[#EAE8E1] pb-4 flex items-center space-x-3">
                  <div className="p-2 bg-[#C59B27]/5 rounded-xl text-[#C59B27] border border-[#C59B27]/15">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif font-medium text-[#18181B] text-base">Profile security</h3>
                    <p className="text-xs text-zinc-500 mt-1">Change your admin password.</p>
                  </div>
                </div>

                <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
                  {passwordSuccess && (
                    <div className="bg-emerald-50 text-emerald-800 text-[11px] p-2.5 rounded-xl border border-emerald-100 font-medium">
                      {passwordSuccess}
                    </div>
                  )}
                  {passwordError && (
                    <div className="bg-red-50 text-red-800 text-[11px] p-2.5 rounded-xl border border-red-100 font-medium">
                      {passwordError}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#18181B] block">
                      Current password
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter your current password"
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#18181B] block">
                      New password
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#18181B] block">
                      Confirm new password
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Verify new password"
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                    />
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Use at least 8 characters with a letter and a number.
                  </p>

                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    loading={changingPassword}
                    className="py-2.5 text-xs font-semibold"
                  >
                    Change password
                  </Button>
                </form>
              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
};

