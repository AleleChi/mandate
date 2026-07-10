import React, { useEffect, useState, useRef } from 'react';
import { 
  Users, 
  UserCheck, 
  Clock, 
  ClipboardList, 
  MessageSquare, 
  Send, 
  Save, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Mail, 
  Phone, 
  Sparkles, 
  AlertTriangle,
  Info,
  RefreshCw,
  Settings,
  Search,
  Filter,
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Calendar,
  User,
  ExternalLink,
  Bell,
  BellOff
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';

interface AdminMessagesViewProps {
  onBackToOverview: () => void;
  onNavigate: (route: string) => void;
}

const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
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
  },
  pickup_reminder: {
    subject: 'Dismissal and Pickup Reminder - {Event name}',
    body: 'Dear {Parent name},\n\nThis is a quick reminder that dismissal and checkout for {Child name} will begin at {Pickup time}. Please ensure you present your physical or digital pass at the checkout station.\n\nSee you soon!'
  },
  general_announcement: {
    subject: 'Important Event Details - {Event name}',
    body: 'Dear {Parent name},\n\nWe are looking forward to {Event name}! Please ensure your children arrive with comfortable clothing and their personal water bottles labeled with their names.\n\nWarm regards,\nThe Koinonia Team'
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
  return `${d.toLocaleDateString([], dateOptions)} · ${timeStr}`;
}

function formatPremiumType(typeStr: string) {
  if (!typeStr) return '';
  const map: Record<string, string> = {
    safety_alert: 'Safety alert',
    escalation: 'Escalation',
    parent_message: 'Parent message',
    volunteer_message: 'Volunteer message',
    pass_update: 'Pass update',
    application_update: 'Application update',
    delivery_issue: 'Delivery issue',
    info: 'General info',
    broadcast: 'Broadcast'
  };
  return map[typeStr] || typeStr.charAt(0).toUpperCase() + typeStr.slice(1).replace(/_/g, ' ');
}

