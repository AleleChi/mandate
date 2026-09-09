import React, { useEffect, useState, useRef } from 'react';
import { 
  MessageSquare, 
  Send, 
  Save, 
  Eye, 
  CheckCircle, 
  Loader2, 
  Mail, 
  Phone, 
  AlertTriangle, 
  RefreshCw, 
  Settings, 
  Search, 
  Archive, 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  Clock, 
  User, 
  ExternalLink,
  X,
  Inbox as InboxIcon,
  Bell,
  Smartphone
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { safeStorage } from '../../utils/storage';

interface AdminMessagesViewProps {
  onBackToOverview: () => void;
  onNavigate: (route: string) => void;
  adminUser?: any;
}

interface EventOption {
  id: string;
  title: string;
  status: string;
}

const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  general_announcement: {
    subject: 'Important Event Details - {Event name}',
    body: 'Dear {Parent name},\n\nWe are looking forward to {Event name}! Please ensure your children arrive with comfortable clothing and their personal water bottles labeled with their names.\n\nWarm regards,\nThe Koinonia Team'
  },
  pickup_reminder: {
    subject: 'Dismissal and Pickup Reminder - {Event name}',
    body: 'Dear {Parent name},\n\nThis is a quick reminder that dismissal and checkout for {Child name} will begin at {Pickup time}. Please ensure you present your physical or digital pass at the checkout station.\n\nSee you soon!'
  },
  pass_ready: {
    subject: 'Your Entry Pass is Ready - {Event name}',
    body: 'Dear {Parent name},\n\nGood news! The entry pass for {Child name} is ready for {Event name}. You can view the pass here:\n{Pass link}\n\nFor any questions or support, contact our team at {Support contact}. We look forward to welcoming you!'
  },
  review_update: {
    subject: 'Review Status Update - {Event name}',
    body: 'Dear {Parent name},\n\nYour details for {Child name} are currently under active review by the team. You can check the status on Parent Access:\n{Review link}\n\nThank you for your patience and support!'
  },
  waiting_list_update: {
    subject: 'Waiting List Status - {Event name}',
    body: 'Dear {Parent name},\n\nWe have received your details for {Child name}. Due to capacity limits for {Event name}, your child has been placed on our waiting list. We will notify you immediately if a spot opens up.\n\nThank you for your understanding.'
  }
};

const TOKENS = [
  { key: '{Parent name}', label: 'Parent Name' },
  { key: '{Child name}', label: 'Child Name' },
  { key: '{Event name}', label: 'Event Name' },
  { key: '{Pass link}', label: 'Pass Link' },
  { key: '{Review link}', label: 'Review Link' },
  { key: '{Pickup time}', label: 'Pickup Time' },
  { key: '{Support contact}', label: 'Support Contact' }
];

function formatPremiumDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  
  if (isToday) {
    return `Today, ${timeStr}`;
  } else if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  } else {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
    return d.toLocaleDateString([], options);
  }
}

