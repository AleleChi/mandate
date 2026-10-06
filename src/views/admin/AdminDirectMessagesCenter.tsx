import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  Check,
  Clock,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  User,
  Users,
  Search,
  Filter,
  CheckCircle2,
  RotateCcw,
  Shield,
  Layers,
  Info,
  Megaphone,
  Plus,
  X,
  Radio,
  Eye
} from 'lucide-react';
import { AdminMessageThread, AdminMessageParticipant, ParentMessage, Announcement, AnnouncementAudienceType } from '../../types';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { useRealtimeSubscription, useRealtimeResync } from '../../services/realtime';

interface AdminDirectMessagesCenterProps {
  adminUser?: any;
  currentRoute?: string;
  initialThreadId?: string;
  onNavigate?: (route: string) => void;
  onUnreadChange?: (newCount: number) => void;
}

type StatusFilter = 'all' | 'unread' | 'open' | 'resolved';
type ParticipantRoleFilter = 'all' | 'parent' | 'volunteer';
type CategoryFilter = 'all' | 'child_application' | 'volunteer_coordination' | 'general';

function getAudienceBadge(type: AnnouncementAudienceType, a?: Announcement) {
  switch (type) {
    case 'all_parents':
      return {
        label: 'All Parents',
        className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200'
      };
    case 'all_volunteers':
      return {
        label: 'All Volunteers',
        className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200'
      };
    case 'everyone':
      return {
        label: 'Everyone',
        className: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200'
      };
    case 'selected_parent':
      return {
        label: `Selected Parent: ${a?.target_parent_name || a?.target_user_email || 'Single Recipient'}`,
        className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200'
      };
    case 'selected_volunteer':
      return {
        label: `Selected Volunteer: ${a?.target_volunteer_name || a?.target_user_email || 'Single Recipient'}`,
        className: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200'
      };
    default:
      return {
        label: type,
        className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200'
      };
  }
}