export function AdminMessagesView({ onBackToOverview, onNavigate }: AdminMessagesViewProps) {
  const { showSuccess, showError, showInfo } = useNotification();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Messages & Updates Centre state
  const [activeTab, setActiveTab] = useState<'updates' | 'broadcast'>('updates');
  const [updates, setUpdates] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ total: 0, page: 1, limit: 15, pages: 1 });
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState<any | null>(null);

  // Summary card counts state
  const [summaryStats, setSummaryStats] = useState({
    unread: 0,
    openAlerts: 0,
    urgent: 0,
    deliveryIssues: 0
  });
  const [summaryStatsLoading, setSummaryStatsLoading] = useState(false);
  const [summaryStatsError, setSummaryStatsError] = useState<string | null>(null);

  // Filters for Updates Centre
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [senderRoleFilter, setSenderRoleFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Stats from backend
  const [stats, setStats] = useState({
    messagesSent: 0,
    whatsappSent: 0,
    emailSent: 0,
    failed: 0,
    pending: 0
  });

  const [recipientGroups, setRecipientGroups] = useState<any[]>([]);
  const [messageTypes, setMessageTypes] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [providerStatus, setProviderStatus] = useState<any>({
    emailEnabled: false,
    whatsappEnabled: false,
    emailProvider: null,
    whatsappProvider: null,
    senderName: '',
    fromEmail: '',
    replyToEmail: ''
  });

  // Form states
  const [selectedGroup, setSelectedGroup] = useState('all_parents');
  const [selectedType, setSelectedType] = useState('general_announcement');
  const [selectedChannel, setSelectedChannel] = useState<'email' | 'whatsapp' | 'both'>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Preview tab
  const [previewTab, setPreviewTab] = useState<'email' | 'whatsapp'>('email');
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewBody, setPreviewBody] = useState('');

  // Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [dispatchSummary, setDispatchSummary] = useState<any | null>(null);

  // Mobile collapsible and sender settings edit states
  const [showPreviewMobile, setShowPreviewMobile] = useState(false);
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editedSenderName, setEditedSenderName] = useState('');
  const [editedReplyTo, setEditedReplyTo] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessagesData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.admin.getMessages();
      if (data.success) {
        setStats({
          messagesSent: data.stats?.messagesSent || 0,
          whatsappSent: data.stats?.whatsappSent || 0,
          emailSent: data.stats?.emailSent || 0,
          failed: data.stats?.failed || 0,
          pending: data.stats?.pending || 0
        });

        const backendGroups = data.recipientGroups || [
          { key: 'all_parents', label: 'All parents', count: 0 },
          { key: 'selected_children', label: 'Selected children', count: 0 },
          { key: 'under_review', label: 'Under review', count: 0 },
          { key: 'waiting_list', label: 'Waiting list', count: 0 },
          { key: 'not_selected', label: 'Not selected', count: 0 },
          { key: 'pass_ready', label: 'Pass ready', count: 0 }
        ];
        setRecipientGroups(backendGroups);

        setMessageTypes(data.messageTypes || [
          { key: 'pass_ready', label: 'Pass ready' },
          { key: 'review_update', label: 'Review update' },
          { key: 'waiting_list_update', label: 'Waiting list update' },
          { key: 'pickup_reminder', label: 'Pickup reminder' },
          { key: 'general_announcement', label: 'General announcement' }
        ]);

        setRecentActivity(data.recentActivity || []);

        const mEnabled = data.emailEnabled !== false;
        const wEnabled = data.whatsappEnabled !== false;
        setEmailEnabled(mEnabled);
        setWhatsappEnabled(wEnabled);

        if (data.providerStatus) {
          setProviderStatus(data.providerStatus);
        } else {
          setProviderStatus({
            emailEnabled: mEnabled,
            whatsappEnabled: wEnabled,
            emailProvider: mEnabled ? 'resend' : null,
            whatsappProvider: wEnabled ? 'twilio' : null,
            senderName: 'Koinonia Global',
            fromEmail: 'info@themandate.dontechservicesconst.com',
            replyToEmail: 'info@themandate.dontechservicesconst.com'
          });
        }

        // Safe defaults
        let defaultChan: 'email' | 'whatsapp' | 'both' = 'email';
        if (!mEnabled && wEnabled) {
          defaultChan = 'whatsapp';
        } else if (mEnabled && !wEnabled) {
          defaultChan = 'email';
        }

        if (data.latestDraft && !body) {
          setSelectedGroup(data.latestDraft.recipientGroup || 'all_parents');
          setSelectedType(data.latestDraft.messageType || 'general_announcement');
          const draftChan = (data.latestDraft.channel as any) || 'email';
          if (draftChan === 'both' && (!mEnabled || !wEnabled)) {
            setSelectedChannel(mEnabled ? 'email' : 'whatsapp');
          } else if (draftChan === 'email' && !mEnabled) {
            setSelectedChannel(wEnabled ? 'whatsapp' : 'email');
          } else if (draftChan === 'whatsapp' && !wEnabled) {
            setSelectedChannel(mEnabled ? 'email' : 'whatsapp');
          } else {
            setSelectedChannel(draftChan);
          }
          setSubject(data.latestDraft.subject || '');
          setBody(data.latestDraft.body || '');
        } else if (!body) {
          const defaultTemplate = DEFAULT_TEMPLATES.general_announcement;
          setSubject(defaultTemplate.subject);
          setBody(defaultTemplate.body);
          setSelectedChannel(defaultChan);
        }
      }
    } catch (err: any) {
      console.error('Error fetching admin messages dashboard:', err);
      showError('Error', 'Could not load messaging details.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSummaryStats = async () => {
    setSummaryStatsLoading(true);
    setSummaryStatsError(null);
    try {
      const res = await api.adminUpdates.getSummary();
      if (res && res.success && res.summary) {
        setSummaryStats({
          unread: res.summary.unread,
          openAlerts: res.summary.openAlerts,
          urgent: res.summary.urgent,
          deliveryIssues: res.summary.deliveryIssues
        });
      } else {
        setSummaryStatsError('We could not update message totals. Please refresh.');
      }
    } catch (err) {
      console.warn('Failed to fetch summary card statistics:', err);
      setSummaryStatsError('We could not update message totals. Please refresh.');
    } finally {
      setSummaryStatsLoading(false);
    }
  };

  const fetchUpdates = async (page = 1) => {
    setUpdatesLoading(true);
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
        dateTo
      });
      if (res && res.updates) {
        setUpdates(res.updates);
        setPagination(res.pagination);
        setCurrentPage(res.pagination.page);
      }
      // Also fetch stats
      fetchSummaryStats();
    } catch (err) {
      console.error('Error loading updates:', err);
      showError('Failed to load updates.');
    } finally {
      setUpdatesLoading(false);
    }
  };

  const handleViewDetail = async (update: any) => {
    setSelectedUpdate(update);
    // Mark as read if unread
    if (!update.isRead) {
      try {
        await api.adminUpdates.markAsRead(update.rawId);
        // Update local status so we don't have to reload list
        setUpdates(prev => prev.map(u => u.rawId === update.rawId ? { ...u, isRead: true } : u));
        update.isRead = true;
        // Refresh summary stats
        fetchSummaryStats();
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
      fetchSummaryStats();
    } catch (err) {
      showError('Action failed.');
    }
  };

  const handleToggleArchive = async (update: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (update.isArchived) {
        await api.adminUpdates.unarchiveUpdate(update.rawId);
        showSuccess('Update unarchived');
        if (statusFilter === 'archived') {
          setUpdates(prev => prev.filter(u => u.rawId !== update.rawId));
        } else {
          setUpdates(prev => prev.map(u => u.rawId === update.rawId ? { ...u, isArchived: false, archivedAt: null } : u));
        }
      } else {
        await api.adminUpdates.archiveUpdate(update.rawId);
        showSuccess('Update archived');
        if (statusFilter !== 'archived') {
          setUpdates(prev => prev.filter(u => u.rawId !== update.rawId));
        } else {
          setUpdates(prev => prev.map(u => u.rawId === update.rawId ? { ...u, isArchived: true, archivedAt: new Date().toISOString() } : u));
        }
      }
      if (selectedUpdate && selectedUpdate.rawId === update.rawId) {
        setSelectedUpdate(prev => prev ? { ...prev, isArchived: !prev.isArchived } : null);
      }
      fetchSummaryStats();
    } catch (err) {
      showError('Action failed.');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.adminUpdates.markAllAsRead();
      setUpdates(prev => prev.map(u => ({ ...u, isRead: true, readAt: new Date().toISOString() })));
      showSuccess('All updates marked as read');
      fetchUpdates(currentPage);
    } catch (err) {
      showError('Action failed.');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUpdates(1);
  };

  useEffect(() => {
    if (activeTab === 'updates') {
      fetchUpdates(1);
    }
  }, [activeTab, statusFilter, typeFilter, senderRoleFilter, priorityFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchMessagesData();
    fetchSummaryStats();
  }, []);

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
        channel: selectedChannel,
        subject,
        body
      });
      if (res.success && res.preview) {
        setPreviewSubject(res.preview.subject);
        setPreviewBody(res.preview.body);
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
  }, [body, subject, selectedGroup, selectedType, selectedChannel]);

  useEffect(() => {
    if (selectedChannel === 'whatsapp') {
      setPreviewTab('whatsapp');
    } else {
      setPreviewTab('email');
    }
  }, [selectedChannel]);

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    const template = DEFAULT_TEMPLATES[type];
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
    }
  };

  const handleSaveDraft = async () => {
    if (!body.trim()) {
      showError('Error', 'You cannot save an empty draft.');
      return;
    }
    setSavingDraft(true);
    try {
      const res = await api.admin.saveMessageDraft({
        recipientGroup: selectedGroup,
        messageType: selectedType,
        channel: selectedChannel,
        subject,
        body
      });
      if (res.success) {
        showSuccess('Success', 'Draft saved successfully.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Error', parsed.message);
    } finally {
      setSavingDraft(false);
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

  const handleSendRequest = () => {
    if (!body.trim()) {
      showError('Error', 'You cannot send an empty message.');
      return;
    }
    if (selectedChannel !== 'whatsapp' && !subject.trim()) {
      showError('Error', 'Subject is required for Email delivery.');
      return;
    }

    const currentGroup = recipientGroups.find(g => g.key === selectedGroup);
    if (currentGroup && currentGroup.count === 0) {
      showError('Error', 'The selected group has 0 recipients.');
      return;
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
        channel: selectedChannel,
        subject,
        body,
        confirmed: true
      });
      
      if (res.success) {
        setDispatchSummary(res.summary);
        showSuccess('Success', 'Messages sent successfully.');
        setBody('');
        setSubject('');
        fetchMessagesData(true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Error', parsed.message || 'Failed to dispatch messages.');
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
      showError('Error', 'Sender name and Reply-to email are required.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editedReplyTo)) {
      showError('Error', 'Please enter a valid reply-to email address.');
      return;
    }

    setSavingSettings(true);
    try {
      const res = await api.admin.updateMessagesSettings({
        senderName: editedSenderName.trim(),
        replyToEmail: editedReplyTo.trim()
      });
      if (res.success) {
        showSuccess('Success', 'Sender settings updated successfully.');
        setIsEditingSettings(false);
        fetchMessagesData(true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Error', parsed.message || 'Failed to update sender settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const activeGroupRecipients = recipientGroups.find(g => g.key === selectedGroup)?.count ?? 0;

  if (loading) {
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
      data-view-version="admin-messages-updates-centre-v2-premium" 
      className="flex-1 flex flex-col overflow-y-auto min-w-0 bg-[#FAF9F6] p-4 sm:p-8 space-y-6 animate-fade-in"
    >
      {/* PAGE HEADER */}
      <div 
        data-component-version="admin-messages-header-v2-premium"
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-[#EAE8E1] space-y-4 sm:space-y-0"
      >
        <div>
          <h1 className="font-serif text-3xl font-bold text-[#18181B] tracking-tight">
            Messages & updates
          </h1>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            Review care alerts, volunteer messages, parent updates, and delivery activity.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              if (activeTab === 'updates') {
                fetchUpdates(currentPage);
              } else {
                fetchMessagesData(false);
              }
            }}
            className="p-2 bg-white border border-[#EAE8E1] rounded-xl text-zinc-500 hover:text-[#18181B] hover:bg-zinc-50 transition-all cursor-pointer shadow-2xs"
            title="Refresh Details"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Button 
            id="back-to-dashboard-btn"
            variant="outline" 
            onClick={onBackToOverview}
            className="text-xs cursor-pointer shadow-2xs"
          >
            Overview Dashboard
          </Button>
        </div>
      </div>

      {/* TABS SELECTOR */}
      <div className="flex border-b border-[#EAE8E1] space-x-6">
        <button
          onClick={() => setActiveTab('updates')}
          className={`pb-3 text-sm font-semibold tracking-wide transition-all border-b-2 cursor-pointer ${
            activeTab === 'updates'
              ? 'border-[#C59B27] text-[#18181B]'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
        >
          Messages & Updates Centre
        </button>
        <button
          onClick={() => setActiveTab('broadcast')}
          className={`pb-3 text-sm font-semibold tracking-wide transition-all border-b-2 cursor-pointer ${
            activeTab === 'broadcast'
              ? 'border-[#C59B27] text-[#18181B]'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
        >
          Broadcast Composer
        </button>
      </div>

      {activeTab === 'updates' ? (
        <div className="space-y-6">
          
          {/* SUMMARY CARDS ROW */}
          <div 
            data-component-version="admin-messages-summary-v2-live"
            data-component-override-api="admin-updates-summary-api-v1-live"
            data-component-sync-version="admin-message-list-stats-sync-v1"
            className="space-y-3"
          >
            {summaryStatsError && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 rounded-xl flex items-center justify-between">
                <span>{summaryStatsError}</span>
                <button 
                  onClick={() => fetchSummaryStats()} 
                  className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold px-2 py-1 rounded cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in relative">
              {summaryStatsLoading && (
                <div className="absolute inset-0 bg-white/40 backdrop-blur-xs flex items-center justify-center z-10 rounded-2xl">
                  <span className="text-xs text-zinc-500 font-mono flex items-center space-x-1">
                    <span className="animate-spin inline-block mr-1">⚡</span>
                    <span>Updating counts...</span>
                  </span>
                </div>
              )}

              {/* Card 1: Unread */}
              <div 
                onClick={() => setStatusFilter('unread')}
                className="bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1.5 hover:border-[#C59B27] hover:bg-[#C59B27]/5 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Unread</span>
                  <span className="w-2 h-2 rounded-full bg-[#C59B27] group-hover:animate-ping" />
                </div>
                <div className="flex items-baseline space-x-1">
                  <span className="font-serif text-2xl font-bold text-zinc-900">{summaryStats.unread}</span>
                </div>
                <p className="text-[9px] text-zinc-400 font-medium">New notifications & care alerts</p>
              </div>

              {/* Card 2: Open Alerts */}
              <div 
                onClick={() => setStatusFilter('open')}
                className="bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1.5 hover:border-[#C59B27] hover:bg-[#C59B27]/5 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Open Alerts</span>
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                </div>
                <div className="flex items-baseline space-x-1">
                  <span className="font-serif text-2xl font-bold text-rose-600">{summaryStats.openAlerts}</span>
                </div>
                <p className="text-[9px] text-zinc-400 font-medium">Active unresolved volunteer alerts</p>
              </div>

              {/* Card 3: Urgent */}
              <div 
                onClick={() => setPriorityFilter('urgent')}
                className="bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1.5 hover:border-[#C59B27] hover:bg-[#C59B27]/5 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Urgent</span>
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                </div>
                <div className="flex items-baseline space-x-1">
                  <span className="font-serif text-2xl font-bold text-amber-600">{summaryStats.urgent}</span>
                </div>
                <p className="text-[9px] text-zinc-400 font-medium">Immediate priority attention items</p>
              </div>

              {/* Card 4: Delivery Issues */}
              <div 
                className="bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1.5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Delivery Issues</span>
                  <span className="w-2 h-2 rounded-full bg-zinc-300" />
                </div>
                <div className="flex items-baseline space-x-1">
                  <span className="font-serif text-2xl font-bold text-zinc-800">{summaryStats.deliveryIssues}</span>
                </div>
                <p className="text-[9px] text-zinc-400 font-medium">Failed emails or whatsapp dispatches</p>
              </div>
            </div>
          </div>

          <div 
            data-component-version="admin-messages-responsive-v1"
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fade-in"
          >
            {/* LEFT SIDE: LIST & FILTERS */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* FILTER BLOCK */}
              <div 
                data-component-version="admin-updates-filters-v2-premium"
                className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-xs space-y-4"
              >
                
                {/* SEARCH */}
                <form onSubmit={handleSearchSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder="Search messages, senders, child names..."
                      className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#18181B] placeholder-zinc-400 focus:outline-none focus:border-[#C59B27] focus:ring-1 focus:ring-[#C59B27] transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-xs hover:shadow-sm"
                  >
                    Search
                  </button>
                </form>

                {/* TWO ROWS OF DROPDOWNS */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {/* PRIORITY */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block font-sans">Priority</label>
                    <select
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] cursor-pointer"
                    >
                      <option value="all">All Priorities</option>
                      <option value="normal">Normal</option>
                      <option value="important">Important</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  {/* SENDER ROLE */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block font-sans">Sender Role</label>
                    <select
                      value={senderRoleFilter}
                      onChange={(e) => setSenderRoleFilter(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] cursor-pointer"
                    >
                      <option value="all">All Senders</option>
                      <option value="admin">Admins</option>
                      <option value="volunteer">Volunteers</option>
                      <option value="parent">Parents</option>
                      <option value="system">Platform Updates</option>
                    </select>
                  </div>

                  {/* TYPE */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block font-sans">Category</label>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] cursor-pointer"
                    >
                      <option value="all">All Types</option>
                      <option value="safety_alert">Safety Alert</option>
                      <option value="escalation">Escalation</option>
                      <option value="info">General Info</option>
                      <option value="broadcast">Broadcast</option>
                    </select>
                  </div>

                  {/* STATUS */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block font-sans">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] cursor-pointer"
                    >
                      <option value="all">All</option>
                      <option value="unread">Unread</option>
                      <option value="read">Read</option>
                      <option value="open">Open Alerts</option>
                      <option value="acknowledged">Acknowledged Alerts</option>
                      <option value="resolved">Resolved Alerts</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>

                {/* DATE FILTERS & BULK ACTIONS */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-3 border-t border-[#EAE8E1] gap-3">
                  {/* DATES */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                    <div className="flex items-center space-x-1.5">
                      <span>From:</span>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-lg px-2 py-1 text-xs text-zinc-700 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span>To:</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-lg px-2 py-1 text-xs text-zinc-700 focus:outline-none"
                      />
                    </div>
                    {(dateFrom || dateTo || searchFilter) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDateFrom('');
                          setDateTo('');
                          setSearchFilter('');
                          // Trigger reload
                          setTimeout(() => fetchUpdates(1), 50);
                        }}
                        className="text-[10px] text-[#C59B27] hover:underline font-semibold cursor-pointer"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>

                  {/* BULK ACTIONS */}
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      className="text-[11px] font-semibold text-[#18181B] bg-zinc-100 hover:bg-zinc-200 border border-[#EAE8E1] px-3.5 py-2 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 text-[#C59B27]" />
                      <span>Mark all read</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* LIST CARDS */}
              <div className="space-y-3">
                {updatesLoading ? (
                  <div className="bg-white border border-[#EAE8E1] rounded-2xl p-16 flex flex-col items-center justify-center space-y-4" data-component-version="admin-updates-state-v2-premium">
                    <Loader2 className="w-8 h-8 text-[#C59B27] animate-spin" />
                    <span className="text-xs text-[#A37B1B] font-serif font-medium">Loading updates & alerts...</span>
                  </div>
                ) : updates.length === 0 ? (
                  <div className="bg-white border border-[#EAE8E1] rounded-2xl p-16 text-center space-y-4 max-w-xl mx-auto" data-component-version="admin-updates-state-v2-premium">
                    <div className="w-12 h-12 bg-[#FAF9F6] border border-[#EAE8E1] rounded-full flex items-center justify-center mx-auto shadow-xs">
                      <BellOff className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="font-serif font-bold text-base text-[#18181B]">No updates found</h3>
                      <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto">
                        There are no active messages or care updates matching your current filter parameters.
                      </p>
                    </div>
                    {(priorityFilter !== 'all' || statusFilter !== 'all' || typeFilter !== 'all' || senderRoleFilter !== 'all' || searchFilter || dateFrom || dateTo) && (
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
                          setTimeout(() => fetchUpdates(1), 50);
                        }}
                        className="inline-flex items-center space-x-1 px-4 py-1.5 text-xs bg-zinc-100 hover:bg-zinc-200 text-[#18181B] font-semibold rounded-xl border border-[#EAE8E1] transition-all cursor-pointer"
                      >
                        <span>Clear all filters</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {updates.map((update) => {
                        const isUnread = !update.isRead;
                        const isSelected = selectedUpdate?.rawId === update.rawId;
                        
                        const priorityStyle = update.priority === 'urgent'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200 font-semibold'
                          : update.priority === 'important'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200 font-semibold'
                          : 'bg-zinc-100 text-zinc-700 border border-zinc-200';

                        const catStyle = update.type === 'safety_alert'
                          ? 'bg-rose-100/50 text-rose-800 border border-rose-100'
                          : update.type === 'escalation'
                          ? 'bg-amber-100/50 text-amber-800 border border-amber-100'
                          : 'bg-zinc-100/50 text-zinc-800 border border-zinc-100';

                        // Format sender role nicely
                        let cleanRole = update.senderRole;
                        if (update.senderRole) {
                          const rLower = update.senderRole.toLowerCase();
                          if (rLower.includes('volunteer')) cleanRole = 'Volunteer';
                          else if (rLower.includes('parent')) cleanRole = 'Parent';
                          else if (rLower.includes('super')) cleanRole = 'Super Admin';
                          else if (rLower.includes('admin')) cleanRole = 'Admin';
                          else if (rLower.includes('system')) cleanRole = 'Platform Updates';
                        }

                        return (
                          <div
                            key={update.id}
                            onClick={() => handleViewDetail(update)}
                            data-component-version="admin-update-card-v2-premium"
                            className={`group relative border rounded-2xl p-5 transition-all duration-200 cursor-pointer flex flex-col md:flex-row md:items-start justify-between gap-4 ${
                              isSelected
                                ? 'border-[#C59B27] bg-[#C59B27]/5 shadow-xs'
                                : isUnread
                                ? 'border-[#EAE8E1] bg-[#C59B27]/3 hover:bg-[#C59B27]/8'
                                : 'border-[#EAE8E1] bg-white hover:bg-zinc-50 shadow-2xs'
                            }`}
                          >
                            {/* Warm left border indicator for unread item */}
                            {isUnread && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#C59B27] rounded-l-2xl" />
                            )}

                            {/* Left: Unread dot & main body */}
                            <div className="flex-1 flex items-start space-x-3.5 min-w-0">
                              {isUnread && (
                                <span className="w-2.5 h-2.5 bg-[#C59B27] rounded-full shrink-0 mt-1.5 animate-pulse" />
                              )}
                              <div className="space-y-2 min-w-0">
                                <div 
                                  data-component-version="admin-update-badges-v2-premium"
                                  className="flex flex-wrap items-center gap-2"
                                >
                                  <span className={`text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${catStyle}`}>
                                    {formatPremiumType(update.type)}
                                  </span>
                                  <span className={`text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${priorityStyle}`}>
                                    {update.priority === 'normal' ? 'Normal' : update.priority === 'important' ? 'Important' : 'Urgent'}
                                  </span>
                                  {update.isArchived && (
                                    <span className="text-[9px] bg-zinc-100 text-zinc-500 border border-zinc-200 px-2 py-0.5 rounded-full font-semibold">
                                      Archived
                                    </span>
                                  )}
                                </div>
                                <h3 className="font-serif font-bold text-sm text-[#18181B] group-hover:text-[#C59B27] transition-all truncate">
                                  {update.title}
                                </h3>
                                <p className="text-zinc-500 text-xs leading-relaxed line-clamp-2">
                                  {update.bodyPreview}
                                </p>
                                {/* Metadata footer */}
                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-400 font-mono">
                                  <span className="flex items-center space-x-1 font-sans">
                                    <span className="w-4 h-4 rounded-full bg-[#FAF9F6] border border-[#EAE8E1] text-[#A37B1B] text-[8px] font-bold flex items-center justify-center shrink-0">
                                      {update.senderName ? update.senderName[0].toUpperCase() : '?'}
                                    </span>
                                    <span className="text-zinc-600 font-semibold">{update.senderName}</span>
                                    <span className="text-zinc-400">({cleanRole})</span>
                                  </span>
                                  <span>•</span>
                                  <span data-component-version="admin-update-date-format-v1">
                                    {formatPremiumDate(update.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Right: Quick action overlays */}
                            <div className="flex items-center space-x-1.5 self-end md:self-start shrink-0">
                              <button
                                type="button"
                                onClick={(e) => handleToggleRead(update, e)}
                                className="p-2 rounded-xl border border-[#EAE8E1] bg-white text-zinc-400 hover:text-[#C59B27] hover:bg-zinc-50 transition-all cursor-pointer shadow-2xs"
                                title={isUnread ? "Mark as Read" : "Mark as Unread"}
                              >
                                <Check className={`w-3.5 h-3.5 ${update.isRead ? 'text-emerald-600' : ''}`} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleToggleArchive(update, e)}
                                className="p-2 rounded-xl border border-[#EAE8E1] bg-white text-zinc-400 hover:text-[#C59B27] hover:bg-zinc-50 transition-all cursor-pointer shadow-2xs"
                                title={update.isArchived ? "Restore from Archive" : "Archive Update"}
                              >
                                <Archive className={`w-3.5 h-3.5 ${update.isArchived ? 'text-[#C59B27]' : ''}`} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* PAGINATION CONTROLS */}
                    {pagination && pagination.pages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t border-[#EAE8E1]">
                        <span className="text-xs text-zinc-500">
                          Showing page <strong>{pagination.page}</strong> of {pagination.pages} ({pagination.total} records)
                        </span>
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            disabled={pagination.page <= 1}
                            onClick={() => fetchUpdates(pagination.page - 1)}
                            className="p-2 border border-[#EAE8E1] rounded-xl text-zinc-500 hover:bg-[#C59B27]/5 hover:text-[#C59B27] disabled:opacity-50 disabled:hover:bg-transparent cursor-pointer transition-all"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={pagination.page >= pagination.pages}
                            onClick={() => fetchUpdates(pagination.page + 1)}
                            className="p-2 border border-[#EAE8E1] rounded-xl text-zinc-500 hover:bg-[#C59B27]/5 hover:text-[#C59B27] disabled:opacity-50 disabled:hover:bg-transparent cursor-pointer transition-all"
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

            {/* RIGHT SIDE: SELECTED DETAIL PANEL */}
            <div className="lg:col-span-5 h-full">
              {selectedUpdate ? (
                <div 
                  data-view-version="admin-update-detail-v2-premium"
                  className="bg-white border border-[#EAE8E1] rounded-2xl p-6 shadow-sm space-y-6 sticky top-6 animate-fade-in"
                >
                  {/* 1. Detail header */}
                  <div 
                    data-component-version="admin-update-detail-header-v2"
                    className="flex items-center justify-between pb-4 border-b border-[#EAE8E1]"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] uppercase tracking-wider font-semibold bg-[#C59B27]/10 text-[#C59B27] px-2.5 py-1 rounded-full">
                        {selectedUpdate.type.replace(/_/g, ' ')}
                      </span>
                      <span className={`text-[10px] px-2.5 py-1 rounded-full ${
                        selectedUpdate.priority === 'urgent' 
                          ? 'bg-rose-50 text-rose-700 font-semibold border border-rose-200' 
                          : selectedUpdate.priority === 'important'
                          ? 'bg-amber-50 text-amber-700 font-semibold border border-amber-200'
                          : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                      }`}>
                        {selectedUpdate.priority === 'normal' ? 'Normal' : selectedUpdate.priority === 'important' ? 'Important' : 'Urgent'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedUpdate(null)}
                      className="text-zinc-400 hover:text-[#18181B] text-xs font-semibold cursor-pointer flex items-center space-x-1"
                    >
                      <span>Close</span>
                    </button>
                  </div>

                  {/* 2. Sender card */}
                  <div 
                    data-component-version="admin-update-detail-sender-v2"
                    className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-4"
                  >
                    <div className="flex items-center space-x-3.5" data-component-version="admin-update-sender-avatar-v2-premium">
                      <div className="w-10 h-10 rounded-full bg-[#FAF9F6] border-2 border-[#EAE8E1] text-[#A37B1B] font-serif font-semibold text-sm flex items-center justify-center shadow-xs">
                        {selectedUpdate.senderName ? selectedUpdate.senderName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() : '??'}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[#18181B] tracking-tight">{selectedUpdate.senderName}</h4>
                        <p className="text-[10px] text-zinc-400 font-medium tracking-wide uppercase mt-0.5">
                          {selectedUpdate.senderRole === 'system' ? 'Automated Update' : selectedUpdate.senderRole}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 3. Message content card */}
                  <div 
                    data-component-version="admin-update-detail-content-v2"
                    className="space-y-3"
                  >
                    <div className="space-y-1">
                      <h2 className="font-serif text-lg font-bold text-[#18181B] leading-snug">
                        {selectedUpdate.title}
                      </h2>
                      <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400 font-mono" data-component-version="admin-update-date-format-v1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Sent: {formatPremiumDateDetail(selectedUpdate.createdAt)}</span>
                      </div>
                    </div>
                    <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-4 text-xs text-zinc-700 leading-relaxed whitespace-pre-wrap font-sans">
                      {selectedUpdate.bodyFull}
                    </div>
                  </div>

                  {/* 4. Related details card */}
                  {(selectedUpdate.relatedChildName || selectedUpdate.relatedEventId || selectedUpdate.actionStatus !== 'n/a') && (
                    <div 
                      data-component-version="admin-update-detail-related-v2"
                      className="border border-[#EAE8E1] rounded-xl p-4 space-y-3 text-xs"
                    >
                      <span className="text-[9px] text-[#A37B1B] uppercase tracking-wider block font-serif font-bold pb-1.5 border-b border-zinc-100">Related Details</span>
                      
                      {selectedUpdate.relatedChildName && (
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-500 font-medium">Child:</span>
                          <strong className="text-[#18181B] font-semibold text-xs">{selectedUpdate.relatedChildName}</strong>
                        </div>
                      )}
                      
                      {selectedUpdate.relatedEventId && (
                        <div className="flex justify-between items-center" data-component-version="admin-update-safe-event-display-v1">
                          <span className="text-zinc-500 font-medium">Event:</span>
                          <strong className="text-[#18181B] font-serif text-xs">
                            {selectedUpdate.relatedEventId === 'event-ga-2026' || selectedUpdate.relatedEventId.includes('2026')
                              ? 'Koinonia Children & Teens Event 2026'
                              : 'Current Event'}
                          </strong>
                        </div>
                      )}

                      <div className="flex justify-between items-center">
                        <span className="text-zinc-500 font-medium">Delivery Status:</span>
                        <span className="font-semibold text-emerald-700 text-xs flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full inline-block" />
                          <span>Delivered (In-App)</span>
                        </span>
                      </div>

                      {selectedUpdate.actionStatus !== 'n/a' && (
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-500 font-medium">Alert Status:</span>
                          <span className={`font-semibold uppercase text-[10px] flex items-center space-x-1 ${
                            selectedUpdate.actionStatus === 'resolved'
                              ? 'text-emerald-700'
                              : selectedUpdate.actionStatus === 'acknowledged'
                              ? 'text-[#C59B27]'
                              : 'text-rose-600 animate-pulse'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                              selectedUpdate.actionStatus === 'resolved'
                                ? 'bg-emerald-600'
                                : selectedUpdate.actionStatus === 'acknowledged'
                                ? 'bg-[#C59B27]'
                                : 'bg-rose-600'
                            }`} />
                            <span>{selectedUpdate.actionStatus}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 5. Action footer */}
                  <div 
                    data-component-version="admin-update-detail-actions-v2"
                    className="flex flex-col gap-2 pt-1"
                  >
                    {selectedUpdate.targetUrl && (
                      <button
                        type="button"
                        data-component-version="admin-update-actions-v2-working"
                        onClick={() => onNavigate(selectedUpdate.targetUrl)}
                        className="w-full bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs hover:shadow-sm"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open related review</span>
                      </button>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleToggleRead(selectedUpdate, e)}
                        className="flex-1 bg-zinc-100 hover:bg-zinc-200 border border-[#EAE8E1] text-[#18181B] text-xs font-semibold py-2 rounded-xl transition-all flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 text-[#C59B27]" />
                        <span>{selectedUpdate.isRead ? 'Mark unread' : 'Mark read'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleToggleArchive(selectedUpdate, e)}
                        className="flex-1 bg-zinc-100 hover:bg-zinc-200 border border-[#EAE8E1] text-[#18181B] text-xs font-semibold py-2 rounded-xl transition-all flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <Archive className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{selectedUpdate.isArchived ? 'Restore' : 'Archive'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-2xl p-12 text-center text-zinc-400 space-y-2.5">
                  <Info className="w-6 h-6 text-zinc-300 mx-auto" />
                  <span className="text-xs block leading-relaxed max-w-xs mx-auto">Select a care update or message from the list to view complete records and execute associated review operations.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* METRIC CARDS ROW */}
          <div 
            data-component-version="admin-message-stats-v3-stitch"
            className="grid grid-cols-2 md:grid-cols-5 gap-4"
          >
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Messages sent
              </span>
              <p className="font-serif text-2xl font-semibold text-zinc-900">
                {stats.messagesSent.toLocaleString()}
              </p>
              <span className="text-[9px] text-zinc-400 block font-mono">
                Total sent logs
              </span>
            </div>

            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                WhatsApp sent
              </span>
              <p className="font-serif text-2xl font-semibold text-zinc-900">
                {stats.whatsappSent.toLocaleString()}
              </p>
              <span className="text-[9px] text-zinc-400 block font-mono">
                Total WhatsApp
              </span>
            </div>

            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Email sent
              </span>
              <p className="font-serif text-2xl font-semibold text-zinc-900">
                {stats.emailSent.toLocaleString()}
              </p>
              <span className="text-[9px] text-zinc-400 block font-mono">
                Total Emails
              </span>
            </div>

            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1 border-red-100">
              <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wider block">
                Failed
              </span>
              <p className="font-serif text-2xl font-semibold text-red-600">
                {stats.failed.toLocaleString()}
              </p>
              <span className="text-[9px] text-zinc-400 block font-mono">
                Delivery faults
              </span>
            </div>

            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1 border-amber-100">
              <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider block">
                Pending
              </span>
              <p className="font-serif text-2xl font-semibold text-amber-600">
                {stats.pending.toLocaleString()}
              </p>
              <span className="text-[9px] text-zinc-400 block font-mono">
                Queued status
              </span>
            </div>
          </div>

      {/* RECIPIENT GROUP CHIPS (HORIZONTALLY SCROLLABLE) */}
      <div 
        data-component-version="admin-message-recipient-groups-v3"
        className="space-y-2"
      >
        <span className="text-[11px] font-bold text-[#18181B] uppercase tracking-wider block">
          Recipient group
        </span>
        <div 
          className="flex items-center space-x-2 overflow-x-auto no-scrollbar pb-1"
          data-component-version="admin-messages-mobile-v3"
        >
          {recipientGroups.map(group => {
            const isGroupActive = selectedGroup === group.key;
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => setSelectedGroup(group.key)}
                className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                  isGroupActive
                    ? 'bg-[#C59B27]/10 text-[#C59B27] border-[#C59B27] font-semibold'
                    : 'bg-white border-[#EAE8E1] text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {group.label} ({group.count})
              </button>
            );
          })}
        </div>
      </div>

      {/* DISPATCH OUTCOME BANNER */}
      {dispatchSummary && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-slide-in-top">
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-serif font-bold text-[#18181B]">Broadcast Summary Report</h4>
              <p className="text-xs text-zinc-600 mt-0.5">
                Your broadcast has been processed.
              </p>
              <div className="flex items-center space-x-4 mt-2">
                <span className="text-[10px] font-mono bg-white border border-emerald-100 rounded-lg px-2 py-1 text-zinc-700">
                  Target Contacts: <strong>{dispatchSummary.requested}</strong>
                </span>
                <span className="text-[10px] font-mono bg-white border border-emerald-100 rounded-lg px-2 py-1 text-emerald-800">
                  Confirmed Sent: <strong>{dispatchSummary.sent}</strong>
                </span>
                <span className="text-[10px] font-mono bg-white border border-emerald-100 rounded-lg px-2 py-1 text-red-700">
                  Failed: <strong>{dispatchSummary.failed}</strong>
                </span>
              </div>
            </div>
          </div>
          <button 
            onClick={() => setDispatchSummary(null)}
            className="text-zinc-400 hover:text-[#18181B] text-xs font-semibold cursor-pointer shrink-0"
          >
            Dismiss Report
          </button>
        </div>
      )}

      {/* MAIN LAYOUT: TWO COLUMNS */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: SEND MESSAGE FORM */}
        <div 
          data-component-version="admin-message-composer-v3"
          className="xl:col-span-7 bg-white border border-[#EAE8E1] rounded-2xl p-4 sm:p-6 shadow-xs space-y-6"
        >
          <div className="flex items-center space-x-2 pb-3 border-b border-[#EAE8E1]">
            <MessageSquare className="w-4 h-4 text-[#C59B27]" />
            <h2 className="font-serif font-bold text-lg text-[#18181B]">Send message</h2>
          </div>

          {/* Delivery Warning Details */}
          {(!emailEnabled || !whatsappEnabled) && (
            <div 
              data-component-version="admin-message-provider-status-v2"
              className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-800 flex items-start space-x-2.5"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-zinc-900">Delivery channel notice</span>
                <p className="mt-0.5 leading-relaxed text-zinc-600">
                  {!emailEnabled && !whatsappEnabled ? (
                    'Both Email and WhatsApp delivery channels are unconfigured in your server settings. Dispatches are temporarily inactive.'
                  ) : !emailEnabled ? (
                    'Email is not ready yet. SMTP or Resend setup is required.'
                  ) : (
                    'WhatsApp is not ready yet. Twilio credentials are required.'
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Recipient group dropdown */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#18181B] uppercase tracking-wider block">
                Recipient group
              </label>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="w-full bg-zinc-50 border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] cursor-pointer"
              >
                {recipientGroups.map(group => (
                  <option key={group.key} value={group.key}>
                    {group.label} ({group.count} contacts)
                  </option>
                ))}
              </select>
            </div>

            {/* Message type dropdown */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#18181B] uppercase tracking-wider block">
                Message type
              </label>
              <select
                value={selectedType}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full bg-zinc-50 border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27] cursor-pointer"
              >
                {messageTypes.map(type => (
                  <option key={type.key} value={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Channel selector */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[#18181B] uppercase tracking-wider block">
              Channel
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'email', label: 'Email Only', desc: 'Send to parent email addresses.', icon: Mail, enabled: emailEnabled },
                { id: 'whatsapp', label: 'WhatsApp Only', desc: 'Send to parent WhatsApp numbers.', icon: Phone, enabled: whatsappEnabled },
                { id: 'both', label: 'Both channels', desc: 'Send by Email and WhatsApp.', icon: MessageSquare, enabled: emailEnabled && whatsappEnabled }
              ].map(ch => {
                const SelectedIcon = ch.icon;
                const isChActive = selectedChannel === ch.id;
                const isDisabled = !ch.enabled;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => setSelectedChannel(ch.id as any)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center space-y-1 transition-all ${
                      isDisabled
                        ? 'border-dashed border-zinc-200 bg-zinc-50 text-zinc-300 opacity-60 cursor-not-allowed'
                        : isChActive
                        ? 'border-[#C59B27] bg-[#C59B27]/5 text-[#18181B] cursor-pointer font-semibold'
                        : 'border-[#EAE8E1] bg-white text-zinc-500 hover:bg-zinc-50 cursor-pointer'
                    }`}
                  >
                    <SelectedIcon className={`w-4 h-4 ${isDisabled ? 'text-zinc-300' : isChActive ? 'text-[#C59B27]' : 'text-zinc-400'}`} />
                    <span className="text-[11px] block">{ch.label}</span>
                    <span className="text-[9px] text-zinc-400 leading-none">{ch.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject Line (visible for email/both) */}
          {(selectedChannel === 'email' || selectedChannel === 'both') && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#18181B] uppercase tracking-wider block">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject line..."
                className="w-full bg-zinc-50 border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27]"
              />
            </div>
          )}

          {/* Message Body Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[#18181B] uppercase tracking-wider block">
              Message body
            </label>
            <textarea
              ref={bodyRef}
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write update body content..."
              className="w-full bg-zinc-50 border border-[#EAE8E1] rounded-xl px-3 py-2.5 text-xs text-[#18181B] font-mono focus:outline-none focus:border-[#C59B27] leading-relaxed resize-y min-h-[140px] sm:min-h-[200px]"
            />
          </div>

          {/* Insert Details Board */}
          <div className="space-y-2 bg-[#F9F8F3] border border-[#EAE8E1] rounded-xl p-4">
            <div className="flex items-center space-x-1.5 text-[10px] font-bold text-zinc-600 uppercase tracking-wide">
              <Info className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>Insert details</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {TOKENS.map(token => (
                <button
                  key={token.key}
                  type="button"
                  onClick={() => handleInsertToken(token.key)}
                  className="bg-white border border-[#EAE8E1] rounded-lg px-2 py-1 text-[10px] font-mono text-[#18181B] hover:border-[#C59B27] hover:bg-[#C59B27]/5 cursor-pointer flex items-center space-x-1 transition-colors"
                >
                  <strong className="text-[#C59B27]">{token.key}</strong>
                  <span className="text-zinc-400 font-sans text-[9px] hidden sm:inline">({token.label})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Actions Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-[#EAE8E1]">
            <span className="text-[10px] text-zinc-500">
              Active Target Recipients: <strong>{activeGroupRecipients} parent(s)</strong>
            </span>

            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={savingDraft || actionLoading}
                className="text-xs cursor-pointer flex items-center justify-center space-x-1.5 h-10 w-full sm:w-auto"
              >
                {savingDraft ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save draft</span>
              </Button>

              <button
                id="preview-trigger-btn"
                type="button"
                onClick={generateLivePreview}
                disabled={previewLoading || actionLoading}
                className="text-xs font-semibold px-3 py-2 bg-zinc-100 border border-[#EAE8E1] rounded-xl text-zinc-700 hover:bg-zinc-200 transition-all flex items-center justify-center space-x-1.5 cursor-pointer h-10 w-full sm:w-auto"
              >
                {previewLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                <span>Preview</span>
              </button>

              <button
                type="button"
                onClick={handleSendRequest}
                disabled={actionLoading || !body.trim() || activeGroupRecipients === 0 || (selectedChannel === 'email' && !emailEnabled) || (selectedChannel === 'whatsapp' && !whatsappEnabled) || (selectedChannel === 'both' && (!emailEnabled || !whatsappEnabled))}
                className={`col-span-2 text-xs font-semibold px-4 py-2 rounded-xl text-white shadow-xs transition-all flex items-center justify-center space-x-2 cursor-pointer h-10 w-full sm:w-auto ${
                  actionLoading || !body.trim() || activeGroupRecipients === 0 || (selectedChannel === 'email' && !emailEnabled) || (selectedChannel === 'whatsapp' && !whatsappEnabled) || (selectedChannel === 'both' && (!emailEnabled || !whatsappEnabled))
                    ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
                    : 'bg-[#C59B27] hover:bg-[#A37B1B]'
                }`}
              >
                {actionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Send message</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PREVIEW + RECENT ACTIVITY + SENDER SETTINGS */}
        <div className="xl:col-span-5 space-y-6 w-full min-w-0">
          
          {/* PREVIEW CONTAINER */}
          <div 
            data-component-version="admin-message-preview-v3"
            className="bg-white border border-[#EAE8E1] rounded-2xl p-4 sm:p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
              <button 
                type="button"
                onClick={() => setShowPreviewMobile(!showPreviewMobile)}
                className="flex items-center space-x-2 cursor-pointer text-left focus:outline-none xl:pointer-events-none w-full"
              >
                <Eye className="w-4 h-4 text-[#C59B27] shrink-0" />
                <h3 className="font-serif font-bold text-[#18181B] flex-1 text-sm sm:text-base">Preview</h3>
                <span className="text-xs text-[#C59B27] font-semibold xl:hidden">
                  {showPreviewMobile ? 'Collapse' : 'Expand'}
                </span>
              </button>
              
              <div className={`flex items-center bg-zinc-50 p-1 rounded-xl border border-[#EAE8E1] shrink-0 ml-2 ${showPreviewMobile ? 'flex' : 'hidden xl:flex'}`}>
                <button
                  type="button"
                  onClick={() => setPreviewTab('email')}
                  disabled={selectedChannel === 'whatsapp'}
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg transition-all ${
                    previewTab === 'email'
                      ? 'bg-white text-[#18181B] shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('whatsapp')}
                  disabled={selectedChannel === 'email'}
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg transition-all ${
                    previewTab === 'whatsapp'
                      ? 'bg-white text-[#18181B] shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  WhatsApp
                </button>
              </div>
            </div>

            {/* COLLAPSIBLE PREVIEW CONTAINER */}
            <div className={`transition-all duration-200 ${showPreviewMobile ? 'block' : 'hidden xl:block'}`}>
              <div className="border border-zinc-200/60 rounded-xl bg-zinc-50 p-4 min-h-[220px] sm:min-h-[250px] flex flex-col justify-between">
                {!previewBody ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
                    <MessageSquare className="w-8 h-8 text-zinc-300" />
                    <p className="text-xs text-zinc-400 leading-normal">Enter subject and body details to view live sample rendering.</p>
                  </div>
                ) : (
                  <>
                    {previewTab === 'email' ? (
                      <div className="flex-1 flex flex-col space-y-3 animate-fade-in text-xs font-sans min-w-0">
                        <div className="bg-white border border-[#EAE8E1] rounded-lg p-3 text-zinc-600 space-y-1 min-w-0">
                          <div className="truncate"><strong>From:</strong> {providerStatus.senderName || 'Koinonia Global'} &lt;{providerStatus.fromEmail || 'info@themandate.dontechservicesconst.com'}&gt;</div>
                          <div className="border-t border-zinc-100 my-1"></div>
                          <div className="truncate"><strong>Subject:</strong> <span className="text-[#18181B] font-semibold">{previewSubject || '(No Subject Line)'}</span></div>
                        </div>

                        <div className="bg-white border border-[#EAE8E1] rounded-lg p-4 text-[#18181B] leading-relaxed whitespace-pre-line flex-1 min-h-[160px] overflow-y-auto break-words">
                          {previewBody}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-end animate-fade-in font-sans text-xs w-full">
                        <div className="bg-emerald-50 text-[#18181B] border border-emerald-200 rounded-2xl rounded-tr-none p-4 leading-relaxed max-w-[90%] sm:max-w-[85%] whitespace-pre-line shadow-2xs break-words">
                          {previewBody}
                          <div className="text-[9px] text-zinc-400 text-right mt-2 font-mono">
                            12:00 PM • WhatsApp Delivery
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* SENDER SETTINGS */}
          <div 
            data-component-version="admin-message-sender-settings-v2"
            className="bg-white border border-[#EAE8E1] rounded-2xl p-4 sm:p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#EAE8E1]">
              <div className="flex items-center space-x-2">
                <Settings className="w-4 h-4 text-[#C59B27]" />
                <h3 className="font-serif font-bold text-[#18181B] text-sm sm:text-base">Sender settings</h3>
              </div>
              <button
                type="button"
                onClick={handleStartEditSettings}
                className="text-xs text-[#C59B27] font-semibold hover:text-[#A37B1B] transition-colors cursor-pointer"
              >
                Edit settings
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-600">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 font-mono text-[10px]">
                <div className="min-w-0">
                  <span className="text-zinc-400 block font-sans text-[9px] uppercase tracking-wider">SENDER NAME</span>
                  <span className="text-zinc-800 font-semibold truncate block">{providerStatus.senderName || 'Koinonia Global'}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-zinc-400 block font-sans text-[9px] uppercase tracking-wider">REPLY-TO EMAIL</span>
                  <span className="text-zinc-800 font-semibold truncate block" title={providerStatus.replyToEmail}>{providerStatus.replyToEmail || 'info@themandate.dontechservicesconst.com'}</span>
                </div>
              </div>

              <div className="border border-zinc-200/60 rounded-xl p-3 bg-zinc-50 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-zinc-700">Email delivery state:</span>
                  <span className={`font-semibold px-2 py-0.5 rounded-full text-[9px] ${
                    emailEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                  }`}>
                    {emailEnabled ? 'Ready' : 'Not ready'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-zinc-700">WhatsApp delivery state:</span>
                  <span className={`font-semibold px-2 py-0.5 rounded-full text-[9px] ${
                    whatsappEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                  }`}>
                    {whatsappEnabled ? 'Ready' : 'Not ready'}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400 leading-normal border-t border-zinc-200/60 pt-2 font-serif">
                  All dispatches are secure. Email uses a verified domain provider, and WhatsApp is routed via Twilio.
                </div>
              </div>
            </div>
          </div>

          {/* RECENT ACTIVITY */}
          <div 
            data-component-version="admin-message-recent-activity-v3"
            className="bg-white border border-[#EAE8E1] rounded-2xl p-4 sm:p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-zinc-400" />
                <h3 className="font-serif font-bold text-[#18181B] text-sm sm:text-base">Recent activity</h3>
              </div>
              <span className="text-xs text-[#C59B27] font-semibold">
                {recentActivity.length} sent
              </span>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {recentActivity.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <ClipboardList className="w-8 h-8 text-zinc-300 mx-auto" />
                  <p className="text-xs font-semibold text-zinc-400">No messages have been sent yet.</p>
                </div>
              ) : (
                recentActivity.map((log) => {
                  const isSent = log.status === 'sent';
                  return (
                    <div 
                      key={log.id}
                      className="p-3 bg-zinc-50 border border-zinc-200/60 rounded-xl space-y-1 text-xs hover:border-zinc-300 transition-all font-sans min-w-0"
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="font-serif font-bold text-zinc-800 truncate flex-1 min-w-0 block">
                          {log.subject || log.messageType.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          isSent ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                        }`}>
                          {log.status.toUpperCase()}
                        </span>
                      </div>

                      <p className="text-[10px] text-zinc-500 font-serif line-clamp-2 break-words">
                        {log.body}
                      </p>

                      <div className="flex items-center justify-between text-[9px] text-zinc-400 pt-1 border-t border-zinc-200/40 font-mono gap-2 min-w-0">
                        <span className="truncate block">Group: <strong className="text-[#18181B]">{log.recipientGroup.replace(/_/g, ' ')}</strong></span>
                        <span className="shrink-0">{new Date(log.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

      {/* SENDER SETTINGS EDIT MODAL */}
      {isEditingSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => setIsEditingSettings(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs" 
          />
          <form 
            onSubmit={handleSaveSettings}
            className="relative bg-white border border-[#EAE8E1] rounded-2xl w-full max-w-md p-6 shadow-2xl animate-fade-in space-y-4"
          >
            <div className="flex items-center space-x-2 pb-3 border-b border-[#EAE8E1]">
              <Settings className="w-5 h-5 text-[#C59B27] shrink-0" />
              <h4 className="font-serif font-bold text-[#18181B] text-lg">Edit sender settings</h4>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#18181B] uppercase tracking-wider block">
                  Sender name
                </label>
                <input
                  type="text"
                  value={editedSenderName}
                  onChange={(e) => setEditedSenderName(e.target.value)}
                  placeholder="e.g. Koinonia Global"
                  className="w-full bg-zinc-50 border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#18181B] uppercase tracking-wider block">
                  Reply-to email
                </label>
                <input
                  type="email"
                  value={editedReplyTo}
                  onChange={(e) => setEditedReplyTo(e.target.value)}
                  placeholder="e.g. support@koinonia.org"
                  className="w-full bg-zinc-50 border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:border-[#C59B27]"
                  required
                />
                <span className="text-[10px] text-zinc-400 block font-serif">
                  Parents see this address when replying to automated or broadcast emails.
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
                className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                {savingSettings ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save settings</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SEND CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div 
          data-component-version="admin-message-send-confirmation-v3"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div 
            onClick={() => setShowConfirmModal(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs" 
          />
          <div className="relative bg-white border border-[#EAE8E1] rounded-2xl w-full max-w-md p-6 shadow-2xl animate-fade-in space-y-4">
            <div className="flex items-center space-x-2.5 pb-3 border-b border-[#EAE8E1]">
              <AlertTriangle className="w-5 h-5 text-[#C59B27] shrink-0" />
              <h4 className="font-serif font-bold text-[#18181B]">Send this message?</h4>
            </div>

            <div className="space-y-3 text-xs text-zinc-600 leading-relaxed">
              <p>
                This will send to {activeGroupRecipients} recipient(s) by {selectedChannel.toUpperCase()}. Please review the preview before sending.
              </p>
              
              <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 space-y-1.5 font-mono text-[10px] text-zinc-700">
                <div>• Recipient group: <strong className="text-[#18181B]">{selectedGroup.replace(/_/g, ' ')}</strong></div>
                <div>• Channel: <strong className="text-[#18181B] font-semibold">{selectedChannel.toUpperCase()}</strong></div>
                <div>• Estimated count: <strong className="text-emerald-700 font-bold">{activeGroupRecipients} recipient(s)</strong></div>
                {(selectedChannel === 'email' || selectedChannel === 'both') && (
                  <>
                    <div>• Subject line: <strong className="text-[#18181B] truncate block">{subject}</strong></div>
                    <div>• Sender email: <strong className="text-[#18181B]">{providerStatus.fromEmail || 'info@themandate.dontechservicesconst.com'}</strong></div>
                  </>
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
                className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send now</span>
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

    </div>
  );
}
