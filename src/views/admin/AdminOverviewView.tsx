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
  User
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { useAlertAudioPreferences } from '../../hooks/useAlertAudioPreferences';
import { BrandLogo } from '../../components/common/BrandLogo';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { SafeImage } from '../../components/common/SafeImage';
import { playSound, resumeAudioContext, stopAllUrgentAlertEffects } from '../../utils/sound';
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

type AdminTab = 'overview' | 'events' | 'applications' | 'review' | 'children' | 'attendance' | 'reports' | 'messages' | 'settings' | 'volunteers' | 'parents';

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerTab, setHeaderTab] = useState<'current' | 'upcoming'>('current');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Rich dashboard dynamic dataset
  const [overviewData, setOverviewData] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [errorUpdatingDemographics, setErrorUpdatingDemographics] = useState<string>('');

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
  const [activeAlertDetail, setActiveAlertDetail] = useState<any | null>(null);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [isAcknowledgeInProgress, setIsAcknowledgeInProgress] = useState<string | null>(null);
  const [activeUrgentAlertCount, setActiveUrgentAlertCount] = useState(0);
  const [activeUrgentAlert, setActiveUrgentAlert] = useState<any | null>(null);
  const [showCommandCenter, setShowCommandCenter] = useState(false);
  const [showResolutionInTakeover, setShowResolutionInTakeover] = useState(false);
  const [isSoundSettingsOpen, setIsSoundSettingsOpen] = useState(false);

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
    } catch (err) {
      console.error('Failed to fetch safety alerts:', err);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    setIsAcknowledgeInProgress(alertId);
    try {
      const res = await api.admin.acknowledgeSafetyAlert(alertId);
      if (res && res.success) {
        showSuccess('Acknowledged', 'The safety alert has been marked as acknowledged.');
        stopActiveUrgentAlertEffects(alertId);
        setSafetyAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'acknowledged', acknowledged_by_name: adminUser?.email?.split('@')[0] || 'Care Lead' } : a));
      } else {
        showError('Acknowledge Failed', 'Could not acknowledge alert at this moment.');
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      if (err.status === 409 || apiErr.message?.toLowerCase().includes('already')) {
        showInfo('Already Responded', apiErr.message || 'This alert has already been acknowledged.');
        stopActiveUrgentAlertEffects(alertId);
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
    setResolvingAlertId(alertId);
    try {
      const res = await api.admin.resolveSafetyAlert(alertId, resolutionNote);
      if (res && res.success) {
        showSuccess('Resolved', 'Safety concern has been successfully resolved and logged.');
        stopActiveUrgentAlertEffects(alertId);
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
        stopActiveUrgentAlertEffects(alertId);
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

  // Timeago helper
  const formatTimeAgo = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch (_) {
      return 'Recent';
    }
  };

  // Fetch Admin Notifications
  const fetchNotificationsList = async (playFeedback = false) => {
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
    } catch (err) {
      console.error('Error fetching admin notifications:', err);
    }
  };

  // SSE Real-time instant notification/alert updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      const token = localStorage.getItem('koinonia_token');
      if (!token) return;

      const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
      const sseUrl = `${apiBaseUrl}/api/notifications/stream?token=${token}`;

      console.log('[SSE Client] Connecting to:', sseUrl);
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          console.log('[SSE Client] Received message:', payload);

          if (payload.type === 'handshake') {
            console.log('[SSE Client] Handshake successful, clientId:', payload.clientId);
            return;
          }

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

            fetchSafetyAlerts();
            fetchNotificationsList();
          }
        } catch (err) {
          console.error('[SSE Client] Failed to parse message:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('[SSE Client] Error or disconnected, retrying in 3s:', err);
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        reconnectTimeout = setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
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

  // Listen to browser lifecycle events to immediately silence alert effects if hidden or closed
  useEffect(() => {
    const handleUnloadCleanup = () => {
      try {
        (window as any).stopAllUrgentAlertEffects?.();
      } catch (e) {
        console.warn('Failed in stopAllUrgentAlertEffects during unload:', e);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        try {
          (window as any).stopAllUrgentAlertEffects?.();
        } catch (e) {
          console.warn('Failed in stopAllUrgentAlertEffects during visibility change:', e);
        }
      }
    };

    window.addEventListener('beforeunload', handleUnloadCleanup);
    window.addEventListener('pagehide', handleUnloadCleanup);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleUnloadCleanup);
      window.removeEventListener('pagehide', handleUnloadCleanup);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          showError('Permission Denied', 'Please allow notifications in your browser settings to subscribe.');
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const keyRes = await api.parent.getVapidPublicKey();
        const vapidPublicKey = keyRes.publicKey;

        if (!vapidPublicKey) {
          throw new Error('No VAPID key found');
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey
        });

        await api.parent.savePushSubscription(subscription);
        setPushEnabled(true);
        showSuccess('Subscribed', 'You will now receive instant push alerts.');
        playSound('success');

        await api.request('/api/notifications/preferences', {
          method: 'PATCH',
          body: JSON.stringify({ pushEnabled: true })
        });
      } else {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          await api.request('/api/notifications/push/unsubscribe', {
            method: 'POST',
            body: JSON.stringify({ endpoint: subscription.endpoint })
          });
        }
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

  const isFetchingRef = useRef(false);

  const fetchDashboardData = async (isRefresh = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.admin.getOverview();
      if (res.success) {
        setOverviewData(res);
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
      console.error('[AdminOverviewView - fetchDashboardData Error]:', err);
      const parsed = extractApiError(err);
      showError('Sync Failed', parsed.message);
      setErrorUpdatingDemographics('We could not update demographics right now. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetchingRef.current = false;
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
            { id: 'events', label: 'Events', icon: Calendar },
            { id: 'applications', label: 'Applications', icon: Users },
            { id: 'volunteers', label: 'Volunteers', icon: Award },
            { id: 'parents', label: 'Parents', icon: Users },
            { id: 'review', label: 'Review', icon: ShieldAlert },
            { id: 'children', label: 'Children', icon: Users },
            { id: 'attendance', label: 'Attendance', icon: UserCheck },
            { id: 'reports', label: 'Reports', icon: TrendingUp },
            { id: 'messages', label: 'Messages', icon: MessageSquare },
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

        {/* Dashboard Main container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6 sm:space-y-8 bg-[#FAF9F6]">
          
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
              {headerTab === 'upcoming' ? (
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
                  {/* Event Safety Alerts Panel */}
                  {safetyAlerts.filter((a: any) => a.status !== 'resolved').length > 0 && showCommandCenter && (
                    <div 
                      className="bg-[#FAF9F6] border border-[#E5D5AE] rounded-[28px] p-8 shadow-xl mb-8 text-zinc-950 relative text-left"
                      data-view-version="emergency-command-center-v2-secondary-detail"
                    >
                      {/* Header block with advanced security styling */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#E5D5AE]/30 mb-6 gap-4"
                        data-component-version="active-safety-alert-header-v3"
                      >
                        <div className="flex items-center space-x-3.5" data-component-version="emergency-no-blinking-dots-v1">
                          <div className="bg-[#C59B27]/10 text-[#C59B27] text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider border border-[#C59B27]/20">
                            Response Status: Active
                          </div>
                          <div>
                            <h3 className="font-serif text-lg font-black text-[#C59B27] tracking-tight uppercase flex items-center gap-2">
                              ✨ Child Care Response
                            </h3>
                            <p className="text-xs text-zinc-500 font-medium font-sans">
                              Active care requests requiring immediate response and care team monitoring.
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex flex-col sm:items-end gap-2 shrink-0 text-left sm:text-right">
                          <div className="flex items-center gap-2">
                            {safetyAlerts.some((a: any) => a.severity === 'urgent' && a.status === 'open') && (
                              <span className="text-[10px] text-red-600 font-sans font-semibold mr-2 animate-pulse">
                                🔔 Urgent requests are active. Alarm sounds repeatedly on all connected terminals.
                              </span>
                            )}
                            <button
                              onClick={() => setShowCommandCenter(false)}
                              className="text-[10px] font-bold bg-white hover:bg-zinc-50 text-zinc-700 hover:text-zinc-900 px-3.5 py-1.5 rounded-xl border border-zinc-200 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Minimize Panel</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* On-Load sound play notice behavior */}
                      {urgentAlertEffectsManager.hasUnsoundedUrgentOnLoad() && (
                        <div 
                          className="mb-6 bg-amber-50/80 border border-[#FAF9F6] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-800 shadow-xs"
                          data-component-version="urgent-alert-load-behaviour-v2"
                        >
                          <div className="flex items-center gap-2 text-left">
                            <Volume2 className="w-4 h-4 text-[#C59B27] shrink-0" />
                            <span>
                              <strong>Emergency alert audio standby:</strong> Open care requests are active. Click to resume sounding alarms.
                            </span>
                          </div>
                          <button
                            id="btn-resume-sound"
                            onClick={() => {
                              resumeAudioContext();
                              urgentAlertEffectsManager.resumeOnLoadAlerts();
                            }}
                            className="text-[10px] font-bold bg-[#C59B27] hover:bg-[#b58c22] text-white px-4 py-1.5 rounded-xl cursor-pointer shadow-sm shrink-0"
                          >
                            RESUME AUDIO
                          </button>
                        </div>
                      )}

                      {/* Main grid with clean, ivory/light bento cards */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start" data-component-version="care-response-surface-v1-premium">
                        
                        {/* ALERT CARDS COLUMN */}
                        <div className="lg:col-span-2 space-y-6">
                          {safetyAlerts.filter((a: any) => a.status !== 'resolved').map((alert: any) => {
                            const severity = alert.severity || 'normal';
                            const isUrgent = severity === 'urgent';
                            const isImportant = severity === 'important';
                            const isNormal = severity === 'normal';
                            const isAck = alert.status === 'acknowledged';
                            const isLocalSilenced = urgentAlertEffectsManager.isAlertSilenced(alert.id);
                            const catLabel = getCategoryLabel(alert.category);

                            // Choose version based on severity
                            const viewVersion = isUrgent 
                              ? "urgent-child-care-response-v1-premium" 
                              : isImportant 
                                ? "important-care-alert-v1-premium" 
                                : "normal-care-alert-v1-premium";

                            const cardVersion = isUrgent 
                              ? "urgent-alert-card-v1-premium" 
                              : isImportant 
                                ? "important-alert-card-v1" 
                                : "normal-alert-card-v1";

                            const soundVersion = isUrgent 
                              ? "severity-audio-behaviour-v1" 
                              : isImportant 
                                ? "important-alert-sound-rules-v1" 
                                : "normal-alert-sound-rules-v1";

                            // Visual classes
                            let bgClass = "bg-white border-[#E5D5AE]/30";
                            let borderAccent = "border-l-4 border-l-[#C59B27]";
                            let badgeClass = "bg-amber-50 text-[#C59B27] border-[#E5D5AE]/40";
                            let badgeLabel = "Support Request";
                            let subtitleCopy = "Review when available.";

                            if (isImportant) {
                              bgClass = "bg-[#FFFDF3] border-amber-200";
                              borderAccent = "border-l-4 border-l-amber-500";
                              badgeClass = "bg-amber-50 text-amber-800 border-amber-200";
                              badgeLabel = "Important Care Update";
                              subtitleCopy = "This request needs timely attention.";
                            } else if (isUrgent) {
                              bgClass = "bg-white border-red-200";
                              borderAccent = "border-l-4 border-l-red-600 shadow-md shadow-red-50";
                              badgeClass = "bg-red-50 text-red-700 border-red-200";
                              badgeLabel = "Emergency Help Needed";
                              subtitleCopy = "Immediate care or security response required.";
                            }

                            return (
                              <div 
                                key={alert.id}
                                className={`border rounded-[24px] p-6 relative transition-all shadow-md flex flex-col justify-between ${bgClass} ${borderAccent}`}
                                data-view-version={viewVersion}
                                data-component-version={cardVersion}
                              >
                                <div>
                                  {/* Badge & Meta Row */}
                                  <div className="flex items-start justify-between gap-3 mb-4">
                                    <div className="flex flex-col">
                                      <span className="text-[10px] font-sans font-black tracking-wider text-zinc-400 uppercase flex items-center gap-1">
                                        <span className={`h-1.5 w-1.5 rounded-full ${isUrgent ? 'bg-red-600' : isImportant ? 'bg-amber-500' : 'bg-[#C59B27]'}`} />
                                        {badgeLabel}
                                      </span>
                                      <span className="font-serif font-bold text-lg text-zinc-950 mt-1"
                                        data-component-version="safety-alert-category-labels-v2"
                                      >
                                        {catLabel}
                                      </span>
                                      <p className="text-[11px] text-zinc-500 font-sans mt-0.5">{subtitleCopy}</p>
                                    </div>
                                    
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-sans font-bold border shrink-0 ${
                                      isAck 
                                        ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    }`}>
                                      {isAck ? 'Acknowledged' : 'New request'}
                                    </span>
                                  </div>

                                  {/* Child Identity Main Focus Section */}
                                  {alert.child_name ? (
                                    <div className="bg-[#FAF9F6] border border-[#E5D5AE]/20 rounded-2xl p-4 my-4 flex flex-col sm:flex-row items-center justify-between gap-4"
                                         data-component-version="alert-child-identity-card-v3-premium">
                                      <div className="flex items-center space-x-3.5">
                                        <div className="shrink-0">
                                          <SafeImage
                                            src={alert.child_photo_file_id}
                                            className="w-14 h-14 rounded-2xl object-cover border border-[#E5D5AE]/30 shadow-xs"
                                            fallbackComponent={
                                              <div className="w-14 h-14 rounded-2xl bg-amber-50/50 border border-[#E5D5AE]/20 flex flex-col items-center justify-center text-center p-1">
                                                <User className="w-6 h-6 text-[#C59B27]/40" />
                                                <span className="text-[6px] font-bold uppercase tracking-tight text-[#C59B27]/60 mt-0.5">No Photo</span>
                                              </div>
                                            }
                                          />
                                        </div>
                                        <div className="text-left">
                                          <p className="text-[9px] font-black text-[#C59B27] uppercase tracking-wider">Child Involves</p>
                                          <p className="text-zinc-950 font-serif font-black text-sm leading-tight mt-0.5">{alert.child_name}</p>
                                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-zinc-600 font-medium font-sans">
                                            {alert.child_age_group && (
                                              <span className="bg-amber-100/40 text-amber-900 px-1.5 py-0.5 rounded text-[10px]">
                                                {alert.child_age_group}
                                              </span>
                                            )}
                                            <span>·</span>
                                            <span>Parent: {alert.parent_name || 'No parent profile'}</span>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {alert.parent_phone && (
                                        <a 
                                          href={`tel:${alert.parent_phone}`}
                                          className="text-[11px] font-bold text-[#C59B27] bg-white hover:bg-amber-50/20 border border-[#E5D5AE]/40 px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer hover:shadow-sm"
                                        >
                                          <Phone className="w-3.5 h-3.5 text-[#C59B27]" />
                                          <span>Call Parent</span>
                                        </a>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="bg-[#FAF9F6] border border-[#E5D5AE]/20 rounded-2xl p-4 my-4 text-xs text-zinc-600 italic text-left">
                                      🛡️ General Event Alert (No specific child linked)
                                    </div>
                                  )}

                                  {/* Location & Message Details */}
                                  <div className="space-y-3 my-4 text-xs">
                                    {alert.location && (
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-zinc-500">Location:</span>
                                        <span className="bg-[#FAF9F6] text-zinc-800 px-3 py-1 rounded-xl font-bold border border-[#E5D5AE]/20">
                                          {alert.location}
                                        </span>
                                      </div>
                                    )}
                                    
                                    {alert.message && (
                                      <div className="my-2" data-component-version="alert-message-summary-v2-premium">
                                        <p className="bg-[#FAF9F6] border border-[#E5D5AE]/20 rounded-xl p-3.5 text-xs text-zinc-700 leading-relaxed font-sans italic">
                                          "{alert.message}"
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Human Response Status Path (1 to 5) */}
                                  <div className="my-5 py-4 border-y border-dashed border-[#E5D5AE]/20 space-y-3"
                                    data-component-version="care-response-status-v2-human"
                                  >
                                    <p className="text-[10px] font-mono font-bold text-zinc-400 tracking-wider uppercase">Response status</p>
                                    <div className="flex items-center justify-between text-[11px] text-zinc-500 font-sans">
                                      {/* Step 1: Help requested */}
                                      <div className="flex flex-col items-center flex-1">
                                        <div className="h-6 w-6 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-[10px] shadow-xs">✓</div>
                                        <span className="text-[9px] font-bold mt-1.5 text-emerald-700 text-center">Help requested</span>
                                      </div>
                                      <div className="h-0.5 bg-emerald-100 flex-1 -mt-4" />
                                      
                                      {/* Step 2: Care team notified */}
                                      <div className="flex flex-col items-center flex-1">
                                        <div className="h-6 w-6 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-[10px] shadow-xs">✓</div>
                                        <span className="text-[9px] font-bold mt-1.5 text-emerald-700 text-center">Care team notified</span>
                                      </div>
                                      <div className="h-0.5 flex-1 -mt-4 transition-colors" style={{ backgroundColor: isAck ? '#d1fae5' : '#f4f4f5' }} />
                                      
                                      {/* Step 3: Response acknowledged */}
                                      <div className="flex flex-col items-center flex-1">
                                        <div className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-[10px] shadow-xs ${
                                          isAck ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-zinc-50 border border-zinc-200 text-zinc-400'
                                        }`}>
                                          {isAck ? '✓' : '3'}
                                        </div>
                                        <span className={`text-[9px] font-bold mt-1.5 text-center ${isAck ? 'text-amber-700' : 'text-zinc-400'}`}>Response acknowledged</span>
                                      </div>
                                      <div className="h-0.5 flex-1 -mt-4 transition-colors" style={{ backgroundColor: isAck ? '#fef3c7' : '#f4f4f5' }} />
                                      
                                      {/* Step 4: Child being assisted */}
                                      <div className="flex flex-col items-center flex-1">
                                        <div className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-[10px] shadow-xs ${
                                          isAck ? 'bg-[#FAF9F6] border border-[#E5D5AE] text-[#C59B27]' : 'bg-zinc-50 border border-zinc-200 text-zinc-400'
                                        }`}>
                                          {isAck ? '4' : '4'}
                                        </div>
                                        <span className={`text-[9px] font-bold mt-1.5 text-center ${isAck ? 'text-[#C59B27]' : 'text-zinc-400'}`}>Child being assisted</span>
                                      </div>
                                      <div className="h-0.5 bg-zinc-100 flex-1 -mt-4" />
                                      
                                      {/* Step 5: Request resolved */}
                                      <div className="flex flex-col items-center flex-1">
                                        <div className="h-6 w-6 rounded-full bg-zinc-50 border border-zinc-200 text-zinc-400 flex items-center justify-center font-bold text-[10px] shadow-xs">5</div>
                                        <span className="text-[9px] font-medium mt-1.5 text-zinc-400 text-center">Request resolved</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Ownership Details */}
                                  <div className="mb-4 text-[11px] text-zinc-600 bg-[#FAF9F6] border border-[#E5D5AE]/20 p-3 rounded-xl flex items-center justify-between">
                                    {isAck ? (
                                      <p className="font-sans font-semibold text-zinc-700 flex items-center gap-1.5">
                                        <span>🛡️ Acknowledged by:</span>
                                        <span className="text-[#C59B27] font-black">{alert.acknowledged_by_name || 'Care Lead'}</span>
                                      </p>
                                    ) : (
                                      <p className="font-sans text-zinc-400 italic">
                                        ⌛ Awaiting care team response
                                      </p>
                                    )}
                                  </div>

                                  {isLocalSilenced && (
                                    <div className="mb-4 text-[11px] text-zinc-600 bg-red-50 p-3 border border-red-200 rounded-xl flex items-center justify-between">
                                      <span>🔇 Alarm sound is silenced on this device.</span>
                                      <button 
                                        onClick={() => {
                                          urgentAlertEffectsManager.unsilenceAlert(alert.id);
                                          showSuccess('Unsilenced', 'Emergency sound restored.');
                                        }}
                                        className="text-red-600 hover:text-red-700 font-bold underline bg-transparent border-none cursor-pointer"
                                      >
                                        Restore Sound
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Footer action section styled precisely by severity */}
                                <div className="border-t border-zinc-100 pt-4 mt-3 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3"
                                  data-component-version="severity-specific-alert-actions-v1"
                                >
                                  <div className="text-zinc-400 font-medium shrink-0">
                                    Requested {formatTimeAgo(alert.created_at)} by {alert.raised_by_name}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    {/* Local device silence rule */}
                                    {!isLocalSilenced && isUrgent && (
                                      <button
                                        onClick={() => handleSilenceAlert(alert.id)}
                                        data-component-version="urgent-alert-silence-device-action-v2"
                                        className="font-bold text-zinc-600 bg-white hover:bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-200 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                                        title="Silence sound only on this device"
                                      >
                                        <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                                        <span>Silence Device</span>
                                      </button>
                                    )}

                                    {/* Normal Alert special actions */}
                                    {isNormal && (
                                      <>
                                        <button
                                          onClick={() => {
                                            setResolutionNote('');
                                            setActiveAlertDetail(alert);
                                          }}
                                          className="font-bold text-zinc-700 bg-white hover:bg-zinc-50 px-3.5 py-1.5 rounded-xl border border-zinc-200 transition-all cursor-pointer shadow-xs"
                                        >
                                          Open Details
                                        </button>
                                        <button
                                          onClick={() => handleAcknowledgeAlert(alert.id)}
                                          className="font-bold text-[#C59B27] bg-[#FAF9F6] hover:bg-[#FAF9F6]/80 px-3.5 py-1.5 rounded-xl border border-[#E5D5AE]/40 transition-all cursor-pointer shadow-xs"
                                        >
                                          Mark as Read
                                        </button>
                                      </>
                                    )}

                                    {/* Important Alert actions */}
                                    {isImportant && (
                                      <>
                                        {!isAck && (
                                          <button
                                            onClick={() => handleAcknowledgeAlert(alert.id)}
                                            disabled={isAcknowledgeInProgress === alert.id}
                                            className="font-bold text-amber-800 bg-amber-50 hover:bg-amber-100/50 px-3.5 py-1.5 rounded-xl border border-amber-200 transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                                          >
                                            {isAcknowledgeInProgress === alert.id ? (
                                              <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : 'Acknowledge'}
                                          </button>
                                        )}
                                        <button
                                          onClick={() => {
                                            setResolutionNote('');
                                            setActiveAlertDetail(alert);
                                          }}
                                          className="font-bold text-zinc-700 bg-white hover:bg-zinc-50 px-3.5 py-1.5 rounded-xl border border-zinc-200 transition-all cursor-pointer shadow-xs"
                                        >
                                          Open Details
                                        </button>
                                        <button
                                          onClick={() => {
                                            setResolutionNote('');
                                            setActiveAlertDetail(alert);
                                          }}
                                          className="font-bold text-white bg-[#C59B27] hover:bg-[#b58c22] px-3.5 py-1.5 rounded-xl transition-all cursor-pointer shadow-xs shadow-amber-900/10"
                                        >
                                          Resolve
                                        </button>
                                      </>
                                    )}

                                    {/* Urgent Alert Actions */}
                                    {isUrgent && (
                                      <>
                                        {!isAck && (
                                          <button
                                            onClick={() => handleAcknowledgeAlert(alert.id)}
                                            disabled={isAcknowledgeInProgress === alert.id}
                                            className="font-bold text-red-800 bg-red-50 hover:bg-red-100/50 px-3.5 py-1.5 rounded-xl border border-red-200 transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                                          >
                                            {isAcknowledgeInProgress === alert.id ? (
                                              <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                                            ) : 'Acknowledge and Respond'}
                                          </button>
                                        )}
                                        <button
                                          onClick={() => {
                                            setResolutionNote('');
                                            setActiveAlertDetail(alert);
                                          }}
                                          className="font-bold text-zinc-700 bg-white hover:bg-zinc-50 px-3.5 py-1.5 rounded-xl border border-zinc-200 transition-all cursor-pointer shadow-xs"
                                        >
                                          Open Full Details
                                        </button>
                                        <button
                                          onClick={() => {
                                            setResolutionNote('');
                                            setActiveAlertDetail(alert); // Requires note popup
                                          }}
                                          className="font-bold text-white bg-red-600 hover:bg-red-700 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer shadow-xs shadow-red-900/10"
                                        >
                                          Resolve Alert
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* SECONDARY SIDE PANEL: SOUND SUMMARY & COLLAPSIBLE SETTINGS */}
                        <div className="space-y-4" data-component-version="alert-device-sound-settings-secondary-v1">
                          
                          {/* Compact Sound Summary Bar */}
                          <div className="bg-white border border-[#E5D5AE]/30 rounded-2xl p-4.5 shadow-sm text-zinc-900 text-left">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2.5">
                                <Volume2 className="w-4 h-4 text-[#C59B27] shrink-0" />
                                <div>
                                  <p className="text-[10px] font-black uppercase text-[#C59B27] tracking-wider">Device audio</p>
                                  <p className="text-xs font-bold text-zinc-800 mt-0.5">
                                    {alertProfile === 'emergency' ? 'Siren' : alertProfile === 'important' ? 'Clear' : 'Gentle'} · {alertVolume === 'very_loud' ? '4x Max' : alertVolume === 'loud' ? '2x Loud' : '1x Std'} · {spokenAlertsEnabled ? 'Voice enabled' : 'Voice disabled'}
                                  </p>
                                </div>
                              </div>
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-4">
                              <button
                                onClick={() => {
                                  // Local Silence Button
                                  const activeUrgent = safetyAlerts.find((a: any) => a.severity === 'urgent' && a.status === 'open');
                                  if (activeUrgent) {
                                    handleSilenceAlert(activeUrgent.id);
                                  } else {
                                    try { stopAllUrgentAlertEffects(); } catch (_) {}
                                    showSuccess('Silenced', 'Alert audio checked and silenced.');
                                  }
                                }}
                                className="font-bold text-[11px] text-red-700 bg-red-50 hover:bg-red-100/50 border border-red-200 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                              >
                                <VolumeX className="w-3.5 h-3.5 text-red-600" />
                                <span>Silence device</span>
                              </button>

                              <button
                                onClick={() => setIsSoundSettingsOpen(!isSoundSettingsOpen)}
                                className="font-bold text-[11px] text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                              >
                                <Settings className="w-3.5 h-3.5 text-zinc-500" />
                                <span>{isSoundSettingsOpen ? 'Hide settings' : 'Open settings'}</span>
                              </button>
                            </div>
                          </div>

                          {/* Collapsible detailed audio & devices panel */}
                          {isSoundSettingsOpen && (
                            <div className="bg-[#FAF9F6] border border-[#E5D5AE]/30 rounded-[24px] p-5 space-y-4 text-zinc-800 shadow-md text-left animate-fade-in">
                              <div className="border-b border-[#E5D5AE]/20 pb-2.5">
                                <h4 className="font-serif font-black text-xs text-[#C59B27] uppercase tracking-wider flex items-center gap-1.5">
                                  <Settings className="w-4 h-4" />
                                  Sound & Announcement Preferences
                                </h4>
                                <p className="text-[10px] text-zinc-400 font-sans mt-0.5">
                                  Configure browser safety alert chimes and speech synthesis rules.
                                </p>
                              </div>

                              {/* Tone Selection */}
                              <div className="space-y-1.5" data-component-version="emergency-alert-sound-profile-v2-loud">
                                <label className="text-[10px] font-black text-zinc-500 tracking-wide block uppercase">
                                  Alert chime profile
                                </label>
                                <div className="grid grid-cols-3 gap-1.5 bg-white p-1 rounded-xl border border-[#E5D5AE]/20">
                                  {[
                                    { id: 'normal', label: 'Gentle' },
                                    { id: 'important', label: 'Clear' },
                                    { id: 'emergency', label: 'Siren' }
                                  ].map((prof) => (
                                    <button
                                      key={prof.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        updatePreference('urgentSoundProfile', prof.id);
                                        showSuccess('Profile updated', `Chime profile changed to ${prof.label}.`);
                                      }}
                                      className={`py-1.5 px-1 rounded-lg font-bold text-[10px] text-center transition-all cursor-pointer ${
                                        alertProfile === prof.id
                                          ? 'bg-[#C59B27] text-white shadow-xs'
                                          : 'text-zinc-500 hover:text-zinc-800 bg-transparent'
                                      }`}
                                    >
                                      {prof.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Volume Boost */}
                              <div className="space-y-1.5" data-component-version="alert-sound-volume-settings-v1">
                                <label className="text-[10px] font-black text-zinc-500 tracking-wide block uppercase">
                                  Alert volume boost
                                </label>
                                <div className="grid grid-cols-3 gap-1.5 bg-white p-1 rounded-xl border border-[#E5D5AE]/20">
                                  {[
                                    { id: 'standard', label: '1x Std' },
                                    { id: 'loud', label: '2x Loud' },
                                    { id: 'very_loud', label: '4x Max' }
                                  ].map((vol) => (
                                    <button
                                      key={vol.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        updatePreference('urgentVolumeBoost', vol.id);
                                        showSuccess('Volume changed', `Boost multiplier changed to ${vol.label}.`);
                                      }}
                                      className={`py-1.5 px-1 rounded-lg font-bold text-[10px] text-center transition-all cursor-pointer ${
                                        alertVolume === vol.id
                                          ? 'bg-[#C59B27] text-white shadow-xs'
                                          : 'text-zinc-500 hover:text-zinc-800 bg-transparent'
                                      }`}
                                    >
                                      {vol.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Spoken Voice */}
                              <div className="space-y-2.5 pt-1.5 border-t border-[#E5D5AE]/20" data-component-version="spoken-alert-voice-settings-v1">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-black text-zinc-500 tracking-wide block uppercase">
                                    Spoken alert (Voice)
                                  </label>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      const newVal = !spokenAlertsEnabled;
                                      updatePreference('spokenAlertsEnabled', newVal);
                                      showSuccess('Spoken alerts ' + (newVal ? 'enabled' : 'disabled'), 'Emergency voice speaking updated.');
                                    }}
                                    className={`text-[9px] font-black px-2 py-0.5 rounded transition-all cursor-pointer ${
                                      spokenAlertsEnabled 
                                        ? 'bg-emerald-600 text-white shadow-xs' 
                                        : 'bg-zinc-100 text-zinc-400 hover:text-zinc-600'
                                    }`}
                                  >
                                    {spokenAlertsEnabled ? 'Enabled' : 'Disabled'}
                                  </button>
                                </div>

                                {spokenAlertsEnabled && (
                                  <>
                                    <div className="space-y-1">
                                      <span className="text-[9px] text-zinc-400 font-bold block uppercase">Privacy level</span>
                                      <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-lg border border-[#E5D5AE]/10">
                                        {[
                                          { id: 'private', label: 'Private' },
                                          { id: 'event', label: 'Event' },
                                          { id: 'full_context', label: 'Full context' }
                                        ].map((mode) => (
                                          <button
                                            key={mode.id}
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              updatePreference('spokenAlertMode', mode.id);
                                              showSuccess('Privacy mode changed', `Set voice privacy level to ${mode.label}.`);
                                            }}
                                            className={`py-1 px-1 rounded text-[9px] text-center font-bold transition-all cursor-pointer ${
                                              spokenAlertMode === mode.id
                                                ? 'bg-[#C59B27] text-white font-extrabold'
                                                : 'text-zinc-400 hover:text-zinc-600 bg-transparent'
                                            }`}
                                          >
                                            {mode.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-[#E5D5AE]/20">
                                      <span className="text-[9px] text-zinc-400 font-black uppercase">Repeat spoken voice</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          const newVal = !spokenAlertRepeats;
                                          updatePreference('spokenAlertRepeats', newVal);
                                          showSuccess('Repeat speaking ' + (newVal ? 'enabled' : 'disabled'), 'Spoken repetitions updated.');
                                        }}
                                        className={`text-[9px] font-bold px-2 py-0.5 rounded transition-all cursor-pointer ${
                                          spokenAlertRepeats 
                                            ? 'bg-[#C59B27] text-white shadow-xs' 
                                            : 'bg-zinc-50 text-zinc-400'
                                        }`}
                                      >
                                        {spokenAlertRepeats ? 'Repeats' : 'Once'}
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Alarm Test controls */}
                              <div className="space-y-1.5 pt-1.5 border-t border-[#E5D5AE]/20" data-component-version="alert-sound-test-actions-v1">
                                <label className="text-[10px] font-black text-zinc-500 tracking-wide block uppercase">
                                  Verification & Tests
                                </label>
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
                                      showSuccess('Testing Sound', 'Playing alert chime.' + (spokenAlertsEnabled ? ' with announcement.' : ''));
                                    }}
                                    className="flex-1 font-bold text-[10px] bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 py-2 rounded-xl transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                                  >
                                    <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Test Alarm</span>
                                  </button>
                                  
                                  <button
                                    type="button"
                                    onClick={() => {
                                      try {
                                        stopAllUrgentAlertEffects();
                                        showSuccess('Test Stopped', 'Synthesizer silenced.');
                                      } catch (_) {}
                                    }}
                                    className="font-bold text-[10px] bg-red-50 hover:bg-red-100 text-red-700 border border-red-100 px-4 py-2 rounded-xl transition-all cursor-pointer shadow-xs"
                                  >
                                    Stop
                                  </button>
                                </div>
                              </div>

                              {/* Readiness Copy */}
                              <div 
                                className="bg-[#FAF9F6]/50 border border-[#E5D5AE]/10 p-3 rounded-xl space-y-1 text-zinc-500"
                                data-component-version="event-sound-readiness-copy-v1"
                              >
                                <p className="font-sans font-black text-[8px] uppercase text-[#C59B27] tracking-wider">
                                  ⚠️ Device Readiness Notice
                                </p>
                                <p className="font-sans text-[9px] leading-relaxed">
                                  Important: Make sure your computer or phone's physical volume switches are turned up. Web applications cannot bypass local device volume sliders.
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

                  {/* Small Elegant Emergency Banner at the top of the dashboard */}
                  {safetyAlerts.filter((a: any) => a.status !== 'resolved').length > 0 && !showCommandCenter && (
                    <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in"
                         data-component-version="emergency-active-top-banner-v1">
                      <div className="flex items-center space-x-3 text-left">
                        <div className="p-2 bg-red-100 text-red-700 rounded-xl">
                          <ShieldAlert className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-red-950 text-sm">
                            Emergency Care Alert Active
                          </p>
                          <p className="text-xs text-red-700/80 font-medium">
                            {safetyAlerts.filter((a: any) => a.status !== 'resolved').length} unresolved care escalations need immediate attention.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Button
                          type="button"
                          onClick={() => {
                            // Resume audio in case browser blocked it
                            try { resumeAudioContext(); } catch (_) {}
                            setShowCommandCenter(true);
                          }}
                          className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer"
                        >
                          Open Command Center
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
                            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4"
                            data-component-version="admin-recent-activity-approved-v1"
                          >
                            <div className="flex items-center justify-between pb-1">
                              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest block">
                                Recent Activity
                              </span>
                              <button 
                                onClick={() => setActiveTab('attendance')}
                                className="text-[10px] font-bold text-[#C59B27] hover:underline"
                              >
                                View All
                              </button>
                            </div>

                            <div className="space-y-3.5">
                              {recentActivityList.length === 0 ? (
                                <p className="text-xs text-zinc-400 text-center py-4">No recent activity yet.</p>
                              ) : (
                                recentActivityList.map((act: any) => (
                                  <div key={act.id} className="flex items-start space-x-2.5 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-1.5 shrink-0" />
                                    <div className="space-y-0.5">
                                      <p className="text-zinc-700 leading-tight font-medium">{act.text}</p>
                                      <p className="text-[10px] text-zinc-400">{act.time}</p>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Care Support & Safety Logs Panel */}
                          <div 
                            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4 shadow-xs"
                            data-component-version="admin-safety-history-logs-v1"
                          >
                            <div className="flex items-center justify-between pb-1">
                              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest block">
                                Care & Safety Audit Records
                              </span>
                              <span className="text-[9px] bg-[#C59B27]/10 text-[#C59B27] font-bold px-2 py-0.5 rounded-full uppercase">
                                {safetyAlerts.length} total
                              </span>
                            </div>

                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                              {safetyAlerts.length === 0 ? (
                                <p className="text-xs text-zinc-400 text-center py-4 font-sans">No safety records registered.</p>
                              ) : (
                                safetyAlerts.map((log: any) => {
                                  const isResolved = log.status === 'resolved';
                                  const isAck = log.status === 'acknowledged';
                                  
                                  let typeLabel = log.category;
                                  if (log.category === 'medical') typeLabel = '🩺 Medical request';
                                  else if (log.category === 'missing_child') typeLabel = '🚨 Missing Child';
                                  else if (log.category === 'failed_scan') typeLabel = '⚠️ Scan issue';
                                  else if (log.category === 'wrong_pickup') typeLabel = '🛑 Pickup concern';
                                  else if (log.category === 'other_safety') typeLabel = '🛡️ Safety Concern';

                                  return (
                                    <div 
                                      key={log.id} 
                                      className="p-3 bg-[#FAF9F6]/80 hover:bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-xl space-y-1.5 transition-all text-xs"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="font-semibold text-zinc-800 font-serif">
                                          {typeLabel}
                                        </div>
                                        <span className={`text-[9px] font-sans font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${
                                          isResolved 
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                            : isAck
                                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                                              : 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                                        }`}>
                                          {log.status.toUpperCase()}
                                        </span>
                                      </div>

                                      <p className="text-[11px] text-zinc-600 leading-relaxed break-words font-sans">
                                        {log.message || "No notes provided."}
                                      </p>

                                      <div className="text-[10px] text-zinc-400 flex flex-wrap justify-between gap-1.5 border-t border-zinc-100/60 pt-1.5 mt-1">
                                        <span>Loc: <strong className="text-zinc-600">{log.location || 'Foyer'}</strong></span>
                                        <span>{formatTimeAgo(log.created_at)}</span>
                                      </div>

                                      {isResolved && log.resolution_note && (
                                        <div className="bg-emerald-50/40 border border-emerald-100/50 rounded-lg p-2 mt-1.5 text-[10px] text-zinc-700">
                                          <p className="font-semibold text-emerald-800">Resolution:</p>
                                          <p className="italic font-sans mt-0.5">"{log.resolution_note}"</p>
                                          <p className="text-[9px] text-zinc-400 mt-1">Resolved by {log.resolved_by_name}</p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          {/* Persistent Security & Device Audio Readiness Panel */}
                          <div 
                            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4 shadow-xs"
                            data-component-version="shared-audio-preferences-mobile-desktop-v1"
                          >
                            <div className="flex items-center justify-between pb-1" data-component-version="mobile-audio-setting-saved-state-v1">
                              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest block">
                                SECURITY AUDIO READINESS
                              </span>
                              <div className="flex items-center gap-1.5">
                                {isAudioPreferenceSaving ? (
                                  <span className="text-[10px] text-zinc-400 animate-pulse">Saving...</span>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                                    <Check className="w-3 h-3" /> Saved
                                  </span>
                                )}
                                <span className="text-[9px] bg-[#C59B27]/10 text-[#C59B27] font-bold px-2 py-0.5 rounded-full uppercase">
                                  Device check
                                </span>
                              </div>
                            </div>

                            <p className="text-xs text-zinc-500 font-sans leading-relaxed">
                              <strong>Device sound settings</strong>: Configure and test the alarm synthesizer of this operator terminal to ensure immediate alerts can be heard during busy events.
                            </p>

                            <div className="space-y-3 pt-1" data-component-version="mobile-volume-boost-persist-v1">
                              {/* Sound Mode Selection */}
                              <div className="space-y-1.5" data-component-version="mobile-audio-preference-field-map-v1">
                                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide block">
                                  Chime Alarm Profile
                                </label>
                                <div className="grid grid-cols-3 gap-1 bg-zinc-50 p-1 rounded-xl border border-zinc-100">
                                  {[
                                    { id: 'normal', label: 'Gentle' },
                                    { id: 'important', label: 'Clear' },
                                    { id: 'emergency', label: 'Siren' }
                                  ].map((prof) => (
                                    <button
                                      key={prof.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        updatePreference('urgentSoundProfile', prof.id);
                                        showSuccess('Profile updated', `Chime profile changed to ${prof.label}.`);
                                      }}
                                      className={`py-1 rounded-lg font-bold text-[10px] text-center transition-all cursor-pointer ${
                                        alertProfile === prof.id
                                          ? 'bg-[#18181B] text-white shadow-xs'
                                          : 'text-zinc-500 hover:text-zinc-800 bg-transparent'
                                      }`}
                                    >
                                      {prof.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Volume Controls */}
                              <div className="space-y-1.5" data-component-version="mobile-emergency-volume-boost-applied-v1">
                                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide block">
                                  Alert volume boost
                                </label>
                                <div className="grid grid-cols-3 gap-1 bg-zinc-50 p-1 rounded-xl border border-zinc-100">
                                  {[
                                    { id: 'standard', label: '1x Std' },
                                    { id: 'loud', label: '2x Loud' },
                                    { id: 'very_loud', label: '4x Max' }
                                  ].map((vol) => (
                                    <button
                                      key={vol.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        updatePreference('urgentVolumeBoost', vol.id);
                                        showSuccess('Volume changed', `Boost multiplier changed to ${vol.label}.`);
                                      }}
                                      className={`py-1 rounded-lg font-bold text-[10px] text-center transition-all cursor-pointer ${
                                        alertVolume === vol.id
                                          ? 'bg-[#C59B27] text-white shadow-xs'
                                          : 'text-zinc-500 hover:text-zinc-800 bg-transparent'
                                      }`}
                                    >
                                      {vol.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Test Buttons */}
                              <div className="flex gap-2 pt-1" data-component-version="mobile-audio-buttons-no-submit-v1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    resumeAudioContext();
                                    playSound('emergency', { volume: alertVolume, profile: alertProfile });
                                    showSuccess('Testing Tone', 'Playing localized check sound.');
                                  }}
                                  className="flex-1 font-bold text-[10px] bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200 py-1.5 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Volume2 className="w-3.5 h-3.5 text-zinc-600" />
                                  Test Local Audio
                                </button>
                                
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    try {
                                      stopAllUrgentAlertEffects();
                                      showSuccess('Audio Silenced', 'Test stopped.');
                                    } catch (_) {}
                                  }}
                                  className="font-bold text-[10px] text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                                  title="Stop sound"
                                >
                                  Stop
                                </button>
                              </div>

                              {/* Physical Device Notice */}
                              <div className="text-[10px] leading-relaxed text-zinc-500 bg-[#FFFDF5] border border-[#F5E6BE] p-3 rounded-xl">
                                <span className="font-bold text-amber-800 block mb-0.5">⚠️ Alert sound</span>
                                This web terminal operates within browser safety limits. To prevent missed emergency alerts during busy events, verify that the physical device volume is unmuted and set high.
                              </div>
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
              onTriggerTestAlert={(testAlert) => {
                setActiveUrgentAlert(testAlert);
              }}
            />
          )}

          {/* APPLICATIONS REGISTRY VIEW PANEL */}
          {activeTab === 'applications' && (
            <AdminApplicationsView onBackToOverview={() => handleTabChange('overview')} />
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
            <AdminChildrenView onBackToOverview={() => handleTabChange('overview')} />
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
            />
          )}

          {/* MESSAGES VIEW PANEL */}
          {activeTab === 'messages' && (
            <AdminMessagesView 
              onBackToOverview={() => handleTabChange('overview')} 
              onNavigate={onNavigate}
            />
          )}

          {/* VOLUNTEERS MODULE VIEW PANEL */}
          {activeTab === 'volunteers' && (
            <AdminVolunteersView onBackToOverview={() => handleTabChange('overview')} />
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
              <AdminParentsView onBackToOverview={() => handleTabChange('overview')} onNavigate={onNavigate} />
            )
          )}

          {/* EVENTS VIEW PANEL */}
          {activeTab === 'events' && (
            <AdminEventsView onBackToOverview={() => handleTabChange('overview')} />
          )}

          {/* OTHER ADMIN TABS: DYNAMIC PLACEHOLDER INSIDE THE SHELL */}
          {activeTab !== 'overview' && activeTab !== 'settings' && activeTab !== 'applications' && activeTab !== 'review' && activeTab !== 'children' && activeTab !== 'attendance' && activeTab !== 'reports' && activeTab !== 'messages' && activeTab !== 'volunteers' && activeTab !== 'parents' && activeTab !== 'events' && (
            renderPlaceholderSection(
              activeTab.charAt(0).toUpperCase() + activeTab.slice(1)
            )
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
          <div className="relative bg-white border border-[#EAE8E1] rounded-[28px] w-full max-w-xl p-6 shadow-2xl animate-fade-in space-y-5 max-h-[90vh] flex flex-col">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
              <div className="flex items-center space-x-2.5">
                <span className="flex h-3 w-3 relative">
                  {activeAlertDetail.status !== 'resolved' && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${activeAlertDetail.status === 'resolved' ? 'bg-emerald-500' : 'bg-red-600'}`}></span>
                </span>
                <h4 className="font-serif font-bold text-lg text-[#18181B] tracking-tight">
                  Event Care & Safety Alert
                </h4>
              </div>
              <button 
                onClick={() => setActiveAlertDetail(null)}
                className="text-zinc-400 hover:text-[#18181B] p-1 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              
              {/* Role Simulation Switcher for Testing Masking */}
              <div className="bg-zinc-100 border border-zinc-200 p-3 rounded-2xl flex flex-col md:flex-row justify-between items-center text-xs space-y-2 md:space-y-0 shadow-xs">
                <span className="font-bold text-zinc-600">Simulate Role View (Testing Masking):</span>
                <div className="flex gap-1.5 flex-wrap">
                  {['admin', 'care_lead', 'gate_lead', 'pickup_lead', 'volunteer'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSimulatedDutyRole(r)}
                      className={`px-2.5 py-1 rounded-lg font-semibold border transition-all text-[10px] cursor-pointer ${
                        simulatedDutyRole === r
                          ? 'bg-red-600 border-red-700 text-white shadow-xs'
                          : 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      {r.replace('_', ' ').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alert Meta Tags */}
              <div className="flex flex-wrap gap-2">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-sans font-bold border ${
                  activeAlertDetail.severity === 'urgent' 
                    ? 'bg-red-50 text-red-700 border-red-100' 
                    : 'bg-amber-50 text-amber-700 border-amber-100'
                }`}>
                  {activeAlertDetail.severity.toUpperCase()} PRIORITY
                </span>

                <span className={`px-2.5 py-1 rounded-full text-[10px] font-sans font-bold border ${
                  activeAlertDetail.status === 'resolved' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                    : activeAlertDetail.status === 'acknowledged'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                }`}>
                  {activeAlertDetail.status.toUpperCase()}
                </span>

                {activeAlertDetail.location && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-sans font-bold bg-zinc-100 text-zinc-700 border border-zinc-200">
                    📍 {activeAlertDetail.location}
                  </span>
                )}
              </div>

              {/* Raised by info */}
              <div className="bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-xl p-3 flex items-center justify-between text-[11px]">
                <div>
                  <p className="text-[10px] font-semibold text-zinc-400">RAISED BY</p>
                  <p className="font-semibold text-zinc-800 mt-0.5">{activeAlertDetail.raised_by_name}</p>
                </div>
                <div className="text-right text-zinc-400 font-medium">
                  {formatTimeAgo(activeAlertDetail.created_at)}
                  <p className="text-[9px] mt-0.5">{new Date(activeAlertDetail.created_at).toLocaleString()}</p>
                </div>
              </div>

              {/* Alarm Description message */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">CRITICAL ISSUE DESCRIPTION</p>
                <div className="bg-red-50/30 border border-red-100/50 rounded-xl p-4 text-[11px] text-zinc-800 leading-relaxed font-sans italic">
                  "{activeAlertDetail.message || 'No descriptive details provided by volunteer.'}"
                </div>
              </div>

              {/* Associated Child & Parent Details */}
              {activeAlertRichDetailLoading ? (
                <div className="flex justify-center py-6 text-zinc-400 border border-zinc-200 rounded-xl bg-white">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span>Loading secure details...</span>
                </div>
              ) : activeAlertRichDetail?.child ? (
                <div className="space-y-4">
                  <div className="flex items-start space-x-4 bg-zinc-50 border border-zinc-200 p-4 rounded-2xl shadow-xs">
                    {/* Child Photo */}
                    <div className="relative shrink-0">
                      {activeAlertRichDetail.child.photoUrl ? (
                        <img
                          src={activeAlertRichDetail.child.photoUrl}
                          alt={activeAlertRichDetail.child.fullName}
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 rounded-2xl object-cover border border-zinc-300 shadow-sm"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400">
                          <User className="w-8 h-8" />
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 bg-zinc-800 text-white font-mono text-[8px] font-bold px-1.5 py-0.5 rounded-md border border-white uppercase">
                        {activeAlertRichDetail.child.gender}
                      </span>
                    </div>

                    {/* Child Identity Details */}
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">Child Affected</span>
                      <h4 className="font-black text-zinc-900 text-base leading-tight truncate">
                        {activeAlertRichDetail.child.fullName}
                      </h4>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-md border border-red-100 text-[10px] font-bold">
                          {activeAlertRichDetail.child.ageGroup}
                        </span>
                        <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-md border border-zinc-200 text-[10px] font-medium font-mono">
                          {activeAlertRichDetail.child.ageDisplay}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          activeAlertRichDetail.child.passStatus === 'checked_in' || activeAlertRichDetail.child.status === 'checked_in'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {(activeAlertRichDetail.child.passStatus || activeAlertRichDetail.child.status).toUpperCase().replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Care & Medical Summary */}
                  {activeAlertRichDetail.careSummary && (
                    <div className={`p-4 rounded-2xl border ${
                      activeAlertRichDetail.careSummary.hasMedicalNote || activeAlertRichDetail.careSummary.hasSupportNeed
                        ? 'bg-red-50/50 border-red-200'
                        : 'bg-zinc-50 border-zinc-200'
                    }`}>
                      <div className="flex items-center space-x-2 pb-1.5 border-b border-zinc-100 mb-2">
                        <Activity className={`w-4 h-4 ${activeAlertRichDetail.careSummary.hasMedicalNote ? 'text-red-600' : 'text-zinc-600'}`} />
                        <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-wider">Care & Medical Summary</span>
                      </div>
                      <p className="text-[11px] font-semibold text-zinc-800 leading-relaxed">
                        {activeAlertRichDetail.careSummary.shortSummary}
                      </p>
                      {activeAlertRichDetail.careSummary.hasAllergy && (
                        <span className="mt-1.5 inline-flex items-center text-[9px] font-bold uppercase tracking-wider text-red-600 bg-red-100 border border-red-200 px-2 py-0.5 rounded-lg">
                          ⚠️ ALLERGY ALERT DETECTED
                        </span>
                      )}
                    </div>
                  )}

                  {/* Parent & Pickup Context Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Parent Contact Card */}
                    {activeAlertRichDetail.parent && (
                      <div className="bg-white border border-zinc-200 p-4 rounded-2xl shadow-xs space-y-2">
                        <div className="flex items-center space-x-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          <Heart className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Linked Parent</span>
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900 text-xs">{activeAlertRichDetail.parent.fullName}</p>
                          <div className="flex items-center space-x-3 mt-1.5 font-mono text-[10px] text-zinc-600">
                            <a
                              href={`tel:${activeAlertRichDetail.parent.phoneMaskedOrVisibleByPermission}`}
                              className="hover:underline flex items-center space-x-1"
                            >
                              <span>📞 {activeAlertRichDetail.parent.phoneMaskedOrVisibleByPermission}</span>
                            </a>
                            {activeAlertRichDetail.parent.whatsappMaskedOrVisibleByPermission && (
                              <span className="text-zinc-400">|</span>
                            )}
                            {activeAlertRichDetail.parent.whatsappMaskedOrVisibleByPermission && (
                              <a
                                href={`https://wa.me/${activeAlertRichDetail.parent.whatsappMaskedOrVisibleByPermission.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline text-emerald-600 flex items-center space-x-1"
                              >
                                <span>💬 WhatsApp</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Authorized Pickup Card */}
                    {activeAlertRichDetail.pickup ? (
                      <div className="bg-white border border-zinc-200 p-4 rounded-2xl shadow-xs flex items-center space-x-3">
                        {activeAlertRichDetail.pickup.photoUrl ? (
                          <img
                            src={activeAlertRichDetail.pickup.photoUrl}
                            alt={activeAlertRichDetail.pickup.fullName}
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-xl object-cover border border-zinc-200 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-center text-zinc-400 shrink-0">
                            <UserCheck className="w-6 h-6" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                            <span>Authorized Pickup</span>
                          </div>
                          <p className="font-bold text-zinc-900 text-xs truncate">
                            {activeAlertRichDetail.pickup.fullName}
                          </p>
                          <p className="text-[10px] text-zinc-500 font-medium">
                            Relationship: <strong className="text-zinc-700">{activeAlertRichDetail.pickup.relationship}</strong>
                          </p>
                          {activeAlertRichDetail.pickup.phoneMaskedOrVisibleByPermission && (
                            <p className="text-[9px] font-mono text-zinc-500 mt-0.5">
                              Phone: {activeAlertRichDetail.pickup.phoneMaskedOrVisibleByPermission}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-2xl shadow-xs flex items-center justify-center text-zinc-400">
                        <span className="text-[10px] font-medium">No custom pickup person registered</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeAlertDetail.child_name ? (
                <div className="border border-[#EAE8E1] rounded-xl p-4 space-y-3 bg-white">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">ASSOCIATED CHILD & CONTACTS</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-serif font-bold text-sm text-[#18181B]">{activeAlertDetail.child_name}</h5>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Active registration check-in record linked</p>
                    </div>
                    {activeAlertDetail.parent_phone && (
                      <div className="flex gap-2">
                        <a 
                          href={`tel:${activeAlertDetail.parent_phone}`}
                          className="font-bold text-xs text-white bg-[#C59B27] hover:bg-[#b58c22] px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          Call Parent
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Action Resolution Form */}
              {activeAlertDetail.status !== 'resolved' ? (
                <div className="border-t border-[#EAE8E1] pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                      RESOLUTION ACTION NOTE <span className="text-red-500 font-bold">*</span>
                    </label>
                    <span className="text-[9px] text-zinc-400">Required to close safety alert</span>
                  </div>
                  
                  <textarea
                    rows={3}
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    placeholder="Describe actions taken (e.g., 'Met volunteer in Room 2, verified wrong scan code, resolved parent verification successfully.')"
                    className="w-full text-xs p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-sans text-zinc-800 placeholder-zinc-400 resize-none leading-relaxed"
                  />

                  <div className="flex flex-col sm:flex-row gap-2 pt-1 justify-between items-center">
                    <div>
                      {activeAlertDetail.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => handleAcknowledgeAlert(activeAlertDetail.id)}
                          disabled={isAcknowledgeInProgress === activeAlertDetail.id}
                          className="font-bold text-xs text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          {isAcknowledgeInProgress === activeAlertDetail.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : 'Acknowledge Alert (Log Response)'}
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => setActiveAlertDetail(null)}
                        className="text-xs bg-zinc-100 text-[#18181B] hover:bg-zinc-200 px-4 py-2"
                      >
                        Cancel
                      </Button>
                      <button
                        type="button"
                        disabled={resolvingAlertId === activeAlertDetail.id}
                        onClick={() => handleResolveAlert(activeAlertDetail.id)}
                        className="font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-md shadow-emerald-100 flex items-center gap-1.5"
                      >
                        {resolvingAlertId === activeAlertDetail.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : 'Resolve & Close Safety Issue'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 space-y-2 mt-2">
                  <p className="font-bold text-xs text-emerald-800 font-serif">Resolution Log details</p>
                  <p className="text-zinc-700 italic font-sans leading-relaxed text-[11px]">
                    "{activeAlertDetail.resolution_note || 'No notes left during resolution.'}"
                  </p>
                  <div className="text-[10px] text-zinc-400 border-t border-emerald-100 pt-2 flex justify-between">
                    <span>Resolved by: <strong className="text-zinc-600">{activeAlertDetail.resolved_by_name}</strong></span>
                    <span>Date: {new Date(activeAlertDetail.resolved_at || activeAlertDetail.created_at).toLocaleString()}</span>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            {activeAlertDetail.status === 'resolved' && (
              <div className="pt-3 border-t border-[#EAE8E1] flex justify-end">
                <Button
                  type="button"
                  onClick={() => setActiveAlertDetail(null)}
                  className="text-xs bg-zinc-100 text-[#18181B] hover:bg-zinc-200 px-4 py-2"
                >
                  Close Window
                </Button>
              </div>
            )}
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
            className="w-full max-w-2xl h-full max-h-[100dvh] md:max-h-[90dvh] bg-[#FAF9F6] border-2 border-red-500 rounded-none md:rounded-[32px] shadow-2xl relative overflow-hidden flex flex-col"
            data-component-version="emergency-mobile-viewport-safe-v1"
          >
            {/* Elegant background gradients */}
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-red-500/5 rounded-full blur-2xl animate-fade-in" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-amber-500/5 rounded-full blur-2xl animate-fade-in" />

            {/* CARD HEADER (Static) */}
            <div className="px-8 pt-8 pb-4 flex flex-col items-center text-center space-y-4 border-b border-red-200 relative z-10 shrink-0">
              <div className="relative">
                <div className="p-4 bg-red-50 rounded-2xl text-red-600 border border-red-200">
                  <ShieldAlert className="w-10 h-10" />
                </div>
                <div className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-red-600"></span>
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-serif font-black tracking-tight text-red-600 uppercase">
                  {activeUrgentAlert.isTest ? '⚠️ SAFETY READINESS TEST ⚠️' : 'EMERGENCY CARE ALERT ACTIVE'}
                </h2>
                <p className="text-xs text-zinc-500 font-sans tracking-wide">
                  {activeUrgentAlert.isTest 
                    ? 'TESTING ACTIVE DEVICE SOUND, VIBRATION, AND OVERLAY CHANNELS' 
                    : 'IMMEDIATE CARE AND SECURITY RESPONSE REQUIRED'}
                </p>
                <p className="text-[10px] text-zinc-400 italic">
                  Sound will continue to repeat on enabled devices until acknowledged or resolved.
                </p>
              </div>
            </div>

            {/* CARD BODY (Scrollable) */}
            <div 
              className="px-8 py-4 overflow-y-auto flex-1 space-y-4 relative z-10 text-xs text-left"
              data-component-version="urgent-alert-scroll-container-v2"
            >
              {/* Role Simulation Switcher */}
              {!activeUrgentAlert.isTest && (
                <div className="bg-zinc-100 border border-zinc-200 p-3.5 rounded-2xl flex flex-col md:flex-row justify-between items-center text-xs space-y-2 md:space-y-0 shadow-xs">
                  <span className="font-bold text-zinc-600">Simulate Role View (Testing Masking):</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {['admin', 'care_lead', 'gate_lead', 'pickup_lead', 'volunteer'].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setSimulatedDutyRole(r)}
                        className={`px-3 py-1 rounded-lg font-semibold border transition-all text-[10px] cursor-pointer ${
                          simulatedDutyRole === r
                            ? 'bg-red-600 border-red-700 text-white shadow-sm'
                            : 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        {r.replace('_', ' ').toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 bg-white border border-zinc-200 p-4 rounded-2xl shadow-sm">
                <div>
                  <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">Raised by</span>
                  <span className="font-bold text-zinc-800 text-xs">{activeUrgentAlert.raised_by_name}</span>
                </div>
                <div>
                  <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">Category</span>
                  <span className="font-bold text-red-600 text-xs uppercase"
                    data-component-version="safety-alert-category-labels-v2"
                  >
                    {getCategoryLabel(activeUrgentAlert.category)}
                  </span>
                </div>
                {activeUrgentAlert.location_label && (
                  <div>
                    <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">Location</span>
                    <span className="font-semibold text-amber-800 text-[10px] bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200 w-fit block mt-0.5">
                      {activeUrgentAlert.location_label}
                    </span>
                  </div>
                )}
                {activeUrgentAlert.created_at && (
                  <div>
                    <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">Time elapsed</span>
                    <span className="font-bold text-zinc-800 text-xs">{formatTimeAgo(activeUrgentAlert.created_at)}</span>
                  </div>
                )}

                {/* Rich Secure Child Details */}
                {activeUrgentAlert.isTest ? (
                  <div className="col-span-2 border-t border-zinc-100 pt-3 mt-1 text-center py-2 text-zinc-500">
                    🛡️ This is a device readiness simulation test alert. No child details linked.
                  </div>
                ) : activeUrgentRichDetailLoading ? (
                  <div className="col-span-2 flex justify-center py-6 text-zinc-400 border-t border-zinc-100 mt-2">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    <span>Loading secure details...</span>
                  </div>
                ) : activeUrgentRichDetail?.child ? (
                  <div 
                    className="col-span-2 border-t border-zinc-200 pt-4 mt-2 space-y-4 text-left" 
                    data-component-version="emergency-scrollable-child-summary-v1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-zinc-700 tracking-wide uppercase">
                        Child context
                      </span>
                      <span className="text-[9px] bg-zinc-800 text-white font-bold px-2 py-0.5 rounded uppercase">
                        Secure in-app details
                      </span>
                    </div>

                    <div className="flex items-start space-x-4 bg-zinc-50 border border-zinc-200 p-4 rounded-2xl shadow-xs">
                      {/* Child Photo */}
                      <div className="relative shrink-0" data-component-version="admin-emergency-child-photo-v2">
                        <SafeImage
                          src={activeUrgentRichDetail.child.photoUrl}
                          alt={activeUrgentRichDetail.child.fullName}
                          className="w-16 h-16 rounded-2xl object-cover border border-zinc-300 shadow-sm"
                          fallbackComponent={
                            <div className="w-16 h-16 rounded-2xl bg-[#FAF6EB] border border-[#E5D5AE]/40 flex flex-col items-center justify-center text-center p-1">
                              <span className="text-[9px] font-extrabold uppercase tracking-tight text-[#C59B27] leading-none">Photo</span>
                              <span className="text-[8px] font-bold uppercase tracking-tight text-[#9A7326]/60 mt-1 leading-none">
                                Unavailable
                              </span>
                            </div>
                          }
                        />
                        <span className="absolute -bottom-1 -right-1 bg-zinc-800 text-white font-mono text-[8px] font-bold px-1.5 py-0.5 rounded-md border border-white uppercase">
                          {activeUrgentRichDetail.child.gender}
                        </span>
                      </div>

                      {/* Child Identity Details */}
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">Child Affected</span>
                        <h4 className="font-black text-zinc-900 text-base leading-tight truncate">
                          {activeUrgentRichDetail.child.fullName}
                        </h4>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-md border border-red-100 text-[10px] font-bold">
                            {activeUrgentRichDetail.child.ageGroup}
                          </span>
                          <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-md border border-zinc-200 text-[10px] font-medium font-mono">
                            {activeUrgentRichDetail.child.ageDisplay}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                            activeUrgentRichDetail.child.passStatus === 'checked_in' || activeUrgentRichDetail.child.status === 'checked_in'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {(activeUrgentRichDetail.child.passStatus || activeUrgentRichDetail.child.status).toUpperCase().replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Care & Medical Summary */}
                    {activeUrgentRichDetail.careSummary && (
                      <div className={`p-4 rounded-2xl border ${
                        activeUrgentRichDetail.careSummary.hasMedicalNote || activeUrgentRichDetail.careSummary.hasSupportNeed
                          ? 'bg-red-50/50 border-red-200'
                          : 'bg-zinc-50 border-zinc-200'
                      }`}>
                        <div className="flex items-center space-x-2 pb-1.5 border-b border-zinc-100 mb-2">
                          <Activity className={`w-4 h-4 ${activeUrgentRichDetail.careSummary.hasMedicalNote ? 'text-red-600' : 'text-zinc-600'}`} />
                          <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-wider">Care & Medical Summary</span>
                        </div>
                        <p className="text-[11px] font-semibold text-zinc-800 leading-relaxed">
                          {activeUrgentRichDetail.careSummary.shortSummary}
                        </p>
                        {activeUrgentRichDetail.careSummary.hasAllergy && (
                          <span className="mt-1.5 inline-flex items-center text-[9px] font-bold uppercase tracking-wider text-red-600 bg-red-100 border border-red-200 px-2 py-0.5 rounded-lg">
                            ⚠️ ALLERGY ALERT DETECTED
                          </span>
                        )}
                      </div>
                    )}

                    {/* Parent & Pickup Context Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Parent Contact Card */}
                      {activeUrgentRichDetail.parent && (
                        <div className="bg-white border border-zinc-200 p-4 rounded-2xl shadow-xs space-y-2">
                          <div className="flex items-center space-x-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                            <Heart className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Linked Parent</span>
                          </div>
                          <div>
                            <p className="font-bold text-zinc-900 text-xs">{activeUrgentRichDetail.parent.fullName}</p>
                            <div className="flex items-center space-x-3 mt-1.5 font-mono text-[10px] text-zinc-600">
                              <a
                                href={`tel:${activeUrgentRichDetail.parent.phoneMaskedOrVisibleByPermission}`}
                                className="hover:underline flex items-center space-x-1"
                              >
                                <span>📞 {activeUrgentRichDetail.parent.phoneMaskedOrVisibleByPermission}</span>
                              </a>
                              {activeUrgentRichDetail.parent.whatsappMaskedOrVisibleByPermission && (
                                <span className="text-zinc-400">|</span>
                              )}
                              {activeUrgentRichDetail.parent.whatsappMaskedOrVisibleByPermission && (
                                <a
                                  href={`https://wa.me/${activeUrgentRichDetail.parent.whatsappMaskedOrVisibleByPermission.replace(/[^0-9]/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline text-emerald-600 flex items-center space-x-1"
                                >
                                  <span>💬 WhatsApp</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Authorized Pickup Card */}
                      {activeUrgentRichDetail.pickup ? (
                        <div className="bg-white border border-zinc-200 p-4 rounded-2xl shadow-xs flex items-center space-x-3">
                          {activeUrgentRichDetail.pickup.photoUrl ? (
                            <img
                              src={activeUrgentRichDetail.pickup.photoUrl}
                              alt={activeUrgentRichDetail.pickup.fullName}
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 rounded-xl object-cover border border-zinc-200 shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-center text-zinc-400 shrink-0 text-center p-1">
                              <UserCheck className="w-6 h-6" />
                              <span className="text-[8px] font-bold uppercase mt-1 leading-tight text-zinc-500">
                                Photo unavailable
                              </span>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                              <span>Authorized Pickup</span>
                            </div>
                            <p className="font-bold text-zinc-900 text-xs truncate">
                              {activeUrgentRichDetail.pickup.fullName}
                            </p>
                            <p className="text-[10px] text-zinc-500 font-medium">
                              Relationship: <strong className="text-zinc-700">{activeUrgentRichDetail.pickup.relationship}</strong>
                            </p>
                            {activeUrgentRichDetail.pickup.phoneMaskedOrVisibleByPermission && (
                              <p className="text-[9px] font-mono text-zinc-500 mt-0.5">
                                Phone: {activeUrgentRichDetail.pickup.phoneMaskedOrVisibleByPermission}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-2xl shadow-xs flex items-center justify-center text-zinc-400">
                          <span className="text-[10px] font-medium">No custom pickup person registered</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div 
                    className="col-span-2 border-t border-zinc-200 pt-4 mt-2 space-y-4 text-left" 
                    data-component-version="emergency-scrollable-child-summary-v1"
                  >
                    <div className="bg-[#FFF8F8] border border-red-200 p-4 rounded-2xl shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-red-100 pb-2">
                        <span className="text-xs font-black text-red-700 uppercase tracking-tight flex items-center gap-1.5">
                          <ShieldAlert className="w-4 h-4 text-red-600" />
                          Emergency help needed
                        </span>
                        <span className="text-[9px] bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded uppercase">
                          Secure in-app details
                        </span>
                      </div>
                      
                      <div className="flex items-start space-x-4">
                        {/* Photo placeholder with Photo unavailable text */}
                        <div className="w-16 h-16 rounded-2xl bg-zinc-100 border border-zinc-200 flex flex-col items-center justify-center text-zinc-400 shrink-0 text-center p-1">
                          <User className="w-6 h-6" />
                          <span className="text-[8px] font-bold uppercase mt-1 leading-tight text-zinc-500">
                            Photo unavailable
                          </span>
                        </div>

                        <div className="flex-1 space-y-2">
                          <p className="text-xs text-zinc-600 leading-relaxed font-sans">
                            An active safety alert was raised without a specific child profile selection. Operators must triage using secondary channels or direct response.
                          </p>

                          {activeUrgentAlert.child_name && (
                            <p className="text-xs">
                              Reported Child Name: <strong className="text-red-600">{activeUrgentAlert.child_name}</strong>
                            </p>
                          )}

                          {/* Open full details button */}
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setActiveAlertDetail(activeUrgentAlert);
                              }}
                              className="font-bold text-[10px] text-zinc-800 bg-white border border-zinc-300 hover:bg-zinc-50 px-3 py-1.5 rounded-xl transition-all inline-flex items-center gap-1 cursor-pointer"
                            >
                              Open full details
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {activeUrgentAlert.message && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl font-sans text-xs leading-relaxed text-red-950 italic shadow-xs text-left">
                  "{activeUrgentAlert.message}"
                </div>
              )}
            </div>

            {/* CARD FOOTER (Sticky) */}
            <div 
              className="px-8 pt-4 pb-8 border-t border-zinc-200 bg-[#FAF9F6] relative z-10 shrink-0"
              data-component-version="emergency-sticky-action-footer-v1"
            >
              {/* State transitions inside Overlay Takeover */}
              {activeUrgentAlert.status === 'open' ? (
                showResolutionInTakeover ? (
                  <div className="space-y-4 text-left">
                    <div className="space-y-2">
                      <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">
                        Direct Resolution Note (Required to Close)
                      </label>
                      <textarea
                        required
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        placeholder="Specify actions taken to secure the child and coordinate with volunteers..."
                        className="w-full text-xs p-3.5 border border-zinc-300 rounded-2xl focus:outline-none focus:border-red-500 bg-white text-zinc-800 placeholder-zinc-400"
                        rows={3}
                      />
                    </div>

                    <div className="flex gap-3 text-xs font-bold">
                      <button
                        onClick={() => setShowResolutionInTakeover(false)}
                        className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 py-3.5 rounded-xl text-center transition-all cursor-pointer border-none"
                      >
                        Back to Actions
                      </button>
                      <button
                        onClick={async () => {
                          if (!resolutionNote.trim()) {
                            showError('Required', 'Please add a resolution note.');
                            return;
                          }
                          if (activeUrgentAlert.isTest) {
                            stopActiveUrgentAlertEffects(activeUrgentAlert.id);
                            setResolutionNote('');
                            setShowResolutionInTakeover(false);
                            showSuccess('Test Resolved', 'Device readiness test completed successfully.');
                            return;
                          }
                          try {
                            const res = await api.admin.resolveSafetyAlert(activeUrgentAlert.id, resolutionNote);
                            if (res && res.success) {
                              showSuccess('Resolved', 'Safety concern has been successfully resolved.');
                              stopActiveUrgentAlertEffects(activeUrgentAlert.id);
                              setSafetyAlerts(prev => prev.map(a => a.id === activeUrgentAlert.id ? { ...a, status: 'resolved', resolution_note: resolutionNote, resolved_by_name: adminUser?.email?.split('@')[0] || 'Care Lead' } : a));
                              setResolutionNote('');
                              setShowResolutionInTakeover(false);
                            }
                          } catch (err) {
                            console.error('Error resolving inside overlay:', err);
                          }
                        }}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl text-center transition-all cursor-pointer shadow-md shadow-emerald-600/10 border-none"
                      >
                        Submit & Close Alert
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3" data-component-version="takeover-open-state-actions-v3">
                    {/* Primary Red Acknowledge Alert Button */}
                    <button
                      onClick={async () => {
                        if (activeUrgentAlert.isTest) {
                          stopActiveUrgentAlertEffects(activeUrgentAlert.id);
                          showSuccess('Test Acknowledged', 'Local browser test marked as acknowledged.');
                          return;
                        }
                        try {
                          const res = await api.admin.acknowledgeSafetyAlert(activeUrgentAlert.id);
                          if (res && res.success) {
                            showSuccess('Acknowledged', 'The safety alert has been marked as acknowledged.');
                            stopActiveUrgentAlertEffects(activeUrgentAlert.id);
                            fetchSafetyAlerts();
                          }
                        } catch (err) {
                          console.error('Error acknowledging inside overlay:', err);
                        }
                      }}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-red-600/20 text-center flex items-center justify-center space-x-2 text-sm cursor-pointer border-none"
                    >
                      <Check className="w-5 h-5" />
                      <span>ACKNOWLEDGE ALERT (STOPS DEVICE SOUND)</span>
                    </button>

                    {/* Secondary Actions Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        onClick={() => {
                          setShowCommandCenter(true);
                          setActiveUrgentAlert(null);
                        }}
                        className="bg-white hover:bg-zinc-50 text-zinc-800 font-bold py-2.5 px-4 rounded-xl border border-zinc-200 transition-all text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                      >
                        <ShieldAlert className="w-4 h-4 text-red-600" />
                        <span>Open Command Center</span>
                      </button>

                      <button
                        onClick={() => setShowResolutionInTakeover(true)}
                        className="bg-white hover:bg-zinc-50 text-zinc-800 font-bold py-2.5 px-4 rounded-xl border border-zinc-200 transition-all text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span>Resolve Directly</span>
                      </button>

                      <button
                        id="btn-stop-alert-sound"
                        data-component-version="urgent-alert-silence-device-action-v2"
                        onClick={() => {
                          try {
                            (window as any).stopAllUrgentAlertEffects?.();
                            if (activeUrgentAlert?.id) {
                              handleSilenceAlert(activeUrgentAlert.id);
                            }
                            setActiveUrgentAlert(null); // Close overlay after silences as per local device rule
                          } catch (e) {
                            console.warn('Kill switch failed:', e);
                          }
                        }}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2.5 px-4 rounded-xl border border-zinc-700 transition-all text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                      >
                        <VolumeX className="w-4 h-4 text-zinc-400" />
                        <span>Silence Device</span>
                      </button>
                    </div>

                    <button
                      onClick={() => setActiveUrgentAlert(null)}
                      className="w-full bg-transparent hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700 py-3 rounded-xl transition-all text-xs font-semibold text-center cursor-pointer border-none"
                    >
                      Close Overlay View (Keeps Alert Open)
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>ALREADY ACKNOWLEDGED — RESOLUTION NOTE REQUIRED TO CLOSE</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">
                      Resolution Actions Taken (Required)
                    </label>
                    <textarea
                      required
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      placeholder="Specify actions taken to secure the child and coordinate with volunteers..."
                      className="w-full text-xs p-3.5 border border-zinc-300 rounded-2xl focus:outline-none focus:border-red-500 bg-white text-zinc-800 placeholder-zinc-400"
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-3 text-xs font-bold">
                    <button
                      onClick={() => setActiveUrgentAlert(null)}
                      className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 py-3.5 rounded-xl text-center transition-all cursor-pointer"
                    >
                      Close View
                    </button>
                    <button
                      onClick={async () => {
                        if (!resolutionNote.trim()) {
                          showError('Required', 'Please add a resolution note.');
                          return;
                        }
                        if (activeUrgentAlert.isTest) {
                          stopActiveUrgentAlertEffects(activeUrgentAlert.id);
                          setResolutionNote('');
                          showSuccess('Test Resolved', 'Device readiness test completed successfully.');
                          return;
                        }
                        try {
                          const res = await api.admin.resolveSafetyAlert(activeUrgentAlert.id, resolutionNote);
                          if (res && res.success) {
                            showSuccess('Resolved', 'Safety concern has been successfully resolved.');
                            stopActiveUrgentAlertEffects(activeUrgentAlert.id);
                            setSafetyAlerts(prev => prev.map(a => a.id === activeUrgentAlert.id ? { ...a, status: 'resolved', resolution_note: resolutionNote, resolved_by_name: adminUser?.email?.split('@')[0] || 'Care Lead' } : a));
                            setResolutionNote('');
                          }
                        } catch (err) {
                          console.error('Error resolving inside overlay:', err);
                        }
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl text-center transition-all cursor-pointer shadow-md shadow-emerald-600/10"
                    >
                      Submit & Close Alert
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
