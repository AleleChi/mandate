import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Send,
  MessageSquare,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Shield,
  HelpCircle,
  Activity,
  Wrench,
  BookOpen,
  ChevronRight,
  X,
  Megaphone
} from 'lucide-react';
import { VolunteerMessageThread, VolunteerMessage, VolunteerCategory, Announcement } from '../../types';
import { api, extractApiError } from '../../services/api';
import { Button } from '../../components/common/Button';
import { BrandLogo } from '../../components/common/BrandLogo';
import { useRealtimeSubscription, useRealtimeResync } from '../../services/realtime';

export interface VolunteerMessagesViewProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  volunteerProfile?: any;
  onUnreadCountChange?: (count: number) => void;
}

const CATEGORY_CONFIG: Record<
  VolunteerCategory,
  { label: string; icon: React.ComponentType<{ className?: string }>; badgeClass: string }
> = {
  general_support: {
    label: 'General Support',
    icon: HelpCircle,
    badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200/60 dark:border-blue-900/40'
  },
  duty_support: {
    label: 'Duty Support',
    icon: Activity,
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/60 dark:border-amber-900/40'
  },
  training_support: {
    label: 'Training Support',
    icon: BookOpen,
    badgeClass: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200/60 dark:border-purple-900/40'
  },
  technical_support: {
    label: 'Technical Support',
    icon: Wrench,
    badgeClass: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border-stone-200/60 dark:border-stone-700'
  }
};

