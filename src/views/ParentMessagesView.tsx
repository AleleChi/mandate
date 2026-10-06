import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Send,
  MessageSquare,
  Check,
  CheckCircle2,
  Clock,
  ArrowRight,
  AlertCircle,
  FileText,
  Calendar,
  Users,
  Shield,
  RefreshCw,
  Home,
  QrCode,
  Activity,
  User,
  Megaphone,
  Plus,
  X
} from 'lucide-react';
import {
  AppRoute,
  BottomNavTab,
  ChildItem,
  ParentProfile,
  ParentMessageThread,
  ParentMessage,
  Announcement
} from '../types';
import { api, extractApiError } from '../services/api';
import { BrandLogo } from '../components/common/BrandLogo';
import { safeStorage } from '../utils/storage';
import { useRealtimeSubscription, useRealtimeResync } from '../services/realtime';

export interface ParentMessagesViewProps {
  onNavigate: (route: AppRoute | string) => void;
  parentProfile: ParentProfile;
  childrenList: ChildItem[];
  initialThreadId?: string;
  onResumeChildDraft?: (child: ChildItem) => void;
  onSignOut?: () => void;
}

// Helpers for human-friendly date & time formatting
function formatRelativeDate(isoStr?: string): string {
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

function formatMessageTimestamp(isoStr?: string): string {
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

// Category neutral metadata text helper
function getCategoryMetaText(category?: string, childFirstName?: string): string {
  switch (category) {
    case 'child_application':
      return childFirstName ? `APPLICATION · ${childFirstName.toUpperCase()}` : 'APPLICATION';
    case 'registration_support':
      return 'REGISTRATION SUPPORT';
    case 'general_support':
      return 'GENERAL SUPPORT';
    case 'attendance':
      return 'ATTENDANCE';
    case 'safety':
      return 'CARE & SAFETY';
    default:
      return 'SUPPORT';
  }
}

function getCategoryInfo(category?: string, childFirstName?: string): { label: string } {
  return {
    label: getCategoryMetaText(category, childFirstName)
  };
}

export const ParentMessagesView: React.FC<ParentMessagesViewProps> = ({
  onNavigate,
  parentProfile,
  childrenList,
  initialThreadId,
  onResumeChildDraft,
  onSignOut
}) => {
  // Navigation & View Mode
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId || null);

  // Inbox Threads State
  const [threads, setThreads] = useState<ParentMessageThread[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState<boolean>(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);

  // Inbox Subtab & Announcements State
  const [inboxTab, setInboxTab] = useState<'threads' | 'announcements'>('threads');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState<boolean>(false);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);
  const [unreadAnnouncementsCount, setUnreadAnnouncementsCount] = useState<number>(0);
  const [activeAnnouncement, setActiveAnnouncement] = useState<Announcement | null>(null);

  // Active Thread State
  const [activeThread, setActiveThread] = useState<ParentMessageThread | null>(null);
  const [messages, setMessages] = useState<ParentMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  // Composer State
  const [composerText, setComposerText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // New Conversation Modal State
  const [isCreatingThread, setIsCreatingThread] = useState<boolean>(false);
  const [newCategory, setNewCategory] = useState<'general_support' | 'registration_support' | 'child_application'>('general_support');
  const [newSubject, setNewSubject] = useState<string>('');
  const [newBody, setNewBody] = useState<string>('');
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [isSubmittingNew, setIsSubmittingNew] = useState<boolean>(false);
  const [newThreadError, setNewThreadError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of messages container
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  };

  // Sync with initialThreadId if provided via URL
  useEffect(() => {
    if (initialThreadId && initialThreadId !== activeThreadId) {
      setActiveThreadId(initialThreadId);
    }
  }, [initialThreadId]);

  // Fetch threads & unread counts on mount and when inbox opens
  const fetchThreads = async (silent = false) => {
    if (!silent) setIsLoadingThreads(true);
    setThreadsError(null);
    try {
      const [threadsRes, unreadRes, unreadAncRes] = await Promise.all([
        api.parent.messages.listThreads({ limit: 50 }),
        api.parent.messages.getUnreadCount(),
        api.parent.announcements.getUnreadCount()
      ]);

      if (threadsRes && threadsRes.success) {
        setThreads(threadsRes.threads || []);
      }
      if (unreadRes && unreadRes.success) {
        setUnreadMessagesCount(Number(unreadRes.unreadThreadCount ?? unreadRes.unreadCount ?? 0));
      }
      if (unreadAncRes && unreadAncRes.success) {
        setUnreadAnnouncementsCount(Number(unreadAncRes.unreadCount ?? 0));
      }
    } catch (err) {
      const extracted = extractApiError(err);
      if (!silent) {
        setThreadsError(extracted.description || extracted.message || 'Unable to load messages.');
      }
    } finally {
      if (!silent) setIsLoadingThreads(false);
    }
  };

  const fetchAnnouncements = async (silent = false) => {
    if (!silent) setIsLoadingAnnouncements(true);
    setAnnouncementsError(null);
    try {
      const [annRes, unreadAncRes] = await Promise.all([
        api.parent.announcements.list({ limit: 50 }),
        api.parent.announcements.getUnreadCount()
      ]);

      if (annRes && annRes.success) {
        setAnnouncements(annRes.announcements || []);
      }
      if (unreadAncRes && unreadAncRes.success) {
        setUnreadAnnouncementsCount(Number(unreadAncRes.unreadCount ?? 0));
      }
    } catch (err) {
      const extracted = extractApiError(err);
      if (!silent) {
        setAnnouncementsError(extracted.description || extracted.message || 'Unable to load announcements.');
      }
    } finally {
      if (!silent) setIsLoadingAnnouncements(false);
    }
  };

  useEffect(() => {
    if (inboxTab === 'announcements') {
      fetchAnnouncements();
    }
  }, [inboxTab]);

  const handleOpenAnnouncement = async (announcement: Announcement) => {
    setActiveAnnouncement(announcement);
    if (!announcement.is_read) {
      try {
        await api.parent.announcements.markRead(announcement.id);
        setAnnouncements(prev =>
          prev.map(a => a.id === announcement.id ? { ...a, is_read: true, read_at: new Date().toISOString() } : a)
        );
        const unreadRes = await api.parent.announcements.getUnreadCount();
        if (unreadRes && unreadRes.success) {
          setUnreadAnnouncementsCount(Number(unreadRes.unreadCount ?? 0));
        }
      } catch {
        // non-blocking
      }
    }
  };

  useEffect(() => {
    fetchThreads();
  }, []);

  // Load thread details and messages
  const loadThread = useCallback(async (threadIdToLoad?: string, silent = false) => {
    const targetId = threadIdToLoad || activeThreadId;
    if (!targetId) {
      setActiveThread(null);
      setMessages([]);
      return;
    }

    if (!silent) setIsLoadingMessages(true);
    setMessagesError(null);
    setSendError(null);
    try {
      const [threadRes, msgsRes] = await Promise.all([
        api.parent.messages.getThread(targetId),
        api.parent.messages.getMessages(targetId, { limit: 100 })
      ]);

      if (threadRes && threadRes.success) {
        setActiveThread(threadRes.thread);
      }
      if (msgsRes && msgsRes.success) {
        setMessages(msgsRes.messages || []);
      }

      // Mark thread read on backend immediately
      try {
        await api.parent.messages.markRead(targetId);
        // Refresh global unread count
        const unreadRes = await api.parent.messages.getUnreadCount();
        if (unreadRes && unreadRes.success) {
          setUnreadMessagesCount(Number(unreadRes.unreadThreadCount ?? unreadRes.unreadCount ?? 0));
        }
        // Clear unread state in local thread list
        setThreads(prev =>
          prev.map(t =>
            t.id === targetId
              ? { ...t, unread_count: 0, is_unread: false }
              : t
          )
        );
      } catch {
        // Non-blocking mark-read failure
      }
    } catch (err) {
      const extracted = extractApiError(err);
      if (!silent) {
        setMessagesError(extracted.description || extracted.message || 'Unable to load conversation.');
      }
    } finally {
      if (!silent) setIsLoadingMessages(false);
      setTimeout(() => scrollToBottom('auto'), 50);
    }
  }, [activeThreadId]);

  // Phase H Realtime Event Handlers
  useRealtimeSubscription(['message.created', 'thread.updated', 'message.unread_changed'], (detail: any) => {
    fetchThreads(true);
    if (activeThreadId && (detail?.threadId === activeThreadId || !detail?.threadId)) {
      loadThread(activeThreadId, true);
    }
  });

  useRealtimeSubscription('announcement.published', () => {
    fetchAnnouncements(true);
    fetchThreads(true);
  });

  useRealtimeSubscription('notification.created', () => {
    fetchThreads(true);
  });

  useRealtimeResync(() => {
    fetchThreads(true);
    if (inboxTab === 'announcements') {
      fetchAnnouncements(true);
    }
    if (activeThreadId) {
      loadThread(activeThreadId, true);
    }
  }, 25000);

  // Handle create new thread from parent
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
      const selectedChild = selectedChildId ? childrenList.find(c => c.id === selectedChildId) : undefined;
      const res = await api.parent.messages.createThread({
        category: newCategory,
        subject: trimmedSubject,
        body: trimmedBody,
        linkedChildId: newCategory === 'child_application' && selectedChild ? selectedChild.id : undefined,
        linkedEntryId: newCategory === 'child_application' && selectedChild ? (selectedChild.entryId || undefined) : undefined
      });

      if (res && res.success && res.thread) {
        setIsCreatingThread(false);
        setNewSubject('');
        setNewBody('');
        setNewCategory('general_support');
        setSelectedChildId('');

        await fetchThreads(true);
        handleOpenThread(res.thread.id);
      }
    } catch (err: any) {
      const extracted = extractApiError(err);
      setNewThreadError(extracted.description || extracted.message || 'Failed to start conversation. Please try again.');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // When activeThreadId changes, fetch thread details and messages
  useEffect(() => {
    if (activeThreadId) {
      loadThread(activeThreadId);
    } else {
      setActiveThread(null);
      setMessages([]);
    }
  }, [activeThreadId, loadThread]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('smooth');
    }
  }, [messages.length]);

  // Handle open thread
  const handleOpenThread = (threadId: string) => {
    setActiveThreadId(threadId);
    onNavigate(`/parent/messages/${threadId}`);
  };

  // Handle back to inbox
  const handleBackToInbox = () => {
    setActiveThreadId(null);
    onNavigate('/parent/messages');
    fetchThreads();
  };

  // Handle send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeThreadId || isSending) return;

    const trimmed = composerText.trim();
    if (!trimmed || trimmed.length > 5000) return;

    setIsSending(true);
    setSendError(null);
    try {
      const res = await api.parent.messages.sendMessage(activeThreadId, trimmed);
      if (res && res.success && res.message) {
        setMessages(prev => [...prev, res.message]);
        setComposerText('');
        // Update thread preview in local list
        setThreads(prev =>
          prev.map(t =>
            t.id === activeThreadId
              ? {
                  ...t,
                  last_message_preview: trimmed.slice(0, 120),
                  last_message_at: new Date().toISOString()
                }
              : t
          )
        );
        setTimeout(() => scrollToBottom('smooth'), 50);
      }
    } catch (err: any) {
      const extracted = extractApiError(err);
      if (extracted.code === 'MESSAGE_THREAD_RESOLVED') {
        if (activeThread) {
          setActiveThread({ ...activeThread, status: 'resolved' });
        }
        setSendError('This conversation has been resolved.');
      } else {
        setSendError(extracted.description || extracted.message || 'Failed to send message.');
      }
    } finally {
      setIsSending(false);
    }
  };

  // Handle Resume Application Action
  const handleResumeApplication = (child?: ChildItem, payload?: { childId?: string; entryId?: string }) => {
    if (child && onResumeChildDraft) {
      onResumeChildDraft(child);
      return;
    }
    // Fallback: If child ID is present, set active draft ID in storage and navigate to draft flow
    const targetChildId = child?.id || payload?.childId;
    if (targetChildId) {
      safeStorage.setItem('koinonia_active_draft_id', targetChildId);
    }
    onNavigate('/parent/children/new');
  };

  // Bottom Nav Change
  const handleTabChange = (tab: BottomNavTab) => {
    if (tab === 'Home') onNavigate('/parent/home');
    else if (tab === 'Children') onNavigate('/parent/children');
    else if (tab === 'Status') onNavigate('/parent/status');
    else if (tab === 'Passes') onNavigate('/parent/passes');
    else if (tab === 'Messages') {
      if (activeThreadId) {
        handleBackToInbox();
      }
    }
    else if (tab === 'Profile') onNavigate('/parent/profile');
  };

  // Helper to find child for a thread
  const getChildForThread = (thread?: ParentMessageThread | null): ChildItem | undefined => {
    if (!thread?.linked_child_id) return undefined;
    return childrenList.find(c => c.id === thread.linked_child_id);
  };

  // Helper to resolve child first name
  const getChildFirstName = (child?: ChildItem): string => {
    if (!child || !child.name) return '';
    return child.name.trim().split(/\s+/)[0];
  };

  // ==========================================================================
  // ANNOUNCEMENT DETAIL VIEW (One-way official broadcast, NO reply composer)
  // ==========================================================================
  if (activeAnnouncement) {
    const publishedFormatted = new Date(activeAnnouncement.published_at).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return (
      <div
        data-component-version="parent-announcement-detail-v1"
        className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] dark:bg-[#1D1D1A] text-[#18181B] dark:text-[#F0EBE3] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 dark:border-[#302E29]"
      >
        {/* Header */}
        <header className="sticky top-0 z-30 bg-[#FAF8F3]/95 dark:bg-[#1D1D1A]/95 backdrop-blur-md border-b border-[#EAE8E1]/60 dark:border-[#302E29] shrink-0">
          <div className="px-4 h-14 flex items-center justify-between">
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setActiveAnnouncement(null)}
                className="p-1.5 -ml-1 rounded-lg text-[#3F3F46] dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer focus:outline-none"
                title="Back to Announcements"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-[#C59B27]" />
                  <span className="font-semibold text-xs sm:text-sm text-[#18181B] dark:text-[#F0EBE3] truncate">
                    Announcement
                  </span>
                </div>
                <span className="text-[10px] text-[#71717A] dark:text-[#7A7570] truncate block">
                  Koinonia Children & Teens
                </span>
              </div>
            </div>

            <div className="shrink-0 pl-2">
              <BrandLogo context="compact" className="cursor-pointer object-contain" />
            </div>
          </div>
        </header>

        {/* Content Body - Official Broadcast Editorial Layout */}
        <main className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-1.5 text-[10px] uppercase tracking-wider font-semibold text-[#9A7326] dark:text-[#C59B27]">
              <span>Koinonia Children & Teens</span>
              <span>·</span>
              <span className="text-[#71717A] dark:text-[#7A7570] font-normal">{publishedFormatted}</span>
            </div>
            <h2 className="font-sans font-bold text-base sm:text-lg text-[#18181B] dark:text-[#F0EBE3] leading-snug">
              {activeAnnouncement.title}
            </h2>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29]">
            <p className="text-xs sm:text-sm text-[#18181B] dark:text-[#F0EBE3] leading-relaxed whitespace-pre-wrap">
              {activeAnnouncement.body}
            </p>
          </div>

          <div className="p-3.5 text-center rounded-xl bg-[#FAF9F6] dark:bg-[#252420] border border-[#EAE8E1]/70 dark:border-[#302E29]">
            <p className="text-[11px] text-[#71717A] dark:text-[#7A7570] leading-relaxed">
              This is an official announcement from Koinonia Children & Teens. Direct replies are disabled for broadcast messages.
            </p>
          </div>
        </main>

        <footer className="sticky bottom-0 z-30 p-4 bg-white/95 dark:bg-[#1D1D1A]/95 backdrop-blur-md border-t border-[#EAE8E1] dark:border-[#302E29] shrink-0 text-center">
          <button
            type="button"
            onClick={() => setActiveAnnouncement(null)}
            className="w-full py-2.5 px-4 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
          >
            Back to Messages
          </button>
        </footer>
      </div>
    );
  }

  // ==========================================================================
  // THREAD DETAIL VIEW
  // ==========================================================================
  if (activeThreadId) {
    const threadChild = getChildForThread(activeThread);
    const childFirstName = getChildFirstName(threadChild);
    const isResolved = activeThread?.status === 'resolved';

    return (
      <div
        data-component-version="parent-messages-thread-v1"
        className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] dark:bg-[#1D1D1A] text-[#18181B] dark:text-[#F0EBE3] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 dark:border-[#302E29]"
      >
        {/* Thread Header */}
        <header className="sticky top-0 z-30 bg-[#FAF8F3]/95 dark:bg-[#1D1D1A]/95 backdrop-blur-md border-b border-[#EAE8E1]/70 dark:border-[#302E29] shrink-0">
          <div className="px-4 h-14 flex items-center justify-between">
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={handleBackToInbox}
                className="p-1.5 -ml-1 rounded-xl text-[#3F3F46] dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3] hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer focus:outline-none"
                aria-label="Back to Messages"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xs sm:text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3] truncate leading-tight tracking-tight">
                  {activeThread?.subject || 'Conversation'}
                </h1>
                <div className="flex items-center space-x-1.5 mt-0.5 text-[10px]">
                  {childFirstName ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-[#8C6D23] dark:text-[#C59B27] truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] shrink-0" />
                      <span>Registration for {childFirstName}</span>
                    </span>
                  ) : (
                    <span className="text-[#71717A] dark:text-[#7A7570] truncate">
                      Church Care Team
                    </span>
                  )}
                  {isResolved && (
                    <>
                      <span className="text-zinc-400">·</span>
                      <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                        Resolved
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 pl-2">
              <BrandLogo context="compact" className="cursor-pointer object-contain" />
            </div>
          </div>
        </header>

        {/* Message Error State */}
        {messagesError && (
          <div className="p-3 m-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-start space-x-2.5 text-xs text-amber-900 dark:text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">{messagesError}</p>
              <button
                type="button"
                onClick={() => {
                  if (activeThreadId) {
                    setIsLoadingMessages(true);
                    setMessagesError(null);
                    api.parent.messages
                      .getMessages(activeThreadId, { limit: 100 })
                      .then(res => setMessages(res.messages || []))
                      .catch(e => setMessagesError(extractApiError(e).message))
                      .finally(() => setIsLoadingMessages(false));
                  }
                }}
                className="mt-1 font-bold text-[#9A7326] hover:underline cursor-pointer"
              >
                Tap to retry
              </button>
            </div>
          </div>
        )}

        {/* Messages Body */}
        <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5 min-h-[300px]">
          {isLoadingMessages ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
              <div className="w-6 h-6 border-2 border-[#C59B27] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-[#71717A] dark:text-[#7A7570]">Loading conversation...</span>
            </div>
          ) : messagesError ? (
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-start space-x-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{messagesError}</p>
                <button
                  type="button"
                  onClick={() => loadThread()}
                  className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/60 font-bold text-[#9A7326] dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/80 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tap to retry</span>
                </button>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-xs text-[#71717A] dark:text-[#7A7570]">
              No messages in this conversation yet.
            </div>
          ) : (
            messages.map((msg) => {
              const isParentSender = msg.sender_role === 'parent';
              const isWorkflowA =
                msg.message_type === 'application_completion_reminder' &&
                msg.action_type === 'resume_application';
              const isWorkflowB =
                msg.message_type === 'application_correction_required' ||
                msg.action_type === 'update_application_details';
              const isReminder = isWorkflowA || isWorkflowB;

              // Parse payload if reminder
              let payload: { childId?: string; entryId?: string } = {};
              if (isReminder && msg.action_payload_json) {
                try {
                  payload =
                    typeof msg.action_payload_json === 'string'
                      ? JSON.parse(msg.action_payload_json)
                      : msg.action_payload_json;
                } catch {
                  payload = {};
                }
              }

              // Determine current authoritative application state for the reminder
              const targetChild =
                (payload.childId && childrenList.find(c => c.id === payload.childId)) ||
                (payload.entryId && childrenList.find(c => c.entryId === payload.entryId)) ||
                threadChild;

              // Authoritative incomplete: child exists and status is Draft or Incomplete, and not submitted
              const isAuthoritativeIncomplete = Boolean(
                targetChild &&
                (targetChild.status === 'Draft' || targetChild.status === 'Incomplete') &&
                !targetChild.submittedAt
              );

              // Check if child is already selected or passed
              const isSelectedOrBeyond = Boolean(
                targetChild &&
                ['Selected', 'Pass ready', 'Checked in', 'Inside', 'Picked up'].includes(targetChild.status)
              );

              if (isReminder) {
                return (
                  <div key={msg.id} className="w-full flex justify-center py-1">
                    <div className="w-full max-w-[96%] sm:max-w-[92%] bg-white dark:bg-[#22211C] rounded-2xl border border-[#EAE5D9] dark:border-[#353229] shadow-[0_4px_20px_-2px_rgba(20,20,20,0.05)] overflow-hidden transition-all">
                      {/* Subtle Top Luxury Accent */}
                      <div className="h-[3px] w-full bg-gradient-to-r from-[#B89047] via-[#DFBA5A] to-[#B89047]" />

                      {/* Card Header Bar */}
                      <div className="px-4 py-3 flex items-center justify-between border-b border-[#F4EFE6] dark:border-[#2C2922]">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FAF5E6] to-[#F2E5BD] dark:from-[#2F291C] dark:to-[#3D3524] border border-[#E5D5AE]/80 dark:border-[#4B402B] flex items-center justify-center text-[#9A7326] dark:text-[#D4AF37] shadow-2xs shrink-0">
                            <Shield className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3] tracking-tight truncate">
                              Koinonia Registration Team
                            </h3>
                            <span className="text-[10px] text-[#71717A] dark:text-[#8C857B] block">
                              {formatMessageTimestamp(msg.created_at)}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0 pl-2">
                          {isWorkflowB ? (
                            isSelectedOrBeyond ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                <Check className="w-3 h-3" /> Updated
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/20">
                                Update Required
                              </span>
                            )
                          ) : isAuthoritativeIncomplete ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/20">
                              Action Required
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                              <Check className="w-3 h-3" /> Submitted
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Body - Calm, formatted letter typography */}
                      <div className="px-4 py-3.5 text-xs sm:text-[13px] text-[#27272A] dark:text-[#E4E4E7] leading-relaxed space-y-2.5">
                        {msg.body.split(/\n\s*\n/).map((para, pIdx) => (
                          <p key={pIdx} className="leading-relaxed">
                            {para.trim()}
                          </p>
                        ))}
                      </div>

                      {/* Action Area - Zero redundancy, ultra-clean */}
                      <div className="px-4 pb-4 pt-1">
                        {isWorkflowB ? (
                          isSelectedOrBeyond ? (
                            <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center space-x-2 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>Registration details have been updated.</span>
                            </div>
                          ) : (
                            <div className="p-3 rounded-xl bg-[#FAF8F4] dark:bg-[#1A1916] border border-[#EBE6DC] dark:border-[#2C2922] space-y-2.5">
                              <div className="flex items-center justify-between text-[11px] text-[#71717A] dark:text-[#8C857B] px-0.5">
                                <span className="flex items-center gap-1.5 text-[#8C6D23] dark:text-[#C59B27] font-medium">
                                  <AlertCircle className="w-3.5 h-3.5 text-[#B89047]" />
                                  <span>{targetChild?.name ? `Details needed for ${targetChild.name.split(' ')[0]}` : 'Additional details requested'}</span>
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleResumeApplication(targetChild, payload)}
                                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#B89047] via-[#C59B27] to-[#B89047] hover:brightness-105 active:scale-[0.99] text-white font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40"
                              >
                                <span>Update Application Details</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        ) : isAuthoritativeIncomplete ? (
                          <div className="p-3 rounded-xl bg-[#FAF8F4] dark:bg-[#1A1916] border border-[#EBE6DC] dark:border-[#2C2922] space-y-2.5">
                            <div className="flex items-center justify-between text-[11px] px-0.5">
                              <span className="flex items-center gap-1.5 text-[#8C6D23] dark:text-[#C59B27] font-medium">
                                <Clock className="w-3.5 h-3.5 text-[#B89047]" />
                                <span>Deadline: 17 Oct · 11:59 PM</span>
                              </span>
                              <span className="text-[10px] uppercase font-bold tracking-wider text-[#9A7326] dark:text-[#C59B27]">
                                Draft Incomplete
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleResumeApplication(targetChild, payload)}
                              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#B89047] via-[#C59B27] to-[#B89047] hover:brightness-105 active:scale-[0.99] text-white font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40"
                            >
                              <span>Continue Application</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-medium">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>Application submitted for review</span>
                            </div>
                            <span className="text-[10px] text-emerald-600 font-medium">Complete</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    isParentSender ? 'items-end' : 'items-start'
                  } space-y-1`}
                >
                  {/* Sender label & Timestamp */}
                  <div className="flex items-center space-x-1.5 px-1 text-[10px] text-[#71717A] dark:text-[#7A7570]">
                    <span className="font-semibold text-[#18181B] dark:text-[#F0EBE3]">
                      {isParentSender ? 'You' : 'Koinonia Registration Team'}
                    </span>
                    <span>·</span>
                    <span>{formatMessageTimestamp(msg.created_at)}</span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs sm:text-[13px] leading-relaxed transition-all shadow-2xs ${
                      isParentSender
                        ? 'rounded-tr-xs bg-[#FAF6EB] dark:bg-[#2A2720] text-[#18181B] dark:text-[#F0EBE3] border border-[#E5D5AE]/70 dark:border-[#3D382E]'
                        : 'rounded-tl-xs bg-white dark:bg-[#22211E] text-[#18181B] dark:text-[#F0EBE3] border border-[#EAE8E1] dark:border-[#302E29]'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </main>

        {/* Send Error Notice */}
        {sendError && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-950/40 border-t border-red-200 dark:border-red-900/50 text-[11px] text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>{sendError}</span>
            <button
              type="button"
              onClick={() => setSendError(null)}
              className="font-bold underline ml-2 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Composer or Resolved State at Bottom */}
        <footer className="sticky bottom-0 z-30 bg-[#FAF8F3]/95 dark:bg-[#1D1D1A]/95 backdrop-blur-md border-t border-[#EAE8E1]/80 dark:border-[#302E29] shrink-0 p-3 sm:p-4">
          {isResolved ? (
            <div className="py-2.5 px-4 text-center">
              <p className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3]">
                Conversation resolved
              </p>
              <p className="text-[11px] text-[#71717A] dark:text-[#7A7570] mt-0.5">
                This discussion has been marked complete.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="space-y-1">
              <div className="flex items-end gap-2 bg-white dark:bg-[#23221E] border border-[#E5E1D8] dark:border-[#38352E] focus-within:border-[#C59B27] focus-within:ring-2 focus-within:ring-[#C59B27]/15 rounded-2xl p-1.5 pl-3.5 shadow-xs transition-all">
                <textarea
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  disabled={isSending}
                  maxLength={5000}
                  placeholder="Reply to the registration team..."
                  rows={1}
                  className="flex-1 bg-transparent border-0 resize-none text-xs sm:text-sm text-[#18181B] dark:text-[#F0EBE3] placeholder:text-[#8C877D] dark:placeholder:text-[#7A7570] focus:outline-none py-1.5 max-h-24 leading-relaxed"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />

                <button
                  type="submit"
                  disabled={isSending || composerText.trim().length === 0 || composerText.length > 5000}
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none bg-gradient-to-r from-[#B89047] to-[#C59B27] hover:brightness-105 active:scale-95 text-white shadow-xs focus:outline-none focus:ring-1 focus:ring-[#C59B27]/40"
                  aria-label="Send message"
                >
                  {isSending ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5 ml-0.5" />
                  )}
                </button>
              </div>

              {composerText.length >= 4500 && (
                <div className="text-right px-2">
                  <span className="text-[10px] text-amber-600 font-mono font-medium">
                    {5000 - composerText.length} characters left
                  </span>
                </div>
              )}
            </form>
          )}
        </footer>
      </div>
    );
  }

  // ==========================================================================
  // INBOX VIEW
  // ==========================================================================
  return (
    <div
      data-component-version="parent-messages-inbox-v1"
      className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] dark:bg-[#1D1D1A] text-[#18181B] dark:text-[#F0EBE3] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 dark:border-[#302E29]"
    >
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#FAF8F3]/95 dark:bg-[#1D1D1A]/95 backdrop-blur-md border-b border-[#EAE8E1]/50 dark:border-[#302E29]">
        <div className="px-5 h-14 flex items-center justify-between">
          <BrandLogo
            context="compact"
            onClick={() => onNavigate('/parent/home')}
            className="cursor-pointer"
          />

          <div className="flex items-center space-x-2">
            {inboxTab === 'threads' && (
              <button
                type="button"
                id="btn-parent-new-message"
                onClick={() => {
                  setNewThreadError(null);
                  setIsCreatingThread(true);
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

      {/* Subtab Switcher: Conversations vs Announcements */}
      <div className="px-4 pt-3 flex items-center space-x-4 border-b border-[#EAE8E1]/60 dark:border-[#302E29] bg-[#FAF8F3] dark:bg-[#1D1D1A] shrink-0">
        <button
          type="button"
          id="tab-parent-conversations"
          onClick={() => setInboxTab('threads')}
          className={`pb-2.5 text-xs transition-all border-b-2 cursor-pointer flex items-center space-x-1.5 ${
            inboxTab === 'threads'
              ? 'border-[#C59B27] font-bold text-[#18181B] dark:text-[#F0EBE3]'
              : 'border-transparent font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
          }`}
        >
          <span>Conversations</span>
          {unreadMessagesCount > 0 && (
            <span className="px-1.5 rounded-sm text-[9px] font-bold bg-[#E07A5F] text-white">
              {unreadMessagesCount}
            </span>
          )}
        </button>

        <button
          type="button"
          id="tab-parent-announcements"
          onClick={() => {
            setInboxTab('announcements');
            fetchAnnouncements();
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

      {/* Main Container */}
      <main className="flex-1 w-full pb-24 flex flex-col">
        {inboxTab === 'threads' ? (
          /* ========================================================================= */
          /* THREADS INBOX                                                            */
          /* ========================================================================= */
          isLoadingThreads ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
              <div className="w-7 h-7 border-2 border-[#C59B27] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[#6B7280] dark:text-[#B8B0A5]">Loading your messages...</p>
            </div>
          ) : threadsError ? (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-start space-x-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{threadsError}</p>
                <button
                  type="button"
                  onClick={() => fetchThreads()}
                  className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/60 font-bold text-[#9A7326] dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/80 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tap to retry</span>
                </button>
              </div>
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
                Messages from the Koinonia Registration Team will appear here.
              </p>
              <button
                type="button"
                id="btn-parent-empty-start-conversation"
                onClick={() => {
                  setNewThreadError(null);
                  setIsCreatingThread(true);
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
                const threadChild = getChildForThread(thread);
                const childFirstName = getChildFirstName(threadChild);
                const categoryInfo = getCategoryInfo(thread.category, childFirstName);
                const hasUnread = Boolean(thread.is_unread || (thread.unread_count && thread.unread_count > 0));
                const isResolved = thread.status === 'resolved';

                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => handleOpenThread(thread.id)}
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
                        {formatRelativeDate(thread.last_message_at || thread.created_at)}
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
                        {categoryInfo.label}
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
          /* ========================================================================= */
          /* ANNOUNCEMENTS INBOX                                                      */
          /* ========================================================================= */
          isLoadingAnnouncements ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
              <div className="w-7 h-7 border-2 border-[#C59B27] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[#71717A] dark:text-[#7A7570]">Loading announcements...</p>
            </div>
          ) : announcementsError ? (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-start space-x-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{announcementsError}</p>
                <button
                  type="button"
                  onClick={() => fetchAnnouncements()}
                  className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/60 font-bold text-[#9A7326] dark:text-amber-300 hover:bg-amber-200 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tap to retry</span>
                </button>
              </div>
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
                Official broadcasts and event notices from the Koinonia Team will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#EAE8E1] dark:divide-[#302E29]">
              {announcements.map(ann => {
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
                        {formatRelativeDate(ann.published_at)}
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
      </main>

      {/* Fixed Bottom Navigation locked within mobile shell */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 max-w-[390px] mx-auto bg-white/95 dark:bg-[#1D1D1A]/95 backdrop-blur-md border-t border-[#EAE8E1] dark:border-[#302E29] shadow-lg">
        <div className="px-2 h-16 flex items-center justify-around">
          {[
            { label: 'Home' as BottomNavTab, icon: <Home className="w-5 h-5" /> },
            { label: 'Children' as BottomNavTab, icon: <Users className="w-5 h-5" /> },
            { label: 'Status' as BottomNavTab, icon: <Activity className="w-5 h-5" /> },
            { label: 'Passes' as BottomNavTab, icon: <QrCode className="w-5 h-5" /> },
            { label: 'Messages' as BottomNavTab, icon: <MessageSquare className="w-5 h-5" />, badge: (unreadMessagesCount + unreadAnnouncementsCount) > 0 ? (unreadMessagesCount + unreadAnnouncementsCount) : undefined },
            { label: 'Profile' as BottomNavTab, icon: <User className="w-5 h-5" /> }
          ].map((item) => {
            const isActive = item.label === 'Messages';
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleTabChange(item.label)}
                className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-xl transition-all cursor-pointer focus:outline-none ${
                  isActive
                    ? 'text-[#B89047] dark:text-[#D4AF37] font-semibold'
                    : 'text-[#6B7280] dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3]'
                }`}
              >
                <div
                  className={`relative p-1 rounded-lg transition-transform ${
                    isActive ? 'bg-[#FAF6EB] dark:bg-[#262520] scale-110 text-[#C59B27] dark:text-[#D4AF37]' : ''
                  }`}
                >
                  {item.icon}
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-[#E07A5F] text-[9px] font-bold text-white shadow-sm ring-1 ring-white">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* New Conversation Modal */}
      {isCreatingThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1D1D1A] w-full max-w-lg rounded-2xl shadow-xl border border-[#EAE8E1] dark:border-[#302E29] overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-sans font-semibold text-sm text-[#18181B] dark:text-[#F0EBE3]">
                  New conversation
                </h3>
                <p className="text-[11px] text-[#6B7280] dark:text-[#7A7570] mt-0.5">
                  Direct message with the Koinonia Registration Team
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSubmittingNew) {
                    setIsCreatingThread(false);
                    setNewThreadError(null);
                  }
                }}
                disabled={isSubmittingNew}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateThread} className="p-4 space-y-4 overflow-y-auto flex-1">
              {newThreadError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{newThreadError}</span>
                </div>
              )}

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3] mb-1.5">
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  disabled={isSubmittingNew}
                  className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3 py-2 text-xs text-[#18181B] dark:text-[#F0EBE3] focus:outline-none focus:border-[#C59B27]"
                >
                  <option value="general_support">General Support</option>
                  <option value="registration_support">Registration Support</option>
                  <option value="child_application">Child Application</option>
                </select>
              </div>

              {/* Linked Child (only if child_application) */}
              {newCategory === 'child_application' && (
                <div>
                  <label className="block text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3] mb-1.5">
                    Select Child
                  </label>
                  {childrenList.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic p-2 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700">
                      No registered children found.
                    </p>
                  ) : (
                    <select
                      value={selectedChildId}
                      onChange={(e) => setSelectedChildId(e.target.value)}
                      disabled={isSubmittingNew}
                      className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3 py-2 text-xs text-[#18181B] dark:text-[#F0EBE3] focus:outline-none focus:border-[#C59B27]"
                    >
                      <option value="">-- Choose child (optional) --</option>
                      {childrenList.map((child) => (
                        <option key={child.id} value={child.id}>
                          {child.name} ({child.status})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Subject */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3]">
                    Subject
                  </label>
                  <span className={`text-[10px] ${newSubject.length > 120 ? 'text-red-500 font-bold' : 'text-zinc-400'}`}>
                    {newSubject.length}/120
                  </span>
                </div>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  disabled={isSubmittingNew}
                  maxLength={120}
                  placeholder="What is your message about?"
                  className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3 py-2 text-xs text-[#18181B] dark:text-[#F0EBE3] placeholder:text-zinc-400 focus:outline-none focus:border-[#C59B27]"
                  required
                />
              </div>

              {/* Body */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3]">
                    Message
                  </label>
                  <span className={`text-[10px] ${newBody.length > 5000 ? 'text-red-500 font-bold' : 'text-zinc-400'}`}>
                    {newBody.length}/5000
                  </span>
                </div>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  disabled={isSubmittingNew}
                  maxLength={5000}
                  rows={4}
                  placeholder="Type your message here..."
                  className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3 py-2 text-xs text-[#18181B] dark:text-[#F0EBE3] placeholder:text-zinc-400 focus:outline-none focus:border-[#C59B27] resize-none"
                  required
                />
              </div>

              {/* Form Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-[#EAE8E1] dark:border-[#302E29]">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingThread(false);
                    setNewThreadError(null);
                  }}
                  disabled={isSubmittingNew}
                  className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew || !newSubject.trim() || !newBody.trim() || newSubject.length > 120 || newBody.length > 5000}
                  className="px-4 py-1.5 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-xs transition-all shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5 cursor-pointer"
                >
                  {isSubmittingNew ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Send message</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
