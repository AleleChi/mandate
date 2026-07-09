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
  Settings
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

export function AdminMessagesView({ onBackToOverview, onNavigate }: AdminMessagesViewProps) {
  const { showSuccess, showError, showInfo } = useNotification();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
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

  useEffect(() => {
    fetchMessagesData();
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
      data-view-version="admin-messages-v4-mobile-refined" 
      className="flex-1 flex flex-col overflow-y-auto min-w-0 bg-[#FAF9F6] p-4 sm:p-8 space-y-6 animate-fade-in"
    >
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-[#EAE8E1] space-y-4 sm:space-y-0">
        <div>
          <h1 className="font-serif text-3xl font-bold text-[#18181B] tracking-tight">
            Messages
          </h1>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            Send clear updates to parents by Email, WhatsApp, or both.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchMessagesData(false)}
            className="p-2 bg-white border border-[#EAE8E1] rounded-xl text-zinc-500 hover:text-[#18181B] hover:bg-zinc-50 transition-all cursor-pointer"
            title="Refresh Details"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Button 
            id="back-to-dashboard-btn"
            variant="outline" 
            onClick={onBackToOverview}
            className="text-xs cursor-pointer"
          >
            Overview Dashboard
          </Button>
        </div>
      </div>

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

    </div>
  );
}