export const AdminDirectMessagesCenter: React.FC<AdminDirectMessagesCenterProps> = ({
  adminUser,
  currentRoute,
  initialThreadId,
  onNavigate,
  onUnreadChange
}) => {
  const { showError, showSuccess } = useNotification();

  // Parse initial thread from URL if provided (/admin/messages/:threadId)
  const urlThreadId = useMemo(() => {
    if (initialThreadId) return initialThreadId;
    if (currentRoute && currentRoute.startsWith('/admin/messages/')) {
      const parts = currentRoute.split('/admin/messages/');
      if (parts[1] && parts[1].startsWith('thrd-')) {
        return parts[1].split('?')[0];
      }
    }
    return null;
  }, [initialThreadId, currentRoute]);

  // Active Selected Thread
  const [activeThreadId, setActiveThreadId] = useState<string | null>(urlThreadId || null);
  const [activeThread, setActiveThread] = useState<AdminMessageThread | null>(null);
  const [participants, setParticipants] = useState<AdminMessageParticipant[]>([]);

  // Threads List State
  const [threads, setThreads] = useState<AdminMessageThread[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState<boolean>(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [totalThreads, setTotalThreads] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasMoreThreads, setHasMoreThreads] = useState<boolean>(false);

  // Filters State
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<ParticipantRoleFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Messages State for Active Thread
  const [messages, setMessages] = useState<ParentMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  // Composer State
  const [replyText, setReplyText] = useState<string>('');
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Resolving / Reopening state
  const [isActionPending, setIsActionPending] = useState<boolean>(false);

  // Announcements Feature State
  const [activeCenterTab, setActiveCenterTab] = useState<'threads' | 'announcements'>('threads');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState<boolean>(false);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);
  const [totalAnnouncements, setTotalAnnouncements] = useState<number>(0);

  // Detail Modal State
  const [viewingAnnouncement, setViewingAnnouncement] = useState<Announcement | null>(null);

  // Composer Modal State
  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);
  const [composerTitle, setComposerTitle] = useState<string>('');
  const [composerBody, setComposerBody] = useState<string>('');
  const [composerAudience, setComposerAudience] = useState<AnnouncementAudienceType>('all_parents');
  const [composerTargetUser, setComposerTargetUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [recipientSearchQuery, setRecipientSearchQuery] = useState<string>('');
  const [recipientCandidates, setRecipientCandidates] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState<boolean>(false);
  const [isPublishingAnnouncement, setIsPublishingAnnouncement] = useState<boolean>(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const fetchAnnouncements = useCallback(async () => {
    setIsLoadingAnnouncements(true);
    setAnnouncementsError(null);
    try {
      const res = await api.admin.announcements.list({ limit: 50 });
      if (res && res.success) {
        setAnnouncements(res.announcements || []);
        setTotalAnnouncements(res.total ?? res.announcements?.length ?? 0);
      }
    } catch (err) {
      const extracted = extractApiError(err);
      setAnnouncementsError(extracted.description || extracted.message || 'Unable to load announcements.');
    } finally {
      setIsLoadingAnnouncements(false);
    }
  }, []);

  useEffect(() => {
    if (activeCenterTab === 'announcements') {
      fetchAnnouncements();
    }
  }, [activeCenterTab, fetchAnnouncements]);

  useEffect(() => {
    if (!isComposerOpen) return;
    if (composerAudience !== 'selected_parent' && composerAudience !== 'selected_volunteer') {
      setRecipientCandidates([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoadingRecipients(true);
      try {
        const res = await api.admin.announcements.getRecipients({
          role: composerAudience === 'selected_parent' ? 'parent' : 'volunteer',
          query: recipientSearchQuery.trim() || undefined
        });
        if (res && res.success) {
          setRecipientCandidates(res.recipients || []);
        }
      } catch {
        // non-blocking
      } finally {
        setIsLoadingRecipients(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [isComposerOpen, composerAudience, recipientSearchQuery]);

  const handlePublishAnnouncement = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isPublishingAnnouncement) return;

    const trimmedTitle = composerTitle.trim();
    const trimmedBody = composerBody.trim();

    if (!trimmedTitle) {
      setComposerError('Announcement title is required.');
      return;
    }
    if (trimmedTitle.length > 120) {
      setComposerError('Title cannot exceed 120 characters.');
      return;
    }
    if (!trimmedBody) {
      setComposerError('Announcement message body is required.');
      return;
    }
    if (trimmedBody.length > 5000) {
      setComposerError('Message body cannot exceed 5000 characters.');
      return;
    }

    if ((composerAudience === 'selected_parent' || composerAudience === 'selected_volunteer') && !composerTargetUser) {
      setComposerError('Please select a specific recipient.');
      return;
    }

    setIsPublishingAnnouncement(true);
    setComposerError(null);

    try {
      const res = await api.admin.announcements.create({
        title: trimmedTitle,
        body: trimmedBody,
        audience_type: composerAudience,
        target_user_id: composerTargetUser?.id || null
      });

      if (res && res.success) {
        showSuccess('Announcement published successfully.');
        setIsComposerOpen(false);
        setComposerTitle('');
        setComposerBody('');
        setComposerAudience('all_parents');
        setComposerTargetUser(null);
        setRecipientSearchQuery('');
        fetchAnnouncements();
      }
    } catch (err) {
      const extracted = extractApiError(err);
      setComposerError(extracted.description || extracted.message || 'Failed to publish announcement.');
    } finally {
      setIsPublishingAnnouncement(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  };

  // Sync with URL thread if changed externally
  useEffect(() => {
    if (urlThreadId && urlThreadId !== activeThreadId) {
      setActiveThreadId(urlThreadId);
    }
  }, [urlThreadId]);

  // Fetch threads with applied filters
  const fetchThreads = useCallback(async (pageToLoad = 1) => {
    setIsLoadingThreads(true);
    setThreadsError(null);
    try {
      const res = await api.admin.messages.listThreads({
        page: pageToLoad,
        limit: 30,
        status: statusFilter === 'open' || statusFilter === 'resolved' ? statusFilter : undefined,
        unreadOnly: statusFilter === 'unread',
        participantRole: roleFilter !== 'all' ? roleFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        search: searchQuery.trim() || undefined
      });

      if (res && res.success) {
        setThreads(res.threads || []);
        setTotalThreads(res.pagination?.total ?? res.threads?.length ?? 0);
        setHasMoreThreads(Boolean(res.pagination?.hasMore));
        setCurrentPage(pageToLoad);
      }
    } catch (err) {
      const extracted = extractApiError(err);
      setThreadsError(extracted.description || extracted.message || 'Unable to load conversations.');
    } finally {
      setIsLoadingThreads(false);
    }
  }, [statusFilter, roleFilter, categoryFilter, searchQuery]);

  // Refresh threads whenever filters change
  useEffect(() => {
    fetchThreads(1);
  }, [fetchThreads]);

  // Refresh unread count
  const refreshUnreadBadge = useCallback(async () => {
    try {
      const res = await api.admin.messages.getUnreadCount();
      if (res && res.success && onUnreadChange) {
        onUnreadChange(res.unreadThreadCount ?? res.unreadCount ?? 0);
      }
    } catch {
      // Non-blocking
    }
  }, [onUnreadChange]);

  // Load active thread details & messages
  const loadThread = useCallback(async (threadIdToLoad?: string) => {
    const targetId = threadIdToLoad || activeThreadId;
    if (!targetId) {
      setActiveThread(null);
      setParticipants([]);
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);
    setMessagesError(null);
    setReplyError(null);
    try {
      const [threadRes, msgsRes] = await Promise.all([
        api.admin.messages.getThread(targetId),
        api.admin.messages.getMessages(targetId, { limit: 100 })
      ]);

      if (threadRes && threadRes.success) {
        setActiveThread(threadRes.thread);
        setParticipants(threadRes.participants || []);
      }
      if (msgsRes && msgsRes.success) {
        setMessages(msgsRes.messages || []);
      }

      // Mark conversation as read on admin participant row
      try {
        await api.admin.messages.markRead(targetId);
        refreshUnreadBadge();
        setThreads(prev =>
          prev.map(t =>
            t.id === targetId ? { ...t, unread_count: 0, is_unread: false } : t
          )
        );
      } catch {
        // Non-blocking read recording
      }
    } catch (err) {
      const extracted = extractApiError(err);
      setMessagesError(extracted.description || extracted.message || 'Unable to load conversation details.');
    } finally {
      setIsLoadingMessages(false);
      setTimeout(() => scrollToBottom('auto'), 50);
    }
  }, [activeThreadId, refreshUnreadBadge]);

  // Phase H Realtime Event Handlers
  useRealtimeSubscription(['message.created', 'thread.updated'], (detail: any) => {
    fetchThreads(currentPage);
    refreshUnreadBadge();
    if (activeThreadId && (detail?.threadId === activeThreadId || !detail?.threadId)) {
      loadThread(activeThreadId);
    }
  });

  useRealtimeSubscription('announcement.published', () => {
    if (activeCenterTab === 'announcements') {
      fetchAnnouncements();
    }
  });

  useRealtimeSubscription('notification.created', () => {
    refreshUnreadBadge();
  });

  useRealtimeResync(() => {
    fetchThreads(currentPage);
    refreshUnreadBadge();
    if (activeCenterTab === 'announcements') {
      fetchAnnouncements();
    }
    if (activeThreadId) {
      loadThread(activeThreadId);
    }
  });

  // Load thread whenever activeThreadId changes
  useEffect(() => {
    if (activeThreadId) {
      loadThread(activeThreadId);
    } else {
      setActiveThread(null);
      setParticipants([]);
      setMessages([]);
    }
  }, [activeThreadId, loadThread]);

  // Send admin reply
  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeThreadId || !replyText.trim() || isSendingReply) return;
    if (replyText.length > 5000) {
      setReplyError('Message cannot exceed 5000 characters.');
      return;
    }

    setIsSendingReply(true);
    setReplyError(null);

    const textToSend = replyText.trim();

    try {
      const res = await api.admin.messages.sendMessage(activeThreadId, textToSend);
      if (res && res.success) {
        setReplyText('');
        if (res.message) {
          setMessages(prev => [...prev, res.message]);
        }
        if (res.thread) {
          setActiveThread(prev => (prev ? { ...prev, ...res.thread } : res.thread));
          setThreads(prev =>
            prev.map(t => (t.id === activeThreadId ? { ...t, ...res.thread } : t))
          );
        }
        setTimeout(() => scrollToBottom('smooth'), 50);
      }
    } catch (err) {
      const extracted = extractApiError(err);
      setReplyError(extracted.description || extracted.message || 'Failed to send message.');
    } finally {
      setIsSendingReply(false);
    }
  };

  // Resolve thread
  const handleResolveThread = async () => {
    if (!activeThreadId || isActionPending) return;
    setIsActionPending(true);
    try {
      const res = await api.admin.messages.resolveThread(activeThreadId);
      if (res && res.success) {
        showSuccess('Conversation marked as resolved.');
        setActiveThread(prev => (prev ? { ...prev, status: 'resolved' } : null));
        setThreads(prev =>
          prev.map(t => (t.id === activeThreadId ? { ...t, status: 'resolved' } : t))
        );
      }
    } catch (err) {
      const extracted = extractApiError(err);
      showError(extracted.description || extracted.message || 'Could not resolve conversation.');
    } finally {
      setIsActionPending(false);
    }
  };

  // Reopen thread
  const handleReopenThread = async () => {
    if (!activeThreadId || isActionPending) return;
    setIsActionPending(true);
    try {
      const res = await api.admin.messages.reopenThread(activeThreadId);
      if (res && res.success) {
        showSuccess('Conversation reopened.');
        setActiveThread(prev => (prev ? { ...prev, status: 'open' } : null));
        setThreads(prev =>
          prev.map(t => (t.id === activeThreadId ? { ...t, status: 'open' } : t))
        );
      }
    } catch (err) {
      const extracted = extractApiError(err);
      showError(extracted.description || extracted.message || 'Could not reopen conversation.');
    } finally {
      setIsActionPending(false);
    }
  };

  // Format Helpers
  const formatTimeAgo = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'child_application':
        return {
          label: 'Child Application',
          className: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/50'
        };
      case 'volunteer_coordination':
        return {
          label: 'Volunteer',
          className: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900/50'
        };
      case 'attendance':
        return {
          label: 'Attendance',
          className: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900/50'
        };
      case 'safety':
        return {
          label: 'Care & Safety',
          className: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900/50'
        };
      default:
        return {
          label: 'General Inquiry',
          className: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
        };
    }
  };

  // Determine active conversation participant display
  const primaryParticipant = useMemo(() => {
    if (!activeThread) return null;
    const directPart = participants.find(p => p.role === 'parent' || p.role === 'volunteer');
    return {
      name: activeThread.participant_name || directPart?.full_name || directPart?.user_email || 'User',
      role: activeThread.participant_role || directPart?.role || (activeThread.category === 'volunteer_coordination' ? 'volunteer' : 'parent'),
      email: directPart?.user_email || ''
    };
  }, [activeThread, participants]);

  return (
    <div className="w-full flex-1 flex flex-col min-h-[620px] bg-white dark:bg-[#181817] border border-[#EAE8E1] dark:border-[#302F2A] rounded-2xl overflow-hidden shadow-2xs">

      {/* TOP SUBNAV: DIRECT INQUIRIES vs BROADCAST ANNOUNCEMENTS */}
      <div className="flex items-center justify-between px-4 pt-2.5 border-b border-[#EAE8E1] dark:border-[#302F2A] bg-stone-50/60 dark:bg-[#1C1B18]/60 shrink-0">
        <div className="flex items-center space-x-6">
          <button
            type="button"
            id="tab-admin-direct-messages"
            onClick={() => setActiveCenterTab('threads')}
            className={`pb-2.5 text-xs transition-all border-b-2 cursor-pointer flex items-center space-x-1.5 ${
              activeCenterTab === 'threads'
                ? 'border-[#C59B27] font-bold text-[#18181B] dark:text-[#F0EBE3]'
                : 'border-transparent font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
          >
            <span>Direct Inquiries</span>
            {totalThreads > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-sm font-semibold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                {totalThreads}
              </span>
            )}
          </button>

          <button
            type="button"
            id="tab-admin-announcements"
            onClick={() => {
              setActiveCenterTab('announcements');
              fetchAnnouncements();
            }}
            className={`pb-2.5 text-xs transition-all border-b-2 cursor-pointer flex items-center space-x-1.5 ${
              activeCenterTab === 'announcements'
                ? 'border-[#C59B27] font-bold text-[#18181B] dark:text-[#F0EBE3]'
                : 'border-transparent font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
          >
            <span>Broadcast Announcements</span>
            {totalAnnouncements > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-sm font-semibold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                {totalAnnouncements}
              </span>
            )}
          </button>
        </div>

        {activeCenterTab === 'announcements' && (
          <button
            type="button"
            id="btn-new-announcement"
            onClick={() => {
              setIsComposerOpen(true);
              setComposerError(null);
            }}
            className="mb-1.5 px-3 py-1.5 rounded-lg bg-[#C59B27] hover:bg-[#B58E33] text-[#18181B] font-semibold text-xs transition-all shadow-2xs flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Announcement</span>
          </button>
        )}
      </div>

      {activeCenterTab === 'threads' ? (
        /* 2-PANE DESKTOP / 1-PANE MOBILE LAYOUT */
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">

        {/* ========================================================================= */}
        {/* LEFT PANE: CONVERSATION LIST (Hidden on mobile when a thread is open)     */}
        {/* ========================================================================= */}
        <div
          className={`w-full md:w-[380px] lg:w-[420px] flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-[#EAE8E1] dark:border-[#302F2A] bg-[#FCFBF8] dark:bg-[#1D1D1A] ${
            activeThreadId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Header & Search */}
          <div className="p-3.5 border-b border-[#EAE8E1] dark:border-[#302F2A] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-[#C59B27]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#18181B] dark:text-[#F0EBE3]">
                  Direct Inquiries ({totalThreads})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => fetchThreads(1)}
                disabled={isLoadingThreads}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                title="Refresh conversations"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingThreads ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search subject or preview..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#EAE8E1] dark:border-[#302F2A] bg-white dark:bg-[#24231F] text-xs text-[#18181B] dark:text-[#F0EBE3] placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              />
            </div>

            {/* Restrained Filter Pills */}
            <div className="space-y-1.5">
              {/* Status Filters */}
              <div className="flex items-center space-x-1 overflow-x-auto pb-0.5">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'unread', label: 'Unread' },
                  { id: 'open', label: 'Open' },
                  { id: 'resolved', label: 'Resolved' }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id as StatusFilter)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      statusFilter === f.id
                        ? 'bg-[#C59B27] text-white shadow-2xs'
                        : 'bg-white dark:bg-[#24231F] text-zinc-600 dark:text-[#A8A095] border border-[#EAE8E1] dark:border-[#302F2A] hover:bg-zinc-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Participant Role Filters */}
              <div className="flex items-center space-x-1 overflow-x-auto">
                {[
                  { id: 'all', label: 'All Roles' },
                  { id: 'parent', label: 'Parents' },
                  { id: 'volunteer', label: 'Volunteers' }
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRoleFilter(r.id as ParticipantRoleFilter)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                      roleFilter === r.id
                        ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                        : 'bg-transparent text-zinc-500 dark:text-[#7A7570] hover:text-zinc-900 dark:hover:text-zinc-300'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Threads List Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#EAE8E1] dark:divide-[#302F2A]">
            {isLoadingThreads ? (
              <div className="py-16 text-center space-y-2">
                <div className="w-5 h-5 mx-auto border-2 border-[#C59B27] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-zinc-500">Loading conversations...</span>
              </div>
            ) : threadsError ? (
              <div className="p-4 text-center space-y-2">
                <AlertCircle className="w-5 h-5 mx-auto text-amber-600" />
                <p className="text-xs text-amber-800 dark:text-amber-200 font-medium">{threadsError}</p>
                <button
                  type="button"
                  onClick={() => fetchThreads(1)}
                  className="text-xs font-bold text-[#C59B27] hover:underline cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : threads.length === 0 ? (
              <div className="py-16 px-4 text-center space-y-2">
                <div className="w-10 h-10 mx-auto rounded-xl bg-zinc-100 dark:bg-[#24231F] flex items-center justify-center text-zinc-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300">No conversations found</h3>
                <p className="text-[11px] text-zinc-400 max-w-[200px] mx-auto">
                  Direct inquiries from parents and volunteers will appear here.
                </p>
              </div>
            ) : (
              threads.map(thread => {
                const isSelected = activeThreadId === thread.id;
                const hasUnread = Boolean(thread.is_unread || (thread.unread_count && thread.unread_count > 0));
                const isResolved = thread.status === 'resolved';
                const catBadge = getCategoryBadge(thread.category);
                const roleBadge = thread.participant_role === 'volunteer' ? 'Volunteer' : 'Parent';

                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      setActiveThreadId(thread.id);
                      if (onNavigate) {
                        onNavigate(`/admin/messages/${thread.id}`);
                      }
                    }}
                    className={`w-full text-left p-3.5 transition-colors cursor-pointer focus:outline-none ${
                      isSelected
                        ? 'bg-[#FAF6EB] dark:bg-[#262520] border-l-2 border-[#C59B27]'
                        : hasUnread
                        ? 'bg-[#FAF6EB]/60 dark:bg-[#262520]/60'
                        : 'bg-white dark:bg-[#1D1D1A] hover:bg-[#FAF9F6] dark:hover:bg-[#24231F]'
                    }`}
                  >
                    {/* Participant & Subject on left, time on right */}
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline space-x-1.5 min-w-0 truncate">
                        <span className={`text-xs truncate ${hasUnread ? 'font-bold text-[#18181B] dark:text-[#F0EBE3]' : 'font-semibold text-zinc-800 dark:text-zinc-200'}`}>
                          {thread.participant_name || 'Participant'}
                        </span>
                        <span className="text-[10px] text-zinc-400">·</span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {thread.subject}
                        </span>
                      </div>

                      <span className="text-[10px] text-zinc-400 whitespace-nowrap shrink-0">
                        {formatTimeAgo(thread.last_message_at || thread.created_at)}
                      </span>
                    </div>

                    {/* Short preview */}
                    <p className={`mt-0.5 text-xs line-clamp-1 leading-relaxed ${hasUnread ? 'text-[#3F3F46] dark:text-[#C0BAB2]' : 'text-zinc-500 dark:text-[#8C857B]'}`}>
                      {thread.last_message_preview || 'No messages'}
                    </p>

                    {/* Context · status */}
                    <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500 dark:text-[#8C857B]">
                      <div className="flex items-center space-x-1.5 truncate">
                        <span className="font-medium text-[#9A7326] dark:text-[#B89040]">
                          {roleBadge}
                        </span>
                        <span>·</span>
                        {thread.child_full_name ? (
                          <span className="truncate">
                            Application: {thread.child_full_name.split(' ')[0]}
                            {thread.entry_status ? ` (${thread.entry_status.replace('_', ' ')})` : ''}
                          </span>
                        ) : (
                          <span className="truncate">{catBadge.label}</span>
                        )}
                      </div>

                      <span className="font-medium shrink-0 ml-2">
                        {isResolved ? 'Resolved' : 'Open'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT PANE: SELECTED CONVERSATION VIEW                                   */}
        {/* ========================================================================= */}
        <div
          className={`flex-1 flex flex-col bg-white dark:bg-[#181817] min-w-0 ${
            activeThreadId ? 'flex' : 'hidden md:flex'
          }`}
        >
          {activeThread ? (
            <>
              {/* Active Thread Header */}
              <div className="p-3.5 border-b border-[#EAE8E1] dark:border-[#302F2A] bg-[#FCFBF8] dark:bg-[#1D1D1A] flex items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5 min-w-0">
                  {/* Mobile Back Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveThreadId(null);
                      if (onNavigate) onNavigate('/admin/messages');
                    }}
                    className="md:hidden p-1.5 -ml-1 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 rounded-lg cursor-pointer"
                    title="Back to conversations"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div className="min-w-0">
                    <h2 className="font-bold text-xs sm:text-sm text-[#18181B] dark:text-[#F0EBE3] truncate leading-tight font-sans">
                      {activeThread.subject}
                    </h2>

                    <div className="flex items-center space-x-1.5 text-[11px] text-zinc-500 dark:text-[#8C857B] mt-0.5 truncate">
                      <span className="font-medium text-[#9A7326] dark:text-[#C59B27]">
                        {primaryParticipant?.role === 'volunteer' ? 'Volunteer' : 'Parent'}: {primaryParticipant?.name}
                      </span>
                      {activeThread.child_full_name && (
                        <>
                          <span>·</span>
                          <span className="truncate">
                            Application: {activeThread.child_full_name.split(' ')[0]}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span className="font-medium">
                        {activeThread.status === 'resolved' ? 'Resolved' : 'Open'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Resolve / Reopen Action Buttons */}
                <div className="flex items-center space-x-2 shrink-0">
                  {activeThread.status === 'resolved' ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReopenThread}
                      disabled={isActionPending}
                      className="text-xs px-2.5 py-1 rounded-lg cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1 text-[#C59B27]" />
                      <span>Reopen thread</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResolveThread}
                      disabled={isActionPending}
                      className="text-xs px-2.5 py-1 rounded-lg cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                      <span>Resolve thread</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                {isLoadingMessages ? (
                  <div className="py-16 text-center space-y-2">
                    <div className="w-6 h-6 mx-auto border-2 border-[#C59B27] border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-zinc-500">Loading conversation...</span>
                  </div>
                ) : messagesError ? (
                  <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-900 dark:text-amber-200 text-center space-y-2">
                    <p className="font-medium">{messagesError}</p>
                    <button
                      type="button"
                      onClick={() => loadThread(activeThread.id)}
                      className="font-bold text-[#C59B27] hover:underline cursor-pointer"
                    >
                      Tap to retry
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-16 text-center text-xs text-zinc-400">
                    No messages in this conversation yet.
                  </div>
                ) : (
                  messages.map(msg => {
                    const isAdminSender = msg.sender_role === 'admin' || msg.sender_role === 'super_admin';
                    const isWorkflowA =
                      msg.message_type === 'application_completion_reminder' &&
                      msg.action_type === 'resume_application';
                    const isWorkflowB =
                      msg.message_type === 'application_correction_required' ||
                      msg.action_type === 'update_application_details';
                    const isReminder = isWorkflowA || isWorkflowB;

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isAdminSender ? 'items-end' : 'items-start'} space-y-1`}
                      >
                        {/* Sender Label & Timestamp */}
                        <div className="flex items-center space-x-1.5 px-1 text-[10px] text-zinc-400">
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            {isAdminSender ? 'Admin Support' : primaryParticipant?.name || 'User'}
                          </span>
                          <span>·</span>
                          <span>{formatMessageTime(msg.created_at)}</span>
                        </div>

                        {/* Message Box - Modest radius rounded-lg */}
                        <div
                          className={`max-w-[85%] rounded-lg px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                            isAdminSender
                              ? 'bg-[#FAF6EB] dark:bg-[#2A2926] text-[#18181B] dark:text-[#F0EBE3] border border-[#E5D5AE] dark:border-[#3A3835]'
                              : isReminder
                              ? 'bg-amber-50/50 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100 border border-amber-200 dark:border-amber-900/50'
                              : 'bg-white dark:bg-[#21211E] text-[#18181B] dark:text-[#F0EBE3] border border-[#EAE8E1] dark:border-[#302F2A]'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.body}</p>

                          {/* Reminder Action Context Block - Human-facing operations copy, no decorative icon */}
                          {isReminder && (
                            <div className="mt-2.5 pt-2.5 border-t border-[#EAE8E1] dark:border-[#302F2A] flex items-center space-x-1.5 text-[11px] text-[#9A7326] dark:text-[#C59B27] font-medium">
                              <span>{isWorkflowB ? 'Application details update requested' : 'Application completion reminder sent'}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Error Banner */}
              {replyError && (
                <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/40 border-t border-rose-200 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
                  <span>{replyError}</span>
                  <button
                    type="button"
                    onClick={() => setReplyError(null)}
                    className="font-bold underline ml-2 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Reply Composer or Resolved Banner */}
              <div className="border-t border-[#EAE8E1] dark:border-[#302F2A] bg-[#FAF9F6] dark:bg-[#1D1D1A] p-3">
                {activeThread.status === 'resolved' ? (
                  <div className="py-3 px-4 text-center space-y-0.5">
                    <p className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3]">
                      Conversation resolved
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Further replies are closed. Click "Reopen thread" above to send new messages.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSendReply} className="space-y-2">
                    <div className="relative">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        disabled={isSendingReply}
                        rows={3}
                        maxLength={5000}
                        placeholder="Write an official response (plain text, max 5000 characters)..."
                        className="w-full p-3 rounded-lg border border-[#EAE8E1] dark:border-[#302F2A] bg-white dark:bg-[#24231F] text-xs text-[#18181B] dark:text-[#F0EBE3] placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
                      />
                      <div className="absolute right-2.5 bottom-2 text-[10px] text-zinc-400">
                        {replyText.length} / 5000
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">
                        Replies are visible in the user's private Messages portal.
                      </span>

                      <Button
                        type="submit"
                        variant="primary"
                        disabled={!replyText.trim() || replyText.length > 5000 || isSendingReply}
                        className="text-xs px-4 py-1.5 rounded-lg cursor-pointer"
                      >
                        {isSendingReply ? (
                          <div className="flex items-center space-x-1.5">
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Sending...</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5">
                            <span>Send Reply</span>
                            <Send className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </>
          ) : (
            /* No Thread Selected Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-[#24231F] border border-[#EAE8E1] dark:border-[#302F2A] flex items-center justify-center text-zinc-400">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-sm text-[#18181B] dark:text-[#F0EBE3]">
                Select a conversation
              </h3>
              <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                Choose an inquiry from the list on the left to read messages and send an official response.
              </p>
            </div>
          )}
        </div>
      </div>
    ) : (
        /* ========================================================================= */
        /* ANNOUNCEMENTS MANAGER PANE                                               */
        /* ========================================================================= */
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1] dark:border-[#302F2A]">
            <div>
              <h2 className="text-base font-bold text-[#18181B] dark:text-[#F0EBE3] flex items-center space-x-2">
                <Megaphone className="w-4 h-4 text-[#C59B27]" />
                <span>Broadcast Announcements</span>
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Published one-way announcements to Parents and Volunteers. Recipient replies are disabled.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchAnnouncements}
              disabled={isLoadingAnnouncements}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title="Refresh announcements"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingAnnouncements ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {isLoadingAnnouncements ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
              <div className="w-6 h-6 border-2 border-[#C59B27] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-zinc-500">Loading broadcast history...</span>
            </div>
          ) : announcementsError ? (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-start space-x-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{announcementsError}</p>
                <button
                  type="button"
                  onClick={fetchAnnouncements}
                  className="mt-1 font-bold text-[#9A7326] hover:underline cursor-pointer"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : announcements.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-[#24231F] border border-[#EAE8E1] dark:border-[#302F2A] flex items-center justify-center text-zinc-400">
                <Megaphone className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-sm text-[#18181B] dark:text-[#F0EBE3]">
                No announcements yet
              </h3>
              <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                Click "New Announcement" above to publish your first broadcast to Parents or Volunteers.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map(ann => {
                const badge = getAudienceBadge(ann.audience_type, ann);
                const publishedDate = new Date(ann.published_at).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={ann.id}
                    className="p-4 rounded-xl border border-[#EAE8E1] dark:border-[#302F2A] bg-white dark:bg-[#24231F] hover:border-[#D5D2C8] dark:hover:border-[#42403B] transition-all space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${badge.className}`}>
                            {badge.label}
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            {publishedDate}
                          </span>
                        </div>
                        <h4 className="font-semibold text-sm text-[#18181B] dark:text-[#F0EBE3]">
                          {ann.title}
                        </h4>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {ann.total_reads ?? 0} {ann.total_reads === 1 ? 'read' : 'reads'}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setViewingAnnouncement(ann)}
                          className="text-xs"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          <span>View</span>
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed">
                      {ann.body}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ANNOUNCEMENT DETAIL MODAL */}
      {viewingAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1D1D1A] rounded-2xl max-w-lg w-full p-6 border border-[#EAE8E1] dark:border-[#302F2A] shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${getAudienceBadge(viewingAnnouncement.audience_type, viewingAnnouncement).className}`}>
                  {getAudienceBadge(viewingAnnouncement.audience_type, viewingAnnouncement).label}
                </span>
                <h3 className="font-bold text-base text-[#18181B] dark:text-[#F0EBE3] mt-2">
                  {viewingAnnouncement.title}
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Published {new Date(viewingAnnouncement.published_at).toLocaleString()} • {viewingAnnouncement.total_reads ?? 0} reads recorded
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingAnnouncement(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#FAF9F6] dark:bg-[#252420] border border-[#EAE8E1] dark:border-[#302F2A] max-h-72 overflow-y-auto">
              <p className="text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                {viewingAnnouncement.body}
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setViewingAnnouncement(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ANNOUNCEMENT COMPOSER MODAL */}
      {isComposerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <form
            onSubmit={handlePublishAnnouncement}
            className="bg-white dark:bg-[#1D1D1A] rounded-2xl max-w-lg w-full p-6 border border-[#EAE8E1] dark:border-[#302F2A] shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1] dark:border-[#302F2A]">
              <div className="flex items-center space-x-2">
                <Megaphone className="w-4 h-4 text-[#C59B27]" />
                <h3 className="font-bold text-sm sm:text-base text-[#18181B] dark:text-[#F0EBE3]">
                  New Broadcast Announcement
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsComposerOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {composerError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-center space-x-2 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{composerError}</span>
              </div>
            )}

            {/* Audience Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Audience
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'all_parents', label: 'All Parents' },
                  { id: 'all_volunteers', label: 'All Volunteers' },
                  { id: 'everyone', label: 'Everyone' },
                  { id: 'selected_parent', label: 'Selected Parent' },
                  { id: 'selected_volunteer', label: 'Selected Volunteer' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setComposerAudience(opt.id as AnnouncementAudienceType);
                      setComposerTargetUser(null);
                      setRecipientSearchQuery('');
                      setComposerError(null);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border text-left flex items-center justify-between transition-all cursor-pointer ${
                      composerAudience === opt.id
                        ? 'border-[#C59B27] bg-[#FAF6EB] dark:bg-[#2A2720] text-[#18181B] dark:text-[#F0EBE3] font-semibold ring-1 ring-[#C59B27]'
                        : 'border-[#EAE8E1] dark:border-[#302F2A] bg-stone-50 dark:bg-[#252420] text-zinc-600 dark:text-zinc-400 hover:bg-stone-100'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {composerAudience === opt.id && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#C59B27]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Recipient Picker for Selected Parent / Volunteer */}
            {(composerAudience === 'selected_parent' || composerAudience === 'selected_volunteer') && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Target {composerAudience === 'selected_parent' ? 'Parent' : 'Volunteer'}
                </label>
                {composerTargetUser ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50">
                    <div className="text-xs">
                      <span className="font-semibold text-amber-900 dark:text-amber-200">
                        {composerTargetUser.name}
                      </span>
                      <span className="text-zinc-500 ml-1.5 font-mono text-[11px]">
                        ({composerTargetUser.email})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setComposerTargetUser(null)}
                      className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
                      <input
                        type="text"
                        value={recipientSearchQuery}
                        onChange={e => setRecipientSearchQuery(e.target.value)}
                        placeholder={`Search ${composerAudience === 'selected_parent' ? 'parent' : 'volunteer'} by name or email...`}
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-[#EAE8E1] dark:border-[#302F2A] bg-white dark:bg-[#24231F] text-xs text-[#18181B] dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                      />
                    </div>
                    {isLoadingRecipients ? (
                      <div className="p-2 text-center text-xs text-zinc-400">Searching...</div>
                    ) : recipientCandidates.length > 0 ? (
                      <div className="max-h-36 overflow-y-auto rounded-xl border border-[#EAE8E1] dark:border-[#302F2A] bg-white dark:bg-[#24231F] divide-y divide-[#EAE8E1] dark:divide-[#302F2A]">
                        {recipientCandidates.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setComposerTargetUser(c);
                              setRecipientSearchQuery('');
                              setComposerError(null);
                            }}
                            className="w-full text-left p-2 hover:bg-stone-50 dark:hover:bg-[#2C2B27] flex items-center justify-between text-xs cursor-pointer"
                          >
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">{c.name}</span>
                            <span className="text-zinc-400 text-[11px] font-mono">{c.email}</span>
                          </button>
                        ))}
                      </div>
                    ) : recipientSearchQuery ? (
                      <div className="p-2 text-center text-xs text-zinc-400">No matching recipients found</div>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {/* Title Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Announcement Title
                </label>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {composerTitle.length} / 120
                </span>
              </div>
              <input
                type="text"
                maxLength={120}
                value={composerTitle}
                onChange={e => setComposerTitle(e.target.value)}
                placeholder="e.g. Schedule Update for Saturday..."
                className="w-full px-3 py-2 rounded-xl border border-[#EAE8E1] dark:border-[#302F2A] bg-[#FAF9F6] dark:bg-[#252420] text-xs sm:text-sm text-[#18181B] dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              />
            </div>

            {/* Message Body Textarea */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Message Body
                </label>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {composerBody.length} / 5000
                </span>
              </div>
              <textarea
                rows={5}
                maxLength={5000}
                value={composerBody}
                onChange={e => setComposerBody(e.target.value)}
                placeholder="Write your broadcast message here..."
                className="w-full px-3 py-2 rounded-xl border border-[#EAE8E1] dark:border-[#302F2A] bg-[#FAF9F6] dark:bg-[#252420] text-xs sm:text-sm text-[#18181B] dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#EAE8E1] dark:border-[#302F2A]">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsComposerOpen(false)}
                disabled={isPublishingAnnouncement}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={
                  isPublishingAnnouncement ||
                  !composerTitle.trim() ||
                  !composerBody.trim() ||
                  ((composerAudience === 'selected_parent' || composerAudience === 'selected_volunteer') && !composerTargetUser)
                }
              >
                {isPublishingAnnouncement ? 'Publishing...' : 'Publish Announcement'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
