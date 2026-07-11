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
  Trash2,
  Bell,
  Volume2,
  Activity,
  TrendingUp,
  Play
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { api } from '../../services/api';
import { AdminLandingView } from './AdminLandingView';
import { SafeImage } from '../../components/common/SafeImage';
import { DeviceSecuritySettings } from '../../components/common/DeviceSecuritySettings';
import { playSound, resumeAudioContext } from '../../utils/sound';
import { subscribeUserToPush } from '../../utils/pushSubscription';

interface AdminSettingsViewProps {
  onBackToOverview?: () => void;
  isSuperAdmin: boolean;
  onTriggerTestAlert?: (testAlert: any) => void;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({ 
  onBackToOverview,
  isSuperAdmin,
  onTriggerTestAlert
}) => {
  // General State
  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingMessages, setSavingMessages] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  // Fallback Escalation Rule State
  const [fallbackRule, setFallbackRule] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_urgent_alert_fallback') || 'Off';
    }
    return 'Off';
  });

  const [lastTestTime, setLastTestTime] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_last_test_time') || 'Never';
    }
    return 'Never';
  });

  const [lastTestStatus, setLastTestStatus] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_last_test_status') || 'No test run yet';
    }
    return 'No test run yet';
  });

  const [isTestingDevice, setIsTestingDevice] = useState(false);
  
  // Tab/Active Panel State inside Settings
  const [activeSubTab, setActiveSubTab] = useState<'parent-access' | 'team-access' | 'message-channels' | 'alert-delivery' | 'landing-page' | 'app-media' | 'device-security'>('parent-access');

  // Feedback State
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 4000);
  };

  // Global Admin Alert Delivery Rules State
  const [recipientRoles, setRecipientRoles] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('koinonia_admin_recipient_roles');
      if (stored) return JSON.parse(stored);
    } catch {}
    return { super_admin: true, admin: true, care_lead: true, gate_lead: false, pickup_lead: false };
  });

  const [alertCategories, setAlertCategories] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('koinonia_admin_alert_categories');
      if (stored) return JSON.parse(stored);
    } catch {}
    return { child_care: true, pickup_issue: true, pass_issue: true, medical_support: true, security_concern: true, general_help: true };
  });

  const [deliveryMethods, setDeliveryMethods] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('koinonia_admin_delivery_methods');
      if (stored) return JSON.parse(stored);
    } catch {}
    return { in_app: true, urgent_screen: true, sound: true, vibration: true, push: false, email_fallback: false };
  });

  const [severityRules, setSeverityRules] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('koinonia_admin_severity_rules');
      if (stored) return JSON.parse(stored);
    } catch {}
    return { normal: 'bell_only', important: 'bell_sound', urgent: 'bell_overlay_vibe_push' };
  });

  const [includeSecureInAppChildDetails, setIncludeSecureInAppChildDetails] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_include_secure_in_app_child_details') !== 'false';
    }
    return true;
  });

  const [deliveryChannelMode, setDeliveryChannelMode] = useState<'app_only' | 'sms_push_fallback'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('koinonia_delivery_channel_mode') as any) || 'app_only';
    }
    return 'app_only';
  });

  // Device-specific Alert Preferences State
  const [deviceReceiveUrgent, setDeviceReceiveUrgent] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_device_receive_urgent') !== 'false';
    }
    return true;
  });
  const [deviceUrgentOnly, setDeviceUrgentOnly] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_device_urgent_only') === 'true';
    }
    return false;
  });
  const [deviceSound, setDeviceSound] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_device_sound') !== 'false';
    }
    return true;
  });
  const [deviceVibration, setDeviceVibration] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_device_vibration') !== 'false';
    }
    return true;
  });
  const [devicePush, setDevicePush] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_device_push') !== 'false';
    }
    return true;
  });
  const [deviceShowPopup, setDeviceShowPopup] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_device_show_popup') !== 'false';
    }
    return true;
  });
  const [deviceRepeatUrgent, setDeviceRepeatUrgent] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_device_repeat_urgent') !== 'false';
    }
    return true;
  });

  // Push Subscription & Permission States
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() => {
    if (typeof Notification !== 'undefined') {
      return Notification.permission;
    }
    return 'default';
  });
  const [pushConnected, setPushConnected] = useState(false);
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);
  const [pushFeedback, setPushFeedback] = useState('');
  const [isVapidConfigured, setIsVapidConfigured] = useState<boolean | null>(null);
  const [isSwRegistered, setIsSwRegistered] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      // 1. Check Service Worker Registration
      if ('serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          setIsSwRegistered(regs.length > 0);
        } catch (e) {
          console.warn('SW registration check failed:', e);
        }
      }

      // 2. Check Push subscription on ready sw
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
          const reg = await navigator.serviceWorker.ready;
          if (reg && reg.pushManager) {
            const sub = await reg.pushManager.getSubscription();
            setPushConnected(!!sub);
          }
        } catch (e) {
          console.warn('Push subscription check failed:', e);
        }
      }

      // 3. Fetch VAPID key configured state
      try {
        const { publicKey } = await api.parent.getVapidPublicKey();
        setIsVapidConfigured(!!publicKey);
      } catch (err) {
        console.error('Failed to query VAPID key:', err);
        setIsVapidConfigured(false);
      }
    };
    checkStatus();
  }, []);

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
      showFeedback('Failed to retrieve settings profiles from secure server storage.', 'error');
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

  const handleSaveAlertDeliverySettings = () => {
    localStorage.setItem('koinonia_admin_recipient_roles', JSON.stringify(recipientRoles));
    localStorage.setItem('koinonia_admin_alert_categories', JSON.stringify(alertCategories));
    localStorage.setItem('koinonia_admin_delivery_methods', JSON.stringify(deliveryMethods));
    localStorage.setItem('koinonia_admin_severity_rules', JSON.stringify(severityRules));
    localStorage.setItem('koinonia_include_secure_in_app_child_details', String(includeSecureInAppChildDetails));
    localStorage.setItem('koinonia_delivery_channel_mode', deliveryChannelMode);
    
    showFeedback('Alert delivery rules updated successfully.');
  };

  const handleSaveDeviceAlertPreferences = () => {
    localStorage.setItem('koinonia_device_receive_urgent', String(deviceReceiveUrgent));
    localStorage.setItem('koinonia_device_urgent_only', String(deviceUrgentOnly));
    localStorage.setItem('koinonia_device_sound', String(deviceSound));
    localStorage.setItem('koinonia_device_vibration', String(deviceVibration));
    localStorage.setItem('koinonia_device_push', String(devicePush));
    localStorage.setItem('koinonia_device_show_popup', String(deviceShowPopup));
    localStorage.setItem('koinonia_device_repeat_urgent', String(deviceRepeatUrgent));

    // Update the other soundEnabled state used in app
    localStorage.setItem('koinonia_sound_enabled', String(deviceSound));

    showFeedback('Device alert preferences saved.');
  };

  const handleEnablePushNotifications = async () => {
    setPushFeedback('');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushFeedback('Browser notifications are not supported on this device.');
      return;
    }

    setIsSubscribingPush(true);
    try {
      const res = await subscribeUserToPush();
      if (res.success) {
        setPushConnected(true);
        setDevicePush(true);
        localStorage.setItem('koinonia_device_push', 'true');
        if (typeof Notification !== 'undefined') {
          setPushPermission(Notification.permission);
        }
        setPushFeedback('');
        showFeedback('Browser notifications successfully enabled and registered!');
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          setIsSwRegistered(regs.length > 0);
        }
      } else {
        setPushConnected(false);
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
          setPushFeedback('Notifications are blocked for this browser. Please allow notifications in your browser settings.');
        } else {
          setPushFeedback(res.error || 'Failed to complete registration.');
        }
      }
    } catch (err: any) {
      console.error('Push enabling error:', err);
      setPushFeedback(err.message || 'An unexpected error occurred during subscription.');
    } finally {
      setIsSubscribingPush(false);
    }
  };

  const handleSendTestAlert = async () => {
    setIsTestingDevice(true);
    try {
      const res = await api.admin.testDeviceAlert();
      
      if (res && res.success && res.alert) {
        const nowStr = new Date().toLocaleTimeString();
        setLastTestTime(nowStr);
        setLastTestStatus(res.message || 'Success (Triggered)');
        localStorage.setItem('koinonia_last_test_time', nowStr);
        localStorage.setItem('koinonia_last_test_status', res.message || 'Success (Triggered)');

        showFeedback(res.message || 'Safe test alert triggered! Check overlay/sound/vibe.');

        if (deviceSound) {
          try {
            resumeAudioContext();
            playSound('alert');
          } catch (e) {
            console.warn('Sound play failed on test alert:', e);
          }
        }

        if (deviceVibration && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate([200, 100, 200, 100, 500]);
          } catch (e) {
            console.warn('Vibration failed on test alert:', e);
          }
        }

        if (onTriggerTestAlert) {
          onTriggerTestAlert(res.alert);
        }
      } else {
        const errMessage = res?.message || 'Failed to dispatch device test alert.';
        setLastTestStatus(`Failed: ${errMessage}`);
        localStorage.setItem('koinonia_last_test_status', `Failed: ${errMessage}`);
        showFeedback(errMessage, 'error');
      }
    } catch (err: any) {
      console.error('Error triggering test alert:', err);
      const errMessage = err?.message || 'Network error dispatching test alert.';
      setLastTestStatus(`Failed: ${errMessage}`);
      localStorage.setItem('koinonia_last_test_status', `Failed: ${errMessage}`);
      showFeedback('Could not dispatch test alert: ' + errMessage, 'error');
    } finally {
      setIsTestingDevice(false);
    }
  };

  const handleFallbackRuleChange = (val: string) => {
    setFallbackRule(val);
    localStorage.setItem('koinonia_urgent_alert_fallback', val);
    showFeedback(`Fallback rule updated: Escalate after ${val}.`);
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
          { id: 'alert-delivery', label: 'Alert delivery & device preferences', icon: ShieldAlert },
          { id: 'landing-page', label: 'Landing page manager', icon: SettingsIcon },
          { id: 'app-media', label: 'App media', icon: Image },
          { id: 'device-security', label: 'Device security', icon: Lock }
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
          <div className={`${activeSubTab === 'team-access' || activeSubTab === 'landing-page' || activeSubTab === 'app-media' || activeSubTab === 'alert-delivery' || activeSubTab === 'device-security' ? 'lg:col-span-12' : 'lg:col-span-7'} space-y-6`}>
            
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

            {/* SUB-TAB: ALERT DELIVERY & DEVICE PREFERENCES */}
            {activeSubTab === 'alert-delivery' && (
              <div 
                className="grid grid-cols-1 lg:grid-cols-2 gap-8"
                data-view-version="admin-alert-delivery-settings-v2"
              >
                {/* COLUMN 1: GLOBAL ALERT CONTEXT & ROUTING RULES */}
                <div className="space-y-8">
                  {/* CARD 1: GLOBAL ALERT ROUTING RULES */}
                  <div 
                    className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-6 flex flex-col justify-between"
                    data-component-version="admin-alert-delivery-rules-v1"
                  >
                    <div className="space-y-6">
                      <div className="border-b border-[#EAE8E1] pb-4">
                        <div className="flex items-center space-x-2.5">
                          <div className="p-2 bg-[#C59B27]/5 rounded-xl text-[#C59B27] border border-[#C59B27]/15">
                            <ShieldAlert className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-serif font-medium text-[#18181B] text-base">Global alert routing rules</h3>
                            <p className="text-xs text-zinc-500 mt-0.5">Control how volunteer safety alerts are escalated across the organization.</p>
                          </div>
                        </div>
                      </div>

                      {/* Section 1: Who Receives Urgent Alerts */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-zinc-700 tracking-wider uppercase">1. Recipient roles</h4>
                        <p className="text-[11px] text-zinc-400 mt-1">Select the active management roles that should receive urgent escalated alerts.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                          {Object.entries(recipientRoles).map(([role, checked]) => {
                            const labelMap: Record<string, string> = {
                              super_admin: 'Super administrators',
                              admin: 'Admins & registrars',
                              care_lead: 'Care leads & coordinators',
                              gate_lead: 'Gate/check-in leads',
                              pickup_lead: 'Pickup safety coordinators'
                            };
                            return (
                              <button
                                key={role}
                                type="button"
                                onClick={() => setRecipientRoles(prev => ({ ...prev, [role]: !checked }))}
                                className="flex items-center space-x-3 p-3 rounded-xl border border-zinc-100 hover:border-[#C59B27]/30 hover:bg-zinc-50/50 transition-all text-left cursor-pointer"
                              >
                                <div className="text-zinc-500">
                                  {checked ? (
                                    <CheckSquare className="w-4.5 h-4.5 text-[#C59B27]" />
                                  ) : (
                                    <Square className="w-4.5 h-4.5 text-zinc-300" />
                                  )}
                                </div>
                                <span className="text-xs font-medium text-zinc-700">{labelMap[role] || role}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 2: Alert Categories */}
                      <div className="space-y-3 pt-2">
                        <h4 className="text-xs font-semibold text-zinc-700 tracking-wider uppercase">2. Routed categories</h4>
                        <p className="text-[11px] text-zinc-400 mt-1">Active event concern classifications subject to this routing profile.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                          {Object.entries(alertCategories).map(([cat, checked]) => {
                            const labelMap: Record<string, string> = {
                              child_care: 'Child care concern',
                              pickup_issue: 'Pickup issue',
                              pass_issue: 'Pass/check-in issue',
                              medical_support: 'Medical support',
                              security_concern: 'Security concern',
                              general_help: 'General care support'
                            };
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setAlertCategories(prev => ({ ...prev, [cat]: !checked }))}
                                className="flex items-center space-x-3 p-3 rounded-xl border border-zinc-100 hover:border-[#C59B27]/30 hover:bg-zinc-50/50 transition-all text-left cursor-pointer"
                              >
                                <div className="text-zinc-500">
                                  {checked ? (
                                    <CheckSquare className="w-4.5 h-4.5 text-[#C59B27]" />
                                  ) : (
                                    <Square className="w-4.5 h-4.5 text-zinc-300" />
                                  )}
                                </div>
                                <span className="text-xs font-medium text-zinc-700">{labelMap[cat] || cat}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 3: Delivery Methods */}
                      <div className="space-y-3 pt-2">
                        <h4 className="text-xs font-semibold text-zinc-700 tracking-wider uppercase">3. Delivery channels</h4>
                        <p className="text-[11px] text-zinc-400 mt-1">Authorized channels for transmitting active real-time safety alerts.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                          {Object.entries(deliveryMethods).map(([method, checked]) => {
                            const labelMap: Record<string, string> = {
                              in_app: 'In-app notification banner',
                              urgent_screen: 'Urgent screen takeover',
                              sound: 'Synthesized audio sound',
                              vibration: 'Physical vibration pulse',
                              push: 'Secure push notification',
                              email_fallback: 'Email fallback digest'
                            };
                            return (
                              <button
                                key={method}
                                type="button"
                                onClick={() => setDeliveryMethods(prev => ({ ...prev, [method]: !checked }))}
                                className="flex items-center space-x-3 p-3 rounded-xl border border-zinc-100 hover:border-[#C59B27]/30 hover:bg-zinc-50/50 transition-all text-left cursor-pointer"
                              >
                                <div className="text-zinc-500">
                                  {checked ? (
                                    <CheckSquare className="w-4.5 h-4.5 text-[#C59B27]" />
                                  ) : (
                                    <Square className="w-4.5 h-4.5 text-zinc-300" />
                                  )}
                                </div>
                                <span className="text-xs font-medium text-zinc-700">{labelMap[method] || method}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 4: Severity-based Routing Rules */}
                      <div className="space-y-3 pt-2">
                        <h4 className="text-xs font-semibold text-zinc-700 tracking-wider uppercase">4. Severity-based routing rules</h4>
                        <div className="border border-zinc-100 rounded-xl overflow-hidden divide-y divide-zinc-50">
                          <div className="p-3 bg-zinc-50/50 flex justify-between text-[11px] font-semibold text-zinc-500">
                            <span>SEVERITY LEVEL</span>
                            <span>ROUTING ACTION</span>
                          </div>
                          <div className="p-3 flex justify-between items-center text-xs">
                            <span className="font-medium text-zinc-800">🟢 Normal</span>
                            <span className="text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-lg text-[10px]">Bell notification only</span>
                          </div>
                          <div className="p-3 flex justify-between items-center text-xs">
                            <span className="font-medium text-amber-600">🟡 Important</span>
                            <span className="text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg text-[10px] font-medium border border-amber-100/50">Bell + Sound Chime</span>
                          </div>
                          <div className="p-3 flex justify-between items-center text-xs">
                            <span className="font-medium text-red-600">🔴 Urgent</span>
                            <span className="text-red-600 bg-red-50 px-2.5 py-1 rounded-lg text-[10px] font-medium border border-red-100/50">Bell + Full Overlay + Sound + Vibe + Push</span>
                          </div>
                        </div>
                      </div>

                      {/* Section 5: Recipients & Delivery Panel */}
                      <div 
                        className="space-y-4 pt-4 border-t border-zinc-100" 
                        data-component-version="alert-recipients-delivery-panel-v1"
                      >
                        <h4 className="text-xs font-semibold text-zinc-700 tracking-wider uppercase">
                          5. Secure recipients & delivery details policy
                        </h4>
                        
                        {/* Channel preference */}
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold text-zinc-500 block uppercase">
                            Primary Transmission Channel
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setDeliveryChannelMode('app_only')}
                              className={`p-3 rounded-xl border text-left flex items-start space-x-3 transition-all cursor-pointer ${
                                deliveryChannelMode === 'app_only'
                                  ? 'border-[#C59B27] bg-[#C59B27]/5'
                                  : 'border-zinc-100 hover:bg-zinc-50/50'
                              }`}
                            >
                              <div className="mt-0.5">
                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                  deliveryChannelMode === 'app_only' ? 'border-[#C59B27]' : 'border-zinc-300'
                                }`}>
                                  {deliveryChannelMode === 'app_only' && <div className="w-2 h-2 rounded-full bg-[#C59B27]" />}
                                </div>
                              </div>
                              <div>
                                <span className="text-xs font-semibold text-zinc-700 block">Secure App-Only</span>
                                <span className="text-[10px] text-zinc-400 font-sans mt-0.5">Restricted strictly within authenticated dashboards</span>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeliveryChannelMode('sms_push_fallback')}
                              className={`p-3 rounded-xl border text-left flex items-start space-x-3 transition-all cursor-pointer ${
                                deliveryChannelMode === 'sms_push_fallback'
                                  ? 'border-amber-500 bg-amber-50/40'
                                  : 'border-zinc-100 hover:bg-zinc-50/50'
                              }`}
                            >
                              <div className="mt-0.5">
                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                  deliveryChannelMode === 'sms_push_fallback' ? 'border-amber-500' : 'border-zinc-300'
                                }`}>
                                  {deliveryChannelMode === 'sms_push_fallback' && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                                </div>
                              </div>
                              <div>
                                <span className="text-xs font-semibold text-zinc-700 block">SMS & Push Fallback</span>
                                <span className="text-[10px] text-zinc-400 font-sans mt-0.5">Allows external SMS previews with zero child details</span>
                              </div>
                            </button>
                          </div>
                        </div>

                        {/* Child Details Inclusion Policy */}
                        <div className="space-y-2 pt-1">
                          <span className="text-[11px] font-bold text-zinc-500 block uppercase">
                            Child Context Disclosure Policy
                          </span>
                          
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={() => setIncludeSecureInAppChildDetails(true)}
                              className={`w-full p-3.5 rounded-xl border text-left flex items-start space-x-3 transition-all cursor-pointer ${
                                includeSecureInAppChildDetails
                                  ? 'border-emerald-500 bg-emerald-50/10'
                                  : 'border-zinc-100 hover:bg-zinc-50/50'
                              }`}
                            >
                              <div className="mt-0.5">
                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                  includeSecureInAppChildDetails ? 'border-emerald-500' : 'border-zinc-300'
                                }`}>
                                  {includeSecureInAppChildDetails && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                                </div>
                              </div>
                              <div>
                                <span className="text-xs font-bold text-zinc-800 block">
                                  Include secure in-app child details/photo (Recommended)
                                </span>
                                <span className="text-[10px] text-zinc-500 leading-relaxed font-sans block mt-1">
                                  Authorized users see names, photos, events, and medical/pickup flags securely inside the live app ONLY. Lock screen and SMS alerts remain anonymous.
                                </span>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setIncludeSecureInAppChildDetails(false)}
                              className={`w-full p-3.5 rounded-xl border text-left flex items-start space-x-3 transition-all cursor-pointer ${
                                !includeSecureInAppChildDetails
                                  ? 'border-zinc-500 bg-zinc-50'
                                  : 'border-zinc-100 hover:bg-zinc-50/50'
                              }`}
                            >
                              <div className="mt-0.5">
                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                  !includeSecureInAppChildDetails ? 'border-zinc-500' : 'border-zinc-300'
                                }`}>
                                  {!includeSecureInAppChildDetails && <div className="w-2 h-2 rounded-full bg-zinc-500" />}
                                </div>
                              </div>
                              <div>
                                <span className="text-xs font-bold text-zinc-800 block">
                                  Minimal alert only (No child details in push payload/lock screen)
                                </span>
                                <span className="text-[10px] text-zinc-500 leading-relaxed font-sans block mt-1">
                                  Hides child identities completely across all views and alerts. Operators must query the register physically or reference pre-distributed manifests.
                                </span>
                              </div>
                            </button>
                          </div>
                        </div>

                        {/* Critical Safety Disclaimer */}
                        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-[10px] text-red-700/80 leading-relaxed font-sans">
                          <strong className="font-bold text-red-800 block mb-0.5">⚠️ Secure Notification Compliance Notice</strong>
                          Full child profiles, primary guardians, photographs, and health/allergy flags are restricted strictly to authorized in-app views. SMS, WhatsApp, and external push notifications are completely masked for privacy compliance.
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 pt-5 flex justify-end">
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleSaveAlertDeliverySettings}
                        className="px-6 py-2.5 text-xs font-semibold flex items-center space-x-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>Save Global Rules</span>
                      </Button>
                    </div>
                  </div>

                  {/* CARD 4: FALLBACK ESCALATION RULE */}
                  <div 
                    className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-6 flex flex-col justify-between"
                    data-component-version="urgent-alert-fallback-rule-v1"
                  >
                    <div className="space-y-6">
                      <div className="border-b border-[#EAE8E1] pb-4">
                        <div className="flex items-center space-x-2.5">
                          <div className="p-2 bg-[#C59B27]/5 rounded-xl text-[#C59B27] border border-[#C59B27]/15">
                            <TrendingUp className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-serif font-medium text-[#18181B] text-base">Unresolved Escalation Fallback</h3>
                            <p className="text-xs text-zinc-500 mt-0.5">Automatically escalate unresolved critical alerts if left unacknowledged.</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 text-xs">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-zinc-700 block">
                            Escalate if urgent alert is not acknowledged after:
                          </label>
                          <select
                            value={fallbackRule}
                            onChange={(e) => handleFallbackRuleChange(e.target.value)}
                            className="w-full bg-[#FAF9F6] border border-[#EAE8E1] hover:border-zinc-300 focus:border-[#C59B27] focus:ring-1 focus:ring-[#C59B27] rounded-xl p-3 text-xs outline-none transition-all cursor-pointer"
                          >
                            <option value="Off">Off</option>
                            <option value="1 minute">1 minute</option>
                            <option value="2 minutes">2 minutes</option>
                            <option value="5 minutes">5 minutes</option>
                          </select>
                          <p className="text-[10px] text-zinc-400 mt-1">
                            If enabled, the safety tracking service monitors open urgent alerts and broadcasts a second-wave high priority notification to all active care channels if the initial dispatcher does not respond.
                          </p>
                        </div>

                        <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-xl space-y-1">
                          <span className="text-[10px] text-zinc-400 font-semibold uppercase block">SMS & WhatsApp Fallback Channel</span>
                          <p className="text-[11px] text-zinc-500 leading-relaxed">
                            External fallback is not connected yet.
                          </p>
                          <p className="text-[10px] text-zinc-400 leading-normal">
                            Secure SMS gateways must be registered via Settings &gt; Message Channels first.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: DEVICE-SPECIFIC SETTINGS & REAL-TIME READINESS */}
                <div className="space-y-8">
                  {/* CARD 2: DEVICE-SPECIFIC ALERT PREFERENCES */}
                  <div 
                    className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-6 flex flex-col justify-between"
                    data-component-version="device-alert-preferences-v1"
                  >
                    <div className="space-y-6">
                      <div className="border-b border-[#EAE8E1] pb-4">
                        <div className="flex items-center space-x-2.5">
                          <div className="p-2 bg-[#C59B27]/5 rounded-xl text-[#C59B27] border border-[#C59B27]/15">
                            <Bell className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-serif font-medium text-[#18181B] text-base">This device alert preferences</h3>
                            <p className="text-xs text-zinc-500 mt-0.5">Configure individual alert behavior specifically on this browser and device.</p>
                          </div>
                        </div>
                      </div>

                      {/* Toggle: Receive alerts */}
                      <div className="flex items-center justify-between p-4 bg-zinc-50/50 border border-zinc-100 rounded-xl">
                        <div className="space-y-0.5 pr-4">
                          <span className="text-xs font-semibold text-zinc-800">Receive safety alerts on this device</span>
                          <p className="text-[10px] text-zinc-400">Enable or disable all real-time visual and audio alerts on this browser.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeviceReceiveUrgent(!deviceReceiveUrgent)}
                          className="focus:outline-none cursor-pointer"
                        >
                          {deviceReceiveUrgent ? (
                            <ToggleRight className="w-10 h-10 text-[#C59B27]" />
                          ) : (
                            <ToggleLeft className="w-10 h-10 text-zinc-300" />
                          )}
                        </button>
                      </div>

                      {/* Only show sub-settings if alerts are enabled on this device */}
                      <div 
                        className={`space-y-4 transition-all ${deviceReceiveUrgent ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
                        data-component-version="urgent-alert-sound-settings-v2"
                      >
                        <h4 className="text-xs font-semibold text-zinc-700 tracking-wider uppercase">Device Delivery Preferences</h4>
                        
                        {/* Sound Preference */}
                        <div className="flex items-center justify-between py-2 border-b border-zinc-100">
                          <div className="space-y-0.5">
                            <span className="text-xs font-medium text-zinc-800 flex items-center space-x-1.5">
                              <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
                              <span>Play alert sound</span>
                            </span>
                            <p className="text-[10px] text-zinc-400">Plays synthesized major chord chimes during critical alert events.</p>
                            <button
                              type="button"
                              onClick={() => {
                                resumeAudioContext();
                                playSound('alert');
                              }}
                              className="mt-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-[#C59B27] border border-[#C59B27]/30 rounded text-[10px] font-bold flex items-center space-x-1 transition-all cursor-pointer"
                              title="Test alert sound trigger"
                            >
                              <Volume2 className="w-3 h-3" />
                              <span>Test Alert Sound</span>
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={!deviceReceiveUrgent}
                            onClick={() => setDeviceSound(!deviceSound)}
                            className="focus:outline-none cursor-pointer"
                          >
                            {deviceSound ? (
                              <ToggleRight className="w-9 h-9 text-[#C59B27]" />
                            ) : (
                              <ToggleLeft className="w-9 h-9 text-zinc-300" />
                            )}
                          </button>
                        </div>

                        {/* Urgent Alerts Only Toggle */}
                        <div className="flex items-center justify-between py-2 border-b border-zinc-100">
                          <div className="space-y-0.5">
                            <span className="text-xs font-medium text-zinc-800">Urgent alerts only</span>
                            <p className="text-[10px] text-zinc-400">Filter out normal/important concern alerts; only notify for absolute urgent status items.</p>
                          </div>
                          <button
                            type="button"
                            disabled={!deviceReceiveUrgent}
                            onClick={() => setDeviceUrgentOnly(!deviceUrgentOnly)}
                            className="focus:outline-none cursor-pointer"
                          >
                            {deviceUrgentOnly ? (
                              <ToggleRight className="w-9 h-9 text-[#C59B27]" />
                            ) : (
                              <ToggleLeft className="w-9 h-9 text-zinc-300" />
                            )}
                          </button>
                        </div>

                        {/* Vibration Preference */}
                        <div className="flex items-center justify-between py-2 border-b border-zinc-100">
                          <div className="space-y-0.5">
                            <span className="text-xs font-medium text-zinc-800">Vibration physical feedback</span>
                            <p className="text-[10px] text-zinc-400">Fires the physical device vibration motor for incoming events.</p>
                            {!(typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') && (
                              <p className="text-[9px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-100/30 w-fit mt-1">
                                Vibration is not supported on this device.
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={!deviceReceiveUrgent || !(typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function')}
                            onClick={() => setDeviceVibration(!deviceVibration)}
                            className={`focus:outline-none cursor-pointer ${!(typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') ? 'opacity-30' : ''}`}
                          >
                            {deviceVibration && (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') ? (
                              <ToggleRight className="w-9 h-9 text-[#C59B27]" />
                            ) : (
                              <ToggleLeft className="w-9 h-9 text-zinc-300" />
                            )}
                          </button>
                        </div>

                        {/* Urgent overlay Preference */}
                        <div className="flex items-center justify-between py-2 border-b border-zinc-100">
                          <div className="space-y-0.5">
                            <span className="text-xs font-medium text-zinc-800">Show urgent pop-up overlay</span>
                            <p className="text-[10px] text-zinc-400">Triggers a persistent critical takeover modal requiring manual clearance.</p>
                          </div>
                          <button
                            type="button"
                            disabled={!deviceReceiveUrgent}
                            onClick={() => setDeviceShowPopup(!deviceShowPopup)}
                            className="focus:outline-none cursor-pointer"
                          >
                            {deviceShowPopup ? (
                              <ToggleRight className="w-9 h-9 text-[#C59B27]" />
                            ) : (
                              <ToggleLeft className="w-9 h-9 text-zinc-300" />
                            )}
                          </button>
                        </div>

                        {/* Repeat urgent alarm Preference */}
                        <div className="flex items-center justify-between py-2 border-b border-zinc-100">
                          <div className="space-y-0.5">
                            <span className="text-xs font-medium text-zinc-800">Repeat urgent alert until acknowledged</span>
                            <p className="text-[10px] text-zinc-400">Continuously repeats synthesized sound and pulse alerts until cleared.</p>
                          </div>
                          <button
                            type="button"
                            disabled={!deviceReceiveUrgent}
                            onClick={() => setDeviceRepeatUrgent(!deviceRepeatUrgent)}
                            className="focus:outline-none cursor-pointer"
                          >
                            {deviceRepeatUrgent ? (
                              <ToggleRight className="w-9 h-9 text-[#C59B27]" />
                            ) : (
                              <ToggleLeft className="w-9 h-9 text-zinc-300" />
                            )}
                          </button>
                        </div>

                        {/* Push & SMS alerts Preference */}
                        <div className="flex items-center justify-between py-2">
                          <div className="space-y-0.5">
                            <span className="text-xs font-medium text-zinc-800">Browser push notifications</span>
                            <p className="text-[10px] text-zinc-400">Fires web push alerts to your background notification center.</p>
                          </div>
                          <button
                            type="button"
                            disabled={!deviceReceiveUrgent}
                            onClick={() => setDevicePush(!devicePush)}
                            className="focus:outline-none cursor-pointer"
                          >
                            {devicePush ? (
                              <ToggleRight className="w-9 h-9 text-[#C59B27]" />
                            ) : (
                              <ToggleLeft className="w-9 h-9 text-zinc-300" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 pt-5 flex justify-end">
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleSaveDeviceAlertPreferences}
                        className="px-6 py-2.5 text-xs font-semibold flex items-center space-x-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>Save Device Settings</span>
                      </Button>
                    </div>
                  </div>

                  {/* CARD 3: DEVICE ALERT READINESS CHECK */}
                  <div 
                    className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-6 flex flex-col justify-between"
                    data-component-version="device-alert-readiness-v2-laptop"
                  >
                    <div className="space-y-6">
                      <div className="border-b border-[#EAE8E1] pb-4">
                        <div className="flex items-center space-x-2.5">
                          <div className="p-2 bg-[#C59B27]/5 rounded-xl text-[#C59B27] border border-[#C59B27]/15">
                            <Activity className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-serif font-medium text-[#18181B] text-base">Device alert status</h3>
                            <p className="text-xs text-zinc-500 mt-0.5">Live readiness check of alert delivery on this active terminal.</p>
                          </div>
                        </div>
                      </div>

                      {/* Explainer with premium honest wording */}
                      <div 
                        className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-4 text-xs text-zinc-600 space-y-2 leading-relaxed"
                        data-component-version="admin-alert-delivery-explainer-v2"
                      >
                        <p className="font-semibold text-zinc-800">Honest Safety Notice</p>
                        <p>
                          For laptops, keep this app open during the event for the full urgent alert experience. Browser push can still notify you in the background when supported and enabled.
                        </p>
                        <p className="text-[#C59B27] font-medium flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#C59B27] animate-pulse"></span>
                          Best protection: Keep this application open on your duty laptop during active hours.
                        </p>
                      </div>

                      {/* Device Readiness Grid */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-xl space-y-1">
                          <span className="text-[10px] text-zinc-400 font-medium block">IN-APP OVERLAY</span>
                          {deviceReceiveUrgent ? (
                            <span className="font-semibold text-emerald-600 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Ready
                            </span>
                          ) : (
                            <span className="font-semibold text-amber-600 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Needs app open
                            </span>
                          )}
                        </div>

                        <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-xl space-y-1">
                          <span className="text-[10px] text-zinc-400 font-medium block">PREMIUM SOUND</span>
                          {!deviceSound ? (
                            <span className="font-semibold text-zinc-400">Disabled</span>
                          ) : (
                            <span className="font-semibold text-emerald-600">Enabled</span>
                          )}
                        </div>

                        <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-xl space-y-1">
                          <span className="text-[10px] text-zinc-400 font-medium block">VIBRATION ENGINE</span>
                          {!(typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') ? (
                            <span className="font-semibold text-zinc-400">Vibration is not supported on this device.</span>
                          ) : deviceVibration ? (
                            <span className="font-semibold text-emerald-600">Supported & Active</span>
                          ) : (
                            <span className="font-semibold text-zinc-500">Supported (Off)</span>
                          )}
                        </div>

                        <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-xl space-y-1">
                          <span className="text-[10px] text-zinc-400 font-medium block">BROWSER NOTIFICATIONS</span>
                          {typeof Notification === 'undefined' ? (
                            <span className="font-semibold text-zinc-400">Not supported</span>
                          ) : pushPermission === 'default' ? (
                            <span className="font-semibold text-amber-600">Permission not requested</span>
                          ) : pushPermission === 'denied' ? (
                            <span className="font-semibold text-red-500">Permission blocked</span>
                          ) : (
                            <span className="font-semibold text-emerald-600">Permission granted</span>
                          )}
                        </div>

                        <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-xl space-y-1">
                          <span className="text-[10px] text-zinc-400 font-medium block">PUSH SUBSCRIPTION</span>
                          {pushConnected ? (
                            <span className="font-semibold text-emerald-600">Connected</span>
                          ) : (
                            <span className="font-semibold text-amber-600">Not connected</span>
                          )}
                        </div>

                        <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-xl space-y-1">
                          <span className="text-[10px] text-zinc-400 font-medium block">PUSH READY</span>
                          {isVapidConfigured === false ? (
                            <span className="font-semibold text-amber-600">Push setup incomplete</span>
                          ) : isVapidConfigured === true ? (
                            <span className="font-semibold text-emerald-600">Setup complete</span>
                          ) : (
                            <span className="font-semibold text-zinc-400">Checking...</span>
                          )}
                        </div>
                      </div>

                      {/* Enable Browser Notifications Button (Phase 3) */}
                      <div 
                        className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 space-y-3"
                        data-component-version="browser-notification-permission-v1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-xs font-semibold text-zinc-800">Browser notification permission</span>
                            <p className="text-[10px] text-zinc-400">Requested only on clicking Enable</p>
                          </div>
                          {!pushConnected && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleEnablePushNotifications}
                              disabled={isSubscribingPush || typeof Notification === 'undefined' || (typeof Notification !== 'undefined' && Notification.permission === 'denied')}
                              className="px-3 py-1.5 text-[11px] font-medium border-[#C59B27]/40 hover:bg-[#C59B27]/5 text-[#C59B27] cursor-pointer"
                            >
                              {isSubscribingPush ? 'Enabling...' : 'Enable browser notifications'}
                            </Button>
                          )}
                        </div>

                        {/* Direct detailed feedbacks */}
                        {typeof Notification === 'undefined' && (
                          <p className="text-[10px] text-red-500">Browser notifications are not supported on this device.</p>
                        )}
                        {typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
                          <p className="text-[10px] text-red-500">Notifications are blocked for this browser. Please allow notifications in your browser settings.</p>
                        )}
                        {pushFeedback && (
                          <p className="text-[10px] text-amber-600">{pushFeedback}</p>
                        )}
                        {pushConnected && (
                          <p className="text-[10px] text-emerald-600 flex items-center gap-1 font-medium">
                            <Check className="w-3.5 h-3.5" />
                            Notifications are active and connected on this device.
                          </p>
                        )}
                      </div>

                      {/* Detailed Push Alert Status Panel (Phase 4 & 5) */}
                      <div 
                        className="bg-zinc-50/50 border border-zinc-100 rounded-xl p-4 space-y-3"
                        data-component-version="push-alert-status-panel-v1"
                      >
                        <span className="text-xs font-bold text-zinc-800 block">Detailed Push Alert Status</span>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-zinc-600">
                          <div className="flex justify-between border-b border-zinc-100/50 pb-1">
                            <span>Service worker support:</span>
                            <strong className={('serviceWorker' in navigator) ? 'text-emerald-600' : 'text-zinc-400'}>
                              {('serviceWorker' in navigator) ? 'Supported' : 'Unsupported'}
                            </strong>
                          </div>
                          <div className="flex justify-between border-b border-zinc-100/50 pb-1">
                            <span>Push manager support:</span>
                            <strong className={('PushManager' in window) ? 'text-emerald-600' : 'text-zinc-400'}>
                              {('PushManager' in window) ? 'Supported' : 'Unsupported'}
                            </strong>
                          </div>
                          <div className="flex justify-between border-b border-zinc-100/50 pb-1">
                            <span>Notification permission:</span>
                            <strong className={pushPermission === 'granted' ? 'text-emerald-600' : pushPermission === 'denied' ? 'text-red-500' : 'text-amber-500'}>
                              {pushPermission}
                            </strong>
                          </div>
                          <div className="flex justify-between border-b border-zinc-100/50 pb-1">
                            <span>Service worker registered:</span>
                            <strong className={isSwRegistered ? 'text-emerald-600' : 'text-amber-500'}>
                              {isSwRegistered ? 'Yes' : 'No'}
                            </strong>
                          </div>
                          <div className="flex justify-between border-b border-zinc-100/50 pb-1 col-span-2">
                            <span>Server push subscription:</span>
                            <strong className={pushConnected ? 'text-emerald-600' : 'text-amber-500'}>
                              {pushConnected ? 'Connected & Registered' : 'Not Connected'}
                            </strong>
                          </div>
                          <div className="flex justify-between border-b border-zinc-100/50 pb-1 col-span-2">
                            <span>VAPID Setup Configured:</span>
                            {isVapidConfigured === null ? (
                              <strong className="text-zinc-400">Checking...</strong>
                            ) : isVapidConfigured ? (
                              <strong className="text-emerald-600">Fully Configured</strong>
                            ) : (
                              <div className="text-right">
                                <strong className="text-amber-600 block">Push setup is not complete yet.</strong>
                                <span className="text-[9px] text-zinc-400 block leading-tight mt-0.5 max-w-[220px]">
                                  Please set env variables: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT on server.
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-xl space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-zinc-400 font-medium">LAST READINESS TEST</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            lastTestStatus.includes('Success') || lastTestStatus.includes('test sent') || lastTestStatus.includes('worked') ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-500'
                          }`}>
                            {lastTestStatus}
                          </span>
                        </div>
                        <span className="text-zinc-600 font-medium block text-[11px] mt-1">
                          Last Run: <strong className="text-zinc-800">{lastTestTime}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 pt-5 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSendTestAlert}
                        disabled={isTestingDevice}
                        data-component-version="admin-test-device-alert-action-v1"
                        className="px-6 py-2.5 text-xs font-semibold flex items-center space-x-1.5 border-[#C59B27]/45 hover:bg-[#C59B27]/5 text-[#C59B27] cursor-pointer"
                      >
                        {isTestingDevice ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Sending Test...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            <span>Send test alert to this device</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB: DEVICE SECURITY */}
            {activeSubTab === 'device-security' && (
              <div className="space-y-6">
                <DeviceSecuritySettings 
                  isAdmin={true}
                  showSuccess={(t, m) => showFeedback(`${t}: ${m}`, 'success')}
                  showError={(t, m) => showFeedback(`${t}: ${m}`, 'error')}
                />
              </div>
            )}

          </div>

          {/* MAIN SETTINGS RIGHT COLUMN: PROFILE SECURITY CARD (Only visible for Parent Access and Message Channels) */}
          {activeSubTab !== 'team-access' && activeSubTab !== 'landing-page' && activeSubTab !== 'app-media' && activeSubTab !== 'alert-delivery' && activeSubTab !== 'device-security' && (
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

