import React, { useState, useEffect } from 'react';
import { ModuleLoadingState } from '../../components/common/ModuleLoadingState';
import { 
  User, Mail, Phone, MapPin, Shield, Calendar, RefreshCw, 
  HelpCircle, Lock, LogOut, CheckCircle2, AlertTriangle, 
  Copy, Check, ChevronDown, ChevronUp, Info, ArrowRight, X,
  Camera, AlertCircle, Loader2
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { DeviceSecuritySettings } from '../../components/common/DeviceSecuritySettings';
import { isAppInstalled, promptPwaInstall } from '../../utils/pwaInstall';
import { PwaInstallGuideModal } from '../../components/common/PwaInstallBanner';
import { VolunteerWhatsAppPreferences } from '../../components/volunteer/VolunteerWhatsAppPreferences';
import {
  getPushNotificationStatus,
  subscribeUserToPush,
  unsubscribeUserFromPush,
  PushNotificationDetails
} from '../../utils/pushSubscription';
import { playSound } from '../../utils/sound';

interface VolunteerProfileViewProps {
  onSignOut: () => void;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
  showWarning: (title: string, message: string) => void;
  isOffline?: boolean;
  hasParentProfile?: boolean;
  onSwitchExperience?: (target: 'parent' | 'volunteer') => Promise<boolean>;
  isSwitchingExperience?: boolean;
}

export const VolunteerProfileView: React.FC<VolunteerProfileViewProps> = ({
  onSignOut,
  showSuccess,
  showError,
  showWarning,
  isOffline = false,
  hasParentProfile = false,
  onSwitchExperience,
  isSwitchingExperience = false
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [profileData, setProfileData] = useState<any>(null);
  const [sendingReset, setSendingReset] = useState<boolean>(false);
  const [resetSent, setResetSent] = useState<boolean>(false);

  // State for image failure fallback
  const [imgFailed, setImgFailed] = useState<boolean>(false);

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
  const [installGuidePlatform, setInstallGuidePlatform] = useState<'ios' | 'browser' | null>(null);

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
  const [profileError, setProfileError] = useState<string | null>(null);

  // Notification preferences states
  const [notifLoading, setNotifLoading] = useState<boolean>(true);
  const [notifActionLoading, setNotifActionLoading] = useState<boolean>(false);
  const [pushDetails, setPushDetails] = useState<PushNotificationDetails | null>(null);
  const [pushOn, setPushOn] = useState<boolean>(false);
  const [emailOn, setEmailOn] = useState<boolean>(true);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_sound_enabled') !== 'false';
    }
    return true;
  });

  const fetchNotificationSettings = async () => {
    try {
      const [prefs, status] = await Promise.all([
        api.parent.getNotificationPreferences().catch(() => null),
        getPushNotificationStatus()
      ]);

      if (prefs) {
        setEmailOn(prefs.emailEnabled ?? true);
        setSoundOn(prefs.soundEnabled ?? true);
        setPushOn(Boolean(prefs.pushEnabled && status.status === 'enabled'));
      } else {
        setPushOn(status.status === 'enabled');
      }

      setPushDetails(status);
    } catch (err) {
      console.warn('Error loading notification preferences:', err);
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    fetchNotificationSettings();
  }, []);

  const handleTogglePush = async () => {
    if (!pushDetails) return;
    setNotifActionLoading(true);

    try {
      if (pushOn) {
        const res = await unsubscribeUserFromPush();
        if (res.success) {
          setPushOn(false);
          await api.parent.updateNotificationPreferences({ pushEnabled: false }).catch(() => null);
          showSuccess('Push disabled', 'Push alerts have been turned off.');
        } else {
          showError('Push error', res.error || 'Failed to disable push notifications.');
        }
      } else {
        const res = await subscribeUserToPush();
        if (res.success) {
          setPushOn(true);
          await api.parent.updateNotificationPreferences({ pushEnabled: true }).catch(() => null);
          showSuccess('Push enabled', 'You will receive event alerts directly on this device.');
        } else {
          showError('Push error', res.error || 'Failed to enable push notifications.');
        }
      }
      const updatedStatus = await getPushNotificationStatus();
      setPushDetails(updatedStatus);
    } catch (err: any) {
      showError('Error', err?.message || 'Failed to update push notification settings.');
    } finally {
      setNotifActionLoading(false);
    }
  };

  const handleToggleEmail = async () => {
    const nextVal = !emailOn;
    setEmailOn(nextVal);
    try {
      await api.parent.updateNotificationPreferences({ emailEnabled: nextVal });
      showSuccess(nextVal ? 'Email updates on' : 'Email updates off', nextVal ? 'You will receive email updates.' : 'Email updates turned off.');
    } catch {
      setEmailOn(!nextVal);
      showError('Update failed', 'Could not save email notification preferences.');
    }
  };

  const handleToggleSound = async () => {
    const nextVal = !soundOn;
    setSoundOn(nextVal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('koinonia_sound_enabled', String(nextVal));
    }
    if (nextVal) {
      playSound('success');
    }
    try {
      await api.parent.updateNotificationPreferences({ soundEnabled: nextVal });
      showSuccess(nextVal ? 'Sound on' : 'Sound off', nextVal ? 'Sound alerts enabled.' : 'Sound alerts muted.');
    } catch {
      setSoundOn(!nextVal);
      showError('Update failed', 'Could not save sound alert preferences.');
    }
  };

  // Load and cache profile data
  const fetchProfile = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.volunteer.getProfile();
      if (data && data.success) {
        setProfileData(data);
        setImgFailed(false);
        setProfileError(null);
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
        const errMsg = apiErr.message || 'Could not load profile details.';
        setProfileError(errMsg);
        showError('Profile Error', errMsg);
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
      <ModuleLoadingState title="Loading your profile..." />
    );
  }

  // Safe fallback mapping from backend
  const finalUser = profileData?.user || { fullName: 'Volunteer', email: '' };
  const finalProfile = profileData?.volunteerProfile || { status: 'approved', preferredTeam: 'Teens Team', assignedTeam: 'Teens Team', assignedArea: 'General Hall', accessScope: 'General Access' };
  const finalActivity = profileData?.activity || { checkedInByYou: 0, lastScanAt: null, pendingUpdates: 0 };

  const photoUrlToUse = finalUser.profilePhotoUrl || finalUser.photoUrl || finalProfile.photoUrl || finalProfile.profilePhotoUrl || '';

  const isOnline = !isOffline && (typeof navigator === 'undefined' || navigator.onLine);
  const hasPendingUpdates = (finalActivity.pendingUpdates || 0) > 0;

  const rawAccessScope = finalProfile.accessScope || 'General Access';
  const humanAccessScope = (rawAccessScope === 'General Access' || rawAccessScope === 'General')
    ? 'Standard event access'
    : rawAccessScope;

  return (
    <div 
      className="max-w-md mx-auto w-full space-y-5 pb-24 px-4 animate-fade-in font-sans" 
      data-view-version="volunteer-profile-v6-mobile-app-header"
      id="volunteer-profile-view-container"
    >
      {/* Profile Error Toast/Alert */}
      {profileError && (
        <div className="bg-rose-50/80 dark:bg-[#21211E] border border-rose-200 dark:border-rose-900/60 rounded-2xl p-4 flex items-start gap-3 shadow-xs text-left animate-fade-in font-sans">
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-semibold text-rose-900 dark:text-[#F0EBE3]">Profile Error</h4>
            <p className="text-xs text-rose-700 dark:text-[#B8B0A5] mt-0.5 leading-normal">{profileError}</p>
          </div>
          <button
            type="button"
            onClick={() => setProfileError(null)}
            className="text-rose-400 dark:text-[#7A7570] hover:text-rose-700 dark:hover:text-[#F0EBE3] p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Profile identity card */}
      <div 
        className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-5 shadow-xs flex flex-col items-center text-center space-y-3 font-sans"
        data-component-version="volunteer-profile-identity-v3-hero"
        id="profile-identity-card"
      >
        {/* Circular Avatar */}
        <div className="relative shrink-0" data-component-version="volunteer-profile-photo-circle-v1">
          {!imgFailed && photoUrlToUse ? (
            <img 
              src={photoUrlToUse} 
              alt={finalUser.fullName || 'Volunteer'}
              onError={() => setImgFailed(true)}
              className="w-20 h-20 rounded-full object-cover border-2 border-[#C59B27] dark:border-[#3A3835] shadow-xs bg-white dark:bg-[#262520]"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#FAF5E6] dark:bg-[#262520] text-[#715D3A] dark:text-[#B8B0A5] flex items-center justify-center text-xl font-bold border-2 border-[#C59B27] dark:border-[#3A3835] shadow-xs">
              {getInitials(finalUser.fullName)}
            </div>
          )}
        </div>

        {/* Name, Team, Duty Readiness, Edit Action */}
        <div className="space-y-1.5 w-full flex flex-col items-center">
          <h3 className="text-2xl font-sans font-semibold text-gray-900 dark:text-[#F0EBE3] leading-tight">
            {finalUser.fullName}
          </h3>
          <p className="text-sm font-sans text-gray-500 dark:text-[#B8B0A5] font-medium">
            {finalProfile.assignedTeam || finalProfile.preferredTeam || 'Teens Team'}
          </p>

          {/* Duty readiness status row */}
          <div className="pt-1 pb-0.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium font-sans bg-amber-50/80 text-[#8C6B18] border border-[#C59B27]/30 dark:bg-[#262520] dark:text-[#C59B27] dark:border-[#C59B27]/40">
              Ready for duty
            </span>
          </div>

          {/* Quiet outlined Edit profile button */}
          <div className="pt-1">
            <button
              onClick={() => setIsEditOpen(true)}
              data-component-version="volunteer-profile-edit-entry-v2"
              className="text-xs font-medium font-sans text-gray-700 hover:text-gray-900 dark:text-[#F0EBE3] px-3.5 py-1.5 rounded-full border border-gray-300 hover:border-gray-400 dark:border-[#3A3835] bg-white dark:bg-[#262520] dark:hover:bg-[#2A2926] shadow-2xs transition-colors cursor-pointer"
            >
              Edit profile
            </button>
          </div>
        </div>
      </div>

      {/* 3. Connection card */}
      <div 
        className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-4 shadow-xs flex items-start space-x-3 font-sans"
        data-component-version="volunteer-profile-offline-v3-state"
        id="profile-connection-card"
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          hasPendingUpdates
            ? 'bg-amber-50 dark:bg-[#262520] text-amber-600 dark:text-[#C59B27]'
            : isOnline
              ? 'bg-emerald-50 dark:bg-[#262520] text-emerald-600 dark:text-[#C59B27]'
              : 'bg-zinc-100 dark:bg-[#262520] text-zinc-600 dark:text-[#7A7570]'
        }`}>
          <Info className="h-4.5 w-4.5" />
        </div>
        <div className="space-y-0.5 pt-0.5">
          <h4 className="text-xs font-semibold text-gray-900 dark:text-[#F0EBE3]">
            Connection: {hasPendingUpdates ? 'Needs attention' : isOnline ? 'Online' : 'Offline'}
          </h4>
          <p className="text-xs text-gray-500 dark:text-[#B8B0A5] leading-normal">
            {hasPendingUpdates 
              ? 'Some recent actions have not synced yet.' 
              : isOnline 
                ? 'Your latest Event Duty information is up to date.' 
                : 'You can continue with saved duty information. New changes will sync when you reconnect.'}
          </p>
        </div>
      </div>

      {/* 4. Event role card */}
      <div 
        className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-4 shadow-xs space-y-3 font-sans"
        data-component-version="volunteer-profile-role-v3-human"
        id="profile-role-card"
      >
        <h4 className="text-xs font-semibold text-gray-900 dark:text-[#F0EBE3]">Your event role</h4>
        
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between border-b border-[#F4F3EF] dark:border-[#302E29] pb-2.5 last:border-0 last:pb-0">
            <span className="font-normal text-gray-500 dark:text-[#B8B0A5]">Team</span>
            <span className="font-medium text-gray-900 dark:text-[#F0EBE3]">{finalProfile.assignedTeam || 'Teens Team'}</span>
          </div>
          
          <div className="flex items-center justify-between border-b border-[#F4F3EF] dark:border-[#302E29] pb-2.5 last:border-0 last:pb-0">
            <span className="font-normal text-gray-500 dark:text-[#B8B0A5]">Serving area</span>
            <span className="font-medium text-gray-900 dark:text-[#F0EBE3]">{finalProfile.assignedArea || 'General Hall'}</span>
          </div>
          
          <div className="flex items-center justify-between border-b border-[#F4F3EF] dark:border-[#302E29] pb-2.5 last:border-0 last:pb-0">
            <span className="font-normal text-gray-500 dark:text-[#B8B0A5]">Access level</span>
            <span className="font-medium text-gray-900 dark:text-[#F0EBE3]">{humanAccessScope}</span>
          </div>
        </div>
      </div>

      {/* 5. Today card */}
      <div 
        className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-4 shadow-xs space-y-3 font-sans"
        data-component-version="volunteer-profile-today-v3-human"
        id="profile-today-card"
      >
        <h4 className="text-xs font-semibold text-gray-900 dark:text-[#F0EBE3]">Today</h4>
        
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between border-b border-[#F4F3EF] dark:border-[#302E29] pb-2.5 last:border-0 last:pb-0">
            <span className="font-normal text-gray-500 dark:text-[#B8B0A5]">Checked in by you</span>
            <span className="font-medium text-gray-900 dark:text-[#F0EBE3]">{finalActivity.checkedInByYou ?? 0}</span>
          </div>
          
          <div className="flex items-center justify-between border-b border-[#F4F3EF] dark:border-[#302E29] pb-2.5 last:border-0 last:pb-0">
            <span className="font-normal text-gray-500 dark:text-[#B8B0A5]">Last scan</span>
            <span className={`font-medium text-gray-900 dark:text-[#F0EBE3] ${!finalActivity.lastScanAt ? 'dark:text-[#7A7570]' : ''}`}>
              {formatTime(finalActivity.lastScanAt)}
            </span>
          </div>
          
          <div className="flex items-center justify-between border-b border-[#F4F3EF] dark:border-[#302E29] pb-2.5 last:border-0 last:pb-0">
            <span className="font-normal text-gray-500 dark:text-[#B8B0A5]">Pending updates</span>
            <span className="font-medium text-gray-900 dark:text-[#F0EBE3]">{finalActivity.pendingUpdates ?? 0}</span>
          </div>
        </div>
      </div>

      {/* 6. Help card */}
      <div 
        className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-4 shadow-xs space-y-3 font-sans"
        data-component-version="volunteer-profile-help-v3-human"
        id="profile-help-card"
      >
        <h4 className="text-xs font-semibold text-gray-900 dark:text-[#F0EBE3]">Help & Guidance</h4>
        
        <div className="space-y-1">
          {helpTopics.map((topic, index) => {
            const isOpen = activeHelpIndex === index;
            return (
              <div key={index} className="border-b border-[#F4F3EF] dark:border-[#302E29] last:border-0 py-2">
                <button
                  onClick={() => setActiveHelpIndex(isOpen ? null : index)}
                  className="w-full flex items-center justify-between text-left text-xs font-medium text-gray-800 dark:text-[#B8B0A5] hover:text-[#C59B27] dark:hover:text-[#F0EBE3] transition-colors cursor-pointer"
                >
                  <span>{topic.title}</span>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-[#C59B27]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400 dark:text-[#7A7570]" />
                  )}
                </button>
                {isOpen && (
                  <div className="mt-2 text-xs text-gray-500 dark:text-[#B8B0A5] leading-relaxed bg-[#FAF9F6] dark:bg-[#262520] p-3 rounded-xl border border-gray-100 dark:border-[#302E29] whitespace-pre-line animate-fade-in">
                    {topic.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 7. Notifications settings card */}
      <div
        className="bg-white dark:bg-[#21211E] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] p-5 shadow-xs font-sans text-left space-y-4"
        data-component-version="volunteer-profile-notifications-v2"
        id="profile-notifications-card"
      >
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-[#F0EBE3]">
            Notifications
          </h3>
          <p className="text-xs text-zinc-500 dark:text-[#B8B0A5] mt-0.5 leading-relaxed">
            Choose how you receive updates about this event.
          </p>
        </div>

        {notifLoading ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-[#7A7570] py-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C59B27]" />
            <span>Loading notification settings...</span>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-[#302E29]">
            {/* Push Notification row */}
            <div className="py-3.5 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-zinc-900 dark:text-[#F0EBE3]">Push notifications</p>
                  <p className="text-[11px] text-zinc-500 dark:text-[#B8B0A5] leading-relaxed">
                    Urgent safety notices, duty locations, and team updates.
                  </p>
                </div>

                {pushDetails?.status === 'unsupported' ? (
                  <span className="text-[11px] text-zinc-400 dark:text-[#7A7570] shrink-0">
                    Not available
                  </span>
                ) : pushDetails?.permission === 'denied' ? (
                  <span className="text-[11px] text-zinc-400 dark:text-[#7A7570] shrink-0">
                    Blocked
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleTogglePush}
                    disabled={notifActionLoading}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer shrink-0 ${
                      pushOn
                        ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-[#262520] dark:hover:bg-[#2A2926] text-zinc-700 dark:text-[#B8B0A5] border border-transparent dark:border-[#3A3835]'
                        : 'bg-[#9A7326] hover:bg-[#7D5B18] dark:bg-[#C59B27] dark:hover:bg-[#B58E33] text-white dark:text-[#1D1D1A]'
                    } disabled:opacity-50`}
                  >
                    {notifActionLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : pushOn ? (
                      'Turn off'
                    ) : (
                      'Enable'
                    )}
                  </button>
                )}
              </div>

              {/* State helper messages */}
              {pushDetails?.status === 'unsupported' ? (
                <p className="text-[11px] text-zinc-500 dark:text-[#7A7570]">
                  Push notifications aren't supported on this browser.
                </p>
              ) : pushDetails?.permission === 'denied' ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20 p-2 rounded-lg border border-amber-200/50 dark:border-amber-900/40">
                  Notifications are blocked in your browser. Use your browser settings to allow them.
                </p>
              ) : pushOn ? (
                <p className="text-[11px] text-[#8C6B18] dark:text-[#C59B27] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27]" />
                  Push notifications are on
                </p>
              ) : (
                <p className="text-[11px] text-zinc-400 dark:text-[#7A7570]">
                  Push notifications are off
                </p>
              )}
            </div>

            {/* Email Updates row */}
            <div className="py-3.5 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-zinc-900 dark:text-[#F0EBE3]">Email updates</p>
                <p className="text-[11px] text-zinc-500 dark:text-[#B8B0A5] leading-relaxed">
                  Receive important notices and summaries by email.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleEmail}
                className="focus:outline-none cursor-pointer shrink-0"
                aria-label="Toggle email notifications"
              >
                <div className={`w-10 h-5.5 rounded-full transition-colors relative ${emailOn ? 'bg-[#9A7326] dark:bg-[#C59B27]' : 'bg-zinc-200 dark:bg-[#262520] border border-transparent dark:border-[#3A3835]'}`}>
                  <div className={`w-4.5 h-4.5 rounded-full bg-white dark:bg-[#F0EBE3] absolute top-0.5 transition-transform shadow-xs ${emailOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </button>
            </div>

            {/* Sound Alerts row */}
            <div className="py-3.5 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-zinc-900 dark:text-[#F0EBE3]">Sound alerts</p>
                <p className="text-[11px] text-zinc-500 dark:text-[#B8B0A5] leading-relaxed">
                  Play a gentle tone when notices arrive while using the app.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleSound}
                className="focus:outline-none cursor-pointer shrink-0"
                aria-label="Toggle sound alerts"
              >
                <div className={`w-10 h-5.5 rounded-full transition-colors relative ${soundOn ? 'bg-[#9A7326] dark:bg-[#C59B27]' : 'bg-zinc-200 dark:bg-[#262520] border border-transparent dark:border-[#3A3835]'}`}>
                  <div className={`w-4.5 h-4.5 rounded-full bg-white dark:bg-[#F0EBE3] absolute top-0.5 transition-transform shadow-xs ${soundOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* WhatsApp updates preference card */}
      <div className="[&>div]:dark:bg-[#21211E] [&>div]:dark:border-[#302E29] [&_h3]:dark:text-[#F0EBE3] [&_p]:dark:text-[#B8B0A5] [&_.text-zinc-900]:dark:text-[#F0EBE3] [&_.divide-zinc-100>div]:dark:border-[#302E29] [&_button]:dark:border-[#302E29]">
        <VolunteerWhatsAppPreferences
          variant="settings"
          volunteerProfile={finalProfile}
          onOpenEditProfile={() => setIsEditOpen(true)}
          onConsentUpdated={(newStatus, updatedProfile) => {
            if (updatedProfile) {
              setProfileData((prev: any) => ({
                ...prev,
                volunteerProfile: {
                  ...(prev?.volunteerProfile || {}),
                  ...updatedProfile,
                  whatsappConsentStatus: newStatus,
                  whatsapp_consent_status: newStatus
                }
              }));
            }
            fetchProfile(true);
          }}
          showSuccess={showSuccess}
          showError={showError}
        />
      </div>

      {/* Device security card */}
      <DeviceSecuritySettings 
        showSuccess={showSuccess}
        showError={showError}
      />

      {/* 8. Account actions card */}
      <div 
        className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-4 shadow-xs space-y-3 font-sans"
        data-component-version="volunteer-profile-actions-v3-human"
        id="profile-actions-card"
      >
        <h4 className="text-xs font-semibold text-gray-900 dark:text-[#F0EBE3]">Account actions</h4>
        
        <div className="space-y-1 text-xs">
          {/* Install app row */}
          {isAppInstalled() ? (
            <div className="flex items-center justify-between py-2.5 border-b border-[#F4F3EF] dark:border-[#302E29]">
              <div className="space-y-0.5">
                <span className="font-semibold text-gray-800 dark:text-[#F0EBE3]">App installed</span>
                <p className="text-[11px] text-gray-500 dark:text-[#B8B0A5]">Koinonia Children & Teens is already installed on this device.</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-[#C59B27] shrink-0" />
            </div>
          ) : (
            <div className="flex items-center justify-between py-2.5 border-b border-[#F4F3EF] dark:border-[#302E29]">
              <div className="space-y-0.5">
                <span className="font-semibold text-gray-800 dark:text-[#F0EBE3]">Install app</span>
                <p className="text-[11px] text-gray-500 dark:text-[#B8B0A5]">Add Koinonia Children & Teens to this device.</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const outcome = await promptPwaInstall();
                  if (outcome === 'accepted') {
                    showSuccess('App installed', 'Koinonia Children & Teens has been added to your device.');
                  } else if (outcome === 'manual_ios') {
                    setInstallGuidePlatform('ios');
                  } else if (outcome === 'manual_browser') {
                    setInstallGuidePlatform('browser');
                  } else if (outcome === 'already_installed') {
                    showSuccess('Already installed', 'Koinonia Children & Teens is already installed on this device.');
                  }
                }}
                className="text-xs font-semibold text-[#9A7326] dark:text-[#C59B27] hover:text-[#7D5B18] dark:hover:text-[#D4AF37] cursor-pointer transition-colors px-2 py-1 rounded-lg hover:bg-amber-50 dark:hover:bg-[#262520]"
              >
                Install
              </button>
            </div>
          )}
          {/* Switch to Parent view (for dual-role accounts) */}
          {hasParentProfile && (
            <div className="flex items-center justify-between py-2.5 border-b border-[#F4F3EF] dark:border-[#302E29]">
              <span className="font-bold text-gray-800 dark:text-[#F0EBE3]">Switch to Parent view</span>
              <button
                disabled={isSwitchingExperience}
                onClick={() => {
                  if (onSwitchExperience) {
                    onSwitchExperience('parent');
                  }
                }}
                className="text-xs font-bold text-[#C59B27] dark:text-[#D4AF37] hover:text-[#A47E1F] disabled:opacity-50 cursor-pointer transition-colors"
              >
                {isSwitchingExperience ? 'Switching…' : 'Switch view'}
              </button>
            </div>
          )}

          {/* Change password trigger */}
          <div className="flex items-center justify-between py-2.5 border-b border-[#F4F3EF] dark:border-[#302E29]">
            <span className="font-bold text-gray-800 dark:text-[#F0EBE3]">Change password</span>
            <button
              onClick={handlePasswordReset}
              disabled={sendingReset || resetSent}
              className="text-xs font-bold text-[#C59B27] dark:text-[#D4AF37] hover:text-[#A47E1F] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              {sendingReset ? 'Sending...' : resetSent ? 'Sent' : 'Send reset email'}
            </button>
          </div>
          
          {/* Sign out trigger */}
          <div className="flex items-center justify-between py-2.5">
            <span className="font-bold text-gray-800 dark:text-[#F0EBE3]">Sign out</span>
            <button
              onClick={onSignOut}
              data-component-version="volunteer-logout-action-v2-separated"
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 cursor-pointer transition-colors"
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
          <div className="bg-[#FAF9F5] dark:bg-[#1D1D1A] w-full h-full sm:h-auto sm:max-w-lg sm:rounded-3xl overflow-hidden shadow-2xl border border-[#EAE8E1] dark:border-[#302E29] flex flex-col max-h-screen sm:max-h-[90vh]">
            {/* Modal Header */}
            <div 
              className="p-5 border-b border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-between bg-white dark:bg-[#21211E] shrink-0"
              data-component-version="volunteer-edit-profile-header-v2-parent-style"
            >
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="p-1 text-[#715D3A] dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3] hover:bg-[#FAF8F4] dark:hover:bg-[#262520] rounded-full cursor-pointer transition-colors"
                  disabled={saving}
                  aria-label="Back"
                >
                  <X className="h-5 w-5" />
                </button>
                <div>
                  <h3 className="text-lg font-sans font-bold text-gray-900 dark:text-[#F0EBE3] leading-tight">Edit profile</h3>
                  <p className="text-xs text-gray-500 dark:text-[#B8B0A5] font-medium">Update your submitted details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="p-1.5 text-gray-400 dark:text-[#7A7570] hover:text-gray-600 dark:hover:text-[#F0EBE3] rounded-full hover:bg-gray-100 dark:hover:bg-[#262520] cursor-pointer hidden sm:block"
                disabled={saving}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSave} className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              <div className="text-center space-y-1 mb-2 bg-[#FAF8F4] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#302E29] p-3 rounded-xl">
                <p className="text-xs text-[#715D3A] dark:text-[#B8B0A5] font-semibold leading-relaxed">
                  Update the details you submitted when you joined the team.
                </p>
              </div>

              {/* Photo Section */}
              <div 
                className="space-y-3 bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-5 shadow-2xs text-center"
                data-component-version="volunteer-edit-profile-photo-v2-parent-style"
              >
                <span className="text-xs font-bold text-[#3F3F46] dark:text-[#F0EBE3] tracking-wide block mb-1">Profile photo</span>
                <div className="flex flex-col items-center">
                  <div className="relative shrink-0 mb-3.5">
                    {editPhotoPreview ? (
                      <img 
                        src={editPhotoPreview} 
                        alt="Preview"
                        className="w-24 h-32 rounded-2xl object-cover border-2 border-[#C59B27] shadow-xs bg-white dark:bg-[#262520]"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-24 h-32 rounded-2xl bg-[#EFECE4] dark:bg-[#262520] text-[#715D3A] dark:text-[#B8B0A5] flex flex-col items-center justify-center text-xs font-bold border-2 border-[#C59B27] gap-1">
                        <Camera className="w-6 h-6 text-[#715D3A] dark:text-[#B8B0A5]" />
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
                      className="inline-block px-4 py-2 bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] border-b-2 border-b-[#D9D6CE] dark:border-b-[#302E29] hover:border-b-[#C59B27] active:border-b-[#715D3A] rounded-lg font-bold text-xs text-gray-700 dark:text-[#F0EBE3] hover:text-[#C59B27] dark:hover:text-[#C59B27] cursor-pointer shadow-xs transition-all"
                    >
                      Change photo
                    </label>
                    <p className="text-[10px] text-gray-400 dark:text-[#7A7570] font-medium leading-normal">JPG, PNG, or WebP. Max 10MB.</p>
                  </div>
                </div>
              </div>

              {/* Personal Details Section */}
              <div 
                className="space-y-4 bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-5 shadow-2xs"
                data-component-version="volunteer-edit-profile-personal-v2-parent-style"
              >
                <h4 className="text-sm font-sans font-bold text-gray-900 dark:text-[#F0EBE3] border-b border-[#FAF8F4] dark:border-[#302E29] pb-2 mb-1">
                  Personal details
                </h4>

                {/* Full name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#3F3F46] dark:text-[#B8B0A5] tracking-wide block">Full name</label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full bg-white dark:bg-[#262520] border border-b-2 rounded-lg px-3.5 py-2.5 text-xs text-[#18181B] dark:text-[#F0EBE3] placeholder:text-[#D9D6CE] dark:placeholder:text-[#7A7570] focus:outline-none border-[#EAE8E1] dark:border-[#302E29] border-b-[#D9D6CE] dark:border-b-[#302E29] focus:border-b-[#C59B27] transition-colors shadow-2xs"
                  />
                </div>

                {/* Phone number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#3F3F46] dark:text-[#B8B0A5] tracking-wide block">Phone number</label>
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
                    className="w-full bg-white dark:bg-[#262520] border border-b-2 rounded-lg px-3.5 py-2.5 text-xs text-[#18181B] dark:text-[#F0EBE3] placeholder:text-[#D9D6CE] dark:placeholder:text-[#7A7570] focus:outline-none border-[#EAE8E1] dark:border-[#302E29] border-b-[#D9D6CE] dark:border-b-[#302E29] focus:border-b-[#C59B27] transition-colors shadow-2xs"
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
                    className="mt-0.5 h-4.5 w-4.5 rounded border-[#D9D6CE] dark:border-[#302E29] text-[#C59B27] focus:ring-[#C59B27]/30 focus:ring-offset-0 cursor-pointer accent-[#C59B27]"
                  />
                  <span className="text-xs font-semibold text-[#52525B] dark:text-[#B8B0A5] select-none leading-tight">
                    WhatsApp number is the same as phone number
                  </span>
                </label>

                {/* WhatsApp number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#3F3F46] dark:text-[#B8B0A5] tracking-wide block">WhatsApp number</label>
                  <input
                    type="tel"
                    required
                    disabled={whatsappSameAsPhone}
                    value={editWhatsapp}
                    onChange={(e) => setEditWhatsapp(e.target.value)}
                    placeholder="Enter WhatsApp number"
                    className={`w-full border border-b-2 rounded-lg px-3.5 py-2.5 text-xs transition-all shadow-2xs ${
                      whatsappSameAsPhone
                        ? 'bg-[#F4F3EF]/65 dark:bg-[#262520]/50 border-[#EAE8E1] dark:border-[#302E29] border-b-[#EAE8E1] dark:border-b-[#302E29] text-[#71717A] dark:text-[#7A7570] cursor-not-allowed font-medium'
                        : 'bg-white dark:bg-[#262520] border-[#EAE8E1] dark:border-[#302E29] border-b-[#D9D6CE] dark:border-b-[#302E29] focus:border-b-[#C59B27] text-[#18181B] dark:text-[#F0EBE3] placeholder:text-[#D9D6CE] dark:placeholder:text-[#7A7570] focus:outline-none'
                    }`}
                  />
                </div>
              </div>

              {/* Service Details Section */}
              <div 
                className="space-y-4 bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-5 shadow-2xs"
                data-component-version="volunteer-edit-profile-service-v2-parent-style"
              >
                <h4 className="text-sm font-sans font-bold text-gray-900 dark:text-[#F0EBE3] border-b border-[#FAF8F4] dark:border-[#302E29] pb-2 mb-1">
                  Service details
                </h4>

                {/* Koinonia worker segmented control */}
                <div className="space-y-2.5">
                  <span className="text-xs font-bold text-[#3F3F46] dark:text-[#B8B0A5] tracking-wide block">Koinonia worker</span>
                  <p className="text-[11px] text-[#715D3A] dark:text-[#7A7570] font-semibold -mt-1 leading-snug">
                    Select this if you already serve in a Koinonia department.
                  </p>
                  <div className="bg-[#FAF8F4] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#302E29] p-1 rounded-xl grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditIsKoinoniaWorker(true)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all focus:outline-none cursor-pointer ${
                        editIsKoinoniaWorker
                          ? 'bg-white dark:bg-[#302E29] text-[#715D3A] dark:text-[#F0EBE3] shadow-2xs border border-[#E5D5AE]/60 dark:border-[#3A3835]'
                          : 'text-gray-500 dark:text-[#7A7570] hover:text-[#18181B] dark:hover:text-[#F0EBE3] font-semibold'
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
                          ? 'bg-white dark:bg-[#302E29] text-[#715D3A] dark:text-[#F0EBE3] shadow-2xs border border-[#E5D5AE]/60 dark:border-[#3A3835]'
                          : 'text-gray-500 dark:text-[#7A7570] hover:text-[#18181B] dark:hover:text-[#F0EBE3] font-semibold'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Koinonia Department */}
                {editIsKoinoniaWorker && (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-xs font-bold text-[#3F3F46] dark:text-[#B8B0A5] tracking-wide block">Koinonia Department</label>
                    <input
                      type="text"
                      required={editIsKoinoniaWorker}
                      value={editDepartment}
                      onChange={(e) => setEditDepartment(e.target.value)}
                      placeholder="e.g. Media, Protocol, Ushering"
                      className="w-full bg-white dark:bg-[#262520] border border-b-2 rounded-lg px-3.5 py-2.5 text-xs text-[#18181B] dark:text-[#F0EBE3] placeholder:text-[#D9D6CE] dark:placeholder:text-[#7A7570] focus:outline-none border-[#EAE8E1] dark:border-[#302E29] border-b-[#D9D6CE] dark:border-b-[#302E29] focus:border-b-[#C59B27] transition-colors shadow-2xs"
                    />
                  </div>
                )}

                {/* Preferred team */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#3F3F46] dark:text-[#B8B0A5] tracking-wide block">Preferred team</label>
                  <div className="relative">
                    <select
                      value={editPreferredTeam}
                      onChange={(e) => setEditPreferredTeam(e.target.value)}
                      className="w-full bg-white dark:bg-[#262520] border border-b-2 rounded-lg px-3.5 py-2.5 text-xs text-[#18181B] dark:text-[#F0EBE3] focus:outline-none border-[#EAE8E1] dark:border-[#302E29] border-b-[#D9D6CE] dark:border-b-[#302E29] focus:border-b-[#C59B27] transition-colors appearance-none cursor-pointer shadow-2xs"
                    >
                      <option value="Check-In Team" className="dark:bg-[#262520] dark:text-[#F0EBE3]">Check-In Team</option>
                      <option value="Pickup Team" className="dark:bg-[#262520] dark:text-[#F0EBE3]">Pickup Team</option>
                      <option value="General Team" className="dark:bg-[#262520] dark:text-[#F0EBE3]">General Team</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#715D3A] dark:text-[#B8B0A5]">
                      <ChevronDown className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Experience and Notes Section */}
              <div 
                className="space-y-4 bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-5 shadow-2xs"
                data-component-version="volunteer-edit-profile-notes-v2-parent-style"
              >
                <h4 className="text-sm font-sans font-bold text-gray-900 dark:text-[#F0EBE3] border-b border-[#FAF8F4] dark:border-[#302E29] pb-2 mb-1">
                  Experience and notes
                </h4>

                {/* Serving experience segmented toggle */}
                <div className="space-y-2.5">
                  <span className="text-xs font-bold text-[#3F3F46] dark:text-[#B8B0A5] tracking-wide block">Serving experience</span>
                  <p className="text-[11px] text-[#715D3A] dark:text-[#7A7570] font-semibold -mt-1 leading-snug">
                    Do you have experience teaching or managing children?
                  </p>
                  <div className="bg-[#FAF8F4] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#302E29] p-1 rounded-xl grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditServingExperience(true)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all focus:outline-none cursor-pointer ${
                        editServingExperience
                          ? 'bg-white dark:bg-[#302E29] text-[#715D3A] dark:text-[#F0EBE3] shadow-2xs border border-[#E5D5AE]/60 dark:border-[#3A3835]'
                          : 'text-gray-500 dark:text-[#7A7570] hover:text-[#18181B] dark:hover:text-[#F0EBE3] font-semibold'
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditServingExperience(false)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all focus:outline-none cursor-pointer ${
                        !editServingExperience
                          ? 'bg-white dark:bg-[#302E29] text-[#715D3A] dark:text-[#F0EBE3] shadow-2xs border border-[#E5D5AE]/60 dark:border-[#3A3835]'
                          : 'text-gray-500 dark:text-[#7A7570] hover:text-[#18181B] dark:hover:text-[#F0EBE3] font-semibold'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Additional note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#3F3F46] dark:text-[#B8B0A5] tracking-wide block">Additional note</label>
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Add anything the event team should know."
                    rows={3}
                    className="w-full bg-white dark:bg-[#262520] border border-b-2 rounded-lg px-3.5 py-2.5 text-xs text-[#18181B] dark:text-[#F0EBE3] placeholder:text-[#D9D6CE] dark:placeholder:text-[#7A7570] focus:outline-none border-[#EAE8E1] dark:border-[#302E29] border-b-[#D9D6CE] dark:border-b-[#302E29] focus:border-b-[#C59B27] transition-colors shadow-2xs resize-none"
                  />
                </div>
              </div>

              {/* Redesigned Event Assignment Section */}
              <div 
                className="bg-[#FAF8F4] dark:bg-[#262520] border border-[#E5D5AE]/60 dark:border-[#302E29] border-b-2 border-b-[#D9D6CE] dark:border-b-[#302E29] rounded-2xl p-5 shadow-2xs space-y-4 text-left"
                data-component-version="volunteer-edit-assignment-card-v2-parent-style"
              >
                <div className="flex items-start justify-between border-b border-[#EAE8E1] dark:border-[#302E29] pb-3">
                  <div>
                    <h4 className="text-sm font-sans font-bold text-gray-900 dark:text-[#F0EBE3] leading-tight">
                      Event assignment
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-[#B8B0A5] font-medium">
                      Set by the admin team
                    </p>
                  </div>
                  <div className="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#EFECE4] dark:bg-[#21211E] border border-[#E5D5AE]/40 dark:border-[#3A3835] rounded-full text-[10px] font-bold text-[#715D3A] dark:text-[#C59B27]">
                    <Lock className="w-3 h-3 text-[#715D3A] dark:text-[#C59B27]" />
                    <span>Admin managed</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[#715D3A] dark:text-[#B8B0A5] font-bold tracking-wide uppercase text-[10px] block">Approval</span>
                    <span className="font-medium text-gray-800 dark:text-[#F0EBE3] leading-relaxed">
                      {finalProfile.status 
                        ? finalProfile.status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') 
                        : 'Approved'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[#715D3A] dark:text-[#B8B0A5] font-bold tracking-wide uppercase text-[10px] block">Team</span>
                    <span className="font-medium text-gray-800 dark:text-[#F0EBE3] leading-relaxed">
                      {finalProfile.assignedTeam || finalProfile.assigned_team 
                        ? (finalProfile.assignedTeam || finalProfile.assigned_team).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') 
                        : 'Not assigned'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[#715D3A] dark:text-[#B8B0A5] font-bold tracking-wide uppercase text-[10px] block">Area</span>
                    <span className="font-medium text-gray-800 dark:text-[#F0EBE3] leading-relaxed">
                      {finalProfile.assignedArea || finalProfile.assigned_area 
                        ? (finalProfile.assignedArea || finalProfile.assigned_area).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') 
                        : 'Not assigned'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[#715D3A] dark:text-[#B8B0A5] font-bold tracking-wide uppercase text-[10px] block">Access</span>
                    <span className="font-medium text-gray-800 dark:text-[#F0EBE3] leading-relaxed">
                      {finalProfile.accessScope || finalProfile.access_scope || finalProfile.permissions
                        ? (finalProfile.accessScope || finalProfile.access_scope || finalProfile.permissions).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') 
                        : 'Not assigned'}
                    </span>
                  </div>
                </div>

                <p className="text-[10px] text-gray-400 dark:text-[#7A7570] font-medium leading-relaxed italic border-t border-[#FAF8F4] dark:border-[#302E29] pt-2">
                  These details are managed by the admin team.
                </p>
              </div>
            </form>

            {/* Sticky Actions Footer */}
            <div 
              className="p-5 border-t border-[#EAE8E1] dark:border-[#302E29] bg-white dark:bg-[#21211E] flex space-x-3 shrink-0 shadow-lg"
              data-component-version="volunteer-edit-profile-actions-v2-parent-style"
            >
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                disabled={saving}
                className="flex-1 py-3 bg-gray-100 dark:bg-[#262520] hover:bg-gray-200 dark:hover:bg-[#2A2926] text-gray-700 dark:text-[#B8B0A5] dark:border dark:border-[#3A3835] font-bold text-xs tracking-wide rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                onClick={handleSave}
                className="flex-1 py-3 bg-[#C59B27] hover:bg-[#A47E1F] text-white dark:text-[#1D1D1A] font-bold text-xs tracking-wide rounded-xl transition-colors cursor-pointer flex items-center justify-center space-x-1.5 shadow-xs disabled:opacity-75"
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

      {/* Manual Install Instructions Modal */}
      <PwaInstallGuideModal
        isOpen={Boolean(installGuidePlatform)}
        onClose={() => setInstallGuidePlatform(null)}
        platform={installGuidePlatform || undefined}
      />

    </div>
  );
};
