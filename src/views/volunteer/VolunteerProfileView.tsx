import React, { useState, useEffect } from 'react';
import { 
  User, Mail, Phone, MapPin, Shield, Calendar, RefreshCw, 
  HelpCircle, Lock, LogOut, CheckCircle2, AlertTriangle, 
  Copy, Check, ChevronDown, ChevronUp, Info, ArrowRight, X,
  Camera, AlertCircle
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { DeviceSecuritySettings } from '../../components/common/DeviceSecuritySettings';

interface VolunteerProfileViewProps {
  onSignOut: () => void;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
  showWarning: (title: string, message: string) => void;
  isOffline?: boolean;
}

export const VolunteerProfileView: React.FC<VolunteerProfileViewProps> = ({
  onSignOut,
  showSuccess,
  showError,
  showWarning,
  isOffline = false
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [profileData, setProfileData] = useState<any>(null);
  const [sendingReset, setSendingReset] = useState<boolean>(false);
  const [resetSent, setResetSent] = useState<boolean>(false);

  // Edit profile states
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [editFullName, setEditFullName] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editWhatsapp, setEditWhatsapp] = useState<string>('');
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = useState<boolean>(false);
  const [editIsKoinoniaWorker, setEditIsKoinoniaWorker] = useState<boolean>(false);
  const [editDepartment, setEditDepartment] = useState<string>('');
  const [editPreferredTeam, setEditPreferredTeam] = useState<string>('');
  const [editServingExperience, setEditServingExperience] = useState<boolean>(false);
  const [editNote, setEditNote] = useState<string>('');
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Synchronize edit state when profile data loads or edit modal opens
  useEffect(() => {
    if (isEditOpen && profileData) {
      const u = profileData.user || {};
      const p = profileData.volunteerProfile || {};
      setEditFullName(u.fullName || u.full_name || '');
      const phoneVal = p.phone || '';
      const whatsappVal = p.whatsapp || '';
      setEditPhone(phoneVal);
      setEditWhatsapp(whatsappVal);
      setWhatsappSameAsPhone(phoneVal !== '' && phoneVal === whatsappVal);
      setEditIsKoinoniaWorker(p.is_koinonia_worker === 1 || p.isKoinoniaWorker === true);
      setEditDepartment(p.department || '');
      setEditPreferredTeam(p.preferredTeam || p.preferred_team || 'General Team');
      setEditServingExperience(p.serving_experience === 1 || p.servingExperience === true);
      setEditNote(p.note || '');
      setEditPhotoFile(null);
      setEditPhotoPreview(u.photoUrl || '');
    }
  }, [isEditOpen, profileData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFullName.trim()) {
      showError('Validation Error', 'Full Name is required.');
      return;
    }
    if (!editPhone.trim()) {
      showError('Validation Error', 'Phone number is required.');
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('fullName', editFullName.trim());
      fd.append('phone', editPhone.trim());
      // Always submit the copied phone value if synced checkbox is checked
      const finalWhatsapp = whatsappSameAsPhone ? editPhone.trim() : editWhatsapp.trim();
      fd.append('whatsapp', finalWhatsapp);
      fd.append('isKoinoniaWorker', editIsKoinoniaWorker ? 'true' : 'false');
      fd.append('department', editIsKoinoniaWorker ? editDepartment.trim() : '');
      fd.append('preferredTeam', editPreferredTeam);
      fd.append('servingExperience', editServingExperience ? 'true' : 'false');
      fd.append('note', editNote.trim());
      if (editPhotoFile) {
        fd.append('photo', editPhotoFile);
      }

      const res = await api.volunteer.updateProfile(fd);
      if (res && res.success) {
        showSuccess('Profile Updated', 'Your onboarding details have been successfully updated.');
        setIsEditOpen(false);
        await fetchProfile(true);
      } else {
        showError('Update Failed', res.message || 'Could not update profile details.');
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      const is405 = err?.message?.includes('405') || apiErr.message?.includes('405');
      if (is405) {
        showError('Update Error', 'We could not save your changes. Please try again.');
      } else {
        showError('Update Error', apiErr.message || 'We could not save your changes. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };
  
  // Local state for expandable help rows
  const [activeHelpIndex, setActiveHelpIndex] = useState<number | null>(null);

  // Load and cache profile data
  const fetchProfile = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.volunteer.getProfile();
      if (data && data.success) {
        setProfileData(data);
        localStorage.setItem('koinonia_cached_volunteer_profile', JSON.stringify(data));
      }
    } catch (err: any) {
      console.error('Error fetching volunteer profile:', err);
      const cached = localStorage.getItem('koinonia_cached_volunteer_profile');
      if (cached) {
        setProfileData(JSON.parse(cached));
        showWarning('Offline mode', 'Using cached profile data.');
      } else {
        const apiErr = extractApiError(err);
        showError('Profile Error', apiErr.message || 'Could not load profile details.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handlePasswordReset = async () => {
    if (!profileData?.user?.email) {
      showError('Reset Error', 'Your profile email is not loaded yet.');
      return;
    }
    setSendingReset(true);
    try {
      const email = profileData.user.email;
      await api.volunteer.requestPasswordReset(email);
      setResetSent(true);
      showSuccess(
        'Reset Link Sent',
        `A password reset link has been successfully sent to ${email}. Please check your inbox.`
      );
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Reset Error', apiErr.message || 'Could not send reset email.');
    } finally {
      setSendingReset(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'V';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return 'No scan yet';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const helpTopics = [
    {
      title: 'How to check in a child',
      content: '1. Open the "Scan" tab from the bottom navigation.\n2. Position the parent’s Event Pass QR code in the camera frame (or tap manual input to enter the child’s security reference code).\n3. Match the child’s physical face with their profile photo.\n4. Tap "Confirm Check-In" to record gate admission. Guide the child to their designated age-group department.'
    },
    {
      title: 'How pickup works',
      content: '1. Ask the parent or authorized guardian for their Event Pass QR code or pickup code.\n2. Scan the pass or lookup the pickup code. The screen will display the side-by-side identity verification cards.\n3. Strictly verify that the physical pickup person matches the authorized photo card displayed on the screen.\n4. Only tap "Confirm Release" after a successful visual identity match.'
    },
    {
      title: 'Report an issue',
      content: 'If you encounter behavioral incidents, medical needs, or technical issues: \n- Open the "Reports" tab to file official notes or view children requiring attention.\n- Use the Emergency Contact below to call or WhatsApp the lead coordinator immediately.'
    },
    {
      title: 'Contact event lead',
      content: 'Your lead coordinator is Pastor Isaac. \n- Emergency Number: +234 803 123 4567\n- Email: isaac@koinoniaglobal.org\n\nIf there is any emergency or security escalation, call or contact the lead coordinator immediately at the Main Entrance or Pickup Zone.'
    }
  ];

  if (loading && !profileData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4" id="profile-loading-stage">
        <div className="w-10 h-10 border-3 border-[#C59B27]/30 border-t-[#C59B27] rounded-full animate-spin"></div>
        <p className="text-xs text-gray-400 font-mono tracking-wider uppercase">Loading profile...</p>
      </div>
    );
  }

  // Safe fallback mapping from backend
  const finalUser = profileData?.user || { fullName: 'Volunteer', email: '' };
  const finalProfile = profileData?.volunteerProfile || { status: 'approved', preferredTeam: 'Not assigned', assignedTeam: 'Not assigned', assignedArea: 'Not assigned', accessScope: 'Not assigned' };
  const finalActivity = profileData?.activity || { checkedInByYou: 0, lastScanAt: null, pendingUpdates: 0 };

  return (
    <div 
      className="max-w-md mx-auto w-full space-y-6 pb-24 px-4 animate-fade-in font-sans" 
      data-view-version="volunteer-profile-v5-mobile-app-header"
      id="volunteer-profile-view-container"
    >
      {/* 2. Profile identity card */}
      <div 
        className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs flex flex-col items-center text-center space-y-4"
        data-component-version="volunteer-profile-identity-v2-stitch-handover"
        id="profile-identity-card"
      >
        {/* Profile photo with soft gold border (rectangular portrait frame) */}
        <div className="relative shrink-0" data-component-version="volunteer-profile-photo-rect-v1">
          {finalUser.photoUrl ? (
            <img 
              src={finalUser.photoUrl} 
              alt={finalUser.fullName}
              className="w-20 h-24 rounded-2xl object-cover border-2 border-[#C59B27] shadow-xs bg-white"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-20 h-24 rounded-2xl bg-[#EFECE4] text-[#715D3A] flex items-center justify-center text-xl font-bold border-2 border-[#C59B27] shadow-xs">
              {getInitials(finalUser.fullName)}
            </div>
          )}
        </div>

        {/* Serif name, small warm badge, and edit action */}
        <div className="space-y-2">
          <h3 className="text-xl font-serif-koinonia font-bold text-gray-900 leading-tight">
            {finalUser.fullName}
          </h3>
          <div className="flex flex-col items-center gap-2">
            <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider uppercase bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20">
              {finalProfile.assignedTeam || finalProfile.preferredTeam || 'Volunteer'}
            </span>
            <button
              onClick={() => setIsEditOpen(true)}
              data-component-version="volunteer-profile-edit-entry-v1"
              className="text-xs font-bold text-[#C59B27] hover:text-[#A47E1F] flex items-center gap-1 transition-colors cursor-pointer bg-amber-50/50 hover:bg-amber-50 px-3 py-1 rounded-full border border-[#C59B27]/20"
            >
              Edit profile
            </button>
          </div>
        </div>
      </div>

      {/* 3. Connection card */}
      <div 
        className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs flex items-start space-x-3"
        data-component-version="volunteer-profile-offline-v2-stitch-handover"
        id="profile-connection-card"
      >
        <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
          <Info className="h-5 w-5" />
        </div>
        <div className="space-y-0.5">
          <h4 className="text-xs font-bold text-gray-900">Connection</h4>
          <p className="text-[11px] text-gray-500 leading-normal">
            Some actions may need connection.
          </p>
        </div>
      </div>

      {/* 4. Event role card */}
      <div 
        className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4"
        data-component-version="volunteer-profile-role-v2-stitch-handover"
        id="profile-role-card"
      >
        <h4 className="text-xs font-bold font-mono text-gray-400 uppercase tracking-wider">Event role</h4>
        
        <div className="space-y-3.5 text-xs">
          <div className="flex items-center justify-between border-b border-[#F4F3EF] pb-3 last:border-0 last:pb-0">
            <span className="font-medium text-gray-500">Role</span>
            <span className="font-bold text-gray-900">{finalProfile.assignedTeam || 'Not assigned'}</span>
          </div>
          
          <div className="flex items-center justify-between border-b border-[#F4F3EF] pb-3 last:border-0 last:pb-0">
            <span className="font-medium text-gray-500">Assigned area</span>
            <span className="font-bold text-gray-900">{finalProfile.assignedArea || 'Not assigned'}</span>
          </div>
          
          <div className="flex items-center justify-between border-b border-[#F4F3EF] pb-3 last:border-0 last:pb-0">
            <span className="font-medium text-gray-500">Access</span>
            <span className="font-bold text-gray-900">{finalProfile.accessScope || 'Not assigned'}</span>
          </div>
        </div>
      </div>

      {/* 5. Today card */}
      <div 
        className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4"
        data-component-version="volunteer-profile-today-v2-stitch-handover"
        id="profile-today-card"
      >
        <h4 className="text-xs font-bold font-mono text-gray-400 uppercase tracking-wider">Today</h4>
        
        <div className="space-y-3.5 text-xs">
          <div className="flex items-center justify-between border-b border-[#F4F3EF] pb-3 last:border-0 last:pb-0">
            <span className="font-medium text-gray-500">Checked in by you</span>
            <span className="font-bold text-gray-900">{finalActivity.checkedInByYou ?? 0}</span>
          </div>
          
          <div className="flex items-center justify-between border-b border-[#F4F3EF] pb-3 last:border-0 last:pb-0">
            <span className="font-medium text-gray-500">Last scan</span>
            <span className="font-bold text-gray-900">{formatTime(finalActivity.lastScanAt)}</span>
          </div>
          
          <div className="flex items-center justify-between border-b border-[#F4F3EF] pb-3 last:border-0 last:pb-0">
            <span className="font-medium text-gray-500">Pending updates</span>
            <span className="font-bold text-gray-900">{finalActivity.pendingUpdates ?? 0}</span>
          </div>
        </div>
      </div>

      {/* 6. Help card */}
      <div 
        className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4"
        data-component-version="volunteer-profile-help-v2-stitch-handover"
        id="profile-help-card"
      >
        <h4 className="text-xs font-bold font-mono text-gray-400 uppercase tracking-wider">Help</h4>
        
        <div className="space-y-1">
          {helpTopics.map((topic, index) => {
            const isOpen = activeHelpIndex === index;
            return (
              <div key={index} className="border-b border-[#F4F3EF] last:border-0 py-2.5">
                <button
                  onClick={() => setActiveHelpIndex(isOpen ? null : index)}
                  className="w-full flex items-center justify-between text-left text-xs font-bold text-gray-800 hover:text-[#C59B27] transition-colors cursor-pointer"
                >
                  <span>{topic.title}</span>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-[#C59B27]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                {isOpen && (
                  <div className="mt-2 text-xs text-gray-500 leading-relaxed bg-[#FAF9F6] p-3 rounded-xl border border-gray-100 whitespace-pre-line animate-fade-in">
                    {topic.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Device security card */}
      <DeviceSecuritySettings 
        showSuccess={showSuccess}
        showError={showError}
      />

      {/* 7. Account actions card */}
      <div 
        className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4"
        data-component-version="volunteer-profile-actions-v2-stitch-handover"
        id="profile-actions-card"
      >
        <h4 className="text-xs font-bold font-mono text-gray-400 uppercase tracking-wider">Account actions</h4>
        
        <div className="space-y-1 text-xs">
          {/* Change password trigger */}
          <div className="flex items-center justify-between py-2.5 border-b border-[#F4F3EF]">
            <span className="font-bold text-gray-800">Change password</span>
            <button
              onClick={handlePasswordReset}
              disabled={sendingReset || resetSent}
              className="text-xs font-bold text-[#C59B27] hover:text-[#A47E1F] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              {sendingReset ? 'Sending...' : resetSent ? 'Sent' : 'Send reset email'}
            </button>
          </div>
          
          {/* Sign out trigger */}
          <div className="flex items-center justify-between py-2.5">
            <span className="font-bold text-gray-800">Sign out</span>
            <button
              onClick={onSignOut}
              data-component-version="volunteer-logout-action-v2-separated"
              className="text-xs font-bold text-rose-600 hover:text-rose-800 cursor-pointer transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Edit Profile Onboarding Form Modal */}
      {isEditOpen && (
        <div 
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 animate-fade-in"
          data-view-version="volunteer-edit-profile-v2-parent-style"
        >
          <div className="bg-[#FAF9F5] w-full h-full sm:h-auto sm:max-w-lg sm:rounded-3xl overflow-hidden shadow-2xl border border-[#EAE8E1] flex flex-col max-h-screen sm:max-h-[90vh]">
            {/* Modal Header */}
            <div 
              className="p-5 border-b border-[#EAE8E1] flex items-center justify-between bg-white shrink-0"
              data-component-version="volunteer-edit-profile-header-v2-parent-style"
            >
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="p-1 text-[#715D3A] hover:text-[#18181B] hover:bg-[#FAF8F4] rounded-full cursor-pointer transition-colors"
                  disabled={saving}
                  aria-label="Back"
                >
                  <X className="h-5 w-5" />
                </button>
                <div>
                  <h3 className="text-lg font-serif-koinonia font-bold text-gray-900 leading-tight">Edit profile</h3>
                  <p className="text-xs text-gray-500 font-medium">Update your submitted details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 cursor-pointer hidden sm:block"
                disabled={saving}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSave} className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              <div className="text-center space-y-1 mb-2 bg-[#FAF8F4] border border-[#EAE8E1] p-3 rounded-xl">
                <p className="text-xs text-[#715D3A] font-semibold leading-relaxed">
                  Update the details you submitted when you joined the team.
                </p>
              </div>

              {/* Photo Section */}
              <div 
                className="space-y-3 bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs text-center"
                data-component-version="volunteer-edit-profile-photo-v2-parent-style"
              >
                <span className="text-xs font-bold text-[#3F3F46] tracking-wide block mb-1">Profile photo</span>
                <div className="flex flex-col items-center">
                  <div className="relative shrink-0 mb-3.5">
                    {editPhotoPreview ? (
                      <img 
                        src={editPhotoPreview} 
                        alt="Preview"
                        className="w-24 h-32 rounded-2xl object-cover border-2 border-[#C59B27] shadow-xs bg-white"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-24 h-32 rounded-2xl bg-[#EFECE4] text-[#715D3A] flex flex-col items-center justify-center text-xs font-bold border-2 border-[#C59B27] gap-1">
                        <Camera className="w-6 h-6 text-[#715D3A]" />
                        <span>No photo</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <input 
                      type="file" 
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setEditPhotoFile(file);
                          setEditPhotoPreview(URL.createObjectURL(file));
                        }
                      }}
                      className="hidden" 
                      id="volunteer-photo-input"
                    />
                    <label 
                      htmlFor="volunteer-photo-input"
                      className="inline-block px-4 py-2 bg-white border border-[#EAE8E1] border-b-2 border-b-[#D9D6CE] hover:border-b-[#C59B27] active:border-b-[#715D3A] rounded-lg font-bold text-xs text-gray-700 hover:text-[#C59B27] cursor-pointer shadow-xs transition-all"
                    >
                      Change photo
                    </label>
                    <p className="text-[10px] text-gray-400 font-medium leading-normal">JPG, PNG, or WebP. Max 10MB.</p>
                  </div>
                </div>
              </div>

              {/* Personal Details Section */}
              <div 
                className="space-y-4 bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs"
                data-component-version="volunteer-edit-profile-personal-v2-parent-style"
              >
                <h4 className="text-sm font-serif-koinonia font-bold text-gray-900 border-b border-[#FAF8F4] pb-2 mb-1">
                  Personal details
                </h4>

                {/* Full name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#3F3F46] tracking-wide block">Full name</label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-xs text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27] transition-colors shadow-2xs"
                  />
                </div>

                {/* Phone number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#3F3F46] tracking-wide block">Phone number</label>
                  <input
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditPhone(val);
                      if (whatsappSameAsPhone) {
                        setEditWhatsapp(val);
                      }
                    }}
                    placeholder="Enter phone number"
                    className="w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-xs text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27] transition-colors shadow-2xs"
                  />
                </div>

                {/* Sync Checkbox */}
                <label className="flex items-start space-x-2.5 cursor-pointer mt-1 py-1">
                  <input
                    type="checkbox"
                    checked={whatsappSameAsPhone}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setWhatsappSameAsPhone(checked);
                      if (checked) {
                        setEditWhatsapp(editPhone);
                      }
                    }}
                    className="mt-0.5 h-4.5 w-4.5 rounded border-[#D9D6CE] text-[#C59B27] focus:ring-[#C59B27]/30 focus:ring-offset-0 cursor-pointer accent-[#C59B27]"
                  />
                  <span className="text-xs font-semibold text-[#52525B] select-none leading-tight">
                    WhatsApp number is the same as phone number
                  </span>
                </label>

                {/* WhatsApp number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#3F3F46] tracking-wide block">WhatsApp number</label>
                  <input
                    type="tel"
                    required
                    disabled={whatsappSameAsPhone}
                    value={editWhatsapp}
                    onChange={(e) => setEditWhatsapp(e.target.value)}
                    placeholder="Enter WhatsApp number"
                    className={`w-full border border-b-2 rounded-lg px-3.5 py-2.5 text-xs transition-all shadow-2xs ${
                      whatsappSameAsPhone
                        ? 'bg-[#F4F3EF]/65 border-[#EAE8E1] border-b-[#EAE8E1] text-[#71717A] cursor-not-allowed font-medium'
                        : 'bg-white border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27] text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none'
                    }`}
                  />
                </div>
              </div>

              {/* Service Details Section */}
              <div 
                className="space-y-4 bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs"
                data-component-version="volunteer-edit-profile-service-v2-parent-style"
              >
                <h4 className="text-sm font-serif-koinonia font-bold text-gray-900 border-b border-[#FAF8F4] pb-2 mb-1">
                  Service details
                </h4>

                {/* Koinonia worker segmented control */}
                <div className="space-y-2.5">
                  <span className="text-xs font-bold text-[#3F3F46] tracking-wide block">Koinonia worker</span>
                  <p className="text-[11px] text-[#715D3A] font-semibold -mt-1 leading-snug">
                    Select this if you already serve in a Koinonia department.
                  </p>
                  <div className="bg-[#FAF8F4] border border-[#EAE8E1] p-1 rounded-xl grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditIsKoinoniaWorker(true)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all focus:outline-none cursor-pointer ${
                        editIsKoinoniaWorker
                          ? 'bg-white text-[#715D3A] shadow-2xs border border-[#E5D5AE]/60'
                          : 'text-gray-500 hover:text-[#18181B] font-semibold'
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditIsKoinoniaWorker(false);
                        setEditDepartment('');
                      }}
                      className={`py-2 rounded-lg text-xs font-bold transition-all focus:outline-none cursor-pointer ${
                        !editIsKoinoniaWorker
                          ? 'bg-white text-[#715D3A] shadow-2xs border border-[#E5D5AE]/60'
                          : 'text-gray-500 hover:text-[#18181B] font-semibold'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Koinonia Department */}
                {editIsKoinoniaWorker && (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-xs font-bold text-[#3F3F46] tracking-wide block">Koinonia Department</label>
                    <input
                      type="text"
                      required={editIsKoinoniaWorker}
                      value={editDepartment}
                      onChange={(e) => setEditDepartment(e.target.value)}
                      placeholder="e.g. Media, Protocol, Ushering"
                      className="w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-xs text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27] transition-colors shadow-2xs"
                    />
                  </div>
                )}

                {/* Preferred team */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#3F3F46] tracking-wide block">Preferred team</label>
                  <div className="relative">
                    <select
                      value={editPreferredTeam}
                      onChange={(e) => setEditPreferredTeam(e.target.value)}
                      className="w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-xs text-[#18181B] focus:outline-none border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27] transition-colors appearance-none cursor-pointer shadow-2xs"
                    >
                      <option value="Check-In Team">Check-In Team</option>
                      <option value="Pickup Team">Pickup Team</option>
                      <option value="General Team">General Team</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#715D3A]">
                      <ChevronDown className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Experience and Notes Section */}
              <div 
                className="space-y-4 bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs"
                data-component-version="volunteer-edit-profile-notes-v2-parent-style"
              >
                <h4 className="text-sm font-serif-koinonia font-bold text-gray-900 border-b border-[#FAF8F4] pb-2 mb-1">
                  Experience and notes
                </h4>

                {/* Serving experience segmented toggle */}
                <div className="space-y-2.5">
                  <span className="text-xs font-bold text-[#3F3F46] tracking-wide block">Serving experience</span>
                  <p className="text-[11px] text-[#715D3A] font-semibold -mt-1 leading-snug">
                    Do you have experience teaching or managing children?
                  </p>
                  <div className="bg-[#FAF8F4] border border-[#EAE8E1] p-1 rounded-xl grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditServingExperience(true)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all focus:outline-none cursor-pointer ${
                        editServingExperience
                          ? 'bg-white text-[#715D3A] shadow-2xs border border-[#E5D5AE]/60'
                          : 'text-gray-500 hover:text-[#18181B] font-semibold'
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditServingExperience(false)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all focus:outline-none cursor-pointer ${
                        !editServingExperience
                          ? 'bg-white text-[#715D3A] shadow-2xs border border-[#E5D5AE]/60'
                          : 'text-gray-500 hover:text-[#18181B] font-semibold'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Additional note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#3F3F46] tracking-wide block">Additional note</label>
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Add anything the event team should know."
                    rows={3}
                    className="w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-xs text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27] transition-colors shadow-2xs resize-none"
                  />
                </div>
              </div>

              {/* Redesigned Event Assignment Section */}
              <div 
                className="bg-[#FAF8F4] border border-[#E5D5AE]/60 border-b-2 border-b-[#D9D6CE] rounded-2xl p-5 shadow-2xs space-y-4 text-left"
                data-component-version="volunteer-edit-assignment-card-v2-parent-style"
              >
                <div className="flex items-start justify-between border-b border-[#EAE8E1] pb-3">
                  <div>
                    <h4 className="text-sm font-serif-koinonia font-bold text-gray-900 leading-tight">
                      Event assignment
                    </h4>
                    <p className="text-[11px] text-gray-500 font-medium">
                      Set by the admin team
                    </p>
                  </div>
                  <div className="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#EFECE4] border border-[#E5D5AE]/40 rounded-full text-[10px] font-bold text-[#715D3A]">
                    <Lock className="w-3 h-3 text-[#715D3A]" />
                    <span>Admin managed</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[#715D3A] font-bold tracking-wide uppercase text-[10px] block">Approval</span>
                    <span className="font-medium text-gray-800 leading-relaxed">
                      {finalProfile.status 
                        ? finalProfile.status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') 
                        : 'Approved'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[#715D3A] font-bold tracking-wide uppercase text-[10px] block">Team</span>
                    <span className="font-medium text-gray-800 leading-relaxed">
                      {finalProfile.assignedTeam || finalProfile.assigned_team 
                        ? (finalProfile.assignedTeam || finalProfile.assigned_team).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') 
                        : 'Not assigned'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[#715D3A] font-bold tracking-wide uppercase text-[10px] block">Area</span>
                    <span className="font-medium text-gray-800 leading-relaxed">
                      {finalProfile.assignedArea || finalProfile.assigned_area 
                        ? (finalProfile.assignedArea || finalProfile.assigned_area).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') 
                        : 'Not assigned'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[#715D3A] font-bold tracking-wide uppercase text-[10px] block">Access</span>
                    <span className="font-medium text-gray-800 leading-relaxed">
                      {finalProfile.accessScope || finalProfile.access_scope || finalProfile.permissions
                        ? (finalProfile.accessScope || finalProfile.access_scope || finalProfile.permissions).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') 
                        : 'Not assigned'}
                    </span>
                  </div>
                </div>

                <p className="text-[10px] text-gray-400 font-medium leading-relaxed italic border-t border-[#FAF8F4] pt-2">
                  These details are managed by the admin team.
                </p>
              </div>
            </form>

            {/* Sticky Actions Footer */}
            <div 
              className="p-5 border-t border-[#EAE8E1] bg-white flex space-x-3 shrink-0 shadow-lg"
              data-component-version="volunteer-edit-profile-actions-v2-parent-style"
            >
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                disabled={saving}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs tracking-wide rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                onClick={handleSave}
                className="flex-1 py-3 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-bold text-xs tracking-wide rounded-xl transition-colors cursor-pointer flex items-center justify-center space-x-1.5 shadow-xs disabled:opacity-75"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Saving changes...</span>
                  </>
                ) : (
                  <span>Save changes</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
