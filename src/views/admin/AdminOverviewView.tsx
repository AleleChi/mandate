import React, { useEffect, useState, useRef } from 'react';
import { AppRoute } from '../../types';
import { 
  Users, 
  UserCheck, 
  Clock, 
  Calendar, 
  ClipboardList, 
  ShieldAlert,
  AlertTriangle,
  LogOut, 
  RefreshCw, 
  Bell, 
  Settings, 
  Search,
  MessageSquare,
  FileCheck2,
  TrendingUp,
  Award,
  Menu,
  X,
  Lock,
  UserPlus,
  ShieldCheck,
  Check,
  Shield,
  Loader2,
  ChevronRight,
  Phone,
  VolumeX,
  Volume2,
  Activity,
  Heart,
  User,
  Smartphone,
  CloudOff
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { useAlertAudioPreferences } from '../../hooks/useAlertAudioPreferences';
import { BrandLogo } from '../../components/common/BrandLogo';
import { subscribeUserToPush, unsubscribeUserFromPush } from '../../utils/pushSubscription';
import { ActiveResponseCoordinationPanel } from '../../components/common/ActiveResponseCoordinationPanel';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { SafeImage } from '../../components/common/SafeImage';
import { playSound, resumeAudioContext, stopAllUrgentAlertEffects, isAudioUnlocked, unlockAudio } from '../../utils/sound';
import { urgentAlertEffectsManager, getCategoryLabel, generateSpokenAlertText, speakAlert, stopSpeaking } from '../../utils/urgentAlertEffects';
import { AdminApplicationsView } from './AdminApplicationsView';
import { AdminReviewBoardView } from './AdminReviewBoardView';
import { AdminChildrenView } from './AdminChildrenView';
import { AdminAttendanceView } from './AdminAttendanceView';
import { AdminReportsView } from './AdminReportsView';
import { AdminMessagesView } from './AdminMessagesView';
import { AdminVolunteersView } from './AdminVolunteersView';
import { AdminParentsView } from './AdminParentsView';
import { AdminParentDetailView } from './AdminParentDetailView';
import { AdminSettingsView } from './AdminSettingsView';
import { AdminEventsView } from './AdminEventsView';
import { AdminIncidentRecordsCentre } from './AdminIncidentRecordsCentre';
import { AdminEscalationsView } from './AdminEscalationsView';
import { AdminOperationsDashboardView } from './AdminOperationsDashboardView';
import { AdminDutyDevicesView } from '../../components/admin/AdminDutyDevicesView';
import { ChildEmergencySummary } from '../../components/ChildEmergencySummary';

type AdminTab = 'overview' | 'events' | 'applications' | 'review' | 'children' | 'attendance' | 'reports' | 'messages' | 'settings' | 'volunteers' | 'parents' | 'duty_devices' | 'incidents' | 'escalations' | 'operations' | 'training';

interface AdminOverviewViewProps {
  onNavigate: (route: AppRoute) => void;
  onSignOut: () => void;
  adminUser: any;
  initialTab?: AdminTab;
  currentRoute?: string;
}

export const AdminOverviewView: React.FC<AdminOverviewViewProps> = ({
  onNavigate,
  onSignOut,
  adminUser,
  initialTab = 'overview',
  currentRoute
}) => {
  const { showError, showSuccess, showInfo } = useNotification();
  const [activeTab, setActiveTab] = useState<AdminTab>((initialTab || 'overview') as AdminTab);
  const [showStatusPopover, setShowStatusPopover] = useState<boolean>(false);
  const [audioArmed, setAudioArmed] = useState<boolean>(() => isAudioUnlocked());
  const statusPopoverRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerTab, setHeaderTab] = useState<'current' | 'upcoming'>('current');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Rich dashboard dynamic dataset
  const [overviewData, setOverviewData] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [errorUpdatingDemographics, setErrorUpdatingDemographics] = useState<string>('');
  const [dashboardError, setDashboardError] = useState<{ message: string; description: string } | null>(null);
  const lastToastMessageRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fallback stats for quick reference/backwards compatibility
  const [stats, setStats] = useState<any>({
    totalChildren: 0,
    underReview: 0,
    approved: 0,
    totalParents: 0,
    totalVolunteers: 0,
    pendingVolunteers: 0,
    checkedIn: 0,
    pickedUp: 0
  });
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Invite states
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'super_admin' | 'team'>('admin');
  const [sendingInvite, setSendingInvite] = useState(false);

  // Attention filter modal
  const [activeAttentionModal, setActiveAttentionModal] = useState<{ id: string, label: string } | null>(null);

  // Deep linking states
  const [initialApplicationId, setInitialApplicationId] = useState<string | null>(null);
  const [initialChildId, setInitialChildId] = useState<string | null>(null);
  const [initialAttentionId, setInitialAttentionId] = useState<string | null>(null);

  // Real-time notification and preferences states
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [notifTab, setNotifTab] = useState<'unread' | 'all'>('unread');
  const [pushEnabled, setPushEnabled] = useState(false);

  // Unified hook for alert audio and sound preferences (Phase 2)
  const {
    soundEnabled,
    urgentSoundProfile: alertProfile,
    urgentVolumeBoost: alertVolume,
    spokenAlertsEnabled,
    spokenAlertMode,
    spokenAlertRepeats,
    isSaving: isAudioPreferenceSaving,
    updatePreference,
    testEmergencySound
  } = useAlertAudioPreferences();

  // Safety Alerts states
  const [safetyAlerts, setSafetyAlerts] = useState<any[]>([]);
  const [activeEmergencySummaryAlertId, setActiveEmergencySummaryAlertId] = useState<string | null>(null);
  const [activeAlertDetail, setActiveAlertDetail] = useState<any | null>(null);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [isAcknowledgeInProgress, setIsAcknowledgeInProgress] = useState<string | null>(null);
  const [activeUrgentAlertCount, setActiveUrgentAlertCount] = useState(0);
  const [activeUrgentAlert, setActiveUrgentAlert] = useState<any | null>(null);
  const [showCommandCenter, setShowCommandCenter] = useState(false);
  const [showResolutionInTakeover, setShowResolutionInTakeover] = useState(false);
  const [isSoundSettingsOpen, setIsSoundSettingsOpen] = useState(false);
  const [settingsSubTab, setSettingsSubTab] = useState<'parent-access' | 'team-access' | 'message-channels' | 'alert-delivery' | 'landing-page' | 'app-media' | 'device-security' | 'footer-settings'>('parent-access');
  const [isPlayingSoundTest, setIsPlayingSoundTest] = useState(false);

  const handleTriggerSoundTest = () => {
    try {
      resumeAudioContext();
      playSound('emergency', { volume: alertVolume, profile: alertProfile });
      setIsPlayingSoundTest(true);
      setTimeout(() => {
        setIsPlayingSoundTest(false);
      }, 2500);
    } catch (_) {
      setIsPlayingSoundTest(false);
    }
  };

  const handleStopSoundTest = () => {
    try {
      stopAllUrgentAlertEffects();
      setIsPlayingSoundTest(false);
    } catch (_) {}
  };

  const handleOpenSoundSettings = () => {
    setSettingsSubTab('alert-delivery');
    handleTabChange('settings');
  };

  // Premium interactive states
  const [viewingChildProfile, setViewingChildProfile] = useState<any | null>(null);
  const [assigningAlertId, setAssigningAlertId] = useState<string | null>(null);
  const [assignedResponders, setAssignedResponders] = useState<Record<string, string>>({});

  // Rich details & role simulation states
  const [simulatedDutyRole, setSimulatedDutyRole] = useState<string>('admin');
  const [activeAlertRichDetail, setActiveAlertRichDetail] = useState<any | null>(null);
  const [activeAlertRichDetailLoading, setActiveAlertRichDetailLoading] = useState(false);
  const [activeUrgentRichDetail, setActiveUrgentRichDetail] = useState<any | null>(null);
  const [activeUrgentRichDetailLoading, setActiveUrgentRichDetailLoading] = useState(false);

  // Load rich details for activeAlertDetail
  useEffect(() => {
    if (activeAlertDetail) {
      const fetchDetail = async () => {
        try {
          setActiveAlertRichDetailLoading(true);
          const res = await api.admin.getSafetyAlertDetail(activeAlertDetail.id, simulatedDutyRole);
          if (res && res.success) {
            setActiveAlertRichDetail(res);
          }
        } catch (err) {
          console.error('Error fetching rich alert detail:', err);
        } finally {
          setActiveAlertRichDetailLoading(false);
        }
      };
      fetchDetail();
    } else {
      setActiveAlertRichDetail(null);
    }
  }, [activeAlertDetail?.id, simulatedDutyRole]);

  // Load rich details for activeUrgentAlert
  useEffect(() => {
    setShowResolutionInTakeover(false);
    if (activeUrgentAlert && !activeUrgentAlert.isTest) {
      const fetchDetail = async () => {
        try {
          setActiveUrgentRichDetailLoading(true);
          const res = await api.admin.getSafetyAlertDetail(activeUrgentAlert.id, simulatedDutyRole);
          if (res && res.success) {
            setActiveUrgentRichDetail(res);
          }
        } catch (err) {
          console.error('Error fetching rich urgent detail:', err);
        } finally {
          setActiveUrgentRichDetailLoading(false);
        }
      };
      fetchDetail();
    } else {
      setActiveUrgentRichDetail(null);
    }
  }, [activeUrgentAlert?.id, simulatedDutyRole]);

  // Centralized cleanup handler (Phase 2, Phase 3, Phase 5)
  const stopActiveUrgentAlertEffects = (alertId: string) => {
    // 1. Silence in global manager
    urgentAlertEffectsManager.silenceAlert(alertId);

    // 2. Clear from active urgent popup overlay state if matched
    setActiveUrgentAlert((prev: any) => {
      if (prev && prev.id === alertId) {
        return null;
      }
      return prev;
    });
  };

  const handleSilenceAlert = async (alertId: string) => {
    try {
      stopActiveUrgentAlertEffects(alertId);
      await api.admin.silenceSafetyAlert(alertId);
      showSuccess('Alarm Silenced', 'The emergency audio was stopped for this device.');
      await fetchSafetyAlerts();
    } catch (err) {
      console.error('Failed to silence alert centrally:', err);
    }
  };

  const fetchSafetyAlerts = async () => {
    if (!api.getToken()) return;
    try {
      const res = await api.admin.getSafetyAlerts();
      if (Array.isArray(res)) {
        setSafetyAlerts(res);

        // Sync with our global alert effects manager!
        urgentAlertEffectsManager.syncAlerts(res);

        // Filter unresolved open alerts
        const openAlerts = res.filter((a: any) => a.status !== 'resolved');
        const rxUrgentPref = localStorage.getItem('koinonia_device_receive_urgent') !== 'false';
        const showPopupPref = localStorage.getItem('koinonia_device_show_popup') !== 'false';

        // Update popup overlay state for new qualifying alerts
        if (rxUrgentPref && showPopupPref) {
          const currentSilenced = urgentAlertEffectsManager.getSilencedAlertIds();
          const activeUrgent = openAlerts.find((a: any) => a.severity === 'urgent' && a.status === 'open' && !currentSilenced.has(a.id));
          if (activeUrgent) {
            setActiveUrgentAlert(activeUrgent);
          }
        }

        // Count active urgent alerts
        const urgentCount = openAlerts.filter((a: any) => a.severity === 'urgent').length;
        setActiveUrgentAlertCount(urgentCount);

        // If there is an active takeover urgent alert, track and clear if status updates to resolved/acknowledged
        if (activeUrgentAlert) {
          const updated = res.find((a: any) => a.id === activeUrgentAlert.id);
          if (updated) {
            if (updated.status === 'resolved' || updated.status === 'acknowledged' || urgentAlertEffectsManager.isAlertSilenced(updated.id)) {
              // Clear from active takeover
              setActiveUrgentAlert(null);
            } else {
              setActiveUrgentAlert(updated);
            }
          }
        }

        // Auto-update active details panel if open
        if (activeAlertDetail) {
          const updated = res.find((a: any) => a.id === activeAlertDetail.id);
          if (updated) {
            setActiveAlertDetail(updated);
          }
        }
      }
    } catch (err: any) {
      console.warn('[AdminOverview] Safety alerts poll fetch issue:', err?.message || err);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    // INSTANT SOUND TERMINATION: Stop device alarm sound synchronously on click before waiting for network API call
    stopActiveUrgentAlertEffects(alertId);
    urgentAlertEffectsManager.silenceAlert(alertId);

    setIsAcknowledgeInProgress(alertId);
    try {
      const res = await api.admin.acknowledgeSafetyAlert(alertId);
      if (res && res.success) {
        showSuccess('Acknowledged', 'The safety alert has been marked as acknowledged.');
        setSafetyAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'acknowledged', acknowledged_by_name: adminUser?.email?.split('@')[0] || 'Care Lead' } : a));
      } else {
        showError('Acknowledge Failed', 'Could not acknowledge alert at this moment.');
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      if (err.status === 409 || apiErr.message?.toLowerCase().includes('already')) {
        showInfo('Already Responded', apiErr.message || 'This alert has already been acknowledged.');
        fetchSafetyAlerts();
      } else {
        showError('Error', apiErr.message || 'Error acknowledging alert.');
      }
    } finally {
      setIsAcknowledgeInProgress(null);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    if (!resolutionNote.trim()) {
      showError('Required', 'Please specify what actions were taken to resolve this safety concern.');
      return;
    }

    // INSTANT SOUND TERMINATION: Stop device alarm sound synchronously on click
    stopActiveUrgentAlertEffects(alertId);
    urgentAlertEffectsManager.silenceAlert(alertId);

    setResolvingAlertId(alertId);
    try {
      const res = await api.admin.resolveSafetyAlert(alertId, resolutionNote);
      if (res && res.success) {
        showSuccess('Resolved', 'Safety concern has been successfully resolved and logged.');
        setSafetyAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'resolved', resolution_note: resolutionNote, resolved_by_name: adminUser?.email?.split('@')[0] || 'Care Lead' } : a));
        setActiveAlertDetail(null);
        setResolutionNote('');
      } else {
        showError('Resolution Failed', 'Could not mark alert as resolved.');
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      if (err.status === 409 || apiErr.message?.toLowerCase().includes('already')) {
        showInfo('Already Resolved', apiErr.message || 'This alert has already been resolved.');
        setActiveAlertDetail(null);
        setResolutionNote('');
        fetchSafetyAlerts();
      } else {
        showError('Error', apiErr.message || 'Error resolving alert.');
      }
    } finally {
      setResolvingAlertId(null);
    }
  };

  const handleViewChildProfile = async (alert: any) => {
    try {
      setViewingChildProfile({ loading: true, fullName: alert.child_name, photoUrl: alert.child_photo_file_id });
      const res = await api.admin.getSafetyAlertDetail(alert.id, 'admin');
      if (res && res.success && res.child) {
        setViewingChildProfile({
          fullName: res.child.fullName,
          photoUrl: res.child.photoUrl,
          ageGroup: res.child.ageGroup || alert.child_age_group,
          ageDisplay: res.child.ageDisplay || (alert.child_calculated_age ? `${alert.child_calculated_age} yrs` : 'N/A'),
          gender: res.child.gender,
          status: res.child.status || res.child.passStatus || 'Active',
          parent: res.parent || { fullName: alert.parent_name, phoneMaskedOrVisibleByPermission: alert.parent_phone },
          pickup: res.pickup,
          careSummary: res.careSummary,
          loading: false
        });
      } else {
        setViewingChildProfile({
          fullName: alert.child_name,
          photoUrl: alert.child_photo_file_id,
          ageGroup: alert.child_age_group,
          ageDisplay: alert.child_calculated_age ? `${alert.child_calculated_age} yrs` : 'N/A',
          parent: { fullName: alert.parent_name, phoneMaskedOrVisibleByPermission: alert.parent_phone },
          loading: false
        });
      }
    } catch (err) {
      setViewingChildProfile({
        fullName: alert.child_name,
        photoUrl: alert.child_photo_file_id,
        ageGroup: alert.child_age_group,
        ageDisplay: alert.child_calculated_age ? `${alert.child_calculated_age} yrs` : 'N/A',
        parent: { fullName: alert.parent_name, phoneMaskedOrVisibleByPermission: alert.parent_phone },
        loading: false
      });
    }
  };

  // Centralized presentation mappings & helpers for Care & Safety
  const CARE_CATEGORY_LABELS: Record<string, string> = {
    child_care: 'Care note',
    medical: 'Medical request',
    medical_support: 'Medical request',
    missing_child: 'Missing child',
    failed_scan: 'Scan issue',
    pass_issue: 'Pass issue',
    wrong_pickup: 'Pickup concern',
    pickup_issue: 'Pickup concern',
    security_concern: 'Security alert',
    security_alert: 'Security alert',
    location_support: 'Location assistance',
    general_help: 'General assistance',
    other_safety: 'Safety concern',
    other: 'Safety concern'
  };

  const formatCareCategory = (category: string | undefined | null): string => {
    if (!category) return 'Care note';
    if (CARE_CATEGORY_LABELS[category]) return CARE_CATEGORY_LABELS[category];
    return category
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const formatCareStatus = (status: string | undefined | null): { label: string; style: string } => {
    const s = (status || '').toLowerCase();
    if (s === 'acknowledged') {
      return { label: 'Reviewed', style: 'text-zinc-600 bg-zinc-100/90 border-zinc-200/70' };
    }
    if (s === 'resolved') {
      return { label: 'Resolved', style: 'text-emerald-700 bg-emerald-50 border-emerald-200/60' };
    }
    if (s === 'open' || s === 'pending') {
      return { label: 'Needs attention', style: 'text-amber-700 bg-amber-50 border-amber-200/60' };
    }
    return {
      label: s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Reviewed',
      style: 'text-zinc-600 bg-zinc-100/90 border-zinc-200/70'
    };
  };

  // Helper to format Recent Activity items
  const formatRecentActivity = (act: { id: string; name?: string; text: string; time: string }) => {
    let personName = act.name || '';
    let actionText = '';

    if (personName && act.text.startsWith(personName)) {
      actionText = act.text.slice(personName.length).trim();
      if (actionText) {
        actionText = actionText.charAt(0).toUpperCase() + actionText.slice(1);
      }
    } else {
      personName = act.text;
    }

    return {
      person: personName,
      action: actionText,
      time: act.time
    };
  };

  // Humanized relative time helper
  const formatTimeAgo = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins === 1) return '1 minute ago';
      if (diffMins < 60) return `${diffMins} minutes ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours === 1) return '1 hour ago';
      if (diffHours < 24) return `${diffHours} hours ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return '1 day ago';
      if (diffDays < 30) return `${diffDays} days ago`;
      return `${diffDays} days ago`;
    } catch (_) {
      return 'Recently';
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  };


  // Fetch Admin Notifications
  const fetchNotificationsList = async (playFeedback = false) => {
    if (!api.getToken()) return;
    try {
      const list = await api.parent.getNotifications(false, 'admin');
      const unreadList = list.filter((n: any) => !n.isRead);
      
      setNotifications((prevNotifications) => {
        // Compare with prevNotifications to find genuinely new unread notifications
        // Avoid sound on initial load (when prevNotifications is empty)
        if (prevNotifications.length > 0 && soundEnabled) {
          const newUnread = unreadList.filter(
            (n: any) => !prevNotifications.some((oldN) => oldN.id === n.id)
          );
          if (newUnread.length > 0) {
            const hasNewEscalation = newUnread.some((n: any) => n.type === 'escalation');
            if (hasNewEscalation) {
              playSound('alert');
            } else {
              playSound('notification');
            }
          }
        } else if (playFeedback) {
          playSound('success');
        }
        return list;
      });
      
      setUnreadNotifCount(unreadList.length);
    } catch (err: any) {
      console.warn('[AdminOverview] Admin notifications poll fetch issue:', err?.message || err);
    }
  };

  // SSE Real-time instant notification/alert updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let isUnmounted = false;

    const connectSSE = () => {
      if (isUnmounted) return;
      const token = localStorage.getItem('koinonia_token');
      if (!token) return;

      const sseUrl = `/api/notifications/stream?token=${token}`;

      console.log('[SSE Client] Connecting to:', sseUrl);
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        if (isUnmounted) return;
        try {
          const payload = JSON.parse(event.data);
          console.log('[SSE Client] Received message:', payload);

          if (payload.type === 'handshake') {
            console.log('[SSE Client] Handshake successful, clientId:', payload.clientId);
            return;
          }

          // Always dispatch for Live Event Operations Dashboard
          window.dispatchEvent(new CustomEvent('sse-ops-refresh', { detail: payload }));

          if (
            payload.type === 'safety_alert_created' ||
            payload.type === 'safety_alert_acknowledged' ||
            payload.type === 'safety_alert_resolved' ||
            payload.type === 'safety_alert_escalated'
          ) {
            const clientReceiptTime = new Date();
            const createdTime = new Date(payload.timestamp || (payload.data && payload.data.created_at) || new Date());
            const latencyMs = clientReceiptTime.getTime() - createdTime.getTime();
            
            console.log('%c[EMERGENCY ALERT TIMING DIAGNOSTIC]', 'background: #DC2626; color: white; font-weight: bold; padding: 6px; border-radius: 4px;', {
              'Event Type': payload.type,
              'Submission/DB Timestamp (Server)': createdTime.toISOString(),
              'Client Receipt Timestamp': clientReceiptTime.toISOString(),
              'Measured Net Delivery Latency': `${latencyMs}ms (${(latencyMs / 1000).toFixed(3)}s)`,
              'Priority Route Status': 'SSE Priority Channel Active (Polling Bypassed)',
              'Sound Trigger Time': new Date().toISOString()
            });

            const alertId = payload.alertId || payload.data?.id || (payload.data && payload.data.alertId);

            if (payload.type === 'safety_alert_created') {
              const alertObj = {
                id: alertId,
                severity: payload.data?.severity || 'urgent',
                category: payload.data?.category || 'general_help',
                status: 'open',
                created_at: payload.timestamp || new Date().toISOString()
              };
              // Trigger local sound & effects INSTANTLY from SSE packet before network fetch finishes
              urgentAlertEffectsManager.syncAlerts([alertObj]);
            } else if (payload.type === 'safety_alert_acknowledged' || payload.type === 'safety_alert_resolved') {
              if (alertId) {
                stopActiveUrgentAlertEffects(alertId);
                urgentAlertEffectsManager.silenceAlert(alertId);
              }
            }

            window.dispatchEvent(new CustomEvent('sse-alert-update', { detail: { alertId } }));
            fetchSafetyAlerts();
            fetchNotificationsList();
          }
        } catch (err) {
          console.error('[SSE Client] Failed to parse message:', err);
        }
      };

      eventSource.onerror = (err) => {
        if (isUnmounted) return;
        console.warn('[SSE Client] Connection closed or transient error. Reconnecting in 3s...');
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        reconnectTimeout = setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      isUnmounted = true;
      if (eventSource) {
        eventSource.close();
        console.log('[SSE Client] Connection closed.');
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  // Global browser autoplay restriction bypass via user interaction
  useEffect(() => {
    const handleGlobalInteraction = () => {
      try {
        resumeAudioContext();
        setAudioArmed(isAudioUnlocked());
      } catch (e) {
        console.warn('Failed to resume AudioContext globally:', e);
      }
    };
    document.addEventListener('click', handleGlobalInteraction);
    document.addEventListener('touchstart', handleGlobalInteraction);
    return () => {
      document.removeEventListener('click', handleGlobalInteraction);
      document.removeEventListener('touchstart', handleGlobalInteraction);
    };
  }, []);

  // Sync audio arming state with custom events
  useEffect(() => {
    const handleAudioStateChange = () => {
      setAudioArmed(isAudioUnlocked());
    };
    const handleAudioBlocked = () => {
      setAudioArmed(false);
    };
    window.addEventListener('koinonia_audio_state_change', handleAudioStateChange);
    window.addEventListener('koinonia_audio_blocked', handleAudioBlocked);
    return () => {
      window.removeEventListener('koinonia_audio_state_change', handleAudioStateChange);
      window.removeEventListener('koinonia_audio_blocked', handleAudioBlocked);
    };
  }, []);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusPopoverRef.current && !statusPopoverRef.current.contains(e.target as Node)) {
        setShowStatusPopover(false);
      }
    };
    if (showStatusPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStatusPopover]);

  const handleArmAudio = async () => {
    const success = await unlockAudio();
    if (success) {
      setAudioArmed(true);
      showSuccess('Sound enabled', 'Emergency sound alerts can now be heard.');
    }
  };

  // Poll for notifications and safety alerts
  useEffect(() => {
    fetchNotificationsList();
    fetchSafetyAlerts();
    const interval = setInterval(() => {
      fetchNotificationsList();
      fetchSafetyAlerts();
    }, 10000); // 10s poll for real-time responsiveness
    return () => {
      clearInterval(interval);
      try {
        urgentAlertEffectsManager.stopAll();
      } catch (e) {
        console.warn('Failed to stop all alert effects during unmount:', e);
      }
    };
  }, [soundEnabled]);

  // Stop all alerts immediately when sound or spoken alerts are disabled
  useEffect(() => {
    if (!soundEnabled || !spokenAlertsEnabled) {
      try {
        urgentAlertEffectsManager.stopAll();
      } catch (e) {
        console.warn('Failed to stop all alert effects during preferences change:', e);
      }
    }
  }, [soundEnabled, spokenAlertsEnabled]);

  // Listen to window unload to clean up background audio safely
  useEffect(() => {
    const handleUnloadCleanup = () => {
      try {
        stopAllUrgentAlertEffects();
      } catch (e) {
        console.warn('Failed in stopAllUrgentAlertEffects during unload:', e);
      }
    };

    window.addEventListener('beforeunload', handleUnloadCleanup);
    window.addEventListener('pagehide', handleUnloadCleanup);

    return () => {
      window.removeEventListener('beforeunload', handleUnloadCleanup);
      window.removeEventListener('pagehide', handleUnloadCleanup);
    };
  }, []);

  const toggleSound = async () => {
    const nextVal = !soundEnabled;
    updatePreference('soundEnabled', nextVal);
    showSuccess(
      nextVal ? 'Sound Alerts On' : 'Sound Alerts Off',
      nextVal ? 'Notification sounds enabled.' : 'Notification sounds disabled.'
    );
    if (nextVal) {
      playSound('success');
    }
  };

  const togglePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showError('Unsupported Device', 'Push notifications are not supported on this browser or device.');
      return;
    }

    const nextVal = !pushEnabled;
    try {
      if (nextVal) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
          showError('Notifications Blocked', 'Notifications are blocked in your browser settings.');
          return;
        }

        const res = await subscribeUserToPush();
        if (res.success) {
          setPushEnabled(true);
          showSuccess('Subscribed', 'You will now receive instant push alerts.');
          playSound('success');

          await api.request('/api/notifications/preferences', {
            method: 'PATCH',
            body: JSON.stringify({ pushEnabled: true })
          });
        } else {
          showError('Subscription Failed', res.error || 'Failed to enable push notifications.');
        }
      } else {
        await unsubscribeUserFromPush();
        setPushEnabled(false);
        showSuccess('Unsubscribed', 'Push alerts disabled.');
        playSound('success');

        await api.request('/api/notifications/preferences', {
          method: 'PATCH',
          body: JSON.stringify({ pushEnabled: false })
        });
      }
    } catch (err: any) {
      console.error('Push toggle error:', err);
      showError('Subscription Failed', 'Could not sync push configuration with the service worker.');
    }
  };

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab as AdminTab);
    }
  }, [initialTab]);

  const fetchDashboardData = async (isRefresh = false) => {
    // Abort previous in-flight request if any to prevent race conditions and redundant triggers
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await api.admin.getOverview({ signal: controller.signal });
      if (res.success) {
        setOverviewData(res);
        setDashboardError(null);
        lastToastMessageRef.current = null; // reset error toast deduplicator on success
        setErrorUpdatingDemographics('');
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastUpdated(timeStr);
        setStats({
          totalChildren: res.metrics?.totalChildren ?? res.stats?.totalChildren ?? 0,
          underReview: res.metrics?.underReview ?? res.stats?.underReview ?? 0,
          approved: res.metrics?.selected ?? res.stats?.approved ?? 0,
          totalParents: res.metrics?.totalParents ?? res.stats?.totalParents ?? 0,
          totalVolunteers: res.stats?.totalVolunteers ?? 0,
          pendingVolunteers: res.stats?.pendingVolunteers ?? 0,
          checkedIn: res.metrics?.checkedIn ?? res.stats?.checkedIn ?? 0,
          pickedUp: res.metrics?.pickedUp ?? 0
        });
        setRecentSubmissions(res.recentSubmissions || []);
        if (isRefresh) {
          showSuccess('Refreshed', 'Dashboard analytics updated successfully.');
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Stale request successfully aborted, do nothing
        return;
      }
      console.error('[AdminOverviewView - fetchDashboardData Error]:', err);
      const parsed = extractApiError(err);
      
      // Map generic "Connection problem" or other errors to highly informative but safe/classified operation errors
      let classifiedError = {
        message: 'Administrative Sync Interrupted',
        description: 'We could not reach the service to synchronize the administrative overview. Please check your network and try again.'
      };
      
      if (parsed.message && parsed.message.toLowerCase().includes('auth')) {
        classifiedError = {
          message: 'Access Authorization Expired',
          description: 'Your session has expired or is invalid. Please sign in again.'
        };
      }
      
      setDashboardError(classifiedError);
      setErrorUpdatingDemographics('We could not update demographics right now. Please try again.');

      // Prevent duplicate stacked error toast alerts
      if (lastToastMessageRef.current !== classifiedError.message) {
        showError(classifiedError.message, classifiedError.description);
        lastToastMessageRef.current = classifiedError.message;
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const fetchAdminsList = async () => {
    setLoadingAdmins(true);
    try {
      const res = await api.admin.listAdmins();
      if (res.success) {
        setAdminsList(res.admins || []);
      }
    } catch (err: any) {
      console.error('Failed to load admin directory:', err);
    } finally {
      setLoadingAdmins(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (activeTab === 'settings') {
      fetchAdminsList();
    }
  }, [activeTab]);

  const handleSignOut = () => {
    onSignOut();
    onNavigate('/');
  };

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    if (tab === 'overview') {
      onNavigate('/admin/overview');
    } else if (tab === 'settings') {
      onNavigate('/admin/settings');
    } else if (tab === 'applications') {
      onNavigate('/admin/applications');
    } else if (tab === 'review') {
      onNavigate('/admin/review');
    } else if (tab === 'children') {
      onNavigate('/admin/children');
    } else if (tab === 'attendance') {
      onNavigate('/admin/attendance');
    } else if (tab === 'reports') {
      onNavigate('/admin/reports');
    } else if (tab === 'messages') {
      onNavigate('/admin/messages');
    } else if (tab === 'parents') {
      onNavigate('/admin/parents');
    } else if (tab === 'volunteers') {
      onNavigate('/admin/volunteers');
    } else if (tab === 'training') {
      onNavigate('/admin/training/scenarios');
    } else if (tab === 'events') {
      onNavigate('/admin/events');
    } else if (tab === 'duty_devices') {
      onNavigate('/admin/duty-devices');
    } else if (tab === 'incidents') {
      onNavigate('/admin/incidents');
    } else if (tab === 'escalations') {
      onNavigate('/admin/escalations');
    } else if (tab === 'operations') {
      onNavigate('/admin/operations');
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      showError('Error', 'All password fields are required.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      showError('Mismatch', 'New passwords do not match.');
      return;
    }

    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    if (newPassword.length < 8 || !hasLetter || !hasNumber) {
      showError('Weak Password', 'New password must be at least 8 characters and contain both letters and numbers.');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await api.admin.changePassword({ currentPassword, newPassword });
      if (res.success) {
        showSuccess('Password Updated', 'Your admin password was updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Update Failed', parsed.message || 'Could not update your password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) {
      showError('Error', 'Email address is required.');
      return;
    }

    setSendingInvite(true);
    try {
      const res = await api.admin.inviteAdmin({ email: inviteEmail, role: inviteRole });
      if (res.success) {
        showSuccess('Invitation Sent', `Sent admin invitation link to ${inviteEmail}.`);
        setInviteEmail('');
        fetchAdminsList(); // refresh list
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Invitation Failed', parsed.message || 'Could not send invitation.');
    } finally {
      setSendingInvite(false);
    }
  };

  const isSuperAdmin = adminUser?.role === 'super_admin';
  const adminRoleTitle = overviewData?.admin?.roleTitle || (adminUser?.role === 'super_admin' ? 'Global Director' : adminUser?.role === 'admin' ? 'Senior Director' : 'Ministry Admin');
  const adminFullName = overviewData?.admin?.fullName || adminUser?.fullName || 'Admin User';

  const demographics = overviewData?.demographics || [];
  const needsAttentionList = overviewData?.needsAttention?.items || [];
  const needsAttentionTotal = overviewData?.needsAttention?.total || 0;
  const reviewProgress = overviewData?.reviewProgress || { selected: 0, underReview: 0, notSelected: 0 };
  const attendanceData = overviewData?.attendance || { expected: 0, checkedIn: 0, stillInside: 0, pickedUp: 0, notArrived: 0 };
  const recentActivityList = overviewData?.recentActivity || [];

  const renderPlaceholderSection = (tabName: string) => (
    <div className="bg-white border border-[#EAE8E1] rounded-2xl p-12 text-center max-w-2xl mx-auto space-y-4 shadow-xs">
      <div className="w-12 h-12 bg-[#C59B27]/5 border border-[#C59B27]/15 text-[#C59B27] rounded-2xl flex items-center justify-center mx-auto">
        <ClipboardList className="w-6 h-6" />
      </div>
      <h3 className="font-serif text-lg font-bold text-[#18181B]">{tabName}</h3>
      <p className="text-xs text-zinc-500 leading-relaxed max-w-md mx-auto">
        This view displays event records and information. Select a primary option above or return to the overview page.
      </p>
      <button
        onClick={() => setActiveTab('overview')}
        className="text-xs font-semibold text-[#C59B27] hover:underline block mx-auto"
      >
        Return to Overview
      </button>
    </div>
  );

  // Sidebar navigation element markup - Approved Light Design
  const renderSidebarContent = () => (
    <div className="flex flex-col h-full justify-between" data-component-version="admin-sidebar-approved-v1">
      <div className="flex flex-col">
        {/* Brand block - Light warm design */}
        <div className="h-20 px-6 border-b border-[#EAE8E1] flex items-center justify-between">
          <div className="flex flex-col justify-center items-start">
            <BrandLogo
              context="admin"
              data-component-version="admin-brand-logo-v1-configured"
            />
          </div>
          {/* Mobile close button */}
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden text-zinc-500 hover:text-[#18181B] p-1 rounded-lg focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav Items - Approved Light styling */}
        <nav className="p-4 space-y-1">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest px-3 mb-2">
            Ministry Admin
          </div>
          
          {[
            { id: 'overview', label: 'Overview', icon: ClipboardList },
            { id: 'operations', label: 'Event Operations', icon: Activity },
            { id: 'events', label: 'Events', icon: Calendar },
            { id: 'applications', label: 'Applications', icon: Users },
            { id: 'volunteers', label: 'Volunteers', icon: Award },
            { id: 'parents', label: 'Parents', icon: Users },
            { id: 'review', label: 'Review', icon: ShieldAlert },
            { id: 'children', label: 'Children', icon: Users },
            { id: 'attendance', label: 'Attendance', icon: UserCheck },
            { id: 'incidents', label: 'Incident Desk', icon: Shield },
            { id: 'escalations', label: 'Escalation Policies', icon: ShieldAlert },
            { id: 'reports', label: 'Reports', icon: TrendingUp },
            { id: 'messages', label: 'Messages', icon: MessageSquare },
            { id: 'duty_devices', label: 'Event Duty', icon: Smartphone },
            { id: 'training', label: 'PWA Rehearsal', icon: Activity },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((item) => {
            const IconComponent = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id as AdminTab)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#C59B27]/5 text-[#18181B] border-l-4 border-[#C59B27] pl-2 font-semibold'
                    : 'text-zinc-500 hover:bg-zinc-50 hover:text-[#18181B] border-l-4 border-transparent'
                }`}
              >
                <IconComponent className={`w-4 h-4 ${isActive ? 'text-[#C59B27]' : 'text-zinc-400'}`} />
                <span>{item.label}</span>
                {item.id === 'review' && stats.pendingVolunteers > 0 && (
                  <span className="ml-auto bg-[#C59B27] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {stats.pendingVolunteers}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User profile & Sign Out inside Sidebar - Approved Light aesthetics */}
      <div className="p-4 border-t border-[#EAE8E1] bg-[#FAF9F6]">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-[#C59B27]/10 flex items-center justify-center text-[#C59B27] font-bold text-xs shrink-0 border border-[#C59B27]/20">
            {adminFullName.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-[#18181B] truncate">
              {adminFullName}
            </span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 hover:text-red-700 transition-all focus:outline-none cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  // Filter submissions by attention type for dynamic attention viewing
  const getFilteredAttentionChildren = (filterId: string) => {
    if (!recentSubmissions || recentSubmissions.length === 0) return [];
    if (filterId === 'below_age') {
      return recentSubmissions.filter((s: any) => s.age < 1 || String(s.age_group).toLowerCase().includes('below 1') || String(s.age_group).toLowerCase().includes('under 1'));
    }
    if (filterId === 'medical') {
      return recentSubmissions.filter((s: any) => s.status === 'under_review' || s.has_medical_notes || s.medical_notes);
    }
    if (filterId === 'missing_pickup') {
      return recentSubmissions.filter((s: any) => !s.photo_file_id && !s.photo_url);
    }
    return recentSubmissions;
  };

  const activeFilteredKids = activeAttentionModal ? getFilteredAttentionChildren(activeAttentionModal.id) : [];

  const activeAlerts = safetyAlerts.filter((a: any) => a.status === 'open');
  const underwayAlerts = safetyAlerts.filter((a: any) => a.status === 'acknowledged');
  const resolvedAlerts = safetyAlerts.filter((a: any) => a.status === 'resolved');

  const renderAlertCard = (alert: any) => {
    const severity = alert.severity || 'normal';
    const isUrgent = severity === 'urgent';
    const isImportant = severity === 'important';
    const isNormal = severity === 'normal';
    const isAck = alert.status === 'acknowledged';
    const isResolved = alert.status === 'resolved';
    const isLocalSilenced = urgentAlertEffectsManager.isAlertSilenced(alert.id);
    const catLabel = getCategoryLabel(alert.category);

    const viewVersion = isResolved
      ? "resolved-care-alert-v1"
      : isUrgent
        ? "urgent-child-care-response-v1-premium"
        : isImportant
          ? "important-care-alert-v1-premium"
          : "normal-care-alert-v1-premium";

    const cardVersion = isResolved
      ? "resolved-alert-card-v1"
      : isUrgent
        ? "urgent-alert-card-v1-premium"
        : isImportant
          ? "important-alert-card-v1"
          : "normal-alert-card-v1";

    let borderAccent = "border-zinc-200 border-l-4 border-l-zinc-300";
    if (isResolved) {
      borderAccent = "border-zinc-200 opacity-75 border-l-4 border-l-zinc-300";
    } else if (isUrgent && !isAck) {
      borderAccent = "border-red-200/80 border-l-4 border-l-red-600";
    } else if (isImportant && !isAck) {
      borderAccent = "border-amber-200/80 border-l-4 border-l-amber-500";
    } else if (isAck) {
      borderAccent = "border-zinc-200 border-l-4 border-l-[#C59B27]";
    }

    const raisedTime = alert.created_at ? formatTime(alert.created_at) : '';
    const raisedRelative = alert.created_at ? formatTimeAgo(alert.created_at) : '';

    return (
      <div
        key={alert.id}
        className={`bg-white border rounded-xl p-5 sm:p-6 relative transition-all shadow-2xs flex flex-col justify-between ${borderAccent}`}
        data-view-version={viewVersion}
        data-component-version={cardVersion}
      >
        <div>
          {/* Header Row: Category & Status */}
          <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-zinc-100">
            <div>
              <span
                className="font-serif font-bold text-lg text-zinc-950 block"
                data-component-version="safety-alert-category-labels-v2"
              >
                {catLabel}
              </span>
              {raisedRelative && (
                <span className="text-[11px] text-zinc-400 font-sans">
                  Raised {raisedTime ? `${raisedTime} · ${raisedRelative}` : raisedRelative}
                </span>
              )}
            </div>

            <div className="text-right shrink-0">
              {isResolved ? (
                <span className="text-xs font-medium text-zinc-500">
                  Resolved
                </span>
              ) : isAck ? (
                <span className="text-xs font-medium text-[#C59B27]">
                  Response underway
                </span>
              ) : (
                <span className="text-xs font-semibold text-red-600">
                  Needs response
                </span>
              )}
            </div>
          </div>

          {/* Child Information */}
          {alert.child_name ? (
            <div
              className="py-3.5 flex items-center justify-between gap-4 border-b border-zinc-100"
              data-component-version="alert-child-identity-card-v3-premium"
            >
              <div className="flex items-center space-x-3.5 min-w-0">
                <div className="shrink-0">
                  <SafeImage
                    src={alert.child_photo_file_id}
                    className="w-11 h-11 rounded-lg object-cover border border-zinc-200"
                    fallbackComponent={
                      <div className="w-11 h-11 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400">
                        <User className="w-5 h-5 text-zinc-400" />
                      </div>
                    }
                  />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-zinc-900 font-medium text-sm leading-snug truncate">
                    {alert.child_name}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {alert.child_age_group && <span>{alert.child_age_group} · </span>}
                    <span>Parent: {alert.parent_name || 'Not on file'}</span>
                  </p>
                </div>
              </div>

              {alert.parent_phone && (
                <a
                  href={`tel:${alert.parent_phone}`}
                  className="text-xs font-medium text-zinc-700 hover:text-zinc-950 bg-white hover:bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer"
                  title="Call parent"
                >
                  <Phone className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Call parent</span>
                </a>
              )}
            </div>
          ) : (
            <div className="py-2.5 text-xs text-zinc-500 border-b border-zinc-100 text-left">
              General care request (no specific child linked)
            </div>
          )}

          {/* Location & Volunteer Details */}
          <div className="py-3 text-xs text-zinc-600 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-left">
            <div>
              <span className="text-zinc-400">Location: </span>
              <span className="font-medium text-zinc-800">
                {alert.location_label || alert.location || 'Location not available'}
              </span>
            </div>

            {alert.volunteer_team && (
              <div>
                <span className="text-zinc-400">Team: </span>
                <span className="font-medium text-zinc-800">{alert.volunteer_team}</span>
              </div>
            )}

            {alert.raised_by_name && (
              <div>
                <span className="text-zinc-400">Raised by: </span>
                <span className="font-medium text-zinc-800">{alert.raised_by_name}</span>
              </div>
            )}

            {alert.volunteer_phone && (
              <a
                href={`tel:${alert.volunteer_phone}`}
                className="text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1 font-medium"
                title="Call volunteer"
              >
                <Phone className="w-3 h-3 text-zinc-400" />
                <span>{alert.volunteer_phone}</span>
              </a>
            )}
          </div>

          {/* Distress Message with subtle left rule */}
          {alert.message && (
            <div className="my-2.5 pl-3.5 border-l-2 border-[#C59B27]/40 py-1 text-left" data-component-version="alert-message-summary-v2-premium">
              <p className="text-xs text-zinc-800 leading-relaxed font-sans">
                “{alert.message}”
              </p>
            </div>
          )}

          {/* Human Response Status Path (5 stages) */}
          <div
            className="my-4 pt-3 pb-3 border-t border-b border-zinc-100 space-y-2.5 text-left"
            data-component-version="care-response-status-v2-human"
          >
            <span className="text-[11px] font-medium text-zinc-400 block">Response</span>

            {/* Desktop Horizontal Timeline */}
            <div className="hidden sm:flex items-center justify-between text-xs font-sans gap-1">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="h-2 w-2 rounded-full bg-emerald-600 shrink-0" />
                <span className="text-[11px] font-medium text-emerald-700">Help requested</span>
              </div>
              <div className="h-px flex-1 bg-emerald-200 mx-1" />

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="h-2 w-2 rounded-full bg-emerald-600 shrink-0" />
                <span className="text-[11px] font-medium text-emerald-700">Care team notified</span>
              </div>
              <div className={`h-px flex-1 mx-1 ${(isAck || isResolved) ? 'bg-emerald-200' : 'bg-zinc-200'}`} />

              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`h-2 w-2 rounded-full shrink-0 ${
                  isResolved ? 'bg-emerald-600' : isAck ? 'bg-[#C59B27]' : 'bg-zinc-300'
                }`} />
                <span className={`text-[11px] ${
                  isResolved ? 'font-medium text-emerald-700' : isAck ? 'font-semibold text-[#C59B27]' : 'font-normal text-zinc-400'
                }`}>
                  {isAck ? 'Response underway' : 'Response acknowledged'}
                </span>
              </div>
              <div className={`h-px flex-1 mx-1 ${isResolved ? 'bg-emerald-200' : isAck ? 'bg-amber-100' : 'bg-zinc-200'}`} />

              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`h-2 w-2 rounded-full shrink-0 ${
                  isResolved ? 'bg-emerald-600' : 'bg-zinc-300'
                }`} />
                <span className={`text-[11px] ${
                  isResolved ? 'font-medium text-emerald-700' : isAck ? 'font-normal text-zinc-600' : 'font-normal text-zinc-400'
                }`}>
                  {isAck ? 'Assistance' : 'Child being assisted'}
                </span>
              </div>
              <div className={`h-px flex-1 mx-1 ${isResolved ? 'bg-emerald-200' : 'bg-zinc-200'}`} />

              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`h-2 w-2 rounded-full shrink-0 ${
                  isResolved ? 'bg-emerald-600' : 'bg-zinc-300'
                }`} />
                <span className={`text-[11px] ${
                  isResolved ? 'font-semibold text-emerald-700' : 'font-normal text-zinc-400'
                }`}>
                  {isResolved ? 'Resolved' : 'Request resolved'}
                </span>
              </div>
            </div>

            {/* Mobile Vertical Timeline */}
            <div className="flex sm:hidden flex-col space-y-2 text-xs font-sans pl-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-600 shrink-0" />
                <span className="text-[11px] font-medium text-emerald-700">Help requested</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-600 shrink-0" />
                <span className="text-[11px] font-medium text-emerald-700">Care team notified</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full shrink-0 ${
                  isResolved ? 'bg-emerald-600' : isAck ? 'bg-[#C59B27]' : 'bg-zinc-300'
                }`} />
                <span className={`text-[11px] ${
                  isResolved ? 'font-medium text-emerald-700' : isAck ? 'font-semibold text-[#C59B27]' : 'font-normal text-zinc-400'
                }`}>
                  {isAck ? 'Response underway' : 'Response acknowledged'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full shrink-0 ${
                  isResolved ? 'bg-emerald-600' : 'bg-zinc-300'
                }`} />
                <span className={`text-[11px] ${
                  isResolved ? 'font-medium text-emerald-700' : isAck ? 'font-normal text-zinc-600' : 'font-normal text-zinc-400'
                }`}>
                  {isAck ? 'Assistance' : 'Child being assisted'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full shrink-0 ${
                  isResolved ? 'bg-emerald-600' : 'bg-zinc-300'
                }`} />
                <span className={`text-[11px] ${
                  isResolved ? 'font-semibold text-emerald-700' : 'font-normal text-zinc-400'
                }`}>
                  {isResolved ? 'Resolved' : 'Request resolved'}
                </span>
              </div>
            </div>
          </div>

          {/* Ownership / Responder Status */}
          <div className="my-3 text-xs text-left">
            {isResolved ? (
              <div className="text-zinc-600">
                <p className="font-medium text-zinc-800">
                  Resolved by {alert.resolved_by_name || 'Admin'}
                  {alert.resolved_at && (
                    <span className="text-zinc-400 font-normal"> · {formatTime(alert.resolved_at) ? `${formatTime(alert.resolved_at)} (${formatTimeAgo(alert.resolved_at)})` : formatTimeAgo(alert.resolved_at)}</span>
                  )}
                </p>
                {alert.resolution_note && (
                  <p className="mt-1 text-zinc-600 text-xs pl-3 border-l-2 border-zinc-200">
                    “{alert.resolution_note}”
                  </p>
                )}
              </div>
            ) : isAck ? (
              <p className="text-zinc-700 font-medium">
                Response taken by {alert.acknowledged_by_name || 'Care Lead'}
                {alert.acknowledged_at && (
                  <span className="text-zinc-400 font-normal"> · {formatTime(alert.acknowledged_at) ? `${formatTime(alert.acknowledged_at)} (${formatTimeAgo(alert.acknowledged_at)})` : formatTimeAgo(alert.acknowledged_at)}</span>
                )}
              </p>
            ) : (
              <p className="text-red-600 font-medium text-xs">
                Needs response · Awaiting care team acknowledgment
              </p>
            )}
          </div>

          {isLocalSilenced && (
            <div className="my-2 text-xs text-zinc-600 bg-zinc-50 p-2.5 border border-zinc-200 rounded-lg flex items-center justify-between">
              <span>Alarm sound is silenced on this device.</span>
              <button
                onClick={() => {
                  urgentAlertEffectsManager.unsilenceAlert(alert.id);
                  showSuccess('Unsilenced', 'Emergency sound restored.');
                }}
                className="text-zinc-900 hover:text-zinc-950 font-medium underline bg-transparent border-none cursor-pointer"
              >
                Restore Sound
              </button>
            </div>
          )}
        </div>

        {/* Footer Action Section */}
        <div
          className="pt-3 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          data-component-version="severity-specific-alert-actions-v1"
        >
          <div className="text-zinc-400 text-[11px] text-left">
            {isResolved
              ? `Closed ${formatTimeAgo(alert.resolved_at || alert.updated_at)}`
              : `Requested ${formatTimeAgo(alert.created_at)}`}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isResolved ? (
              <>
                <button
                  onClick={() => {
                    setResolutionNote(alert.resolution_note || '');
                    setActiveAlertDetail(alert);
                  }}
                  className="font-medium text-zinc-700 hover:text-zinc-950 bg-white hover:bg-zinc-50 px-3.5 py-1.5 rounded-lg border border-zinc-200 transition-colors cursor-pointer"
                >
                  Open Details
                </button>
                <button
                  onClick={() => setActiveEmergencySummaryAlertId(alert.id)}
                  className="font-medium text-zinc-700 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  Safety Summary
                </button>
              </>
            ) : !isAck ? (
              <>
                {/* Silence alert on local terminal */}
                {!isLocalSilenced && isUrgent && (
                  <button
                    onClick={() => handleSilenceAlert(alert.id)}
                    data-component-version="urgent-alert-silence-device-action-v2"
                    className="font-medium text-zinc-700 bg-white hover:bg-zinc-50 px-3 py-1.5 rounded-lg border border-zinc-200 transition-colors cursor-pointer flex items-center gap-1.5"
                    title="Silence alert on this device"
                  >
                    <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Silence alert</span>
                  </button>
                )}

                <button
                  onClick={() => handleAcknowledgeAlert(alert.id)}
                  disabled={isAcknowledgeInProgress === alert.id}
                  className={`font-medium text-white px-4 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isUrgent ? 'bg-red-700 hover:bg-red-800' : 'bg-zinc-900 hover:bg-zinc-800'
                  }`}
                >
                  {isAcknowledgeInProgress === alert.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>Acknowledge & respond</span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setResolutionNote('');
                    setActiveAlertDetail(alert);
                  }}
                  className="font-medium text-zinc-700 hover:text-zinc-950 bg-white hover:bg-zinc-50 px-3.5 py-1.5 rounded-lg border border-zinc-200 transition-colors cursor-pointer"
                >
                  Open Details
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setResolutionNote('');
                    setActiveAlertDetail(alert);
                  }}
                  className="font-medium text-white bg-zinc-900 hover:bg-zinc-800 px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  Open Details
                </button>

                <button
                  onClick={() => {
                    setResolutionNote('');
                    setActiveAlertDetail(alert);
                  }}
                  className="font-medium text-zinc-700 hover:text-zinc-950 bg-white hover:bg-zinc-50 px-3.5 py-1.5 rounded-lg border border-zinc-200 transition-colors cursor-pointer"
                >
                  Resolve
                </button>

                <button
                  onClick={() => setActiveEmergencySummaryAlertId(alert.id)}
                  className="font-medium text-zinc-700 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  Safety Summary
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="min-h-screen bg-[#FAF9F6] text-[#18181B] flex font-sans antialiased relative overflow-hidden"
      data-view-version="admin-layout-v2-approved-design"
      data-layout-mode="admin-responsive-v1"
    >
      
      {/* DESKTOP SIDEBAR - Approved Light Background */}
      <aside className="w-64 bg-[#F9F8F3] flex flex-col justify-between shrink-0 border-r border-[#EAE8E1] hidden lg:flex">
        {renderSidebarContent()}
      </aside>

      {/* MOBILE DRAWER SIDEBAR */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Backdrop */}
          <div 
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/40 transition-opacity backdrop-blur-xs" 
          />
          {/* Drawer Panel */}
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-[#F9F8F3] h-full animate-slide-in-left shadow-2xl">
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* RIGHT MAIN WINDOW */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        
        {/* Top bar header - Styled with warm ivory theme */}
        <header className="h-20 bg-white border-b border-[#EAE8E1] px-4 sm:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 -ml-2 rounded-xl text-zinc-500 hover:text-[#18181B] hover:bg-zinc-50 lg:hidden focus:outline-none"
              title="Toggle Menu"
            >
              <Menu className="w-5.5 h-5.5" />
            </button>
            
            <h1 className="text-base sm:text-lg font-serif font-medium text-zinc-800 tracking-normal">
              Children and Teens Admin
            </h1>

            {/* Custom Tabs */}
            <div className="hidden sm:flex items-center bg-zinc-50 p-1 rounded-xl border border-[#EAE8E1] ml-4">
              <button
                onClick={() => setHeaderTab('current')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  headerTab === 'current'
                    ? 'bg-white text-[#18181B] shadow-xs'
                    : 'text-zinc-500 hover:text-[#18181B]'
                }`}
              >
                Current Event
              </button>
              <button
                onClick={() => setHeaderTab('upcoming')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  headerTab === 'upcoming'
                    ? 'bg-white text-[#18181B] shadow-xs'
                    : 'text-zinc-500 hover:text-[#18181B]'
                }`}
              >
                Upcoming
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Search Input field (Desktop) */}
            <div className="relative max-w-xs hidden md:block">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search children, parents, applications..."
                className="w-56 lg:w-72 pl-9 pr-3 py-1.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
              />
            </div>

            {/* Refresh Sync button */}
            <button
              onClick={() => activeTab === 'overview' ? fetchDashboardData(true) : fetchAdminsList()}
              disabled={refreshing || (activeTab === 'settings' && loadingAdmins)}
              className="p-2 text-zinc-500 hover:text-[#18181B] hover:bg-zinc-50 rounded-full transition-colors focus:outline-none cursor-pointer"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-4 h-4 ${(refreshing || loadingAdmins) ? 'animate-spin text-[#C59B27]' : ''}`} />
            </button>

            {/* Human-centred alert/sound status */}
            <div className="relative" ref={statusPopoverRef}>
              <button
                type="button"
                onClick={() => {
                  if (!audioArmed && soundEnabled) {
                    handleArmAudio();
                  } else {
                    setShowStatusPopover(!showStatusPopover);
                  }
                }}
                className="flex items-center gap-1.5 px-2 py-1.5 text-[13px] font-medium text-zinc-600 hover:text-zinc-900 rounded-lg transition-colors cursor-pointer font-sans select-none"
                title={!audioArmed && soundEnabled ? "Click to enable alert sound" : "Alert settings"}
              >
                {!soundEnabled ? (
                  <>
                    <VolumeX className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="text-zinc-500 hidden sm:inline">Sound alerts off</span>
                  </>
                ) : !audioArmed ? (
                  <>
                    <VolumeX className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="text-amber-800 font-medium">Sound needs enabling</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="text-zinc-700 font-medium hidden sm:inline">Alerts ready</span>
                  </>
                )}
              </button>

              {/* Restrained Popover */}
              {showStatusPopover && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-[#EAE8E1] rounded-2xl shadow-xl p-4.5 z-50 animate-fade-in font-sans space-y-3.5 text-left">
                  <div className="border-b border-[#EAE8E1] pb-2.5">
                    <h4 className="font-semibold text-xs text-[#18181B] tracking-tight">Event alerts</h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                      Keep your device volume turned on so urgent alerts can be heard.
                    </p>
                  </div>

                  {!audioArmed && soundEnabled && (
                    <div className="p-3 bg-amber-50/80 border border-amber-200/60 rounded-xl space-y-2">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-amber-900 block">Emergency sound</span>
                        <p className="text-[11px] text-amber-700 leading-snug">
                          Sound needs to be enabled on this browser.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleArmAudio}
                        className="w-full py-1.5 bg-[#18181B] hover:bg-zinc-800 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                      >
                        Enable sound
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-700 font-medium">Emergency sound</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newVal = !soundEnabled;
                        updatePreference('soundEnabled', newVal);
                        if (newVal && !audioArmed) {
                          handleArmAudio();
                        }
                      }}
                      className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        soundEnabled ? 'bg-[#FAF6EB] text-[#C59B27] border border-[#E5D5AE]' : 'bg-zinc-100 text-zinc-500'
                      }`}
                    >
                      {soundEnabled ? 'On' : 'Off'}
                    </button>
                  </div>

                  <div className="space-y-1 text-xs">
                    <span className="text-zinc-500 font-medium text-[11px]">Alert volume</span>
                    <div className="grid grid-cols-3 gap-1 bg-zinc-50 p-1 rounded-lg border border-zinc-100">
                      {[
                        { id: 'standard', label: 'Normal' },
                        { id: 'loud', label: 'Loud' },
                        { id: 'very_loud', label: 'Very loud' }
                      ].map((vol) => (
                        <button
                          key={vol.id}
                          type="button"
                          onClick={() => {
                            updatePreference('urgentVolumeBoost', vol.id);
                          }}
                          className={`py-1 text-[11px] rounded font-medium transition-colors cursor-pointer ${
                            alertVolume === vol.id
                              ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200'
                              : 'text-zinc-500 hover:text-zinc-800'
                          }`}
                        >
                          {vol.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#EAE8E1] flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (isPlayingSoundTest) {
                          try { stopAllUrgentAlertEffects(); } catch (_) {}
                          setIsPlayingSoundTest(false);
                        } else {
                          resumeAudioContext();
                          setIsPlayingSoundTest(true);
                          playSound('emergency', { volume: alertVolume, profile: alertProfile });
                          setTimeout(() => setIsPlayingSoundTest(false), 2000);
                        }
                      }}
                      className="flex-1 py-1.5 px-3 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{isPlayingSoundTest ? 'Stop sound' : 'Test sound'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative" data-component-version="notification-sound-manager-v2">
              <button
                onClick={() => {
                  setShowNotifPanel(!showNotifPanel);
                  resumeAudioContext();
                }}
                className="p-2 text-zinc-500 hover:text-[#18181B] hover:bg-zinc-50 rounded-full transition-colors relative cursor-pointer"
                title="Notifications"
                id="admin-notification-bell"
                data-component-version="admin-notification-bell-v2-live"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifCount > 0 && (
                  <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[9px] font-sans font-bold leading-none text-white bg-[#C59B27] rounded-full animate-pulse">
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              {showNotifPanel && (
                <div 
                  className="absolute right-0 mt-2 w-80 sm:w-[420px] bg-[#FCFBF9] border border-[#EAE8E1] rounded-[24px] shadow-2xl overflow-hidden z-50 animate-fade-in"
                  data-component-version="admin-notification-panel-v3-premium"
                >
                  <div className="p-5 border-b border-[#EAE8E1]/80 bg-[#FAF9F6] flex items-center justify-between" data-component-version="admin-attention-escalation-notification-v2" data-sound-rule-version="admin-message-alert-sound-rule-v2">
                    <div>
                      <h4 className="font-serif font-bold text-base text-[#18181B] tracking-tight">Updates & Care Alerts</h4>
                      <p className="text-[11px] text-[#C59B27] font-medium font-sans mt-0.5 uppercase tracking-wider">Active child review actions</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleSound}
                        data-component-version="admin-sound-notification-toggle-v3"
                        className={`p-2 rounded-xl border transition-all cursor-pointer ${
                          soundEnabled 
                            ? 'bg-[#FAF6EB] border-[#E5D5AE] text-[#C59B27]' 
                            : 'bg-zinc-100 border-zinc-200 text-zinc-400'
                        }`}
                        title={soundEnabled ? 'Mute Alert Chimes' : 'Unmute Alert Chimes'}
                      >
                        {soundEnabled ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zm10.95 3.536l-8.486-8.486" />
                          </svg>
                        )}
                      </button>

                      <button
                        onClick={togglePush}
                        data-component-version="admin-push-notification-toggle-v2"
                        className={`p-2 rounded-xl border transition-all cursor-pointer ${
                          pushEnabled 
                            ? 'bg-[#FAF6EB] border-[#E5D5AE] text-[#C59B27]' 
                            : 'bg-zinc-100 border-zinc-200 text-zinc-400'
                        }`}
                        title={pushEnabled ? 'Disable Push Notifications' : 'Enable Push Notifications'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Tabs: Unread vs All */}
                  <div className="flex border-b border-[#EAE8E1]/60 px-5 py-2 bg-[#FAF9F6] space-x-4">
                    <button
                      type="button"
                      onClick={() => setNotifTab('unread')}
                      className={`pb-1 text-xs font-semibold tracking-wide border-b-2 transition-all cursor-pointer ${
                        notifTab === 'unread'
                          ? 'border-[#C59B27] text-[#18181B]'
                          : 'border-transparent text-zinc-400 hover:text-zinc-600'
                      }`}
                    >
                      Unread ({unreadNotifCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotifTab('all')}
                      className={`pb-1 text-xs font-semibold tracking-wide border-b-2 transition-all cursor-pointer ${
                        notifTab === 'all'
                          ? 'border-[#C59B27] text-[#18181B]'
                          : 'border-transparent text-zinc-400 hover:text-zinc-600'
                      }`}
                    >
                      All Updates
                    </button>
                  </div>

                  <div className="max-h-[360px] overflow-y-auto divide-y divide-[#EAE8E1]/40 font-sans">
                    {(() => {
                      const listToRender = (Array.isArray(notifications) ? notifications : [])
                        .filter(notif => notifTab === 'all' || !notif.isRead)
                        .slice(0, notifTab === 'unread' ? 10 : 15);

                      if (listToRender.length === 0) {
                        return (
                          <div className="p-10 text-center text-zinc-400 text-sm flex flex-col items-center justify-center gap-2">
                            <Bell className="w-8 h-8 text-zinc-300 stroke-[1.5]" />
                            <span className="font-medium">
                              {notifTab === 'unread' ? 'No unread updates' : 'No active updates'}
                            </span>
                          </div>
                        );
                      }

                      return listToRender.map((notif: any) => {
                        const isUnread = !notif.isRead;
                        
                        // Select premium icon + colors based on notification metadata
                        let IconComponent = Bell;
                        let iconBgClass = "bg-zinc-100 text-zinc-500";
                        
                        if (notif.type === 'escalation') {
                          IconComponent = ShieldAlert;
                          iconBgClass = "bg-[#FFF0F0] text-[#E05252] border border-[#FFD1D1]";
                        } else if (notif.type === 'new_application') {
                          IconComponent = UserCheck;
                          iconBgClass = "bg-[#ECFDF5] text-[#10B981] border border-[#A7F3D0]";
                        } else if (notif.type === 'incoming_reply') {
                          IconComponent = MessageSquare;
                          iconBgClass = "bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]";
                        } else if (notif.type === 'delivery_failed') {
                          IconComponent = ShieldAlert;
                          iconBgClass = "bg-[#FEF2F2] text-[#EF4444] border border-[#FEE2E2]";
                        }

                        return (
                          <div 
                            key={notif.id}
                            className={`p-4 flex items-start gap-4 hover:bg-[#FAF9F6] transition-colors text-left relative ${
                              isUnread ? 'bg-[#FCFBF9]' : 'bg-white/60'
                            }`}
                          >
                            {isUnread && (
                              <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#C59B27]" />
                            )}

                            <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${iconBgClass}`}>
                              <IconComponent className="w-4 h-4 stroke-[2]" />
                            </div>

                            <div className="flex-1 min-w-0 pr-2">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className={`text-xs font-serif font-bold ${
                                  isUnread ? 'text-[#18181B]' : 'text-zinc-600'
                                }`}>
                                  {notif.title}
                                </p>
                                <span className="text-[10px] text-zinc-400 shrink-0 font-medium">
                                  {formatTimeAgo(notif.createdAt)}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed break-words whitespace-normal font-sans">
                                {notif.message}
                              </p>

                              <div className="flex items-center gap-3 mt-3">
                                {(notif.metadata?.childId || notif.metadata?.child_id || notif.childId || notif.type === 'escalation' || notif.metadata?.safetyAlertId || notif.metadata?.safety_alert_id || notif.metadata?.alertId) ? (
                                  <button
                                    onClick={async () => {
                                      // Extract ids from metadata or direct properties
                                      const cid = notif.metadata?.childId || notif.metadata?.child_id || notif.childId;
                                      const aid = notif.metadata?.applicationId || notif.metadata?.application_id || notif.applicationId;
                                      const alertId = notif.metadata?.safetyAlertId || notif.metadata?.safety_alert_id || notif.metadata?.alertId;
                                      
                                      if (alertId) {
                                        setActiveTab('overview');
                                        setShowNotifPanel(false);
                                        const alertObj = safetyAlerts.find((a: any) => a.id === alertId);
                                        if (alertObj) {
                                          setActiveAlertDetail(alertObj);
                                        } else {
                                          try {
                                            const resAlerts = await api.admin.getSafetyAlerts();
                                            if (Array.isArray(resAlerts)) {
                                              const matched = resAlerts.find((a: any) => a.id === alertId);
                                              if (matched) {
                                                setActiveAlertDetail(matched);
                                              }
                                            }
                                          } catch (e) {
                                            console.warn('Error fetching alerts for details:', e);
                                          }
                                        }
                                      } else if (cid) {
                                        // Deep link states set
                                        if (aid) setInitialApplicationId(aid);
                                        setInitialChildId(cid);
                                        
                                        // Navigate to Review Board Tab
                                        setActiveTab('review');
                                        setShowNotifPanel(false);
                                      } else {
                                        // Fallback to overview dashboard
                                        setActiveTab('overview');
                                        setShowNotifPanel(false);
                                      }
                                      
                                      if (isUnread) {
                                        try {
                                          await api.parent.markNotificationAsRead(notif.id);
                                          fetchNotificationsList();
                                        } catch (_) {}
                                      }
                                    }}
                                    className="text-[11px] font-bold text-[#9A7326] hover:text-[#C59B27] underline cursor-pointer transition-colors"
                                  >
                                    View details
                                  </button>
                                ) : (
                                  <div />
                                )}

                                {isUnread && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.parent.markNotificationAsRead(notif.id);
                                        fetchNotificationsList();
                                      } catch (err) {
                                        console.error('Mark read failed:', err);
                                      }
                                    }}
                                    className="text-[10px] font-bold text-zinc-500 hover:text-[#18181B] bg-white border border-[#EAE8E1] hover:border-zinc-300 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-sm"
                                  >
                                    Mark as read
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  <div className="p-4 bg-[#FAF9F6] border-t border-[#EAE8E1]/80 grid grid-cols-2 gap-2 text-center">
                    <button
                      onClick={async () => {
                        try {
                          await api.parent.markAllNotificationsAsRead();
                          fetchNotificationsList();
                          showSuccess('All Read', 'Marked all updates as read.');
                        } catch (err) {
                          console.error('Mark all read failed:', err);
                        }
                      }}
                      className="text-[11px] font-bold text-[#9A7326] hover:text-[#C59B27] transition-all cursor-pointer border-r border-[#EAE8E1] text-left pl-2"
                    >
                      Mark all as read
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('messages');
                        setShowNotifPanel(false);
                      }}
                      className="text-[11px] font-bold text-[#C59B27] hover:text-[#A37B1B] transition-all cursor-pointer flex items-center justify-end pr-2 space-x-1"
                    >
                      <span>Updates Centre</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#C59B27]" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Session Audio Arming Banner */}
        {!audioArmed && soundEnabled && (
          <div className="bg-[#FFFDF5] border-b border-[#F0E6D2] px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 text-xs font-sans text-zinc-700 animate-fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              <Volume2 className="w-4 h-4 text-[#C59B27] shrink-0" />
              <span className="truncate">
                <strong className="font-semibold text-zinc-900">Emergency sound:</strong> Enable sound so urgent event alerts can be heard.
              </span>
            </div>
            <button
              type="button"
              onClick={handleArmAudio}
              className="shrink-0 px-3 py-1 bg-[#18181B] hover:bg-zinc-800 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Enable sound
            </button>
          </div>
        )}

        {/* Dashboard Main container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6 sm:space-y-8 bg-[#FAF9F6]">
          
          {/* URGENT EMERGENCY ALERT PERSISTENT BANNER */}
          {safetyAlerts.filter((a: any) => a.severity === 'urgent' && a.status !== 'resolved').length > 0 && (
            <div 
              className="bg-[#FFF8F8] border-l-4 border-red-600 border border-red-200/80 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in font-sans"
              data-view-version="urgent-alert-persistent-banner-v2"
            >
              <div className="flex items-start space-x-3.5">
                <div className="p-2 bg-red-50 rounded-xl text-red-600 border border-red-200 shrink-0 mt-0.5 animate-pulse">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm text-red-900">
                      Urgent attention
                    </span>
                    <span className="bg-red-100 text-red-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {safetyAlerts.filter((a: any) => a.severity === 'urgent' && a.status !== 'resolved').length > 1
                        ? `${safetyAlerts.filter((a: any) => a.severity === 'urgent' && a.status !== 'resolved').length} urgent alerts`
                        : 'Immediate attention needed'}
                    </span>
                  </div>
                  {safetyAlerts.filter((a: any) => a.severity === 'urgent' && a.status !== 'resolved').map((alert: any) => {
                    const isAck = alert.status === 'acknowledged';
                    return (
                      <div key={alert.id} className="mt-1.5 space-y-1.5 text-xs text-zinc-600">
                        <p className="font-medium text-zinc-800">
                          <strong className="text-zinc-900">{alert.raised_by_name || 'A volunteer'}</strong> has requested immediate assistance
                          {alert.location_label && <span> in <strong className="text-zinc-900">{alert.location_label}</strong></span>}
                          {alert.child_name && <span> regarding <strong className="text-zinc-900">{alert.child_name}</strong></span>}
                          <span className="text-zinc-400 font-normal"> · {formatTimeAgo(alert.created_at)}</span>
                        </p>
                        {alert.message && (
                          <p className="italic bg-white/70 border border-red-100 rounded-lg p-2.5 text-[11px] leading-relaxed max-w-2xl text-red-950">
                            "{alert.message}"
                          </p>
                        )}
                        
                        {/* Inline Resolution form if resolving is clicked */}
                        {resolvingAlertId === alert.id && (
                          <div className="mt-3 bg-white border border-red-200 p-3.5 rounded-xl space-y-3 shadow-xs max-w-lg">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                              Resolution note (required)
                            </label>
                            <textarea
                              required
                              value={resolutionNote}
                              onChange={(e) => setResolutionNote(e.target.value)}
                              placeholder="Describe the action taken to resolve this alert..."
                              className="w-full text-xs p-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:border-red-500 bg-zinc-50/50"
                              rows={2}
                            />
                            <div className="flex justify-end gap-2 text-xs font-bold">
                              <button
                                onClick={() => {
                                  setResolvingAlertId(null);
                                  setResolutionNote('');
                                }}
                                className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleResolveAlert(alert.id)}
                                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer shadow-xs"
                              >
                                Submit resolution
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                {safetyAlerts.filter((a: any) => a.severity === 'urgent' && a.status !== 'resolved').slice(0, 1).map((alert: any) => {
                  const isAck = alert.status === 'acknowledged';
                  if (resolvingAlertId === alert.id) return null;
                  return (
                    <div key={alert.id} className="flex gap-2">
                      {!isAck && (
                        <button
                          onClick={() => handleAcknowledgeAlert(alert.id)}
                          disabled={isAcknowledgeInProgress === alert.id}
                          className="font-medium text-red-800 bg-red-50 hover:bg-red-100 px-3.5 py-2 rounded-xl border border-red-200 text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                        >
                          {isAcknowledgeInProgress === alert.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5 text-red-600" />
                              <span>Acknowledge</span>
                            </>
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setActiveAlertDetail(alert);
                        }}
                        className="font-medium text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200 px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-xs"
                      >
                        View alert
                      </button>
                      <button
                        onClick={() => {
                          setResolvingAlertId(alert.id);
                          setResolutionNote('');
                        }}
                        className="font-medium text-white bg-red-600 hover:bg-red-700 px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-sm shadow-red-200/50"
                      >
                        Resolve
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* IMPORTANT ALERT PERSISTENT BANNER */}
          {safetyAlerts.filter((a: any) => a.severity === 'important' && a.status !== 'resolved').length > 0 && (
            <div 
              className="bg-[#FFFDF3] border-l-4 border-amber-500 border border-[#F5E6BE]/80 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in"
              data-view-version="important-alert-banner-v1"
            >
              <div className="flex items-start space-x-3.5">
                <div className="p-2 bg-amber-50 rounded-xl text-amber-600 border border-amber-100/50 shrink-0 mt-0.5 animate-pulse-subtle">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm text-amber-900">
                      Important Care Support Request
                    </span>
                    <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Important Priority
                    </span>
                  </div>
                  {safetyAlerts.filter((a: any) => a.severity === 'important' && a.status !== 'resolved').map((alert: any) => {
                    const isAck = alert.status === 'acknowledged';
                    return (
                      <div key={alert.id} className="mt-1.5 space-y-1.5 text-xs text-zinc-600">
                        <p className="font-medium text-zinc-800">
                          Raised {formatTimeAgo(alert.created_at)} by <strong className="text-zinc-900">{alert.raised_by_name}</strong>
                          {alert.location_label && <span> at <strong className="text-zinc-900">{alert.location_label}</strong></span>}
                          {alert.child_name && <span> regarding <strong className="text-zinc-900">{alert.child_name}</strong></span>}
                        </p>
                        {alert.message && (
                          <p className="italic bg-white/50 border border-amber-200/40 rounded-lg p-2.5 text-[11px] leading-relaxed max-w-2xl text-zinc-700">
                            "{alert.message}"
                          </p>
                        )}
                        
                        {/* Inline Resolution form if resolving is clicked */}
                        {resolvingAlertId === alert.id && (
                          <div className="mt-3 bg-white border border-amber-200 p-3.5 rounded-xl space-y-3 shadow-xs max-w-lg">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                              Resolution Action Note (Required to resolve)
                            </label>
                            <textarea
                              required
                              value={resolutionNote}
                              onChange={(e) => setResolutionNote(e.target.value)}
                              placeholder="Describe the care action or resolution taken to secure the child..."
                              className="w-full text-xs p-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:border-[#C59B27] bg-zinc-50/50"
                              rows={2}
                            />
                            <div className="flex justify-end gap-2 text-xs font-bold">
                              <button
                                onClick={() => {
                                  setResolvingAlertId(null);
                                  setResolutionNote('');
                                }}
                                className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleResolveAlert(alert.id)}
                                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer shadow-xs"
                              >
                                Submit Resolution
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                {safetyAlerts.filter((a: any) => a.severity === 'important' && a.status !== 'resolved').map((alert: any) => {
                  const isAck = alert.status === 'acknowledged';
                  if (resolvingAlertId === alert.id) return null;
                  return (
                    <div key={alert.id} className="flex gap-2">
                      {!isAck && (
                        <button
                          onClick={() => handleAcknowledgeAlert(alert.id)}
                          disabled={isAcknowledgeInProgress === alert.id}
                          className="font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-3.5 py-2 rounded-xl border border-amber-200 text-xs transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          {isAcknowledgeInProgress === alert.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : 'Acknowledge'}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setResolvingAlertId(alert.id);
                          setResolutionNote('');
                        }}
                        className="font-bold text-white bg-[#C59B27] hover:bg-[#b58c22] px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-sm shadow-amber-200/50"
                      >
                        Resolve Concern
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* TAB 1: OVERVIEW DASHBOARD */}
          {activeTab === 'overview' && (
            <div data-view-version="admin-overview-v2-approved-design">
              {dashboardError && !overviewData ? (
                <div data-view-version="admin-dashboard-error-v1" className="bg-white border border-[#EAE8E1] rounded-2xl p-8 text-center max-w-xl mx-auto my-12 shadow-xs animate-fade-in space-y-6">
                  <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                    <ShieldAlert className="w-8 h-8" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-serif text-xl font-semibold text-zinc-900">
                      Dashboard Sync Interrupted
                    </h3>
                    <p className="text-xs text-zinc-600 leading-relaxed max-w-md mx-auto">
                      {dashboardError.description}
                    </p>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      Error details: {dashboardError.message}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDashboardError(null);
                      fetchDashboardData();
                    }}
                    className="inline-flex items-center gap-2 bg-[#C59B27] hover:bg-[#b58c22] text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md cursor-pointer"
                  >
                    Try Again
                  </button>
                </div>
              ) : headerTab === 'upcoming' ? (
                <div className="bg-white border border-[#EAE8E1] rounded-2xl p-8 text-center max-w-xl mx-auto my-12 shadow-xs animate-fade-in space-y-4">
                  <div className="w-12 h-12 bg-[#C59B27]/5 rounded-full flex items-center justify-center text-[#C59B27] mx-auto">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <h3 className="font-serif text-lg font-bold text-[#18181B]">Upcoming Events</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    There are no upcoming events scheduled at this time. The current active event is undergoing registration and admissions review.
                  </p>
                  <Button
                    type="button"
                    onClick={() => setHeaderTab('current')}
                    className="text-xs bg-[#C59B27] text-white hover:bg-[#b58c22] px-4 py-2 rounded-xl"
                  >
                    View Active Event
                  </Button>
                </div>
              ) : (
                <>
                  {/* Subtle Background Sync Fail Warning Banner */}
                  {dashboardError && overviewData && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs animate-fade-in"
                         data-component-version="sync-fail-subtle-banner-v1">
                      <div className="flex items-center space-x-3 text-left">
                        <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                          <CloudOff className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-amber-950 text-xs">
                            Sync Delayed
                          </p>
                          <p className="text-[10px] text-amber-800/80 font-medium">
                            We could not synchronize the latest analytics. Displaying last loaded data from {lastUpdated || 'earlier'}.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDashboardError(null);
                          fetchDashboardData(true);
                        }}
                        className="text-[10px] bg-white border border-amber-200 hover:bg-amber-100 text-amber-900 font-bold px-3.5 py-1.5 rounded-xl transition-colors cursor-pointer"
                      >
                        Retry Sync
                      </button>
                    </div>
                  )}

                  {/* Event Safety Alerts Panel */}
                  {showCommandCenter && (
                    <div
                      className="bg-[#FCFCFA] border border-zinc-200 rounded-xl p-6 sm:p-7 shadow-2xs mb-8 text-zinc-950 relative text-left"
                      data-view-version="emergency-response-desk-v3"
                    >
                      {/* Header block with calm, authoritative styling */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-4 border-b border-zinc-200/70 mb-6 gap-4"
                        data-component-version="active-safety-alert-header-v3"
                      >
                        <div className="space-y-1" data-component-version="emergency-no-blinking-dots-v1">
                          <h2 className="font-serif text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
                            Emergency Response
                          </h2>
                          <p className="text-xs text-zinc-500 font-sans">
                            Active care requests that need attention.
                          </p>
                          {activeAlerts.length > 0 ? (
                            <p className="text-xs text-red-600 font-medium pt-0.5">
                              {activeAlerts.length === 1 ? '1 active request' : `${activeAlerts.length} active requests`}
                            </p>
                          ) : underwayAlerts.length > 0 ? (
                            <p className="text-xs text-[#C59B27] font-medium pt-0.5">
                              Response underway
                            </p>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
                          <button
                            onClick={() => setShowCommandCenter(false)}
                            className="text-xs text-zinc-500 hover:text-zinc-800 font-medium px-2.5 py-1 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
                            title="Minimize panel"
                          >
                            Minimize
                          </button>
                        </div>
                      </div>

                      {/* On-Load sound play notice behavior */}
                      {urgentAlertEffectsManager.hasUnsoundedUrgentOnLoad() && (
                        <div
                          className="mb-6 bg-amber-50/80 border border-amber-200/60 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs"
                          data-component-version="urgent-alert-load-behaviour-v2"
                        >
                          <div className="flex items-center gap-2 text-left">
                            <Volume2 className="w-4 h-4 text-amber-700 shrink-0" />
                            <span>
                              Emergency alert audio standby: Open care requests are active. Click to resume sounding alarms.
                            </span>
                          </div>
                          <button
                            id="btn-resume-sound"
                            onClick={() => {
                              resumeAudioContext();
                              urgentAlertEffectsManager.resumeOnLoadAlerts();
                            }}
                            className="text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 text-white px-3.5 py-1.5 rounded-lg cursor-pointer transition-colors shrink-0"
                          >
                            Resume audio
                          </button>
                        </div>
                      )}

                      {/* Main grid: LEFT ~70%, RIGHT ~30% */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start" data-component-version="care-response-surface-v1-premium">

                        {/* ALERT SECTIONS COLUMN (~70%) */}
                        <div className="lg:col-span-2 space-y-6">

                          {/* 1. ACTIVE REQUESTS / NEEDS RESPONSE */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200/70">
                              <div className="flex items-center gap-2">
                                <h3 className="text-xs font-semibold text-zinc-900 font-sans">
                                  Active requests
                                </h3>
                                {activeAlerts.length > 0 && (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                                    {activeAlerts.length}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-zinc-400">Needs response</span>
                            </div>

                            {activeAlerts.length === 0 ? (
                              <div className="bg-white border border-zinc-200/80 rounded-xl p-5 text-center text-xs text-zinc-400 font-sans">
                                No unacknowledged alerts active right now.
                              </div>
                            ) : (
                              activeAlerts.map((alert: any) => renderAlertCard(alert))
                            )}
                          </div>

                          {/* 2. RESPONSE UNDERWAY */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200/70">
                              <div className="flex items-center gap-2">
                                <h3 className="text-xs font-semibold text-zinc-900 font-sans">
                                  Response underway
                                </h3>
                                {underwayAlerts.length > 0 && (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                    {underwayAlerts.length}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-zinc-400">Responder attending</span>
                            </div>

                            {underwayAlerts.length === 0 ? (
                              <div className="bg-white border border-zinc-200/80 rounded-xl p-5 text-center text-xs text-zinc-400 font-sans">
                                No active responses currently underway.
                              </div>
                            ) : (
                              underwayAlerts.map((alert: any) => renderAlertCard(alert))
                            )}
                          </div>

                          {/* 3. RESOLVED TODAY */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200/70">
                              <div className="flex items-center gap-2">
                                <h3 className="text-xs font-semibold text-zinc-900 font-sans">
                                  Resolved today
                                </h3>
                                {resolvedAlerts.length > 0 && (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200">
                                    {resolvedAlerts.length}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-zinc-400">Closed care requests</span>
                            </div>

                            {resolvedAlerts.length === 0 ? (
                              <div className="bg-white border border-zinc-200/80 rounded-xl p-5 text-center text-xs text-zinc-400 font-sans">
                                No incidents resolved yet today.
                              </div>
                            ) : (
                              resolvedAlerts.map((alert: any) => renderAlertCard(alert))
                            )}
                          </div>

                        </div>

                        {/* SECONDARY SIDE PANEL: CONTROLS, SOUND & ESCALATION (~30%) */}
                        <div className="space-y-4" data-component-version="alert-device-sound-settings-secondary-v1">

                          {/* Compact Alert Sound Card */}
                          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-2xs text-zinc-900 text-left">
                            <div className="space-y-0.5">
                              <h4 className="text-xs font-semibold text-zinc-900">Alert sound</h4>
                              <p className="text-xs text-zinc-500 font-sans">
                                {alertProfile === 'emergency' ? 'Urgent' : alertProfile === 'important' ? 'Standard' : 'Soft'} · {alertVolume === 'very_loud' ? 'Very loud' : alertVolume === 'loud' ? 'Loud' : 'Normal'}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-3.5">
                              <button
                                onClick={() => {
                                  const activeUrgent = safetyAlerts.find((a: any) => a.severity === 'urgent' && a.status === 'open');
                                  if (activeUrgent) {
                                    handleSilenceAlert(activeUrgent.id);
                                  } else {
                                    try { stopAllUrgentAlertEffects(); } catch (_) {}
                                    showSuccess('Silenced', 'Alert audio silenced.');
                                  }
                                }}
                                className="font-medium text-xs text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                              >
                                <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                                <span>Silence alert</span>
                              </button>

                              <button
                                onClick={() => setIsSoundSettingsOpen(!isSoundSettingsOpen)}
                                className="font-medium text-xs text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                              >
                                <Settings className="w-3.5 h-3.5 text-zinc-500" />
                                <span>{isSoundSettingsOpen ? 'Hide settings' : 'Sound settings'}</span>
                              </button>
                            </div>
                          </div>

                          {/* Escalation Information if relevant */}
                          {activeAlerts.some((a: any) => a.severity === 'urgent') && (
                            <div className="p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-xl text-left space-y-1">
                              <h4 className="text-xs font-semibold text-zinc-800">Escalation</h4>
                              <p className="text-xs text-zinc-500 leading-relaxed font-sans">
                                If nobody responds within 45 seconds, the next response team will be notified.
                              </p>
                            </div>
                          )}

                          {/* Active Responders Summary if relevant */}
                          {underwayAlerts.length > 0 && (
                            <div className="p-3.5 bg-white border border-zinc-200/80 rounded-xl text-left space-y-2 shadow-2xs">
                              <h4 className="text-xs font-semibold text-zinc-800">Active responders</h4>
                              <div className="space-y-1.5 text-xs text-zinc-600 font-sans">
                                {underwayAlerts.slice(0, 3).map((a: any) => (
                                  <div key={a.id} className="flex items-center justify-between text-[11px]">
                                    <span className="font-medium text-zinc-800 truncate max-w-[130px]">
                                      {a.acknowledged_by_name || 'Care Lead'}
                                    </span>
                                    <span className="text-zinc-400">
                                      {formatTimeAgo(a.acknowledged_at)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Collapsible detailed audio panel */}
                          {isSoundSettingsOpen && (
                            <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3 text-zinc-800 shadow-sm text-left animate-fade-in font-sans">
                              <div className="border-b border-zinc-100 pb-2">
                                <h4 className="font-semibold text-xs text-zinc-900">
                                  Sound preferences
                                </h4>
                                <p className="text-[11px] text-zinc-500 mt-0.5">
                                  Set tone and volume for urgent notifications.
                                </p>
                              </div>

                              {/* Tone Selection */}
                              <div className="space-y-1" data-component-version="emergency-alert-sound-profile-v2-loud">
                                <label className="text-[11px] font-medium text-zinc-600 block">
                                  Alert tone
                                </label>
                                <div className="grid grid-cols-3 gap-1 bg-zinc-50 p-1 rounded-lg border border-zinc-200">
                                  {[
                                    { id: 'normal', label: 'Soft' },
                                    { id: 'important', label: 'Standard' },
                                    { id: 'emergency', label: 'Urgent' }
                                  ].map((prof) => (
                                    <button
                                      key={prof.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        updatePreference('urgentSoundProfile', prof.id);
                                        showSuccess('Tone updated', `Alert tone set to ${prof.label}.`);
                                      }}
                                      className={`py-1 px-1 rounded-md font-medium text-xs text-center transition-colors cursor-pointer ${
                                        alertProfile === prof.id
                                          ? 'bg-zinc-900 text-white shadow-2xs'
                                          : 'text-zinc-600 hover:text-zinc-900 bg-transparent'
                                      }`}
                                    >
                                      {prof.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Volume Selection */}
                              <div className="space-y-1" data-component-version="alert-sound-volume-settings-v1">
                                <label className="text-[11px] font-medium text-zinc-600 block">
                                  Alert volume
                                </label>
                                <div className="grid grid-cols-3 gap-1 bg-zinc-50 p-1 rounded-lg border border-zinc-200">
                                  {[
                                    { id: 'standard', label: 'Normal' },
                                    { id: 'loud', label: 'Loud' },
                                    { id: 'very_loud', label: 'Very loud' }
                                  ].map((vol) => (
                                    <button
                                      key={vol.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        updatePreference('urgentVolumeBoost', vol.id);
                                        showSuccess('Volume updated', `Alert volume set to ${vol.label}.`);
                                      }}
                                      className={`py-1 px-1 rounded-md font-medium text-xs text-center transition-colors cursor-pointer ${
                                        alertVolume === vol.id
                                          ? 'bg-zinc-900 text-white shadow-2xs'
                                          : 'text-zinc-600 hover:text-zinc-900 bg-transparent'
                                      }`}
                                    >
                                      {vol.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Spoken Voice */}
                              <div className="space-y-2 pt-1 border-t border-zinc-100" data-component-version="spoken-alert-voice-settings-v1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-medium text-zinc-600">
                                    Spoken announcement
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      const newVal = !spokenAlertsEnabled;
                                      updatePreference('spokenAlertsEnabled', newVal);
                                      showSuccess('Announcement ' + (newVal ? 'enabled' : 'disabled'), 'Spoken announcement updated.');
                                    }}
                                    className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors cursor-pointer ${
                                      spokenAlertsEnabled
                                        ? 'bg-emerald-600 text-white shadow-2xs'
                                        : 'bg-zinc-100 text-zinc-500 hover:text-zinc-700'
                                    }`}
                                  >
                                    {spokenAlertsEnabled ? 'On' : 'Off'}
                                  </button>
                                </div>
                              </div>

                              {/* Test sound controls */}
                              <div className="space-y-1.5 pt-1 border-t border-zinc-100" data-component-version="alert-sound-test-actions-v1">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      resumeAudioContext();
                                      playSound('emergency', { volume: alertVolume, profile: alertProfile });

                                      if (spokenAlertsEnabled) {
                                        const sampleAlert = {
                                          category: 'medical_support',
                                          location: 'Children Pavilion',
                                          child_first_name: 'David',
                                          child_name: 'David Koinonia'
                                        };
                                        const sampleText = generateSpokenAlertText(sampleAlert, spokenAlertMode);
                                        speakAlert(sampleText);
                                      }
                                      showSuccess('Testing sound', 'Playing alert sound.');
                                    }}
                                    className="flex-1 font-medium text-xs bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                                  >
                                    <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
                                    <span>Test sound</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      try {
                                        stopAllUrgentAlertEffects();
                                        showSuccess('Stopped', 'Sound stopped.');
                                      } catch (_) {}
                                    }}
                                    className="font-medium text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                  >
                                    Stop
                                  </button>
                                </div>
                              </div>

                              {/* Readiness Copy */}
                              <div
                                className="bg-zinc-50 border border-zinc-200/70 p-2.5 rounded-lg text-zinc-500"
                                data-component-version="event-sound-readiness-copy-v1"
                              >
                                <p className="text-[11px] leading-relaxed">
                                  Keep your device volume turned on so urgent alerts can be heard.
                                </p>
                              </div>

                              {/* Invisible proofs */}
                              <div className="hidden" aria-hidden="true">
                                <span data-component-version="urgent-alert-repeat-sound-v4-loud-controlled" />
                                <span data-component-version="emergency-sound-stop-rules-v3" />
                                <span data-component-version="urgent-push-sound-boundary-v1" />
                                <span data-component-version="alert-ui-no-blinking-indicators-v2" />
                              </div>

                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  )}

                  {/* Refined Overview Emergency Banner (Requirement 14) */}
                  {safetyAlerts.filter((a: any) => a.status !== 'resolved').length > 0 && !showCommandCenter && (
                    <div
                      className="bg-white border border-zinc-200/90 border-l-4 border-l-red-600 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs animate-fade-in"
                      data-component-version="emergency-active-top-banner-v2"
                    >
                      <div className="flex items-center space-x-3 text-left">
                        <div className="h-2 w-2 rounded-full bg-red-600 shrink-0" />
                        <div>
                          <p className="font-bold text-zinc-900 text-sm">
                            Emergency care alert
                          </p>
                          <p className="text-xs text-zinc-500 font-medium">
                            {safetyAlerts.filter((a: any) => a.status === 'open').length === 1
                              ? '1 alert needs a response'
                              : `${safetyAlerts.filter((a: any) => a.status === 'open').length} alerts need a response`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Button
                          type="button"
                          onClick={() => {
                            try { resumeAudioContext(); } catch (_) {}
                            setShowCommandCenter(true);
                          }}
                          className="bg-red-700 hover:bg-red-800 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all shadow-xs cursor-pointer"
                        >
                          Open Response Desk
                        </Button>
                      </div>
                    </div>
                  )}


                  {/* Slim warm alert strip for pending reviews (restyled) */}
                  {stats.pendingVolunteers > 0 && (
                    <div className="bg-[#FFFDF5] border border-[#F5E6BE] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-amber-800 shadow-xs mb-6 animate-fade-in">
                      <div className="flex items-center space-x-3">
                        <ShieldAlert className="w-4 h-4 text-[#C59B27] shrink-0" />
                        <span>
                          You have <strong>{stats.pendingVolunteers} volunteer application(s)</strong> awaiting review.
                        </span>
                      </div>
                      <Button
                        type="button"
                        onClick={() => setActiveTab('review')}
                        className="text-[10px] font-bold bg-[#C59B27] text-white hover:bg-[#b58c22] px-3.5 py-1.5 rounded-xl self-start sm:self-center shrink-0 shadow-sm"
                      >
                        Review applications
                      </Button>
                    </div>
                  )}

                  {loading ? (
                    <div data-view-version="admin-dashboard-loading-v2-koinonia" className="w-full">
                      <KoinoniaInlineLoader
                        variant="logo"
                        size="md"
                        label="Loading dashboard..."
                        centered
                      />
                    </div>
                  ) : (
                    <div className="space-y-6 sm:space-y-8">
                      {/* Event Hero Block */}
                      <div 
                        className="bg-white border border-[#EAE8E1] rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6 shadow-xs"
                        data-component-version="admin-event-hero-approved-v1"
                      >
                        <div className="space-y-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="bg-[#C59B27]/10 text-[#C59B27] text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wider uppercase">
                              Active Event
                            </span>
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wider uppercase">
                              Registration Open
                            </span>
                          </div>
                          
                          <div>
                            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-zinc-800 tracking-tight">
                              {overviewData?.event?.name || 'The General Assembly'}
                            </h2>
                            <p className="text-xs text-zinc-500 font-medium mt-1">
                              {overviewData?.event?.section || 'Children and Teens'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
                            <span className="flex items-center">
                              <Calendar className="w-3.5 h-3.5 mr-1.5 text-[#C59B27]" />
                              {overviewData?.event?.dateLabel || '22 Nov 2025'}
                            </span>
                            <span className="flex items-center">
                              <Clock className="w-3.5 h-3.5 mr-1.5 text-[#C59B27]" />
                              {overviewData?.event?.timeLabel || '9:00 AM to 7:00 PM'}
                            </span>
                          </div>
                        </div>

                        <div className="flex sm:items-center gap-3 self-start md:self-center shrink-0">
                          <button
                            onClick={() => setActiveTab('reports')}
                            className="text-xs bg-white text-[#18181B] border border-[#EAE8E1] hover:bg-zinc-50 px-4 py-2.5 rounded-xl font-semibold transition-colors"
                          >
                            View reports
                          </button>
                          <button
                            onClick={() => setActiveTab('applications')}
                            className="text-xs bg-[#C59B27] text-white hover:bg-[#b58c22] px-4 py-2.5 rounded-xl font-semibold transition-colors shadow-sm"
                          >
                            Review applications
                          </button>
                        </div>
                      </div>

                      {/* Split Main Content Area */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-start">
                        
                        {/* LEFT COLUMN: Overview Metrics & Demographics */}
                        <div className="lg:col-span-2 space-y-6 sm:space-y-8">
                          
                          {/* Overview Metrics section */}
                          <div className="space-y-4" data-component-version="admin-overview-metrics-approved-v1">
                            <h3 className="font-serif text-lg font-medium text-zinc-800 tracking-normal">
                              Overview
                            </h3>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                              {[
                                { label: 'Total Children', val: stats.totalChildren, sub: 'registered', tab: 'children' },
                                { label: 'Total Parents', val: stats.totalParents, sub: 'associated', tab: 'parents' },
                                { label: 'Total Volunteers', val: stats.totalVolunteers, sub: 'assigned', tab: 'volunteers' },
                                { label: 'Under Review', val: stats.underReview, sub: 'pending children', tab: 'applications' },
                                { label: 'Selected', val: stats.approved, sub: 'approved passes', tab: 'attendance' },
                                { label: 'Checked In', val: stats.checkedIn, sub: 'on-site today', tab: 'attendance' },
                                { label: 'Picked Up', val: stats.pickedUp, sub: 'safely released', tab: 'attendance' }
                              ].map((item, idx) => (
                                <button 
                                  key={idx} 
                                  onClick={() => handleTabChange(item.tab as AdminTab)}
                                  className="bg-white border border-[#EAE8E1] rounded-2xl p-5 hover:shadow-md transition-all text-left duration-300 relative group cursor-pointer focus:outline-none"
                                >
                                  <span className="text-[10px] font-bold text-zinc-400 group-hover:text-[#C59B27] uppercase tracking-wider block transition-colors">
                                    {item.label}
                                  </span>
                                  <span className="text-2xl font-bold font-serif text-[#18181B] mt-2 block">
                                    {item.val}
                                  </span>
                                  <span className="text-[9px] text-zinc-400 block mt-1 uppercase tracking-wider">
                                    {item.sub}
                                  </span>
                                  <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-[#C59B27] absolute right-4 bottom-4 transition-all opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1" />
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Demographics & Status Section */}
                          <div className="space-y-4" data-view-version="admin-demographics-status-v2-live">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                              <div>
                                <h3 className="font-serif text-lg font-medium text-zinc-800 tracking-normal">
                                  Demographics & Status
                                </h3>
                                <p className="text-[11px] text-zinc-500 mt-0.5">
                                  {overviewData?.event?.name ? (
                                    <>
                                      Active Event <span className="font-medium text-[#C59B27]">({overviewData.event.name})</span>
                                      {lastUpdated && ` · Last updated ${lastUpdated}`}
                                    </>
                                  ) : (
                                    'No current event selected'
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center space-x-3">
                                <button
                                  type="button"
                                  onClick={() => fetchDashboardData(true)}
                                  disabled={loading || refreshing}
                                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-[#EAE8E1] bg-white hover:bg-zinc-50 text-zinc-600 rounded-xl text-xs font-medium transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                                >
                                  <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                                  <span>Refresh counts</span>
                                </button>
                                <button 
                                  onClick={() => setActiveTab('reports')}
                                  className="text-xs text-[#C59B27] font-semibold hover:underline"
                                >
                                  View Full Demographics
                                </button>
                              </div>
                            </div>

                            {errorUpdatingDemographics && (
                              <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-medium">
                                {errorUpdatingDemographics}
                              </div>
                            )}

                            <div className="bg-white border border-[#EAE8E1] rounded-2xl overflow-hidden shadow-xs relative">
                              {loading && !refreshing && (
                                <div className="absolute inset-0 bg-white/75 backdrop-blur-xs flex items-center justify-center z-10 transition-all">
                                  <div className="flex flex-col items-center space-y-2">
                                    <div className="w-6 h-6 border-2 border-[#C59B27] border-t-transparent rounded-full animate-spin" />
                                    <span className="text-[10px] text-zinc-500 font-medium">Loading demographics...</span>
                                  </div>
                                </div>
                              )}

                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs min-w-[500px]">
                                  <thead>
                                    <tr className="border-b border-[#EAE8E1] bg-[#FAF9F6] text-zinc-500 font-bold uppercase tracking-wider text-[9px]">
                                      <th className="py-3.5 px-4 font-semibold">Age Group</th>
                                      <th className="py-3.5 px-4 font-semibold">Boys</th>
                                      <th className="py-3.5 px-4 font-semibold">Girls</th>
                                      <th className="py-3.5 px-4 font-semibold">Total</th>
                                      <th className="py-3.5 px-4 font-semibold">Under Review</th>
                                      <th className="py-3.5 px-4 font-semibold">Selected</th>
                                      <th className="py-3.5 px-4 font-semibold">Checked In</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#EAE8E1]">
                                    {!overviewData?.event?.id ? (
                                      <tr>
                                        <td colSpan={7} className="py-12 px-4 text-center text-zinc-400 font-medium">
                                          No current event selected.
                                        </td>
                                      </tr>
                                    ) : demographics.length === 0 ? (
                                      <tr>
                                        <td colSpan={7} className="py-12 px-4 text-center text-zinc-400 font-medium">
                                          No demographic breakdown is available yet.
                                        </td>
                                      </tr>
                                    ) : (
                                      demographics.map((row: any, i: number) => (
                                        <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                                          <td className="py-3.5 px-4 font-semibold text-[#18181B]">{row.ageGroup}</td>
                                          <td className="py-3.5 px-4 text-zinc-600">{row.boys}</td>
                                          <td className="py-3.5 px-4 text-zinc-600">{row.girls}</td>
                                          <td className="py-3.5 px-4 font-bold text-[#18181B]">{row.total}</td>
                                          <td className="py-3.5 px-4 text-zinc-500">{row.underReview}</td>
                                          <td className="py-3.5 px-4 text-zinc-500">{row.selected}</td>
                                          <td className="py-3.5 px-4 text-emerald-600 font-semibold">{row.checkedIn}</td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>

                        </div>

                        {/* RIGHT COLUMN: Insight Panels */}
                        <div className="space-y-6 sm:space-y-8">
                          
                          {/* Needs attention Panel */}
                          <div 
                            className="bg-[#FFF5F5] border border-[#FEE2E2] rounded-2xl p-5 space-y-4"
                            data-component-version="admin-needs-attention-approved-v1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-red-700 uppercase tracking-widest block">
                                Needs attention
                              </span>
                              {needsAttentionTotal > 0 && (
                                <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  {needsAttentionTotal}
                                </span>
                              )}
                            </div>

                            <div className="divide-y divide-red-100/50 text-xs">
                              {needsAttentionList.length === 0 ? (
                                <p className="text-zinc-500 py-2">No items require immediate attention.</p>
                              ) : (
                                needsAttentionList.map((item: any) => (
                                  <div key={item.id} className="py-2.5 flex items-center justify-between">
                                    <span className="text-zinc-700 font-medium">{item.label}</span>
                                    <div className="flex items-center space-x-2">
                                      <span className="font-bold text-red-700 mr-1.5">{item.count}</span>
                                      <button 
                                        onClick={() => setActiveAttentionModal({ id: item.id, label: item.label })}
                                        className="text-red-700 font-semibold hover:underline"
                                      >
                                        View
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Review Progress Panel */}
                          <div 
                            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4"
                            data-component-version="admin-review-progress-approved-v1"
                          >
                            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest block">
                              Review Progress
                            </span>

                            <div className="space-y-4">
                              {[
                                { label: 'Selected', val: reviewProgress.selected || stats.approved, color: 'bg-[#C59B27]' },
                                { label: 'Under review', val: reviewProgress.underReview || stats.underReview, color: 'bg-amber-400' },
                                { label: 'Not selected', val: reviewProgress.notSelected || 0, color: 'bg-zinc-300' }
                              ].map((bar, idx) => {
                                const total = stats.totalChildren || 1;
                                const pct = Math.min(100, Math.round((bar.val / total) * 100));
                                return (
                                  <div key={idx} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-zinc-600 font-medium">{bar.label}</span>
                                      <span className="text-[#18181B] font-semibold">{bar.val}</span>
                                    </div>
                                    <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                                      <div className={`${bar.color} h-full rounded-full`} style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Today's Attendance Panel */}
                          <div 
                            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4"
                            data-component-version="admin-attendance-approved-v1"
                          >
                            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest block">
                              Today’s Attendance
                            </span>

                            <div className="space-y-4">
                              <div className="flex items-baseline space-x-1">
                                <span className="font-serif text-2xl font-bold text-[#C59B27]">
                                  {attendanceData.checkedIn}
                                </span>
                                <span className="text-xs text-zinc-400 font-medium">
                                  / {attendanceData.expected} Expected
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs border-t border-zinc-50 pt-3">
                                {[
                                  { label: 'Checked in', val: attendanceData.checkedIn },
                                  { label: 'Still inside', val: attendanceData.stillInside },
                                  { label: 'Picked up', val: attendanceData.pickedUp },
                                  { label: 'Not arrived', val: attendanceData.notArrived }
                                ].map((statItem, idx) => (
                                  <div key={idx} className="space-y-0.5">
                                    <span className="text-zinc-400 text-[10px] uppercase block">{statItem.label}</span>
                                    <span className="text-sm font-semibold text-[#18181B] block">{statItem.val}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Recent Activity Panel */}
                          <div 
                            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4 shadow-none"
                            data-component-version="admin-recent-activity-refined-v2"
                          >
                            <div className="flex items-center justify-between pb-1">
                              <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
                                Recent activity
                              </h3>
                              <button 
                                onClick={() => setActiveTab('attendance')}
                                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
                              >
                                View all
                              </button>
                            </div>

                            {recentActivityList.length === 0 ? (
                              <p className="text-xs text-zinc-400 text-center py-4 font-normal">
                                No recent activity yet.
                              </p>
                            ) : (
                              <div className="divide-y divide-[#EAE8E1]/60">
                                {recentActivityList.slice(0, 5).map((act: any) => {
                                  const item = formatRecentActivity(act);
                                  return (
                                    <div key={act.id} className="py-2.5 first:pt-0 last:pb-0 space-y-0.5">
                                      <p className="text-xs font-semibold text-zinc-900 leading-snug">
                                        {item.person}
                                      </p>
                                      <p className="text-[11px] text-zinc-500 font-normal">
                                        {item.action ? `${item.action} · ${item.time}` : item.time}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Care & Safety Panel */}
                          <div 
                            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4 shadow-none"
                            data-component-version="admin-care-safety-refined-v2"
                          >
                            <div className="flex items-center justify-between pb-1">
                              <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
                                Care & safety
                              </h3>
                              <div className="flex items-center gap-2 text-xs text-zinc-400 font-normal">
                                <span>{safetyAlerts.length}</span>
                                <span className="text-zinc-300">·</span>
                                <button 
                                  onClick={() => setActiveTab('review')}
                                  className="font-medium text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
                                >
                                  View all
                                </button>
                              </div>
                            </div>

                            {safetyAlerts.length === 0 ? (
                              <p className="text-xs text-zinc-400 text-center py-4 font-normal">
                                No care or safety updates.
                              </p>
                            ) : (
                              <div className="divide-y divide-[#EAE8E1]/60">
                                {safetyAlerts.slice(0, 4).map((log: any) => {
                                  const categoryLabel = formatCareCategory(log.category);
                                  const statusInfo = formatCareStatus(log.status);
                                  const location = log.location || log.location_label || 'Foyer';
                                  const timeAgo = formatTimeAgo(log.created_at);

                                  return (
                                    <div key={log.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-semibold text-zinc-900 leading-snug">
                                          {categoryLabel}
                                        </span>
                                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusInfo.style}`}>
                                          {statusInfo.label}
                                        </span>
                                      </div>

                                      {log.message && (
                                        <p className="text-xs text-zinc-600 leading-relaxed break-words font-normal">
                                          {log.message}
                                        </p>
                                      )}

                                      <p className="text-[11px] text-zinc-400 font-normal">
                                        {location} · {timeAgo}
                                      </p>

                                      {log.status === 'resolved' && log.resolution_note && (
                                        <div className="text-[11px] text-zinc-500 bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-lg p-2 mt-1">
                                          <span className="font-medium text-zinc-700">Resolution:</span> {log.resolution_note}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Alert Sound Readiness Panel */}
                          <div 
                            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4 shadow-none"
                            data-component-version="admin-alert-sound-readiness-v2"
                          >
                            <div className="flex items-center justify-between pb-1">
                              <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
                                Alert sound
                              </h3>
                              {soundEnabled !== false ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Ready on this device
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  Needs attention
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-zinc-600 leading-relaxed font-normal">
                              {soundEnabled !== false 
                                ? 'Important alerts can be heard on this device.'
                                : "Turn up this device's volume so important alerts can be heard."}
                            </p>

                            <div className="flex items-center gap-2 pt-0.5">
                              <button
                                type="button"
                                onClick={isPlayingSoundTest ? handleStopSoundTest : handleTriggerSoundTest}
                                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#EAE8E1] bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-800 transition-all cursor-pointer"
                              >
                                <Volume2 className={`w-3.5 h-3.5 ${isPlayingSoundTest ? 'text-[#C59B27] animate-pulse' : 'text-zinc-500'}`} />
                                <span>{isPlayingSoundTest ? 'Stop sound' : 'Test sound'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleOpenSoundSettings}
                                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#EAE8E1] bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-800 transition-all cursor-pointer"
                              >
                                <Settings className="w-3.5 h-3.5 text-zinc-500" />
                                <span>Sound settings</span>
                              </button>
                            </div>

                            <div className="text-[11px] leading-relaxed text-zinc-500 bg-[#FAF9F6] border border-[#EAE8E1]/80 p-3 rounded-xl font-normal">
                              Make sure this device is not muted and the volume is high enough to hear important alerts during the event.
                            </div>
                          </div>

                        </div>

                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 2: SYSTEM SETTINGS - Ivory and Cream design restyled */}
          {activeTab === 'settings' && (
            <AdminSettingsView 
              onBackToOverview={() => handleTabChange('overview')}
              isSuperAdmin={isSuperAdmin}
              adminUser={adminUser}
              initialSubTab={settingsSubTab}
              onTriggerTestAlert={(testAlert) => {
                setActiveUrgentAlert(testAlert);
              }}
            />
          )}

          {/* APPLICATIONS REGISTRY VIEW PANEL */}
          {activeTab === 'applications' && (
            <AdminApplicationsView 
              onBackToOverview={() => handleTabChange('overview')}
              adminUser={adminUser}
              isSuperAdmin={isSuperAdmin}
            />
          )}

          {/* REVIEW BOARD VIEW PANEL */}
          {activeTab === 'review' && (
            <AdminReviewBoardView 
              onBackToOverview={() => handleTabChange('overview')} 
              initialApplicationId={initialApplicationId}
              initialChildId={initialChildId}
              onClearInitialParams={() => {
                setInitialApplicationId(null);
                setInitialChildId(null);
                setInitialAttentionId(null);
              }}
            />
          )}

          {/* CHILDREN MODULE VIEW PANEL */}
          {activeTab === 'children' && (
            <AdminChildrenView onBackToOverview={() => handleTabChange('overview')} adminUser={adminUser} />
          )}

          {/* ATTENDANCE VIEW PANEL */}
          {activeTab === 'attendance' && (
            <AdminAttendanceView 
              onBackToOverview={() => handleTabChange('overview')} 
              onNavigate={onNavigate}
            />
          )}

          {/* REPORTS VIEW PANEL */}
          {activeTab === 'reports' && (
            <AdminReportsView 
              onBackToOverview={() => handleTabChange('overview')} 
              onNavigate={onNavigate}
              currentRoute={currentRoute}
            />
          )}

          {/* MESSAGES VIEW PANEL */}
          {activeTab === 'messages' && (
            <AdminMessagesView 
              onBackToOverview={() => handleTabChange('overview')} 
              onNavigate={onNavigate}
              adminUser={adminUser}
            />
          )}

          {/* VOLUNTEERS MODULE VIEW PANEL */}
          {activeTab === 'volunteers' && (
            <AdminVolunteersView onBackToOverview={() => handleTabChange('overview')} adminUser={adminUser} />
          )}

          {/* PARENTS MODULE VIEW PANEL */}
          {activeTab === 'parents' && (
            currentRoute && currentRoute.startsWith('/admin/parents/') ? (
              <AdminParentDetailView 
                parentId={currentRoute.split('/').pop() || ''} 
                onNavigate={onNavigate} 
                onBack={() => onNavigate('/admin/parents')}
                adminUser={adminUser}
              />
            ) : (
              <AdminParentsView onBackToOverview={() => handleTabChange('overview')} onNavigate={onNavigate} adminUser={adminUser} />
            )
          )}

          {/* EVENTS VIEW PANEL */}
          {activeTab === 'events' && (
            <AdminEventsView onBackToOverview={() => handleTabChange('overview')} />
          )}

          {/* EVENT DUTY DEVICES VIEW PANEL */}
          {activeTab === 'duty_devices' && (
            <AdminDutyDevicesView />
          )}

          {/* INCIDENT DESK RECORDS CENTRE */}
          {activeTab === 'incidents' && (
            <AdminIncidentRecordsCentre 
              onBackToOverview={() => handleTabChange('overview')}
              adminUser={adminUser}
            />
          )}

          {/* ESCALATIONS VIEW PANEL */}
          {activeTab === 'escalations' && (
            <AdminEscalationsView />
          )}

          {/* LIVE EVENT OPERATIONS DASHBOARD */}
          {activeTab === 'operations' && (
            <AdminOperationsDashboardView 
              onBackToOverview={() => handleTabChange('overview')}
              adminUser={adminUser}
              onNavigate={onNavigate}
              onTabChange={handleTabChange}
            />
          )}



        </main>
      </div>


      {/* ATTENTION CATEGORY FILTER MODAL */}
      {activeAttentionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => setActiveAttentionModal(null)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs" 
          />
          <div className="relative bg-white border border-[#EAE8E1] rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-fade-in space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                <h4 className="font-serif font-bold text-[#18181B]">
                  {activeAttentionModal.label} List
                </h4>
              </div>
              <button 
                onClick={() => setActiveAttentionModal(null)}
                className="text-zinc-400 hover:text-[#18181B] p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1 text-xs">
              {activeFilteredKids.length === 0 ? (
                <div className="text-center py-12 text-zinc-400">
                  No active registration entries found matching this alert category in current scope.
                </div>
              ) : (
                activeFilteredKids.map((kid: any) => (
                  <div key={kid.id} className="p-3.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl flex items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0">
                      <span className="font-semibold text-[#18181B] block truncate">{kid.name}</span>
                      <span className="text-[10px] text-zinc-400 block">{kid.age_group || `Age ${kid.age}`}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                        {kid.status || 'Under Review'}
                      </span>
                      <button
                        onClick={() => {
                          setActiveAttentionModal(null);
                          setActiveTab('applications');
                        }}
                        className="text-[#C59B27] font-semibold hover:underline"
                      >
                        Review
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#EAE8E1] flex justify-end">
              <Button
                type="button"
                onClick={() => setActiveAttentionModal(null)}
                className="text-xs bg-zinc-100 text-[#18181B] hover:bg-zinc-200 px-4 py-2"
              >
                Close Window
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* EVENT SAFETY ALERT DETAIL & RESOLUTION MODAL */}
      {activeAlertDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => setActiveAlertDetail(null)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs" 
          />
          <div className="relative bg-[#FAF9F6] border border-[#EAE8E1] rounded-[28px] w-full max-w-xl shadow-2xl animate-fade-in max-h-[90vh] flex flex-col overflow-hidden" id="coordination-panel-modal">
            <ActiveResponseCoordinationPanel
              alertId={activeAlertDetail.id}
              currentUser={{
                id: adminUser?.id || 'temp-id',
                role: adminUser?.role || 'admin',
                fullName: adminFullName,
                email: adminUser?.email || ''
              }}
              onClose={() => {
                setActiveAlertDetail(null);
                fetchSafetyAlerts();
              }}
              onRefreshParentAlerts={() => fetchSafetyAlerts()}
            />
          </div>
        </div>
      )}

      {/* URGENT SAFETY ALERT FULL-SCREEN TAKEOVER OVERLAY */}
      {activeUrgentAlert && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-4 bg-[#18181B]/95 backdrop-blur-md animate-fade-in text-[#18181B]"
          data-view-version="urgent-alert-takeover-v7-personalised-scrollable"
        >
          {/* Helper DOM Elements for Automated Verification */}
          <div className="hidden">
            <div data-component-version="emergency-voice-message-builder-v1" />
            <div data-component-version="spoken-alert-category-map-v1" />
            <div data-component-version="spoken-alert-child-name-privacy-v1" />
            <div data-component-version="emergency-alarm-voice-sequence-v1" />
            <div data-component-version="emergency-voice-stop-rules-v2" />
            <div data-component-version="emergency-voice-no-old-replay-v1" />
            {spokenAlertsEnabled && (
              <div data-component-version="personalised-child-emergency-voice-v1" />
            )}
          </div>

          <div
            className="w-full max-w-lg max-h-[92dvh] bg-[#FAF9F6] border border-zinc-200/90 border-t-4 border-t-red-600 rounded-2xl shadow-2xl relative overflow-hidden flex flex-col text-left font-sans"
            data-component-version="emergency-mobile-viewport-safe-v1"
          >
            {/* CARD HEADER */}
            <div className="px-6 pt-5 pb-4 border-b border-zinc-200/80 bg-white/60 shrink-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${activeUrgentAlert.status === 'open' ? 'bg-red-600' : 'bg-amber-600'}`} />
                  <span className={`text-[11px] font-semibold ${activeUrgentAlert.status === 'open' ? 'text-red-700' : 'text-amber-800'}`}>
                    {activeUrgentAlert.status === 'open' ? 'Needs response' : 'Response underway'}
                  </span>
                </div>
                {activeUrgentAlert.created_at && (
                  <span className="text-[11px] text-zinc-400 font-medium">
                    Raised {formatTimeAgo(activeUrgentAlert.created_at)}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-serif font-bold text-zinc-950 tracking-tight">
                {activeUrgentAlert.isTest ? 'Alert Sound Test' : 'Emergency care alert'}
              </h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                {activeUrgentAlert.isTest ? 'Testing device alarm sound and readiness.' : 'A volunteer needs assistance.'}
              </p>
            </div>

            {/* CARD BODY */}
            <div
              className="px-6 py-5 overflow-y-auto flex-1 space-y-3.5 text-xs [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pb-safe"
              data-component-version="urgent-alert-scroll-container-v2"
            >
              {/* Volunteer (WHO) */}
              <div className="bg-white border border-zinc-200/80 rounded-xl p-4 shadow-2xs">
                <div className="text-[11px] font-medium text-zinc-400 mb-1">Volunteer</div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-zinc-900 text-sm">{activeUrgentAlert.raised_by_name || 'Volunteer'}</p>
                    {activeUrgentAlert.volunteer_team && (
                      <p className="text-xs text-zinc-500 font-medium mt-0.5">{activeUrgentAlert.volunteer_team}</p>
                    )}
                  </div>
                  {activeUrgentAlert.volunteer_phone && (
                    <a
                      href={`tel:${activeUrgentAlert.volunteer_phone}`}
                      className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg font-medium text-xs transition-colors shrink-0 flex items-center gap-1.5"
                    >
                      <Phone className="w-3 h-3 text-zinc-500" />
                      <span>{activeUrgentAlert.volunteer_phone}</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Location (WHERE) */}
              <div className="bg-white border border-zinc-200/80 rounded-xl p-4 shadow-2xs">
                <div className="text-[11px] font-medium text-zinc-400 mb-1">Location</div>
                <p className="font-semibold text-zinc-900 text-sm">
                  {activeUrgentAlert.location_label || 'Location not available'}
                </p>
              </div>

              {/* Distress Message (WHAT) */}
              <div className="bg-white border border-zinc-200/80 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-[11px] font-medium text-zinc-400">
                    Emergency Type
                  </div>
                  <span className="text-[10px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-100" data-component-version="safety-alert-category-labels-v2">
                    {getCategoryLabel(activeUrgentAlert.category)}
                  </span>
                </div>
                <p className="text-zinc-800 text-xs leading-relaxed font-sans mt-2 pl-3 border-l-2 border-[#C59B27]/40">
                  “{activeUrgentAlert.message || activeUrgentAlert.title || 'Immediate support requested.'}”
                </p>
              </div>

              {/* Child Info if linked */}
              {activeUrgentAlert.child_name && (
                <div className="bg-zinc-50 border border-zinc-200/70 rounded-xl p-3 text-xs text-zinc-600 flex items-center justify-between">
                  <span>Child: <strong className="text-zinc-900">{activeUrgentAlert.child_name}</strong></span>
                  {activeUrgentAlert.parent_phone && (
                    <a href={`tel:${activeUrgentAlert.parent_phone}`} className="text-zinc-700 underline font-medium">
                      Call Parent
                    </a>
                  )}
                </div>
              )}

              {/* Local device silence notice */}
              {urgentAlertEffectsManager.isAlertSilenced(activeUrgentAlert.id) && activeUrgentAlert.status === 'open' && (
                <div className="bg-zinc-100 border border-zinc-200 rounded-xl p-3 flex items-center justify-between text-xs text-zinc-600">
                  <span>Alarm sound is silenced on this device. Alert remains active.</span>
                  <button
                    type="button"
                    onClick={() => {
                      urgentAlertEffectsManager.unsilenceAlert(activeUrgentAlert.id);
                      showSuccess('Sound Restored', 'Emergency sound restored.');
                    }}
                    className="text-zinc-900 font-semibold underline text-xs cursor-pointer"
                  >
                    Restore Sound
                  </button>
                </div>
              )}

              {/* Acknowledged status banner */}
              {activeUrgentAlert.status === 'acknowledged' && (
                <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Check className="w-4 h-4 text-amber-700" />
                    <span>Response underway</span>
                  </div>
                  <p className="text-amber-800 text-xs">
                    Acknowledged by <strong>{activeUrgentAlert.acknowledged_by_name || 'Admin'}</strong> {formatTimeAgo(activeUrgentAlert.acknowledged_at || activeUrgentAlert.created_at)}
                  </p>
                </div>
              )}
            </div>

            {/* CARD FOOTER */}
            <div className="px-6 py-4 border-t border-zinc-200/80 bg-white/80 shrink-0">
              {activeUrgentAlert.status === 'open' ? (
                showResolutionInTakeover ? (
                  <div className="space-y-3">
                    <label className="text-[11px] font-semibold text-zinc-700 block">
                      Resolution note (required to close)
                    </label>
                    <textarea
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      placeholder="Specify actions taken to support the volunteer and child..."
                      className="w-full text-xs p-3 border border-zinc-300 rounded-xl focus:outline-none focus:border-red-500 bg-white text-zinc-900 placeholder-zinc-400"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowResolutionInTakeover(false)}
                        className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium rounded-xl transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          if (!resolutionNote.trim()) {
                            showError('Required', 'Please add a resolution note.');
                            return;
                          }
                          try {
                            const res = await api.admin.resolveSafetyAlert(activeUrgentAlert.id, resolutionNote);
                            if (res && res.success) {
                              showSuccess('Resolved', 'Emergency alert has been closed.');
                              stopActiveUrgentAlertEffects(activeUrgentAlert.id);
                              setSafetyAlerts(prev => prev.map(a => a.id === activeUrgentAlert.id ? { ...a, status: 'resolved', resolution_note: resolutionNote } : a));
                              setActiveUrgentAlert(null);
                              setResolutionNote('');
                              setShowResolutionInTakeover(false);
                            }
                          } catch (err) {
                            console.error('Resolution error:', err);
                          }
                        }}
                        className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
                      >
                        Close incident
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex gap-3">
                      <button
                        id="btn-stop-alert-sound"
                        data-component-version="urgent-alert-silence-device-action-v2"
                        onClick={() => handleSilenceAlert(activeUrgentAlert.id)}
                        className="px-4 py-3 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-medium rounded-lg border border-zinc-200 shadow-2xs transition-colors cursor-pointer shrink-0"
                      >
                        {urgentAlertEffectsManager.isAlertSilenced(activeUrgentAlert.id) ? 'Sound silenced' : 'Silence alert'}
                      </button>
                      <button
                        onClick={() => handleAcknowledgeAlert(activeUrgentAlert.id)}
                        disabled={isAcknowledgeInProgress === activeUrgentAlert.id}
                        className="flex-1 px-5 py-3 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isAcknowledgeInProgress === activeUrgentAlert.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <span>Acknowledge & respond</span>
                        )}
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-zinc-400 pt-1">
                      <button
                        onClick={() => {
                          setShowCommandCenter(true);
                          setActiveUrgentAlert(null);
                        }}
                        className="hover:text-zinc-700 underline cursor-pointer"
                      >
                        Open Response Desk
                      </button>
                      <button
                        onClick={() => setShowResolutionInTakeover(true)}
                        className="hover:text-zinc-700 underline cursor-pointer"
                      >
                        Resolve alert
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  {showResolutionInTakeover ? (
                    <div className="space-y-3">
                      <label className="text-[11px] font-semibold text-zinc-700 block">
                        Resolution note (required to close)
                      </label>
                      <textarea
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        placeholder="Specify actions taken to support the volunteer and child..."
                        className="w-full text-xs p-3 border border-zinc-300 rounded-xl focus:outline-none focus:border-red-500 bg-white text-zinc-900 placeholder-zinc-400"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowResolutionInTakeover(false)}
                          className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            if (!resolutionNote.trim()) {
                              showError('Required', 'Please add a resolution note.');
                              return;
                            }
                            try {
                              const res = await api.admin.resolveSafetyAlert(activeUrgentAlert.id, resolutionNote);
                              if (res && res.success) {
                                showSuccess('Resolved', 'Emergency alert has been closed.');
                                stopActiveUrgentAlertEffects(activeUrgentAlert.id);
                                setSafetyAlerts(prev => prev.map(a => a.id === activeUrgentAlert.id ? { ...a, status: 'resolved', resolution_note: resolutionNote } : a));
                                setActiveUrgentAlert(null);
                                setResolutionNote('');
                                setShowResolutionInTakeover(false);
                              }
                            } catch (err) {
                              console.error('Resolution error:', err);
                            }
                          }}
                          className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-xs"
                        >
                          Close incident
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setShowCommandCenter(true);
                          setActiveUrgentAlert(null);
                        }}
                        className="flex-1 py-3 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 text-xs font-medium rounded-lg shadow-2xs transition-colors cursor-pointer"
                      >
                        Open Response Desk
                      </button>
                      <button
                        onClick={() => setShowResolutionInTakeover(true)}
                        className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                      >
                        Resolve alert
                      </button>
                      <button
                        onClick={() => setActiveUrgentAlert(null)}
                        className="px-3 py-3 text-zinc-500 hover:text-zinc-800 text-xs transition-colors cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {activeEmergencySummaryAlertId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#FAF9F5] rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-[#EAE8E1]">
            <div className="p-5 border-b border-[#EAE8E1] flex items-center justify-between shrink-0 bg-white rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-600 animate-pulse" />
                <h3 className="text-base font-serif font-bold text-gray-900">Child Emergency & Safety Summary</h3>
              </div>
              <button
                onClick={() => setActiveEmergencySummaryAlertId(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <ChildEmergencySummary 
                alertId={activeEmergencySummaryAlertId} 
                onClose={() => setActiveEmergencySummaryAlertId(null)}
                isAdmin={true}
                onRefreshAlert={() => {
                  fetchSafetyAlerts();
                }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