function formatPremiumDateDetail(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const dateOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${d.toLocaleDateString([], dateOptions)} at ${timeStr}`;
}

function formatHumanType(typeStr: string) {
  if (!typeStr) return 'General update';
  const map: Record<string, string> = {
    safety_alert: 'Care update',
    escalation: 'Escalation',
    parent_message: 'Parent message',
    volunteer_message: 'Volunteer message',
    pass_update: 'Entry pass update',
    application_update: 'Registration update',
    delivery_issue: 'Not delivered',
    info: 'General update',
    broadcast: 'Announcement'
  };
  return map[typeStr] || typeStr.charAt(0).toUpperCase() + typeStr.slice(1).replace(/_/g, ' ');
}

function formatHumanSenderRole(roleStr?: string) {
  if (!roleStr) return 'System';
  const rLower = roleStr.toLowerCase();
  if (rLower.includes('volunteer')) return 'Volunteer';
  if (rLower.includes('parent')) return 'Parent';
  if (rLower.includes('super')) return 'Super Admin';
  if (rLower.includes('admin') || rLower.includes('staff')) return 'Event team';
  if (rLower.includes('system')) return 'System';
  return roleStr;
}

export function AdminMessagesView({ onBackToOverview, onNavigate, adminUser }: AdminMessagesViewProps) {
  const { showSuccess, showError } = useNotification();
  const [initialLoading, setInitialLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Events scoping
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('event-ga-2026');

  // Main navigation tabs: 'updates' = Inbox, 'broadcast' = Send Announcement
  const [activeTab, setActiveTab] = useState<'updates' | 'broadcast'>('updates');

  // Inbox state
  const [updates, setUpdates] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ total: 0, page: 1, limit: 15, pages: 1 });
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState<any | null>(null);

  // Resolution modal for safety concerns / attention items
  const [resolvingUpdate, setResolvingUpdate] = useState<any | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolvingAction, setResolvingAction] = useState(false);

  // Summary counts state
  const [summaryStats, setSummaryStats] = useState({
    total: 0,
    unread: 0,
    openAlerts: 0,
    urgent: 0,
    deliveryIssues: 0
  });
  const [summaryStatsLoading, setSummaryStatsLoading] = useState(false);
  const [summaryStatsError, setSummaryStatsError] = useState<string | null>(null);

  // Filters for Inbox
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [senderRoleFilter, setSenderRoleFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Send Announcement / Composer states
  const [recipientGroups, setRecipientGroups] = useState<any[]>([]);
  const [eventParents, setEventParents] = useState<Array<{
    id: string;
    name: string;
    phone: string;
    whatsappNumber?: string;
    whatsappConsentStatus: string;
    email: string;
    userId: string;
    pushCount: number;
    children: Array<{ id: string; name: string }>;
    childCount: number;
  }>>([]);
  const [selectedParentIds, setSelectedParentIds] = useState<string[]>([]);
  const [parentSearchQuery, setParentSearchQuery] = useState('');
  const [previewRepresentativeParent, setPreviewRepresentativeParent] = useState<string | null>(null);
  const [channelEligibility, setChannelEligibility] = useState<{
    inApp: number;
    push: number;
    email: number;
    whatsappNumbers: number;
    whatsappOptedIn: number;
  } | null>(null);
  const [messageTypes, setMessageTypes] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [providerStatus, setProviderStatus] = useState<any>({
    emailEnabled: true,
    whatsappEnabled: true,
    whatsappStatus: 'Setup pending',
    emailProvider: null,
    whatsappProvider: null,
    senderName: 'Koinonia Global',
    fromEmail: 'info@themandate.dontechservicesconst.com',
    replyToEmail: 'info@themandate.dontechservicesconst.com'
  });

  // Super Admin WhatsApp Test Send state
  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState<any | null>(null);

  const handleSendTestWhatsApp = async () => {
    if (!providerStatus.whatsappReadiness?.testSendAvailable) {
      showError('WhatsApp setup incomplete. Provider credentials must be configured before testing.');
      return;
    }
    if (!testPhone.trim()) {
      showError('Please enter a phone number to test.');
      return;
    }
    setTestSending(true);
    setTestStatus({ status: 'queued', recipientPhone: testPhone.trim() });
    try {
      const res = await api.admin.testWhatsApp({
        to: testPhone.trim(),
        message: 'Koinonia Children & Teens\nThis is a test message from the TGA communication system.'
      });
      if (res.success) {
        showSuccess('Test WhatsApp message queued.');
        const initialStatus = res.status || 'queued';
        setTestStatus({
          id: res.logId,
          status: initialStatus,
          provider: res.provider,
          recipientPhone: testPhone.trim()
        });
        if (res.logId) {
          pollTestStatus(res.logId);
        }
      } else {
        showError(res.message || 'Failed to dispatch test WhatsApp message.');
        setTestStatus({
          status: 'failed',
          recipientPhone: testPhone.trim(),
          errorMessage: res.message
        });
      }
    } catch (err: any) {
      let errorMsg = err.message || 'Test send request failed.';
      if (errorMsg.trim().toLowerCase() === 'authenticate') {
        errorMsg = 'Twilio authentication failed (Error 20003). Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in server configuration.';
      }
      showError(errorMsg);
      setTestStatus({
        status: 'failed',
        recipientPhone: testPhone.trim(),
        errorMessage: errorMsg
      });
    } finally {
      setTestSending(false);
    }
  };

  const pollTestStatus = (logId: string) => {
    let attempts = 0;
    const maxAttempts = 12;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await api.admin.getTestWhatsAppStatus({ logId });
        if (res.success && res.log) {
          setTestStatus(res.log);
          if (res.log.status === 'read' || res.log.status === 'failed') {
            clearInterval(interval);
          }
        }
      } catch {
        // Quiet catch for polling
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 2000);
  };

  const [selectedGroup, setSelectedGroup] = useState('all_parents');
  const [selectedType, setSelectedType] = useState('general_announcement');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['in_app', 'push']);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const toggleChannel = (channelId: string) => {
    setSelectedChannels(prev => {
      if (prev.includes(channelId)) {
        if (prev.length === 1) {
          showError('Please select at least one delivery channel.');
          return prev;
        }
        return prev.filter(c => c !== channelId);
      } else {
        return [...prev, channelId];
      }
    });
  };

  // Live preview
  const [previewTab, setPreviewTab] = useState<'push' | 'in_app' | 'email' | 'whatsapp'>('push');
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewBody, setPreviewBody] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [dispatchSummary, setDispatchSummary] = useState<any | null>(null);

  // Sender settings modal
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editedSenderName, setEditedSenderName] = useState('');
  const [editedReplyTo, setEditedReplyTo] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Fetch all available events to allow event scoping
  useEffect(() => {
    let isMounted = true;
    const fetchEvents = async () => {
      try {
        const token = safeStorage.getItem('koinonia_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/admin/events', { headers });
        if (res.ok) {
          const data = await res.json();
          const list: EventOption[] = data.events || (Array.isArray(data) ? data : []);
          if (isMounted && list.length > 0) {
            setEvents(list);
            const currentEv = list.find((e) => e.status === 'current' || e.status === 'open') || list[0];
            if (currentEv?.id) {
              setSelectedEventId(currentEv.id);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load events for messages module:', err);
      }
    };
    fetchEvents();
    return () => { isMounted = false; };
  }, []);

  const fetchSummaryStats = async (eventId = selectedEventId) => {
    setSummaryStatsLoading(true);
    setSummaryStatsError(null);
    try {
      const res = await api.adminUpdates.getSummary(eventId);
      if (res && res.success && res.summary) {
        setSummaryStats({
          total: res.summary.total || 0,
          unread: res.summary.unread || 0,
          openAlerts: res.summary.openAlerts || 0,
          urgent: res.summary.urgent || 0,
          deliveryIssues: res.summary.deliveryIssues || 0
        });
      }
    } catch (err) {
      console.warn('Failed to fetch summary card statistics:', err);
      setSummaryStatsError("Message summary unavailable");
    } finally {
      setSummaryStatsLoading(false);
    }
  };

  const fetchUpdates = async (page = 1, silent = false, eventId = selectedEventId) => {
    if (!silent) setUpdatesLoading(true);
    try {
      const res = await api.adminUpdates.getUpdates({
        limit: 15,
        page,
        status: statusFilter,
        type: typeFilter,
        senderRole: senderRoleFilter,
        priority: priorityFilter,
        search: searchFilter,
        dateFrom,
        dateTo,
        eventId
      });
      if (res && res.updates) {
        setUpdates(res.updates);
        setPagination(res.pagination || { total: res.updates.length, page, limit: 15, pages: 1 });
        setCurrentPage(res.pagination?.page || page);
        
        // Preserve selected item if still in list
        if (selectedUpdate) {
          const matching = res.updates.find((u: any) => u.rawId === selectedUpdate.rawId);
          if (matching) {
            setSelectedUpdate(matching);
          }
        }
      }
      fetchSummaryStats(eventId);
    } catch (err) {
      console.error('Error loading updates:', err);
      if (!silent) {
        showError("We couldn't load the messages. Try again");
      }
    } finally {
      if (!silent) setUpdatesLoading(false);
    }
  };

  const fetchMessagesData = async (silent = false, eventId = selectedEventId) => {
    if (!silent && activeTab === 'broadcast') setInitialLoading(true);
    try {
      const data = await api.admin.getMessages(eventId);
      if (data.success) {
        setRecipientGroups(data.recipientGroups || [
          { key: 'all_parents', label: 'All parents', count: 0 },
          { key: 'selected_children', label: 'Selected children', count: 0 },
          { key: 'under_review', label: 'Under review', count: 0 },
          { key: 'waiting_list', label: 'Waiting list', count: 0 },
          { key: 'not_selected', label: 'Not selected', count: 0 },
          { key: 'pass_ready', label: 'Pass ready', count: 0 },
          { key: 'volunteers', label: 'Volunteers', count: 0 },
          { key: 'all_event_team', label: 'Event team & volunteers', count: 0 }
        ]);

        if (data.channelEligibility) {
          setChannelEligibility(data.channelEligibility);
        }

        if (data.eventParents) {
          setEventParents(data.eventParents);
        }

        setMessageTypes(data.messageTypes || [
          { key: 'general_announcement', label: 'General announcement' },
          { key: 'pickup_reminder', label: 'Dismissal and pickup reminder' },
          { key: 'pass_ready', label: 'Entry pass ready' },
          { key: 'review_update', label: 'Review update' },
          { key: 'waiting_list_update', label: 'Waiting list update' }
        ]);

        setRecentActivity(data.recentActivity || []);

        const mEnabled = data.emailEnabled !== false;
        const wEnabled = data.whatsappEnabled !== false;
        setEmailEnabled(mEnabled);
        setWhatsappEnabled(wEnabled);

        if (data.providerStatus) {
          setProviderStatus(data.providerStatus);
        }

        if (data.latestDraft && !body) {
          setSelectedGroup(data.latestDraft.recipientGroup || 'all_parents');
          setSelectedType(data.latestDraft.messageType || 'general_announcement');
          if (data.latestDraft.channel) {
            const parsedChans = String(data.latestDraft.channel).split(',').map((c: string) => c.trim()).filter(Boolean);
            if (parsedChans.length > 0) {
              setSelectedChannels(parsedChans);
            }
          }
          setSubject(data.latestDraft.subject || '');
          setBody(data.latestDraft.body || '');
        } else if (!body) {
          const defaultTemplate = DEFAULT_TEMPLATES.general_announcement;
          setSubject(defaultTemplate.subject);
          setBody(defaultTemplate.body);
          setSelectedChannels(['in_app', 'push']);
        }
      }
    } catch (err: any) {
      console.error('Error fetching admin messages data:', err);
      showError("We couldn't load messaging details. Try again");
    } finally {
      setInitialLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchSummaryStats(selectedEventId);
    fetchUpdates(1, false, selectedEventId);
    fetchMessagesData(false, selectedEventId);
  }, [selectedEventId]);

  // Refetch updates on filter change
  useEffect(() => {
    if (activeTab === 'updates') {
      fetchUpdates(1, false, selectedEventId);
    }
  }, [activeTab, statusFilter, typeFilter, senderRoleFilter, priorityFilter, dateFrom, dateTo]);

  // Periodic silent refresh for real-time updates
  useEffect(() => {
    let intervalId: any;
    if (activeTab === 'updates') {
      intervalId = setInterval(() => {
        fetchUpdates(currentPage, true, selectedEventId);
      }, 15000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeTab, statusFilter, typeFilter, senderRoleFilter, priorityFilter, dateFrom, dateTo, currentPage, selectedEventId]);

  // Live preview generation
  const generateLivePreview = async () => {
    if (!body.trim()) {
      setPreviewSubject('');
      setPreviewBody('');
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await api.admin.previewMessage({
        recipientGroup: selectedGroup,
        messageType: selectedType,
        channel: selectedChannels.includes('email') ? 'email' : (selectedChannels.includes('whatsapp') ? 'whatsapp' : 'in_app'),
        subject,
        body,
        selectedParentIds: selectedGroup === 'specific_parents' ? selectedParentIds : undefined
      });
      if (res.success && res.preview) {
        setPreviewSubject(res.preview.subject);
        setPreviewBody(res.preview.body);
        setPreviewRepresentativeParent(res.preview.representativeParentName || null);
      }
    } catch (err) {
      console.error('Preview error:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      generateLivePreview();
    }, 400);
    return () => clearTimeout(timer);
  }, [body, subject, selectedGroup, selectedType, selectedChannels, selectedParentIds]);

  useEffect(() => {
    if (!selectedChannels.includes(previewTab)) {
      if (selectedChannels.includes('push')) {
        setPreviewTab('push');
      } else if (selectedChannels.includes('in_app')) {
        setPreviewTab('in_app');
      } else if (selectedChannels.includes('email')) {
        setPreviewTab('email');
      } else if (selectedChannels.includes('whatsapp')) {
        setPreviewTab('whatsapp');
      }
    }
  }, [selectedChannels, previewTab]);

  // Item interaction handlers
  const handleSelectUpdate = async (update: any) => {
    setSelectedUpdate(update);
    if (!update.isRead) {
      try {
        await api.adminUpdates.markAsRead(update.rawId);
        setUpdates(prev => prev.map(u => u.rawId === update.rawId ? { ...u, isRead: true } : u));
        update.isRead = true;
        fetchSummaryStats(selectedEventId);
      } catch (err) {
        console.warn('Failed to mark update as read:', err);
      }
    }
  };

  const handleToggleRead = async (update: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (update.isRead) {
        await api.adminUpdates.markAsUnread(update.rawId);
        setUpdates(prev => prev.map(u => u.rawId === update.rawId ? { ...u, isRead: false, readAt: null } : u));
        showSuccess('Marked as unread');
      } else {
        await api.adminUpdates.markAsRead(update.rawId);
        setUpdates(prev => prev.map(u => u.rawId === update.rawId ? { ...u, isRead: true, readAt: new Date().toISOString() } : u));
        showSuccess('Marked as read');
      }
      fetchSummaryStats(selectedEventId);
    } catch (err) {
      showError("We couldn't update this message. Try again");
    }
  };

  const handleToggleArchive = async (update: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (update.isArchived) {
        await api.adminUpdates.unarchiveUpdate(update.rawId);
        showSuccess('Message restored from archive');
        if (statusFilter === 'archived') {
          setUpdates(prev => prev.filter(u => u.rawId !== update.rawId));
        } else {
          setUpdates(prev => prev.map(u => u.rawId === update.rawId ? { ...u, isArchived: false, archivedAt: null } : u));
        }
      } else {
        await api.adminUpdates.archiveUpdate(update.rawId);
        showSuccess('Message archived');
        if (statusFilter !== 'archived') {
          setUpdates(prev => prev.filter(u => u.rawId !== update.rawId));
        } else {
          setUpdates(prev => prev.map(u => u.rawId === update.rawId ? { ...u, isArchived: true, archivedAt: new Date().toISOString() } : u));
        }
      }
      if (selectedUpdate && selectedUpdate.rawId === update.rawId) {
        setSelectedUpdate(prev => prev ? { ...prev, isArchived: !prev.isArchived } : null);
      }
      fetchSummaryStats(selectedEventId);
    } catch (err) {
      showError("We couldn't update this message. Try again");
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.adminUpdates.markAllAsRead();
      setUpdates(prev => prev.map(u => ({ ...u, isRead: true, readAt: new Date().toISOString() })));
      showSuccess('All messages marked as read');
      fetchUpdates(currentPage, false, selectedEventId);
    } catch (err) {
      showError("We couldn't mark messages as read. Try again");
    }
  };

  // Resolve safety concern / attention item directly
  const handleOpenResolveModal = (update: any) => {
    setResolvingUpdate(update);
    setResolutionNote('');
  };

  const handleConfirmResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingUpdate) return;
    setResolvingAction(true);
    try {
      const alertId = resolvingUpdate.metadata?.safetyAlertId || resolvingUpdate.metadata?.alertId || resolvingUpdate.rawId;
      const res = await api.admin.resolveSafetyAlert(alertId, resolutionNote.trim());
      if (res && res.success) {
        showSuccess('Concern resolved and logged');
        // Update local status
        setUpdates(prev => prev.map(u => u.rawId === resolvingUpdate.rawId ? { ...u, actionStatus: 'resolved' } : u));
        if (selectedUpdate && selectedUpdate.rawId === resolvingUpdate.rawId) {
          setSelectedUpdate((prev: any) => prev ? { ...prev, actionStatus: 'resolved' } : null);
        }
        setResolvingUpdate(null);
        fetchSummaryStats(selectedEventId);
      } else {
        showError("We couldn't resolve this concern. Try again");
      }
    } catch (err) {
      showError("We couldn't resolve this concern. Try again");
    } finally {
      setResolvingAction(false);
    }
  };

  // Template / token handlers
  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    const template = DEFAULT_TEMPLATES[type];
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
    }
  };

  const handleInsertToken = (token: string) => {
    if (!bodyRef.current) return;
    const textarea = bodyRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const updated = text.substring(0, start) + token + text.substring(end);
    setBody(updated);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
    }, 50);
  };

  // Composer submit handlers
  const handleSaveDraft = async () => {
    if (!body.trim()) {
      showError('Please write your message before saving a draft.');
      return;
    }
    setSavingDraft(true);
    try {
      const res = await api.admin.saveMessageDraft({
        recipientGroup: selectedGroup,
        messageType: selectedType,
        channels: selectedChannels,
        channel: selectedChannels.join(','),
        subject,
        body
      });
      if (res.success) {
        showSuccess('Draft saved');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError(parsed.message || "We couldn't save this draft. Try again");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSendRequest = () => {
    if (!body.trim()) {
      showError('Please write a message before sending.');
      return;
    }
    if (selectedChannels.length === 0) {
      showError('Please select at least one delivery channel.');
      return;
    }
    if (selectedChannels.includes('email') && !subject.trim()) {
      showError('A subject is required for email delivery.');
      return;
    }

    if (selectedGroup === 'specific_parents') {
      if (selectedParentIds.length === 0) {
        showError('Please select at least one parent recipient.');
        return;
      }
    } else {
      const currentGroup = recipientGroups.find(g => g.key === selectedGroup);
      if (currentGroup && currentGroup.count === 0) {
        showError('The selected group currently has 0 recipients.');
        return;
      }
    }

    setShowConfirmModal(true);
  };

  const handleConfirmSend = async () => {
    setShowConfirmModal(false);
    setActionLoading(true);
    try {
      const res = await api.admin.sendMessage({
        recipientGroup: selectedGroup,
        messageType: selectedType,
        channels: selectedChannels,
        channel: selectedChannels.includes('email') && selectedChannels.includes('whatsapp') ? 'both' : (selectedChannels.includes('email') ? 'email' : (selectedChannels.includes('whatsapp') ? 'whatsapp' : 'in_app')),
        subject,
        body,
        confirmed: true,
        eventId: selectedEventId,
        selectedParentIds: selectedGroup === 'specific_parents' ? selectedParentIds : undefined
      });
      
      if (res.success) {
        setDispatchSummary({
          ...res.summary,
          message: res.message
        });
        showSuccess(res.message || 'Update sent');
        setBody('');
        setSubject('');
        fetchMessagesData(true, selectedEventId);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError(parsed.message || "We couldn't send this announcement. Try again");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartEditSettings = () => {
    setEditedSenderName(providerStatus.senderName || '');
    setEditedReplyTo(providerStatus.replyToEmail || '');
    setIsEditingSettings(true);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedSenderName.trim() || !editedReplyTo.trim()) {
      showError('Sender name and reply-to email are required.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editedReplyTo)) {
      showError('Please enter a valid reply-to email address.');
      return;
    }

    setSavingSettings(true);
    try {
      const res = await api.admin.updateMessagesSettings({
        senderName: editedSenderName.trim(),
        replyToEmail: editedReplyTo.trim()
      });
      if (res.success) {
        showSuccess('Sender details updated');
        setIsEditingSettings(false);
        fetchMessagesData(true, selectedEventId);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError(parsed.message || "We couldn't save these settings. Try again");
    } finally {
      setSavingSettings(false);
    }
  };

  const isSpecificParents = selectedGroup === 'specific_parents';
  const selectedParentsList = eventParents.filter(p => selectedParentIds.includes(p.id));

  const effectiveEligibility = isSpecificParents ? {
    inApp: selectedParentsList.filter(p => !!p.userId).length,
    push: selectedParentsList.filter(p => Number(p.pushCount || 0) > 0).length,
    email: selectedParentsList.filter(p => !!p.email && p.email.includes('@')).length,
    whatsappNumbers: selectedParentsList.filter(p => !!(p.whatsappNumber || p.phone)).length,
    whatsappOptedIn: whatsappEnabled ? selectedParentsList.filter(p => p.whatsappConsentStatus === 'opted_in' && !!(p.whatsappNumber || p.phone)).length : 0
  } : channelEligibility;

  const activeGroupRecipients = isSpecificParents
    ? selectedParentIds.length
    : (recipientGroups.find(g => g.key === selectedGroup)?.count ?? 0);

  const filteredParents = eventParents.filter(p => {
    if (!parentSearchQuery.trim()) return true;
    const q = parentSearchQuery.toLowerCase().trim();
    const nameMatch = (p.name || '').toLowerCase().includes(q);
    const emailMatch = (p.email || '').toLowerCase().includes(q);
    const phoneMatch = (p.phone || '').includes(q) || (p.whatsappNumber || '').includes(q);
    const childMatch = (p.children || []).some(c => (c.name || '').toLowerCase().includes(q));
    return nameMatch || emailMatch || phoneMatch || childMatch;
  });

  const toggleSelectParent = (id: string) => {
    setSelectedParentIds(prev =>
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const selectAllFilteredParents = () => {
    const idsToAdd = filteredParents.map(p => p.id);
    setSelectedParentIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const clearSelectedParents = () => {
    setSelectedParentIds([]);
  };

  const isFiltersActive = priorityFilter !== 'all' || statusFilter !== 'all' || typeFilter !== 'all' || senderRoleFilter !== 'all' || searchFilter || dateFrom || dateTo;

  if (initialLoading && updatesLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 bg-[#FAF9F6] w-full">
        <KoinoniaInlineLoader
          variant="logo"
          size="lg"
          label="Loading messages..."
          centered
        />
      </div>
    );
  }

  return (
    <div 
      data-view-version="admin-messages-refined" 
      className="flex-1 flex flex-col min-w-0 bg-[#FAF9F6] p-4 sm:p-8 space-y-6 font-sans text-[#18181B]"
    >
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-[#EAE8E1] gap-4">
        <div>
          <h1 
            className="text-2xl sm:text-3xl font-bold text-[#18181B] tracking-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Messages & updates
          </h1>
          <p className="text-xs text-zinc-500 mt-1 font-normal leading-relaxed">
            View messages from parents and volunteers, follow important updates, and send event communications.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          {events.length > 0 && (
            <div className="relative">
              <select
                id="messages-event-selector"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                aria-label="Select event"
                className="appearance-none text-xs font-medium pl-3 pr-8 py-2 bg-white border border-[#EAE8E1] rounded-xl text-zinc-800 shadow-2xs hover:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} {ev.status === 'current' ? '(Current)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          <button
            onClick={() => {
              if (activeTab === 'updates') {
                fetchUpdates(currentPage, false, selectedEventId);
              } else {
                fetchMessagesData(false, selectedEventId);
              }
            }}
            className="p-2 bg-white border border-[#EAE8E1] rounded-xl text-zinc-500 hover:text-[#18181B] hover:bg-zinc-50 transition-all cursor-pointer shadow-2xs"
            aria-label="Refresh messages"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${updatesLoading ? 'animate-spin text-[#C59B27]' : ''}`} />
          </button>

          <Button 
            id="back-to-overview-btn"
            variant="outline" 
            onClick={onBackToOverview}
            className="text-xs font-medium cursor-pointer shadow-2xs"
          >
            Back to Overview
          </Button>
        </div>
      </div>

      {/* 2. RESTRAINED TAB NAVIGATION */}
      <div className="flex border-b border-[#EAE8E1] space-x-6">
        <button
          id="tab-messages-inbox"
          onClick={() => setActiveTab('updates')}
          className={`pb-3 text-xs font-semibold tracking-wide transition-all border-b-2 cursor-pointer focus:outline-none ${
            activeTab === 'updates'
              ? 'border-[#C59B27] text-[#18181B]'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
        >
          Inbox
        </button>
        <button
          id="tab-messages-compose"
          onClick={() => setActiveTab('broadcast')}
          className={`pb-3 text-xs font-semibold tracking-wide transition-all border-b-2 cursor-pointer focus:outline-none ${
            activeTab === 'broadcast'
              ? 'border-[#C59B27] text-[#18181B]'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
        >
          Send Announcement
        </button>
      </div>

      {activeTab === 'updates' ? (
        <div className="space-y-6">
          {/* 3. RESTRAINED SUMMARY METRICS ROW */}
          <div className="space-y-3">
            {summaryStatsError && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-2.5 rounded-xl flex items-center justify-between">
                <span>{summaryStatsError}</span>
                <button 
                  onClick={() => fetchSummaryStats(selectedEventId)} 
                  className="text-amber-900 font-semibold hover:underline cursor-pointer text-xs"
                >
                  Try again
                </button>
              </div>
            )}

            <div className="bg-white border border-[#EAE8E1] rounded-2xl shadow-2xs grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-[#EAE8E1] overflow-hidden">
              {/* Unread */}
              <button
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === 'unread' ? 'all' : 'unread');
                }}
                className={`p-4 text-left transition-colors cursor-pointer hover:bg-zinc-50/80 ${statusFilter === 'unread' ? 'bg-[#C59B27]/5' : ''}`}
              >
                <div className="text-[11px] font-semibold text-zinc-500">Unread</div>
                <div className="text-xl font-bold text-[#18181B] mt-1">{summaryStatsError ? '—' : summaryStats.unread}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">Messages not yet opened</div>
              </button>

              {/* Needs attention */}
              <button
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === 'open' ? 'all' : 'open');
                }}
                className={`p-4 text-left transition-colors cursor-pointer hover:bg-zinc-50/80 ${statusFilter === 'open' ? 'bg-[#C59B27]/5' : ''}`}
              >
                <div className="text-[11px] font-semibold text-zinc-500">Needs attention</div>
                <div className={`text-xl font-bold mt-1 ${!summaryStatsError && summaryStats.openAlerts > 0 ? 'text-amber-700' : 'text-[#18181B]'}`}>
                  {summaryStatsError ? '—' : summaryStats.openAlerts}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">Updates awaiting action</div>
              </button>

              {/* Urgent */}
              <button
                type="button"
                onClick={() => {
                  setPriorityFilter(priorityFilter === 'urgent' ? 'all' : 'urgent');
                }}
                className={`p-4 text-left transition-colors cursor-pointer hover:bg-zinc-50/80 ${priorityFilter === 'urgent' ? 'bg-[#C59B27]/5' : ''}`}
              >
                <div className="text-[11px] font-semibold text-zinc-500">Urgent</div>
                <div className={`text-xl font-bold mt-1 ${!summaryStatsError && summaryStats.urgent > 0 ? 'text-rose-700' : 'text-[#18181B]'}`}>
                  {summaryStatsError ? '—' : summaryStats.urgent}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">Items marked urgent</div>
              </button>

              {/* Not delivered */}
              <button
                type="button"
                onClick={() => {
                  setTypeFilter(typeFilter === 'delivery_issue' ? 'all' : 'delivery_issue');
                }}
                className={`p-4 text-left transition-colors cursor-pointer hover:bg-zinc-50/80 ${typeFilter === 'delivery_issue' ? 'bg-[#C59B27]/5' : ''}`}
              >
                <div className="text-[11px] font-semibold text-zinc-500">Not delivered</div>
                <div className={`text-xl font-bold mt-1 ${!summaryStatsError && summaryStats.deliveryIssues > 0 ? 'text-rose-700' : 'text-[#18181B]'}`}>
                  {summaryStatsError ? '—' : summaryStats.deliveryIssues}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">Messages that could not be sent</div>
              </button>
            </div>
          </div>

          {/* 4. MAIN INBOX LAYOUT */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* LEFT SIDE: SEARCH, FILTERS & LIST */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* FILTERS CARD */}
              <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-2xs space-y-4">
                
                {/* Search input with clean icon and clear button */}
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search messages, senders, child names..."
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl pl-10 pr-9 py-2 text-xs text-[#18181B] placeholder-zinc-400 focus:outline-none focus:border-[#C59B27] focus:ring-1 focus:ring-[#C59B27] transition-all"
                  />
                  {searchFilter && (
                    <button
                      type="button"
                      onClick={() => setSearchFilter('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdowns row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  {/* Priority */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Priority</label>
                    <select
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-2.5 py-1.5 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] cursor-pointer"
                    >
                      <option value="all">All priorities</option>
                      <option value="normal">Normal</option>
                      <option value="important">Important</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  {/* From */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">From</label>
                    <select
                      value={senderRoleFilter}
                      onChange={(e) => setSenderRoleFilter(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-2.5 py-1.5 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] cursor-pointer"
                    >
                      <option value="all">Everyone</option>
                      <option value="parent">Parents</option>
                      <option value="volunteer">Volunteers</option>
                      <option value="admin">Event team</option>
                    </select>
                  </div>

                  {/* Type */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Type</label>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-2.5 py-1.5 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] cursor-pointer"
                    >
                      <option value="all">All messages</option>
                      <option value="safety_alert">Care update</option>
                      <option value="escalation">Escalation</option>
                      <option value="parent_message">Parent message</option>
                      <option value="volunteer_message">Volunteer message</option>
                      <option value="info">General update</option>
                      <option value="broadcast">Announcement</option>
                      <option value="delivery_issue">Not delivered</option>
                    </select>
                  </div>

                  {/* Status */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-2.5 py-1.5 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] cursor-pointer"
                    >
                      <option value="all">All</option>
                      <option value="unread">Unread</option>
                      <option value="read">Read</option>
                      <option value="open">Needs attention</option>
                      <option value="acknowledged">Acknowledged</option>
                      <option value="resolved">Resolved</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>

                {/* Compact Date Filters & Mark All as Read */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-3 border-t border-[#EAE8E1] gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-zinc-500">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[11px]">Date from:</span>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-lg px-2 py-1 text-xs text-zinc-700 focus:outline-none focus:border-[#C59B27]"
                      />
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[11px]">Date to:</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-lg px-2 py-1 text-xs text-zinc-700 focus:outline-none focus:border-[#C59B27]"
                      />
                    </div>
                    {isFiltersActive && (
                      <button
                        type="button"
                        onClick={() => {
                          setPriorityFilter('all');
                          setStatusFilter('all');
                          setTypeFilter('all');
                          setSenderRoleFilter('all');
                          setSearchFilter('');
                          setDateFrom('');
                          setDateTo('');
                        }}
                        className="text-[11px] text-[#C59B27] hover:underline font-medium cursor-pointer ml-1"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>

                  {summaryStats.unread > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      className="text-[11px] font-medium text-zinc-700 hover:text-[#18181B] bg-zinc-50 hover:bg-zinc-100 border border-[#EAE8E1] px-3 py-1.5 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer self-start sm:self-auto shrink-0"
                    >
                      <Check className="w-3.5 h-3.5 text-[#C59B27]" />
                      <span>Mark all as read</span>
                    </button>
                  )}
                </div>

              </div>

              {/* MESSAGE ROWS LIST */}
              <div className="space-y-2">
                {updatesLoading ? (
                  <div className="bg-white border border-[#EAE8E1] rounded-2xl p-12 flex flex-col items-center justify-center space-y-3">
                    <Loader2 className="w-6 h-6 text-[#C59B27] animate-spin" />
                    <span className="text-xs text-zinc-500 font-medium">Loading messages…</span>
                  </div>
                ) : updates.length === 0 ? (
                  <div className="bg-white border border-[#EAE8E1] rounded-2xl p-12 text-center space-y-3">
                    <div className="w-10 h-10 bg-[#FAF9F6] border border-[#EAE8E1] rounded-full flex items-center justify-center mx-auto text-zinc-400">
                      <InboxIcon className="w-5 h-5" />
                    </div>
                    {isFiltersActive ? (
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-[#18181B]">No matching messages</h3>
                        <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                          Try changing your search or filters.
                        </p>
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPriorityFilter('all');
                              setStatusFilter('all');
                              setTypeFilter('all');
                              setSenderRoleFilter('all');
                              setSearchFilter('');
                              setDateFrom('');
                              setDateTo('');
                            }}
                            className="text-xs text-[#C59B27] font-medium hover:underline cursor-pointer"
                          >
                            Clear filters
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-[#18181B]">No messages yet</h3>
                        <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                          Messages and updates from parents, volunteers and the event team will appear here.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {updates.map((update) => {
                        const isUnread = !update.isRead;
                        const isSelected = selectedUpdate?.rawId === update.rawId;
                        const cleanRole = formatHumanSenderRole(update.senderRole);

                        return (
                          <div
                            key={update.id}
                            onClick={() => handleSelectUpdate(update)}
                            className={`group relative border rounded-xl p-4 transition-all duration-150 cursor-pointer flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                              isSelected
                                ? 'border-[#C59B27] bg-[#C59B27]/5 shadow-2xs'
                                : isUnread
                                ? 'border-[#EAE8E1] bg-[#C59B27]/3 hover:bg-[#C59B27]/7'
                                : 'border-[#EAE8E1] bg-white hover:bg-zinc-50/70 shadow-2xs'
                            }`}
                          >
                            {/* Subtle gold left border on unread messages */}
                            {isUnread && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#C59B27] rounded-l-xl" />
                            )}

                            {/* Main message item content */}
                            <div className="flex-1 min-w-0 space-y-1.5">
                              {/* Metadata line: sender, role, time */}
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-semibold text-zinc-900">{update.senderName}</span>
                                <span className="text-[11px] text-zinc-400">·</span>
                                <span className="text-[11px] text-zinc-500">{cleanRole}</span>
                                <span className="text-[11px] text-zinc-400">·</span>
                                <span className="text-[11px] text-zinc-400">{formatPremiumDate(update.createdAt)}</span>

                                {/* Priority tag if not normal */}
                                {update.priority === 'urgent' && (
                                  <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                                    Urgent
                                  </span>
                                )}
                                {update.priority === 'important' && (
                                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                    Important
                                  </span>
                                )}

                                {/* Needs attention alert tag */}
                                {update.actionStatus === 'open' && (
                                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                    Needs attention
                                  </span>
                                )}
                                {update.actionStatus === 'resolved' && (
                                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                    Resolved
                                  </span>
                                )}

                                {update.isArchived && (
                                  <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded">
                                    Archived
                                  </span>
                                )}
                              </div>

                              {/* Title / Subject */}
                              <h3 className={`text-xs text-[#18181B] truncate ${isUnread ? 'font-bold' : 'font-semibold'}`}>
                                {update.title}
                              </h3>

                              {/* Preview text */}
                              <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                                {update.bodyPreview}
                              </p>

                              {/* Related child footer if available */}
                              {update.relatedChildName && (
                                <div className="pt-0.5 text-[11px] text-zinc-500 flex items-center space-x-1">
                                  <span className="text-zinc-400">Child:</span>
                                  <span className="font-medium text-zinc-700">{update.relatedChildName}</span>
                                </div>
                              )}
                            </div>

                            {/* Row end quick actions */}
                            <div className="flex items-center space-x-1 self-end sm:self-start shrink-0 pt-1 sm:pt-0">
                              <button
                                type="button"
                                onClick={(e) => handleToggleRead(update, e)}
                                className="p-1.5 rounded-lg border border-[#EAE8E1] bg-white text-zinc-400 hover:text-[#C59B27] hover:bg-zinc-50 transition-all cursor-pointer shadow-2xs"
                                title={isUnread ? 'Mark as read' : 'Mark as unread'}
                                aria-label={isUnread ? 'Mark as read' : 'Mark as unread'}
                              >
                                <Check className={`w-3.5 h-3.5 ${update.isRead ? 'text-emerald-600' : ''}`} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleToggleArchive(update, e)}
                                className="p-1.5 rounded-lg border border-[#EAE8E1] bg-white text-zinc-400 hover:text-[#C59B27] hover:bg-zinc-50 transition-all cursor-pointer shadow-2xs"
                                title={update.isArchived ? 'Restore message' : 'Archive message'}
                                aria-label={update.isArchived ? 'Restore message' : 'Archive message'}
                              >
                                <Archive className={`w-3.5 h-3.5 ${update.isArchived ? 'text-[#C59B27]' : ''}`} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination */}
                    {pagination && pagination.pages > 1 && (
                      <div className="flex items-center justify-between pt-3 border-t border-[#EAE8E1] text-xs text-zinc-500">
                        <span>
                          Showing page <strong>{pagination.page}</strong> of {pagination.pages} ({pagination.total} messages)
                        </span>
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            disabled={pagination.page <= 1}
                            onClick={() => fetchUpdates(pagination.page - 1, false, selectedEventId)}
                            className="p-1.5 border border-[#EAE8E1] rounded-lg text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={pagination.page >= pagination.pages}
                            onClick={() => fetchUpdates(pagination.page + 1, false, selectedEventId)}
                            className="p-1.5 border border-[#EAE8E1] rounded-lg text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

            </div>

            {/* RIGHT SIDE: SELECTED MESSAGE DETAIL PANEL */}
            <div className="lg:col-span-5">
              {selectedUpdate ? (
                <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs space-y-5 sticky top-6">
                  
                  {/* Panel Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-semibold text-zinc-700 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded">
                        {formatHumanType(selectedUpdate.type)}
                      </span>
                      {selectedUpdate.priority === 'urgent' && (
                        <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                          Urgent
                        </span>
                      )}
                      {selectedUpdate.priority === 'important' && (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                          Important
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedUpdate(null)}
                      className="text-zinc-400 hover:text-zinc-700 p-1 rounded-lg cursor-pointer"
                      aria-label="Close message details"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Sender & Received Info */}
                  <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3.5 space-y-1">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-full bg-white border border-[#EAE8E1] text-[#C59B27] font-semibold text-xs flex items-center justify-center shrink-0">
                        {selectedUpdate.senderName ? selectedUpdate.senderName[0].toUpperCase() : 'U'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[#18181B] truncate">{selectedUpdate.senderName}</div>
                        <div className="text-[11px] text-zinc-500">
                          {formatHumanSenderRole(selectedUpdate.senderRole)}
                        </div>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-[#EAE8E1] text-[11px] text-zinc-400 flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Received: {formatPremiumDateDetail(selectedUpdate.createdAt)}</span>
                    </div>
                  </div>

                  {/* Message Title & Full Body */}
                  <div className="space-y-2">
                    <h2 className="text-sm font-bold text-[#18181B] leading-snug">
                      {selectedUpdate.title}
                    </h2>
                    <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3.5 text-xs text-zinc-700 leading-relaxed whitespace-pre-wrap">
                      {selectedUpdate.bodyFull}
                    </div>
                  </div>

                  {/* Related Metadata */}
                  {(selectedUpdate.relatedChildName || selectedUpdate.actionStatus !== 'n/a') && (
                    <div className="border border-[#EAE8E1] rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider pb-1 border-b border-zinc-100">
                        Related information
                      </div>

                      {selectedUpdate.relatedChildName && (
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-500">Child:</span>
                          <span className="font-semibold text-zinc-900">{selectedUpdate.relatedChildName}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center">
                        <span className="text-zinc-500">Delivery status:</span>
                        <span className="font-medium text-emerald-700">Delivered</span>
                      </div>

                      {selectedUpdate.actionStatus !== 'n/a' && (
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-500">Attention status:</span>
                          <span className={`font-semibold ${
                            selectedUpdate.actionStatus === 'resolved'
                              ? 'text-emerald-700'
                              : selectedUpdate.actionStatus === 'acknowledged'
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}>
                            {selectedUpdate.actionStatus === 'resolved' ? 'Resolved' : selectedUpdate.actionStatus === 'acknowledged' ? 'Acknowledged' : 'Needs attention'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Operational Actions */}
                  <div className="space-y-2 pt-1">
                    {/* Primary actions */}
                    {selectedUpdate.targetUrl && (
                      <button
                        type="button"
                        onClick={() => onNavigate(selectedUpdate.targetUrl)}
                        className="w-full bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open related review</span>
                      </button>
                    )}

                    {/* Resolve concern button if open */}
                    {(selectedUpdate.actionStatus === 'open' || selectedUpdate.actionStatus === 'acknowledged') && (
                      <button
                        type="button"
                        onClick={() => handleOpenResolveModal(selectedUpdate)}
                        className="w-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Resolve concern</span>
                      </button>
                    )}

                    {/* Secondary row */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleToggleRead(selectedUpdate, e)}
                        className="flex-1 bg-zinc-50 hover:bg-zinc-100 border border-[#EAE8E1] text-[#18181B] text-xs font-medium py-2 rounded-xl transition-all flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 text-[#C59B27]" />
                        <span>{selectedUpdate.isRead ? 'Mark as unread' : 'Mark as read'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleToggleArchive(selectedUpdate, e)}
                        className="flex-1 bg-zinc-50 hover:bg-zinc-100 border border-[#EAE8E1] text-[#18181B] text-xs font-medium py-2 rounded-xl transition-all flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <Archive className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{selectedUpdate.isArchived ? 'Restore' : 'Archive'}</span>
                      </button>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="bg-white border border-[#EAE8E1] rounded-2xl p-10 text-center space-y-2 shadow-2xs">
                  <h3 className="text-sm font-semibold text-[#18181B]">Select a message</h3>
                  <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                    Choose a message from the list to read it and see any available actions.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      ) : (
        /* 5. SEND ANNOUNCEMENT COMPOSER TAB */
        <div className="space-y-6">
          {/* Dispatch Summary Banner */}
          {dispatchSummary && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-[#18181B]">Update sent</h4>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {dispatchSummary.message || `Delivered to ${dispatchSummary.recipients || dispatchSummary.sent || dispatchSummary.requested || 0} recipient(s).`}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setDispatchSummary(null)}
                className="text-xs text-zinc-500 hover:text-zinc-800 font-medium cursor-pointer self-end sm:self-auto"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Delivery Channel Notice */}
          {(() => {
            const readiness = providerStatus.whatsappReadiness;
            const isWaConfigured = readiness?.configured ?? whatsappEnabled;
            const optedInCount = channelEligibility?.whatsappOptedIn ?? 0;

            let waNotice: string | null = null;
            if (!isWaConfigured) {
              waNotice = 'WhatsApp setup incomplete';
            } else if (providerStatus.whatsappFailure || readiness?.statusMessage?.includes('temporarily')) {
              waNotice = 'WhatsApp is temporarily unavailable.';
            } else if (isWaConfigured && optedInCount === 0) {
              waNotice = 'WhatsApp is ready. No parents in this audience have enabled WhatsApp updates yet.';
            }

            if (!emailEnabled || waNotice) {
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 flex items-start space-x-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-semibold block text-zinc-900">Communication notice</span>
                    {!emailEnabled && (
                      <p className="leading-relaxed text-zinc-600">Email is not available right now.</p>
                    )}
                    {waNotice && (
                      <p className="leading-relaxed text-zinc-600">{waNotice}</p>
                    )}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Two column composer layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left column: Form */}
            <div className="lg:col-span-7 bg-white border border-[#EAE8E1] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-5">
              <div className="pb-3 border-b border-[#EAE8E1]">
                <h2 className="text-base font-bold text-[#18181B]">Send announcement</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Compose and send updates to parents and event groups.</p>
              </div>

              {/* Group & Type Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider block">
                    Send to
                  </label>
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] cursor-pointer"
                  >
                    {recipientGroups.map(group => {
                      const groupLabel = group.key === 'all_parents' ? 'All current-event parents' : group.label;
                      return (
                        <option key={group.key} value={group.key}>
                          {groupLabel} ({group.count} {group.count === 1 ? 'contact' : 'contacts'})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider block">
                    Message type
                  </label>
                  <select
                    value={selectedType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] cursor-pointer"
                  >
                    {messageTypes.map(type => (
                      <option key={type.key} value={type.key}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Specific parents searchable multi-select */}
              {isSpecificParents && (
                <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-[#18181B] block">Select specific parents</span>
                      <p className="text-[11px] text-zinc-500">
                        Choose recipient parents for this announcement (one message per parent).
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={selectAllFilteredParents}
                        className="text-[11px] font-medium text-[#C59B27] hover:underline cursor-pointer"
                      >
                        Select all shown ({filteredParents.length})
                      </button>
                      <span className="text-zinc-300">•</span>
                      <button
                        type="button"
                        onClick={clearSelectedParents}
                        className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 cursor-pointer"
                      >
                        Clear ({selectedParentIds.length})
                      </button>
                    </div>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={parentSearchQuery}
                      onChange={(e) => setParentSearchQuery(e.target.value)}
                      placeholder="Search by parent name, child name, email, or phone..."
                      className="w-full pl-8 pr-8 py-1.5 bg-white border border-[#EAE8E1] rounded-lg text-xs text-[#18181B] placeholder:text-zinc-400 focus:outline-none focus:border-[#C59B27]"
                    />
                    {parentSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setParentSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Parent list */}
                  <div className="max-h-56 overflow-y-auto divide-y divide-[#EAE8E1] border border-[#EAE8E1] rounded-lg bg-white">
                    {filteredParents.length === 0 ? (
                      <div className="p-4 text-center text-xs text-zinc-400">
                        No parents match &quot;{parentSearchQuery}&quot;
                      </div>
                    ) : (
                      filteredParents.map((parent) => {
                        const isSelected = selectedParentIds.includes(parent.id);
                        const childSummary = parent.childCount > 0
                          ? `${parent.childCount} ${parent.childCount === 1 ? 'child' : 'children'}`
                          : 'No linked children';
                        const isOptedIn = parent.whatsappConsentStatus === 'opted_in';

                        return (
                          <label
                            key={parent.id}
                            className={`flex items-center justify-between p-2.5 hover:bg-zinc-50 cursor-pointer transition-colors ${
                              isSelected ? 'bg-amber-50/40' : ''
                            }`}
                          >
                            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectParent(parent.id)}
                                className="rounded border-zinc-300 text-[#C59B27] focus:ring-[#C59B27] cursor-pointer"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-semibold text-[#18181B] block truncate">
                                  {parent.name || 'Unnamed parent'}
                                </span>
                                <span className="text-[11px] text-zinc-500 block truncate">
                                  {childSummary}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 shrink-0 ml-2">
                              {isOptedIn ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center space-x-1">
                                  <Check className="w-2.5 h-2.5 inline" />
                                  <span>WhatsApp Opted In</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-500">
                                  WhatsApp Unconsented
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>

                  {/* Selection summary */}
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                    <span>
                      {selectedParentIds.length} of {eventParents.length} parents selected
                    </span>
                    <span className="font-medium text-[#18181B]">
                      {selectedParentIds.length} unique {selectedParentIds.length === 1 ? 'recipient' : 'recipients'}
                    </span>
                  </div>
                </div>
              )}

              {/* Send through / Delivery channels */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider block">
                  Send through
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    {
                      id: 'in_app',
                      label: 'In-app',
                      desc: 'Notification centre',
                      countLabel: effectiveEligibility ? `${effectiveEligibility.inApp} eligible` : 'Eligible contacts',
                      icon: Bell,
                      enabled: true
                    },
                    {
                      id: 'push',
                      label: 'Push',
                      desc: 'Registered devices',
                      countLabel: effectiveEligibility ? `${effectiveEligibility.push} eligible` : 'Registered devices',
                      icon: Smartphone,
                      enabled: true
                    },
                    {
                      id: 'email',
                      label: 'Email',
                      desc: 'Account email addresses',
                      countLabel: effectiveEligibility ? `${effectiveEligibility.email} eligible` : (emailEnabled ? 'Account email addresses' : 'Email provider not configured'),
                      icon: Mail,
                      enabled: emailEnabled
                    },
                    {
                      id: 'whatsapp',
                      label: 'WhatsApp',
                      desc: 'Parents who opted in',
                      countLabel: isSpecificParents
                        ? `${effectiveEligibility ? effectiveEligibility.whatsappOptedIn : 0} of ${selectedParentsList.length} eligible`
                        : (effectiveEligibility ? `${effectiveEligibility.whatsappOptedIn} opted in` : 'Parents who opted in'),
                      icon: Phone,
                      enabled: whatsappEnabled && (effectiveEligibility ? effectiveEligibility.whatsappOptedIn > 0 : false)
                    }
                  ].map(ch => {
                    const SelectedIcon = ch.icon;
                    const isChecked = selectedChannels.includes(ch.id);
                    const isDisabled = !ch.enabled;
                    return (
                      <label
                        key={ch.id}
                        className={`p-3 rounded-xl border flex items-start space-x-3 transition-all cursor-pointer select-none ${
                          isDisabled
                            ? 'border-zinc-200 bg-zinc-50 text-zinc-400 opacity-60 cursor-not-allowed'
                            : isChecked
                            ? 'border-[#C59B27] bg-[#C59B27]/5 text-[#18181B]'
                            : 'border-[#EAE8E1] bg-white text-zinc-600 hover:bg-zinc-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isDisabled}
                          checked={isChecked}
                          onChange={() => !isDisabled && toggleChannel(ch.id)}
                          className="mt-0.5 rounded border-zinc-300 text-[#C59B27] focus:ring-[#C59B27] cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center space-x-2">
                              <SelectedIcon className={`w-3.5 h-3.5 ${isDisabled ? 'text-zinc-400' : isChecked ? 'text-[#C59B27]' : 'text-zinc-500'}`} />
                              <span className="text-xs font-semibold">{ch.label}</span>
                            </div>
                            <span className={`text-[10px] font-medium ${isChecked ? 'text-[#C59B27]' : 'text-zinc-400'}`}>
                              {ch.countLabel}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-400 block mt-0.5 leading-tight">{ch.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Title / subject */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider block">
                  Title / subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter announcement title or subject..."
                  className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27]"
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider block">
                  Message
                </label>
                <textarea
                  ref={bodyRef}
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your announcement text here..."
                  className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] leading-relaxed resize-y min-h-[140px]"
                />
              </div>

              {/* Personalisation details board */}
              <div className="space-y-2 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3.5">
                <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Insert details
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TOKENS.map(token => (
                    <button
                      key={token.key}
                      type="button"
                      onClick={() => handleInsertToken(token.key)}
                      className="bg-white border border-[#EAE8E1] rounded-lg px-2.5 py-1 text-[11px] text-[#18181B] hover:border-[#C59B27] hover:bg-[#C59B27]/5 cursor-pointer flex items-center space-x-1 transition-colors"
                    >
                      <span className="font-semibold text-[#C59B27]">{token.key}</span>
                      <span className="text-zinc-400 text-[10px] hidden sm:inline">({token.label})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-[#EAE8E1]">
                <span className="text-xs text-zinc-500">
                  Sending to: <strong>{activeGroupRecipients} recipient{activeGroupRecipients === 1 ? '' : 's'}</strong>
                </span>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    onClick={handleSaveDraft}
                    disabled={savingDraft || actionLoading}
                    className="text-xs cursor-pointer flex items-center space-x-1.5"
                  >
                    {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Save draft</span>
                  </Button>

                  <button
                    type="button"
                    onClick={handleSendRequest}
                    disabled={actionLoading || !body.trim() || activeGroupRecipients === 0 || selectedChannels.length === 0 || (selectedChannels.includes('email') && !emailEnabled) || (selectedChannels.includes('whatsapp') && (!whatsappEnabled || (effectiveEligibility?.whatsappOptedIn === 0)))}
                    className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                  >
                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Send announcement</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Right column: Preview, Sender Details, Recent Activity */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Preview Container */}
              <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
                  <div className="flex items-center space-x-2">
                    <Eye className="w-4 h-4 text-[#C59B27]" />
                    <h3 className="text-sm font-bold text-[#18181B]">Preview</h3>
                  </div>

                  <div className="flex items-center bg-zinc-50 p-1 rounded-xl border border-[#EAE8E1] gap-1 flex-wrap">
                    {(['push', 'in_app', 'email', 'whatsapp'] as const).map((chKey) => {
                      const labels: Record<string, string> = {
                        push: 'Push',
                        in_app: 'In-app',
                        email: 'Email',
                        whatsapp: 'WhatsApp'
                      };
                      const isSelectedChannel = selectedChannels.includes(chKey);
                      return (
                        <button
                          key={chKey}
                          type="button"
                          onClick={() => setPreviewTab(chKey)}
                          className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg transition-all cursor-pointer ${
                            previewTab === chKey
                              ? 'bg-white text-[#18181B] shadow-2xs'
                              : isSelectedChannel
                              ? 'text-zinc-600 hover:text-zinc-900'
                              : 'text-zinc-400 hover:text-zinc-600'
                          }`}
                        >
                          {labels[chKey]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {isSpecificParents && (
                  <div className="px-3 py-2 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start space-x-2">
                    <User className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">
                        Previewing as {previewRepresentativeParent || selectedParentsList[0]?.name || 'Representative parent'}
                      </div>
                      <p className="text-[11px] text-amber-700/90 mt-0.5">
                        This preview demonstrates token substitution for a representative selected parent. Each selected parent receives their own personalized copy.
                      </p>
                    </div>
                  </div>
                )}

                <div className="border border-[#EAE8E1] rounded-xl bg-[#FAF9F6] p-4 min-h-[180px]">
                  {!body.trim() && !subject.trim() ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center space-y-2 text-zinc-400">
                      <MessageSquare className="w-6 h-6 text-zinc-300" />
                      <p className="text-xs">Enter message text to see sample preview.</p>
                    </div>
                  ) : previewTab === 'push' ? (
                    /* Calm, light Koinonia push notification preview - no black slab, no fake OS screen */
                    <div className="bg-[#FFFDF9] text-[#18181B] rounded-xl p-4 border border-[#EAE8E1] shadow-2xs space-y-2.5 font-sans">
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <div className="flex items-center space-x-1.5">
                          <div className="w-5 h-5 rounded-full bg-[#C59B27]/15 text-[#C59B27] flex items-center justify-center text-[10px] font-bold">
                            K
                          </div>
                          <span className="font-semibold text-zinc-800">Koinonia Children & Teens</span>
                        </div>
                        <span className="text-zinc-400 text-[10px]">Now</span>
                      </div>
                      <div className="text-xs font-bold text-[#18181B]">
                        {subject.trim() || 'Important Event Details — The General Assembly'}
                      </div>
                      <div className="text-xs text-zinc-600 leading-relaxed">
                        {body.trim()
                          ? (body.length > 140 ? body.slice(0, 140) + '…' : body)
                          : 'You have a new update for The General Assembly.'}
                      </div>
                      <div className="text-[10px] text-zinc-400 pt-2 border-t border-[#EAE8E1] flex items-center justify-between">
                        <span>Push notification</span>
                        <span className="text-[#C59B27] font-medium">Delivered to registered devices</span>
                      </div>
                    </div>
                  ) : previewTab === 'in_app' ? (
                    <div className="bg-[#FFFDF9] border border-[#EAE8E1] rounded-xl p-4 shadow-2xs space-y-2 font-sans">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold bg-[#C59B27]/10 text-[#C59B27] px-2 py-0.5 rounded">Announcement</span>
                        <span className="text-[10px] text-zinc-400">Just now</span>
                      </div>
                      <h4 className="text-xs font-bold text-[#18181B]">{subject.trim() || 'Important Event Details — The General Assembly'}</h4>
                      <p className="text-xs text-zinc-600 line-clamp-4 leading-relaxed whitespace-pre-line">{body || 'You have a new update for The General Assembly.'}</p>
                    </div>
                  ) : previewTab === 'email' ? (
                    <div className="space-y-3 text-xs font-sans">
                      <div className="bg-[#FFFDF9] border border-[#EAE8E1] rounded-lg p-3 text-zinc-600 space-y-1">
                        <div><strong>From:</strong> {providerStatus.senderName || 'Koinonia Global'}</div>
                        <div><strong>Subject:</strong> <span className="text-[#18181B] font-medium">{previewSubject || subject || 'Important Event Details — The General Assembly'}</span></div>
                      </div>
                      <div className="bg-[#FFFDF9] border border-[#EAE8E1] rounded-lg p-3.5 text-zinc-800 leading-relaxed whitespace-pre-line min-h-[120px]">
                        {previewBody || body || 'You have a new update for The General Assembly.'}
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end font-sans">
                      <div className="bg-[#F0F7F4] border border-[#D1E7DD] rounded-2xl rounded-tr-none p-3.5 text-xs text-zinc-800 leading-relaxed max-w-[90%] whitespace-pre-line shadow-2xs">
                        {previewBody || body || 'Important Event Details — The General Assembly\n\nYou have a new update for The General Assembly.'}
                        <div className="text-[10px] text-zinc-400 text-right mt-2">
                          12:00 PM · WhatsApp
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sender Details */}
              <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs space-y-3 font-sans">
                <div className="flex items-center justify-between pb-2 border-b border-[#EAE8E1]">
                  <div className="flex items-center space-x-2">
                    <Settings className="w-4 h-4 text-[#C59B27]" />
                    <h3 className="text-sm font-bold text-[#18181B]">Sender details</h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartEditSettings}
                    className="text-xs text-[#C59B27] font-semibold hover:underline cursor-pointer"
                  >
                    Edit details
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <div className="font-semibold text-sm text-[#18181B]">{providerStatus.senderName || 'Koinonia Global'}</div>
                    <div className="text-zinc-500 text-xs mt-0.5">Reply-to: {providerStatus.replyToEmail || 'info@themandate.dontechservicesconst.com'}</div>
                  </div>

                  <div className="pt-2.5 border-t border-[#EAE8E1] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-zinc-500">Email:</span>
                      <span className={`font-semibold ${emailEnabled ? 'text-emerald-700' : 'text-zinc-400'}`}>
                        {emailEnabled ? 'Ready' : 'Not ready'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-zinc-500">WhatsApp:</span>
                      <span className="font-semibold text-amber-700">
                        {providerStatus.whatsappStatus || 'Setup pending'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* WhatsApp Setup & Super Admin Test Delivery */}
              <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#EAE8E1]">
                  <div className="flex items-center space-x-2">
                    <Phone className="w-4 h-4 text-[#25D366]" />
                    <h3 className="text-sm font-bold text-[#18181B]">WhatsApp setup</h3>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    providerStatus.whatsappReadiness?.configured ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {providerStatus.whatsappReadiness?.configured ? 'Ready' : 'WhatsApp setup incomplete'}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Provider:</span>
                    <span className="font-semibold text-zinc-800 capitalize">
                      {providerStatus.whatsappReadiness?.provider || 'simulated'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Webhook:</span>
                    <span className={`font-semibold ${providerStatus.whatsappReadiness?.webhookConfigured ? 'text-emerald-700' : 'text-zinc-400'}`}>
                      {providerStatus.whatsappReadiness?.webhookConfigured ? 'Active' : 'Unconfigured'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Test send:</span>
                    <span className="font-semibold text-zinc-800">
                      {providerStatus.whatsappReadiness?.testSendAvailable ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Bulk broadcasts:</span>
                    <span className={`font-semibold ${providerStatus.whatsappReadiness?.bulkEnabled ? 'text-emerald-700' : 'text-zinc-400'}`}>
                      {providerStatus.whatsappReadiness?.bulkEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Opted-in parents:</span>
                    <span className="font-semibold text-zinc-800">
                      {channelEligibility?.whatsappOptedIn ?? 0}
                    </span>
                  </div>
                </div>

                {/* Test delivery section */}
                <div className="pt-3 border-t border-[#EAE8E1] space-y-2.5">
                  <div className="font-semibold text-xs text-zinc-900">Test delivery</div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Send a controlled test message to verify provider connectivity and delivery state tracking.
                  </p>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                      Phone number
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        disabled={testSending || !providerStatus.whatsappReadiness?.testSendAvailable}
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        placeholder="+234 800 000 0000"
                        className="flex-1 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-3 py-1.5 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        disabled={testSending || !testPhone.trim() || !providerStatus.whatsappReadiness?.testSendAvailable}
                        onClick={handleSendTestWhatsApp}
                        className="px-3 py-1.5 bg-[#18181B] hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold cursor-pointer transition-all shrink-0"
                      >
                        {testSending ? 'Sending...' : 'Send test'}
                      </button>
                    </div>
                    {!providerStatus.whatsappReadiness?.testSendAvailable && (
                      <p className="text-[11px] text-amber-700 font-medium">
                        WhatsApp setup incomplete. Provider credentials must be configured before test delivery is available.
                      </p>
                    )}
                  </div>

                  {/* Delivery States Stepper */}
                  {testStatus && (
                    <div className="mt-3 p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-700">Delivery state:</span>
                        <span className={`font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full ${
                          testStatus.status === 'read' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          testStatus.status === 'delivered' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          testStatus.status === 'sent' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                          testStatus.status === 'queued' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {testStatus.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1 text-center text-[9px] font-semibold pt-1">
                        {['Queued', 'Sent', 'Delivered', 'Read'].map((st) => {
                          const stateOrder = ['queued', 'sent', 'delivered', 'read'];
                          const currentIdx = stateOrder.indexOf(testStatus.status);
                          const thisIdx = stateOrder.indexOf(st.toLowerCase());
                          const isReached = currentIdx >= thisIdx && testStatus.status !== 'failed';
                          const isCurrent = testStatus.status === st.toLowerCase();

                          return (
                            <div key={st} className="flex flex-col items-center">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                isCurrent
                                  ? 'bg-[#C59B27] text-white ring-2 ring-[#C59B27]/30'
                                  : isReached
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-zinc-200 text-zinc-500'
                              }`}>
                                {isReached && !isCurrent ? '✓' : thisIdx + 1}
                              </div>
                              <span className={`mt-1 ${isCurrent ? 'text-[#18181B] font-bold' : isReached ? 'text-emerald-700' : 'text-zinc-400'}`}>
                                {st}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {testStatus.status === 'failed' && (
                        <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-700 font-medium">
                          Failed: {testStatus.errorMessage || 'Provider delivery error'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Announcements */}
              <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#EAE8E1]">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-zinc-400" />
                    <h3 className="text-sm font-bold text-[#18181B]">Recent announcements</h3>
                  </div>
                  <span className="text-xs text-zinc-400 font-medium">
                    {recentActivity.length} sent
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                  {recentActivity.length === 0 ? (
                    <div className="text-center py-6 text-xs text-zinc-400">
                      No announcements sent yet.
                    </div>
                  ) : (
                    recentActivity.map((log) => (
                      <div 
                        key={log.id}
                        className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-zinc-900 truncate">
                            {log.subject || log.messageType.replace(/_/g, ' ')}
                          </span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            log.status === 'sent' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                          }`}>
                            {log.status === 'sent' ? 'Sent' : 'Not delivered'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 line-clamp-2 leading-normal">
                          {log.body}
                        </p>
                        <div className="text-[10px] text-zinc-400 pt-1 flex justify-between border-t border-zinc-200/60">
                          <span>Group: {log.recipientGroup.replace(/_/g, ' ')}</span>
                          <span>{new Date(log.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* SENDER SETTINGS EDIT MODAL */}
      {isEditingSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => setIsEditingSettings(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs" 
          />
          <form 
            onSubmit={handleSaveSettings}
            className="relative bg-white border border-[#EAE8E1] rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4 animate-fade-in"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
              <div className="flex items-center space-x-2">
                <Settings className="w-4 h-4 text-[#C59B27]" />
                <h4 className="text-base font-bold text-[#18181B]">Edit sender details</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingSettings(false)}
                className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-600 block">Sender name</label>
                <input
                  type="text"
                  value={editedSenderName}
                  onChange={(e) => setEditedSenderName(e.target.value)}
                  placeholder="e.g. Koinonia Global"
                  className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-600 block">Reply-to email</label>
                <input
                  type="email"
                  value={editedReplyTo}
                  onChange={(e) => setEditedReplyTo(e.target.value)}
                  placeholder="e.g. support@koinonia.org"
                  className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27]"
                  required
                />
                <span className="text-[10px] text-zinc-400 block">
                  Parents see this address when replying to announcements.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#EAE8E1]">
              <Button 
                variant="outline" 
                type="button"
                onClick={() => setIsEditingSettings(false)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <button
                type="submit"
                disabled={savingSettings}
                className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              >
                {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save details</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CONFIRMATION MODAL BEFORE SENDING ANNOUNCEMENT */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => setShowConfirmModal(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs" 
          />
          <div className="relative bg-white border border-[#EAE8E1] rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4 animate-fade-in">
            <div className="flex items-center space-x-2.5 pb-3 border-b border-[#EAE8E1]">
              <AlertTriangle className="w-5 h-5 text-[#C59B27] shrink-0" />
              <h4 className="text-base font-bold text-[#18181B]">Send this announcement?</h4>
            </div>

            <div className="space-y-2.5 text-xs text-zinc-600 leading-relaxed">
              <p>
                This will send your message to {activeGroupRecipients} recipient(s). Please confirm you want to proceed.
              </p>
              
              <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 space-y-1.5 text-xs">
                <div>• Recipient group: <strong className="text-zinc-900">{selectedGroup.replace(/_/g, ' ')}</strong></div>
                <div>• Delivery channels: <strong className="text-zinc-900">{selectedChannels.map(c => c === 'in_app' ? 'In-app' : c === 'push' ? 'Push notification' : c.toUpperCase()).join(', ')}</strong></div>
                <div>• Estimated recipients: <strong className="text-emerald-700 font-bold">{activeGroupRecipients} recipient(s)</strong></div>
                {subject && (
                  <div>• Title / Subject: <strong className="text-zinc-900 truncate block">{subject}</strong></div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#EAE8E1]">
              <Button 
                variant="outline" 
                onClick={() => setShowConfirmModal(false)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <button
                onClick={handleConfirmSend}
                className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESOLVE CONCERN MODAL */}
      {resolvingUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => setResolvingUpdate(null)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs" 
          />
          <form 
            onSubmit={handleConfirmResolve}
            className="relative bg-white border border-[#EAE8E1] rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4 animate-fade-in"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
              <div className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-700" />
                <h4 className="text-base font-bold text-[#18181B]">Resolve concern</h4>
              </div>
              <button
                type="button"
                onClick={() => setResolvingUpdate(null)}
                className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-zinc-600 leading-relaxed">
                Add an optional resolution note describing what actions were taken to address this update.
              </p>

              <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs">
                <div className="font-semibold text-zinc-900">{resolvingUpdate.title}</div>
                {resolvingUpdate.relatedChildName && (
                  <div className="text-zinc-500 mt-0.5">Child: {resolvingUpdate.relatedChildName}</div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-600 block">Resolution note</label>
                <textarea
                  rows={3}
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="e.g. Parent confirmed pickup with verified entry pass."
                  className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-2.5 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#EAE8E1]">
              <Button 
                variant="outline" 
                type="button"
                onClick={() => setResolvingUpdate(null)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <button
                type="submit"
                disabled={resolvingAction}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              >
                {resolvingAction ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Mark as resolved</span>
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