function formatRelativeTime(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24 && now.getDate() === d.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1 || (diffDays === 0 && now.getDate() !== d.getDate())) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function formatMessageTime(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const isToday = now.toDateString() === d.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) return `Today, ${timeStr}`;
  const dateStr = d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${dateStr}, ${timeStr}`;
}

export const VolunteerMessagesView: React.FC<VolunteerMessagesViewProps> = ({
  currentRoute,
  onNavigate,
  onUnreadCountChange
}) => {
  // Extract thread ID if route is /volunteer/messages/:threadId
  const threadIdFromRoute = currentRoute.startsWith('/volunteer/messages/')
    ? currentRoute.replace('/volunteer/messages/', '').split('?')[0].trim()
    : null;

  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadIdFromRoute || null);

  // Subtabs & Announcements State
  const [inboxTab, setInboxTab] = useState<'threads' | 'announcements'>('threads');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState<boolean>(false);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);
  const [unreadAnnouncementsCount, setUnreadAnnouncementsCount] = useState<number>(0);
  const [unreadThreadsCount, setUnreadThreadsCount] = useState<number>(0);
  const [activeAnnouncement, setActiveAnnouncement] = useState<Announcement | null>(null);

  // Inbox Threads State
  const [threads, setThreads] = useState<VolunteerMessageThread[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState<boolean>(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);

  // Active Thread Messages State
  const [activeThread, setActiveThread] = useState<VolunteerMessageThread | null>(null);
  const [messages, setMessages] = useState<VolunteerMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  // Active Thread Reply Composer
  const [replyText, setReplyText] = useState<string>('');
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // New Thread Modal / Form State
  const [isCreatingThread, setIsCreatingThread] = useState<boolean>(false);
  const [newCategory, setNewCategory] = useState<VolunteerCategory>('general_support');
  const [newSubject, setNewSubject] = useState<string>('');
  const [newBody, setNewBody] = useState<string>('');
  const [isSubmittingNew, setIsSubmittingNew] = useState<boolean>(false);
  const [newThreadError, setNewThreadError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Combined Unread Helper
  const updateCombinedUnread = useCallback((tCount: number, aCount: number) => {
    onUnreadCountChange?.(tCount + aCount);
  }, [onUnreadCountChange]);

  // Auto-scroll when messages update
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  };

  // Sync route param with state
  useEffect(() => {
    if (threadIdFromRoute !== activeThreadId) {
      setActiveThreadId(threadIdFromRoute);
    }
  }, [threadIdFromRoute]);

  // Load threads
  const loadThreads = useCallback(async () => {
    setIsLoadingThreads(true);
    setThreadsError(null);
    try {
      const [threadsRes, unreadRes, unreadAncRes] = await Promise.all([
        api.volunteer.messages.listThreads({ limit: 50 }),
        api.volunteer.messages.getUnreadCount(),
        api.volunteer.announcements.getUnreadCount()
      ]);

      let tCount = 0;
      let aCount = 0;

      if (threadsRes && threadsRes.success) {
        setThreads(threadsRes.threads || []);
      }
      if (unreadRes && unreadRes.success) {
        tCount = unreadRes.unreadCount ?? unreadRes.unreadThreadCount ?? 0;
        setUnreadThreadsCount(tCount);
      }
      if (unreadAncRes && unreadAncRes.success) {
        aCount = unreadAncRes.unreadCount ?? 0;
        setUnreadAnnouncementsCount(aCount);
      }
      updateCombinedUnread(tCount, aCount);
    } catch (err: any) {
      const parsed = extractApiError(err);
      setThreadsError(parsed.message || 'Unable to load support conversations. Please try again.');
    } finally {
      setIsLoadingThreads(false);
    }
  }, [updateCombinedUnread]);

  // Load announcements
  const loadAnnouncements = useCallback(async () => {
    setIsLoadingAnnouncements(true);
    setAnnouncementsError(null);
    try {
      const [annRes, unreadAncRes] = await Promise.all([
        api.volunteer.announcements.list({ limit: 50 }),
        api.volunteer.announcements.getUnreadCount()
      ]);

      if (annRes && annRes.success) {
        setAnnouncements(annRes.announcements || []);
      }
      if (unreadAncRes && unreadAncRes.success) {
        const aCount = unreadAncRes.unreadCount ?? 0;
        setUnreadAnnouncementsCount(aCount);
        updateCombinedUnread(unreadThreadsCount, aCount);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      setAnnouncementsError(parsed.message || 'Unable to load announcements. Please try again.');
    } finally {
      setIsLoadingAnnouncements(false);
    }
  }, [unreadThreadsCount, updateCombinedUnread]);

  useEffect(() => {
    if (inboxTab === 'announcements') {
      loadAnnouncements();
    }
  }, [inboxTab, loadAnnouncements]);

  const handleOpenAnnouncement = async (announcement: Announcement) => {
    setActiveAnnouncement(announcement);
    if (!announcement.is_read) {
      try {
        await api.volunteer.announcements.markRead(announcement.id);
        setAnnouncements(prev =>
          prev.map(a => a.id === announcement.id ? { ...a, is_read: true, read_at: new Date().toISOString() } : a)
        );
        const unreadAncRes = await api.volunteer.announcements.getUnreadCount();
        if (unreadAncRes && unreadAncRes.success) {
          const aCount = unreadAncRes.unreadCount ?? 0;
          setUnreadAnnouncementsCount(aCount);
          updateCombinedUnread(unreadThreadsCount, aCount);
        }
      } catch {
        // non-blocking
      }
    }
  };

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Load thread detail and messages when activeThreadId changes
  const loadThread = useCallback(async (threadId: string) => {
    setIsLoadingMessages(true);
    setMessagesError(null);
    try {
      const [threadRes, msgsRes] = await Promise.all([
        api.volunteer.messages.getThread(threadId),
        api.volunteer.messages.getMessages(threadId, { limit: 100 })
      ]);

      if (threadRes && threadRes.success) {
        setActiveThread(threadRes.thread);
      }
      if (msgsRes && msgsRes.success) {
        setMessages(msgsRes.messages || []);
      }

      // Mark read for volunteer participant
      await api.volunteer.messages.markRead(threadId).catch(() => {});

      // Refresh unread count
      api.volunteer.messages.getUnreadCount().then((res) => {
        if (res && res.success) {
          const tCount = res.unreadCount ?? res.unreadThreadCount ?? 0;
          setUnreadThreadsCount(tCount);
          updateCombinedUnread(tCount, unreadAnnouncementsCount);
        }
      }).catch(() => {});

      setTimeout(() => scrollToBottom('auto'), 100);
    } catch (err: any) {
      const parsed = extractApiError(err);
      setMessagesError(parsed.message || 'Unable to load conversation details.');
    } finally {
      setIsLoadingMessages(false);
    }
  }, [onUnreadCountChange]);

  // Phase H Realtime Event Handlers
  useRealtimeSubscription(['message.created', 'thread.updated'], (detail: any) => {
    loadThreads();
    if (activeThreadId && (detail?.threadId === activeThreadId || !detail?.threadId)) {
      loadThread(activeThreadId);
    }
  });

  useRealtimeSubscription('announcement.published', () => {
    loadAnnouncements();
    loadThreads();
  });

  useRealtimeSubscription('notification.created', () => {
    loadThreads();
  });

  useRealtimeResync(() => {
    loadThreads();
    if (inboxTab === 'announcements') {
      loadAnnouncements();
    }
    if (activeThreadId) {
      loadThread(activeThreadId);
    }
  });

  useEffect(() => {
    if (activeThreadId) {
      loadThread(activeThreadId);
    } else {
      setActiveThread(null);
      setMessages([]);
    }
  }, [activeThreadId, loadThread]);

  // Send reply in active thread
  const handleSendReply = async () => {
    if (!activeThreadId || !replyText.trim() || isSendingReply) return;
    if (activeThread?.status === 'resolved') {
      setReplyError('This conversation has been resolved. Further replies are disabled.');
      return;
    }

    const textToSend = replyText.trim();
    if (textToSend.length > 5000) {
      setReplyError('Message cannot exceed 5,000 characters.');
      return;
    }

    setIsSendingReply(true);
    setReplyError(null);

    try {
      const res = await api.volunteer.messages.sendMessage(activeThreadId, textToSend);
      if (res && res.success && res.message) {
        setMessages((prev) => [...prev, res.message]);
        setReplyText('');
        setTimeout(() => scrollToBottom('smooth'), 50);

        // Update thread in local list
        setThreads((prev) =>
          prev.map((t) =>
            t.id === activeThreadId
              ? {
                  ...t,
                  last_message_at: res.message.created_at,
                  last_message_preview: res.message.body.slice(0, 100)
                }
              : t
          )
        );
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      if (parsed.code === 'MESSAGE_THREAD_RESOLVED') {
        setReplyError('This conversation has been resolved. You can read the history above.');
        if (activeThread) {
          setActiveThread({ ...activeThread, status: 'resolved' });
        }
      } else {
        setReplyError(parsed.message || 'Failed to send message. Please tap retry.');
      }
    } finally {
      setIsSendingReply(false);
    }
  };

  // Submit new support conversation
  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingNew) return;

    const trimmedSubject = newSubject.trim();
    const trimmedBody = newBody.trim();

    if (!trimmedSubject) {
      setNewThreadError('Subject is required.');
      return;
    }
    if (trimmedSubject.length > 120) {
      setNewThreadError('Subject cannot exceed 120 characters.');
      return;
    }
    if (!trimmedBody) {
      setNewThreadError('Message body is required.');
      return;
    }
    if (trimmedBody.length > 5000) {
      setNewThreadError('Message body cannot exceed 5,000 characters.');
      return;
    }

    setIsSubmittingNew(true);
    setNewThreadError(null);

    try {
      const res = await api.volunteer.messages.createThread({
        category: newCategory,
        subject: trimmedSubject,
        body: trimmedBody
      });

      if (res && res.success && res.thread) {
        setIsCreatingThread(false);
        setNewSubject('');
        setNewBody('');
        setNewCategory('general_support');

        // Refresh thread list and navigate to new thread
        await loadThreads();
        onNavigate(`/volunteer/messages/${res.thread.id}`);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      setNewThreadError(parsed.message || 'Failed to send message. Please try again.');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // ============================================================================
  // RENDER: ANNOUNCEMENT DETAIL VIEW (One-way official broadcast, NO reply composer)
  // ============================================================================
  if (activeAnnouncement) {
    const publishedFormatted = new Date(activeAnnouncement.published_at).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return (
      <div className="flex flex-col min-h-[calc(100vh-3.5rem)] pb-28 space-y-4">
        {/* Subpage Header with Back Arrow */}
        <div className="flex items-center justify-between py-3 border-b border-[#EAE8E1] dark:border-[#302E29]">
          <button
            type="button"
            onClick={() => setActiveAnnouncement(null)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-[#F0EBE3] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Announcements</span>
          </button>

          <span className="text-[10px] text-zinc-400 dark:text-[#938C81] uppercase tracking-wider font-semibold">
            Broadcast
          </span>
        </div>

        {/* Content Body */}
        <div className="space-y-4 pt-1">
          <div className="space-y-1">
            <div className="flex items-center space-x-1.5 text-[10px] uppercase tracking-wider font-semibold text-[#9A7326] dark:text-[#C59B27]">
              <span>Koinonia Volunteer Team</span>
              <span>·</span>
              <span className="text-[#71717A] dark:text-[#7A7570] font-normal">{publishedFormatted}</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold font-sans text-[#18181B] dark:text-[#F0EBE3] leading-snug">
              {activeAnnouncement.title}
            </h1>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] shadow-2xs">
            <p className="text-xs sm:text-sm text-[#18181B] dark:text-[#F0EBE3] leading-relaxed whitespace-pre-wrap">
              {activeAnnouncement.body}
            </p>
          </div>

          <div className="p-3.5 text-center rounded-xl bg-zinc-50 dark:bg-[#252420] border border-zinc-200/80 dark:border-[#302E29]">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              This is an official announcement from the Koinonia Team. Direct replies are disabled for broadcast messages.
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setActiveAnnouncement(null)}
            className="w-full text-xs"
          >
            Back to Announcements
          </Button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER: THREAD DETAIL VIEW
  // ============================================================================
  if (activeThreadId) {
    const isResolved = activeThread?.status === 'resolved';
    const catConfig = activeThread?.category
      ? CATEGORY_CONFIG[activeThread.category as VolunteerCategory] || {
          label: 'Support',
          icon: MessageSquare,
          badgeClass: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
        }
      : null;
    const CatIcon = catConfig?.icon || MessageSquare;

    return (
      <div className="flex flex-col min-h-[calc(100vh-3.5rem)] pb-28">
        {/* Header matching Parent thread header */}
        <div className="flex items-center justify-between py-3 border-b border-[#EAE8E1] dark:border-[#302E29]">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onNavigate('/volunteer/messages')}
              className="p-1.5 -ml-1 rounded-lg text-[#3F3F46] dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer focus:outline-none"
              aria-label="Back to Messages"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-xs sm:text-sm font-bold text-[#18181B] dark:text-[#F0EBE3] truncate leading-tight font-sans">
                {activeThread?.subject || 'Conversation'}
              </h1>
              <div className="flex items-center space-x-1.5 mt-0.5 text-[10px]">
                <span className="text-[#9A7326] dark:text-[#C59B27] font-semibold truncate">
                  {catConfig?.label || 'Volunteer Support'}
                </span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                  {isResolved ? 'Resolved' : 'Open'}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0 pl-2">
            <BrandLogo context="compact" className="cursor-pointer object-contain" />
          </div>
        </div>

        {/* Messages Body / Stream */}
        <div className="flex-1 py-4 space-y-3.5 overflow-y-auto">
          {isLoadingMessages ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin text-[#C59B27]" />
              <span className="text-xs">Loading conversation...</span>
            </div>
          ) : messagesError ? (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Could not load messages</span>
              </div>
              <p>{messagesError}</p>
              <button
                type="button"
                onClick={() => loadThread(activeThreadId)}
                className="font-semibold underline hover:no-underline cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-xs text-zinc-400">
              No messages found in this conversation.
            </div>
          ) : (
            messages.map((msg) => {
              const isVolunteer = msg.sender_role === 'volunteer';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isVolunteer ? 'items-end' : 'items-start'} space-y-1`}
                >
                  {/* Sender Header */}
                  <div className="flex items-center gap-1.5 px-1 text-[10px] text-[#71717A] dark:text-[#7A7570]">
                    <span className="font-semibold text-[#18181B] dark:text-[#F0EBE3]">
                      {isVolunteer ? 'You' : 'Koinonia Volunteer Team'}
                    </span>
                    <span>·</span>
                    <span>{formatMessageTime(msg.created_at)}</span>
                  </div>

                  {/* Message Bubble - Modest radius rounded-lg */}
                  <div
                    className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                      isVolunteer
                        ? 'bg-[#FAF6EB] dark:bg-[#2A2926] text-[#18181B] dark:text-[#F0EBE3] border border-[#E5D5AE] dark:border-[#3A3835]'
                        : 'bg-white dark:bg-[#21211E] text-[#18181B] dark:text-[#F0EBE3] border border-[#EAE8E1] dark:border-[#302E29]'
                    }`}
                  >
                    {msg.body}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Composer or Resolved Notice */}
        {isResolved ? (
          <div className="mt-2 py-4 px-4 rounded-lg bg-zinc-100 dark:bg-[#242320] border border-zinc-200 dark:border-[#302E29] text-center space-y-0.5 text-zinc-600 dark:text-zinc-400">
            <p className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3]">
              Conversation resolved
            </p>
            <p className="text-[11px] text-[#71717A] dark:text-[#7A7570]">
              Further replies are closed. If you have new questions, please start a new conversation.
            </p>
          </div>
        ) : (
          <div className="mt-2 border-t border-[#EAE8E1] dark:border-[#302E29] pt-3 space-y-2">
            {replyError && (
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between">
                <span>{replyError}</span>
                <button
                  type="button"
                  onClick={() => setReplyError(null)}
                  className="p-1 hover:text-amber-950 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="relative">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your message to the registration/admin team..."
                maxLength={5000}
                rows={3}
                disabled={isSendingReply}
                className="w-full p-3 text-xs bg-white dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#302E29] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none text-[#18181B] dark:text-[#F0EBE3]"
              />
              <div className="flex items-center justify-between pt-1 px-1">
                <span className="text-[10px] text-zinc-400 font-mono">
                  {replyText.length} / 5000
                </span>
                <Button
                  type="button"
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || isSendingReply}
                  variant="primary"
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-none"
                >
                  {isSendingReply ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Send</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // RENDER: INBOX LIST VIEW + NEW CONVERSATION MODAL
  // ============================================================================
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)] pb-28 space-y-4">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#FAF8F3]/95 dark:bg-[#1D1D1A]/95 backdrop-blur-md border-b border-[#EAE8E1]/50 dark:border-[#302E29]">
        <div className="px-5 h-14 flex items-center justify-between">
          <BrandLogo
            context="compact"
            onClick={() => onNavigate('/volunteer/dashboard')}
            className="cursor-pointer"
          />

          <div className="flex items-center space-x-2">
            {inboxTab === 'threads' && (
              <button
                type="button"
                id="btn-volunteer-new-message"
                onClick={() => {
                  setIsCreatingThread(true);
                  setNewThreadError(null);
                }}
                className="p-2 rounded-xl border border-[#C59B27]/40 bg-[#FAF6EB] dark:bg-[#262520] hover:bg-[#F3ECE0] dark:hover:bg-[#2e2d28] text-[#9A7326] dark:text-[#C59B27] transition-all cursor-pointer flex items-center justify-center shadow-xs active:scale-95"
                title="New message"
                aria-label="New message"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Subtab Switcher: Support Chats vs Announcements */}
      <div className="flex items-center space-x-4 border-b border-[#EAE8E1] dark:border-[#302E29] pb-0 px-4">
        <button
          type="button"
          id="tab-volunteer-threads"
          onClick={() => setInboxTab('threads')}
          className={`pb-2.5 text-xs transition-all border-b-2 cursor-pointer flex items-center space-x-1.5 ${
            inboxTab === 'threads'
              ? 'border-[#C59B27] font-bold text-[#18181B] dark:text-[#F0EBE3]'
              : 'border-transparent font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
          }`}
        >
          <span>Conversations</span>
          {unreadThreadsCount > 0 && (
            <span className="px-1.5 rounded-sm text-[9px] font-bold bg-[#E07A5F] text-white">
              {unreadThreadsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          id="tab-volunteer-announcements"
          onClick={() => {
            setInboxTab('announcements');
            loadAnnouncements();
          }}
          className={`pb-2.5 text-xs transition-all border-b-2 cursor-pointer flex items-center space-x-1.5 ${
            inboxTab === 'announcements'
              ? 'border-[#C59B27] font-bold text-[#18181B] dark:text-[#F0EBE3]'
              : 'border-transparent font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
          }`}
        >
          <span>Announcements</span>
          {unreadAnnouncementsCount > 0 && (
            <span className="px-1.5 rounded-sm text-[9px] font-bold bg-[#E07A5F] text-white">
              {unreadAnnouncementsCount}
            </span>
          )}
        </button>
      </div>

      {/* Main Inbox Content: Threads vs Announcements */}
      <div className="flex-1 flex flex-col">
        {inboxTab === 'threads' ? (
        isLoadingThreads ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#C59B27]" />
            <span className="text-xs">Loading conversations...</span>
          </div>
        ) : threadsError ? (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Could not load conversations</span>
            </div>
            <p>{threadsError}</p>
            <button
              type="button"
              onClick={loadThreads}
              className="font-semibold underline hover:no-underline cursor-pointer"
            >
              Tap to retry
            </button>
          </div>
        ) : threads.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 my-auto">
            <div className="w-13 h-13 rounded-2xl bg-[#F5F2EB] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#33312B] shadow-2xs flex items-center justify-center mb-4 text-[#9A7326] dark:text-[#C59B27]">
              <MessageSquare className="w-6 h-6 stroke-[1.6]" />
            </div>

            <h3 className="text-base font-semibold text-[#18181B] dark:text-[#F0EBE3] tracking-tight">
              No conversations yet
            </h3>
            <p className="text-xs text-[#71717A] dark:text-[#A19D95] mt-1.5 max-w-[260px] leading-relaxed">
              Messages from the Koinonia Volunteer Team will appear here.
            </p>
            <button
              type="button"
              id="btn-volunteer-empty-start-conversation"
              onClick={() => {
                setIsCreatingThread(true);
                setNewThreadError(null);
              }}
              className="mt-5 inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl border border-[#C59B27]/40 bg-[#FAF6EB] dark:bg-[#262520] hover:bg-[#F3ECE0] dark:hover:bg-[#2e2d28] active:scale-98 text-[#9A7326] dark:text-[#D4AF37] font-semibold text-xs transition-all shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.25]" />
              <span>Start a conversation</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#EAE8E1] dark:divide-[#302E29]">
            {threads.map((thread) => {
              const isResolved = thread.status === 'resolved';
              const catConfig = CATEGORY_CONFIG[thread.category as VolunteerCategory] || {
                label: 'Volunteer Support',
                icon: MessageSquare,
                badgeClass: ''
              };
              const hasUnread = (thread.unread_count || 0) > 0 || thread.is_unread;

              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => onNavigate(`/volunteer/messages/${thread.id}`)}
                  className={`w-full text-left px-4 py-3 transition-colors cursor-pointer focus:outline-none ${
                    hasUnread
                      ? 'bg-[#FAF6EB]/60 dark:bg-[#262520]/60'
                      : 'bg-transparent hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
                  }`}
                >
                  {/* Subject / sender & time */}
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`text-xs sm:text-[13px] leading-snug truncate ${
                        hasUnread
                          ? 'font-bold text-[#18181B] dark:text-[#F0EBE3]'
                          : 'font-medium text-[#27272A] dark:text-[#D4D4D8]'
                      }`}
                    >
                      {thread.subject}
                    </span>

                    <span className="text-[10px] text-[#71717A] dark:text-[#7A7570] whitespace-nowrap shrink-0">
                      {formatRelativeTime(thread.last_message_at)}
                    </span>
                  </div>

                  {/* Short preview */}
                  <p
                    className={`mt-0.5 text-xs line-clamp-1 leading-relaxed ${
                      hasUnread
                        ? 'text-[#3F3F46] dark:text-[#C0BAB2]'
                        : 'text-[#71717A] dark:text-[#7A7570]'
                    }`}
                  >
                    {thread.last_message_preview || 'No messages'}
                  </p>

                  {/* Context · status */}
                  <div className="mt-1 flex items-center space-x-1.5 text-[10px] text-[#71717A] dark:text-[#8C857B]">
                    <span className="font-medium text-[#9A7326] dark:text-[#B89040]">
                      {catConfig.label}
                    </span>
                    <span>·</span>
                    <span>{isResolved ? 'Resolved' : 'Open'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        /* Announcements Inbox */
        isLoadingAnnouncements ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#C59B27]" />
            <span className="text-xs">Loading announcements...</span>
          </div>
        ) : announcementsError ? (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Could not load announcements</span>
            </div>
            <p>{announcementsError}</p>
            <button
              type="button"
              onClick={loadAnnouncements}
              className="font-semibold underline hover:no-underline cursor-pointer"
            >
              Tap to retry
            </button>
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 my-auto">
            <div className="w-13 h-13 rounded-2xl bg-[#F5F2EB] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#33312B] shadow-2xs flex items-center justify-center mb-4 text-[#9A7326] dark:text-[#C59B27]">
              <Megaphone className="w-6 h-6 stroke-[1.6]" />
            </div>

            <h3 className="text-base font-semibold text-[#18181B] dark:text-[#F0EBE3] tracking-tight">
              No announcements yet
            </h3>
            <p className="text-xs text-[#71717A] dark:text-[#A19D95] mt-1.5 max-w-[260px] leading-relaxed">
              Official team announcements, training schedules, and briefings will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EAE8E1] dark:divide-[#302E29]">
            {announcements.map((ann) => {
              const isUnread = !ann.is_read;
              return (
                <button
                  key={ann.id}
                  type="button"
                  onClick={() => handleOpenAnnouncement(ann)}
                  className={`w-full text-left px-4 py-3 transition-colors cursor-pointer focus:outline-none ${
                    isUnread
                      ? 'bg-[#FAF6EB]/60 dark:bg-[#262520]/60'
                      : 'bg-transparent hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
                  }`}
                >
                  {/* Title & time */}
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-xs sm:text-[13px] leading-snug truncate ${
                      isUnread
                        ? 'font-bold text-[#18181B] dark:text-[#F0EBE3]'
                        : 'font-medium text-[#27272A] dark:text-[#D4D4D8]'
                    }`}>
                      {ann.title}
                    </span>
                    <span className="text-[10px] text-[#71717A] dark:text-[#7A7570] whitespace-nowrap shrink-0">
                      {formatRelativeTime(ann.published_at)}
                    </span>
                  </div>

                  {/* Short preview */}
                  <p className={`mt-0.5 text-xs line-clamp-1 leading-relaxed ${
                    isUnread
                      ? 'text-[#3F3F46] dark:text-[#C0BAB2]'
                      : 'text-[#71717A] dark:text-[#7A7570]'
                  }`}>
                    {ann.body}
                  </p>

                  {/* Context */}
                  <div className="mt-1 flex items-center space-x-1.5 text-[10px] text-[#71717A] dark:text-[#8C857B]">
                    <span className="font-medium text-[#9A7326] dark:text-[#B89040]">
                      Announcement
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}
      </div>

      {/* NEW CONVERSATION MODAL */}
      {isCreatingThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1] dark:border-[#302E29]">
              <div>
                <h3 className="font-sans font-semibold text-sm text-[#18181B] dark:text-[#F0EBE3]">
                  New conversation
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-[#938C81] mt-0.5">
                  Direct message with the Koinonia Admin Team
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatingThread(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {newThreadError && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 text-xs">
                {newThreadError}
              </div>
            )}

            <form onSubmit={handleCreateThread} className="space-y-3.5 overflow-y-auto pr-1">
              {/* Category Select */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-[#D1CBC1] block">
                  Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(CATEGORY_CONFIG) as VolunteerCategory[]).map((cat) => {
                    const cfg = CATEGORY_CONFIG[cat];
                    const isSelected = newCategory === cat;
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setNewCategory(cat)}
                        className={`p-2 rounded-lg border text-left text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-[#C59B27]/10 border-[#C59B27] text-[#18181B] dark:text-[#F0EBE3] font-semibold'
                            : 'bg-zinc-50 dark:bg-[#242320] border-zinc-200 dark:border-[#302E29] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-[#C59B27]' : 'text-zinc-400'}`} />
                        <span className="truncate">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-[#D1CBC1]">
                    Subject
                  </label>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {newSubject.length} / 120
                  </span>
                </div>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Brief summary of your question or issue"
                  maxLength={120}
                  required
                  className="w-full p-2.5 text-xs bg-white dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#302E29] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-[#18181B] dark:text-[#F0EBE3]"
                />
              </div>

              {/* Message Body */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-[#D1CBC1]">
                    Message
                  </label>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {newBody.length} / 5000
                  </span>
                </div>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Details for the support team..."
                  maxLength={5000}
                  rows={4}
                  required
                  className="w-full p-2.5 text-xs bg-white dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#302E29] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none text-[#18181B] dark:text-[#F0EBE3]"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#302E29]">
                <button
                  type="button"
                  onClick={() => setIsCreatingThread(false)}
                  disabled={isSubmittingNew}
                  className="px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-[#302E29] text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#262520] cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmittingNew || !newSubject.trim() || !newBody.trim()}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-none"
                >
                  {isSubmittingNew ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Send conversation</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
