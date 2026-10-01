import React, { useEffect, useState, useCallback, useRef } from 'react';
import { 
  Bell, 
  X, 
  CheckCheck, 
  ChevronRight, 
  MapPin, 
  ShieldAlert, 
  Ticket, 
  Users, 
  Calendar,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { api } from '../../services/api';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type?: string;
  createdAt: string;
  isRead: boolean;
  readAt?: string | null;
  childId?: string;
  parentId?: string;
  eventId?: string;
  metadata?: any;
}

interface MobileNotificationCentreProps {
  isOpen: boolean;
  onClose: () => void;
  role: 'volunteer' | 'parent';
  surface?: 'volunteer' | 'parent';
  onNavigate?: (path: string) => void;
  onUnreadCountChange?: (count: number) => void;
}

/**
 * Humanizes technical system copy into natural, role-appropriate language.
 */
function humanizeNotificationCopy(text: string, role?: 'volunteer' | 'parent'): string {
  if (!text) return '';
  let result = text;
  if (role === 'parent') {
    result = result
      .replace(/New child application/gi, 'Application submitted')
      .replace(/New application submitted for\s+([^.]+)\.?/gi, "$1's application has been received.")
      .replace(/Application submitted for\s+([^.]+)\.?/gi, "$1's application has been received.");
  }
  return result
    .replace(/escalation state/gi, 'safety status')
    .replace(/event duty assignment/gi, 'duty location')
    .replace(/notification delivery/gi, 'notice')
    .replace(/application status code/gi, 'application status')
    .replace(/alert payload/gi, 'details')
    .replace(/pending mutation queue/gi, 'pending updates')
    .replace(/sync queue/gi, 'updates')
    .replace(/dispatch/gi, 'assignment');
}

/**
 * Natural date grouping: Today, Yesterday, Earlier.
 */
function groupNotificationsByDate(items: NotificationItem[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: { title: string; items: NotificationItem[] }[] = [
    { title: 'Today', items: [] },
    { title: 'Yesterday', items: [] },
    { title: 'Earlier', items: [] }
  ];

  for (const item of items) {
    const itemDate = new Date(item.createdAt);
    itemDate.setHours(0, 0, 0, 0);

    if (itemDate.getTime() === today.getTime()) {
      groups[0].items.push(item);
    } else if (itemDate.getTime() === yesterday.getTime()) {
      groups[1].items.push(item);
    } else {
      groups[2].items.push(item);
    }
  }

  return groups.filter(g => g.items.length > 0);
}

function formatNotificationTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

function getNotificationIcon(title: string, message: string) {
  const lower = `${title} ${message}`.toLowerCase();
  if (lower.includes('safety') || lower.includes('urgent') || lower.includes('concern')) {
    return <ShieldAlert className="w-4 h-4 text-[#B45309] dark:text-[#C59B27] shrink-0" />;
  }
  if (lower.includes('location') || lower.includes('duty') || lower.includes('serving') || lower.includes('hall')) {
    return <MapPin className="w-4 h-4 text-[#9A7326] dark:text-[#C59B27] shrink-0" />;
  }
  if (lower.includes('pass') || lower.includes('check-in') || lower.includes('checked in') || lower.includes('ticket')) {
    return <Ticket className="w-4 h-4 text-[#9A7326] dark:text-[#C59B27] shrink-0" />;
  }
  if (lower.includes('child') || lower.includes('selected') || lower.includes('application') || lower.includes('approved')) {
    return <Users className="w-4 h-4 text-[#9A7326] dark:text-[#C59B27] shrink-0" />;
  }
  return <Bell className="w-4 h-4 text-[#9A7326] dark:text-[#C59B27] shrink-0" />;
}

export const MobileNotificationCentre: React.FC<MobileNotificationCentreProps> = ({
  isOpen,
  onClose,
  role,
  surface,
  onNavigate,
  onUnreadCountChange
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<NotificationItem | null>(null);

  const onUnreadCountChangeRef = useRef(onUnreadCountChange);
  useEffect(() => {
    onUnreadCountChangeRef.current = onUnreadCountChange;
  });

  const fetchNotifications = useCallback(async (pageNum = 1, isBackground = false) => {
    if (!isBackground && pageNum === 1) setLoading(true);
    if (pageNum > 1) setLoadingMore(true);

    try {
      const res = await api.parent.getNotificationsPaginated(false, role, pageNum, 25);
      if (res && Array.isArray(res.notifications)) {
        if (pageNum === 1) {
          setNotifications(prev => {
            if (isBackground && prev.length > 0) {
              const localReadMap = new Map(prev.map(n => [n.id, n.isRead]));
              return res.notifications.map(n => ({
                ...n,
                isRead: localReadMap.has(n.id) ? (localReadMap.get(n.id) || n.isRead) : n.isRead
              }));
            }
            return res.notifications;
          });
        } else {
          setNotifications(prev => {
            const existingIds = new Set(prev.map(n => n.id));
            const newItems = res.notifications.filter(n => !existingIds.has(n.id));
            return [...prev, ...newItems];
          });
        }
        setHasMore(Boolean(res.hasMore));
        setPage(pageNum);

        const unread = res.notifications.filter(n => !n.isRead).length;
        if (onUnreadCountChangeRef.current) {
          onUnreadCountChangeRef.current(unread);
        }
      }
    } catch (err) {
      console.warn('[MobileNotificationCentre] fetch issue:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [role]);

  useEffect(() => {
    if (isOpen) {
      setSelectedNotif(null);
      fetchNotifications(1, false);
      const interval = setInterval(() => {
        fetchNotifications(1, true);
      }, 25000);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await api.parent.markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      if (onUnreadCountChange) onUnreadCountChange(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      try {
        await api.parent.markNotificationAsRead(notif.id);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
        const remainingUnread = notifications.filter(n => n.id !== notif.id && !n.isRead).length;
        if (onUnreadCountChange) onUnreadCountChange(remainingUnread);
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }

    // Determine deep link
    const lower = `${notif.title} ${notif.message}`.toLowerCase();
    let targetRoute = '';

    if (role === 'volunteer') {
      if (lower.includes('safety') || lower.includes('incident') || lower.includes('urgent')) {
        targetRoute = '/volunteer/safety';
      } else if (lower.includes('location') || lower.includes('duty') || lower.includes('serving')) {
        targetRoute = '/volunteer/duty';
      } else {
        setSelectedNotif(notif);
        return;
      }
    } else {
      // Parent role
      if (notif.childId) {
        if (lower.includes('pass') || notif.title.toLowerCase().includes('pass')) {
          targetRoute = `/parent/children/${notif.childId}/pass`;
        } else {
          targetRoute = `/parent/children/${notif.childId}/status`;
        }
      } else {
        setSelectedNotif(notif);
        return;
      }
    }

    if (targetRoute && onNavigate) {
      onClose();
      onNavigate(targetRoute);
    } else {
      setSelectedNotif(notif);
    }
  };

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const groups = groupNotificationsByDate(notifications);

  // Volunteer Popover: anchored below Volunteer app header, constrained to 500px app frame
  if (surface === 'volunteer' || role === 'volunteer') {
    return (
      <>
        {/* Subtle backdrop for outside-click dismiss */}
        <div
          className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-2xs transition-opacity duration-150 animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Popover wrapper constrained to Volunteer 500px frame below 56px header */}
        <div
          className="fixed top-14 left-1/2 -translate-x-1/2 w-full max-w-[500px] px-4 flex justify-end z-50 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-150"
          data-testid="volunteer-notification-popover"
        >
          <div
            className="pointer-events-auto w-full max-w-[420px] bg-white dark:bg-[#1D1D1A] rounded-2xl shadow-2xl border border-[#EAE8E1] dark:border-[#302E29] flex flex-col overflow-hidden font-sans"
          >
            {/* Header inside popover */}
            <div className="px-4 py-3 border-b border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-between shrink-0 bg-white dark:bg-[#1D1D1A] sticky top-0 z-10">
              <div className="flex items-center gap-2">
                {selectedNotif ? (
                  <button
                    onClick={() => setSelectedNotif(null)}
                    className="p-1 -ml-1 text-zinc-500 hover:text-zinc-900 dark:text-[#7A7570] dark:hover:text-[#F0EBE3] rounded-lg transition-colors cursor-pointer"
                    aria-label="Back to notification list"
                  >
                    <ArrowLeft className="w-4.5 h-4.5" />
                  </button>
                ) : (
                  <Bell className="w-4.5 h-4.5 text-[#C59B27] dark:text-[#D4AF37]" />
                )}
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-[#F0EBE3] tracking-tight">
                  Notifications
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {!selectedNotif && unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs font-medium text-[#C59B27] hover:text-[#A47E1F] dark:text-[#D4AF37] dark:hover:text-[#E5C158] px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1 text-zinc-400 hover:text-zinc-700 dark:text-[#7A7570] dark:hover:text-[#F0EBE3] rounded-lg hover:bg-zinc-100 dark:hover:bg-[#262520] transition-colors cursor-pointer"
                  aria-label="Close notifications"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Scrollable Content Area (max-height ~60vh, no fixed height) */}
            <div className="max-h-[60vh] overflow-y-auto bg-stone-50/40 dark:bg-[#1D1D1A]">
              {selectedNotif ? (
                /* Detailed view */
                <div className="p-4 space-y-3.5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-[#FAF8F5] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29]">
                      {getNotificationIcon(selectedNotif.title, selectedNotif.message)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-[#F0EBE3] leading-snug">
                        {humanizeNotificationCopy(selectedNotif.title, role)}
                      </h3>
                      <p className="text-xs text-zinc-400 dark:text-[#7A7570] mt-0.5">
                        {formatNotificationTime(selectedNotif.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl">
                    <p className="text-xs sm:text-sm text-zinc-700 dark:text-[#F0EBE3] leading-relaxed whitespace-pre-wrap">
                      {humanizeNotificationCopy(selectedNotif.message, role)}
                    </p>
                  </div>

                  {onNavigate && (
                    <div className="pt-1 flex flex-col gap-2">
                      <button
                        onClick={() => {
                          onClose();
                          onNavigate('/volunteer/duty');
                        }}
                        className="w-full py-2.5 px-4 bg-[#C59B27] hover:bg-[#A47E1F] text-white text-xs font-medium rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
                      >
                        <span>View duty location</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (loading && notifications.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-2 text-zinc-400 dark:text-[#7A7570]">
                  <Loader2 className="w-5 h-5 animate-spin text-[#C59B27] dark:text-[#D4AF37]" />
                  <p className="text-xs">Loading notifications...</p>
                </div>
              ) : notifications.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-2">
                  <Bell className="w-8 h-8 text-zinc-300 dark:text-[#7A7570] stroke-[1.5]" />
                  <p className="text-sm font-medium text-zinc-800 dark:text-[#F0EBE3]">No notifications yet</p>
                  <p className="text-xs text-zinc-500 dark:text-[#B8B0A5] max-w-[240px] leading-relaxed">
                    Updates about your event will appear here.
                  </p>
                </div>
              ) : (
                /* Natural Date Grouping List */
                <div className="divide-y divide-zinc-100 dark:divide-[#302E29]">
                  {groups.map(group => (
                    <div key={group.title} className="pb-0.5">
                      <div className="px-4 py-2 bg-zinc-50/80 dark:bg-[#21211E]/80 border-y border-zinc-100 dark:border-[#302E29] text-[10px] font-medium text-zinc-500 dark:text-[#B8B0A5] uppercase tracking-wider">
                        {group.title}
                      </div>
                      <div>
                        {group.items.map(notif => {
                          const isUnread = !notif.isRead;
                          return (
                            <div
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer border-b border-zinc-100 dark:border-[#302E29] last:border-b-0 ${
                                isUnread
                                  ? 'bg-[#FAF6EB]/40 hover:bg-[#FAF6EB]/70 dark:bg-[#262520] dark:hover:bg-[#2A2926]'
                                  : 'bg-white hover:bg-zinc-50/80 dark:bg-[#1D1D1A] dark:hover:bg-[#21211E]'
                              }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {getNotificationIcon(notif.title, notif.message)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <h4 className={`text-xs leading-snug truncate ${isUnread ? 'font-semibold text-zinc-900 dark:text-[#F0EBE3]' : 'font-normal text-zinc-700 dark:text-[#B8B0A5]'}`}>
                                    {humanizeNotificationCopy(notif.title, role)}
                                  </h4>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isUnread && (
                                      <span className="text-[9px] text-[#C59B27] dark:text-[#D4AF37] font-semibold bg-[#FAF6EB] dark:bg-[#262520] px-1.5 py-0.5 rounded-full border border-[#E5D5AE]/60 dark:border-[#3A3835]">
                                        New
                                      </span>
                                    )}
                                    <span className="text-[10px] text-zinc-400 dark:text-[#7A7570]">
                                      {formatNotificationTime(notif.createdAt)}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-xs text-zinc-500 dark:text-[#B8B0A5] mt-0.5 leading-relaxed line-clamp-2">
                                  {humanizeNotificationCopy(notif.message, role)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {hasMore && (
                    <div className="p-3 text-center">
                      <button
                        onClick={() => fetchNotifications(page + 1)}
                        disabled={loadingMore}
                        className="text-xs font-medium text-[#C59B27] dark:text-[#D4AF37] hover:text-[#A47E1F] dark:hover:text-[#E5C158] py-1.5 px-3 rounded-lg border border-[#EAE8E1] dark:border-[#302E29] bg-white dark:bg-[#21211E] hover:bg-zinc-50 dark:hover:bg-[#262520] transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {loadingMore ? 'Loading earlier updates...' : 'Earlier notifications'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // Parent Notification Popover: anchored below Parent header, constrained to 390px Parent app frame
  return (
    <>
      {/* Subtle backdrop for outside-click dismiss */}
      <div
        className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-2xs transition-opacity duration-150 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Popover wrapper constrained to Parent 390px frame below 56px header */}
      <div
        className="fixed top-14 left-1/2 -translate-x-1/2 w-full max-w-[390px] flex justify-end z-50 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-150"
        data-testid="mobile-notification-centre"
      >
        <div
          className="pointer-events-auto w-[calc(100%-24px)] max-w-[360px] mr-3 bg-white dark:bg-[#1D1D1A] rounded-2xl shadow-lg border border-[#EAE8E1] dark:border-[#302E29] flex flex-col overflow-hidden font-sans"
        >
          {/* Header inside popover */}
          <div className="px-4 py-3 border-b border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-between shrink-0 bg-white dark:bg-[#1D1D1A] sticky top-0 z-10">
            <div className="flex items-center gap-2">
              {selectedNotif ? (
                <button
                  onClick={() => setSelectedNotif(null)}
                  className="p-1 -ml-1 text-zinc-500 hover:text-zinc-900 dark:text-[#7A7570] dark:hover:text-[#F0EBE3] rounded-lg transition-colors cursor-pointer"
                  aria-label="Back to notification list"
                >
                  <ArrowLeft className="w-4.5 h-4.5" />
                </button>
              ) : (
                <Bell className="w-4.5 h-4.5 text-[#C59B27]" />
              )}
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-[#F0EBE3] tracking-tight">
                Notifications
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {!selectedNotif && unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs font-medium text-[#C59B27] hover:text-[#A47E1F] dark:text-[#C59B27] dark:hover:text-[#E5C158] px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:text-[#7A7570] dark:hover:text-[#F0EBE3] rounded-lg hover:bg-zinc-100 dark:hover:bg-[#262520] transition-colors cursor-pointer"
                aria-label="Close notifications"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="max-h-[60vh] overflow-y-auto bg-stone-50/40 dark:bg-[#1D1D1A]">
            {selectedNotif ? (
              /* Detailed view */
              <div className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-[#FAF8F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#302E29]">
                    {getNotificationIcon(selectedNotif.title, selectedNotif.message)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-[#F0EBE3] leading-snug">
                      {humanizeNotificationCopy(selectedNotif.title, role)}
                    </h3>
                    <p className="text-xs text-zinc-400 dark:text-[#7A7570] mt-0.5">
                      {formatNotificationTime(selectedNotif.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-[#FAF9F6] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl">
                  <p className="text-xs text-zinc-700 dark:text-[#B8B0A5] leading-relaxed whitespace-pre-wrap">
                    {humanizeNotificationCopy(selectedNotif.message, role)}
                  </p>
                </div>

                {/* Contextual Deep Link Button */}
                {role === 'parent' && selectedNotif.childId && onNavigate && (
                  <div className="pt-1">
                    <button
                      onClick={() => {
                        onClose();
                        onNavigate(`/parent/children/${selectedNotif.childId}/status`);
                      }}
                      className="w-full py-2 px-3 bg-[#18181B] dark:bg-[#262520] text-white dark:text-[#F0EBE3] border border-transparent dark:border-[#302E29] text-xs font-medium rounded-xl hover:bg-zinc-800 dark:hover:bg-[#2A2926] transition-colors cursor-pointer"
                    >
                      View child status
                    </button>
                  </div>
                )}
              </div>
            ) : (loading && notifications.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3 text-zinc-400 dark:text-[#7A7570]">
                <Loader2 className="w-5 h-5 animate-spin text-[#C59B27]" />
                <p className="text-xs text-zinc-500 dark:text-[#B8B0A5]">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              /* Calm empty state */
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-2">
                <Bell className="w-7 h-7 text-zinc-300 dark:text-[#7A7570] stroke-[1.5]" />
                <p className="text-sm font-medium text-zinc-800 dark:text-[#F0EBE3]">No notifications yet</p>
                <p className="text-xs text-zinc-500 dark:text-[#B8B0A5] max-w-[220px] leading-relaxed">
                  Updates about your event will appear here.
                </p>
              </div>
            ) : (
              /* Natural Date Grouping List */
              <div className="divide-y divide-zinc-100 dark:divide-[#302E29]">
                {groups.map(group => (
                  <div key={group.title} className="pb-1">
                    <div className="px-4 py-2 bg-zinc-50/80 dark:bg-[#21211E] border-y border-zinc-100 dark:border-[#302E29] text-[11px] font-medium text-zinc-500 dark:text-[#B8B0A5] uppercase tracking-wider">
                      {group.title}
                    </div>
                    <div>
                      {group.items.map(notif => {
                        const isUnread = !notif.isRead;
                        return (
                          <div
                            key={notif.id}
                            onClick={() => handleNotificationClick(notif)}
                            className={`px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer border-b border-zinc-100 dark:border-[#302E29] last:border-b-0 ${
                              isUnread
                                ? 'bg-[#FAF6EB]/40 hover:bg-[#FAF6EB]/70 dark:bg-[#262520] dark:hover:bg-[#2A2926]'
                                : 'bg-white hover:bg-zinc-50/80 dark:bg-[#21211E] dark:hover:bg-[#2A2926]'
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">
                              {getNotificationIcon(notif.title, notif.message)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h4 className={`text-xs leading-snug truncate ${isUnread ? 'font-semibold text-zinc-900 dark:text-[#F0EBE3]' : 'font-normal text-zinc-800 dark:text-[#F0EBE3]'}`}>
                                  {humanizeNotificationCopy(notif.title, role)}
                                </h4>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isUnread && (
                                    <span className="text-[10px] text-[#C59B27] font-medium">
                                      New
                                    </span>
                                  )}
                                  <span className="text-[11px] text-zinc-400 dark:text-[#7A7570]">
                                    {formatNotificationTime(notif.createdAt)}
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-zinc-600 dark:text-[#B8B0A5] mt-1 leading-relaxed line-clamp-2">
                                {humanizeNotificationCopy(notif.message, role)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {hasMore && (
                  <div className="p-3 text-center">
                    <button
                      onClick={() => fetchNotifications(page + 1)}
                      disabled={loadingMore}
                      className="text-xs font-medium text-[#C59B27] hover:text-[#A47E1F] dark:hover:text-[#E5C158] py-1.5 px-3 rounded-lg border border-[#EAE8E1] dark:border-[#302E29] bg-white dark:bg-[#21211E] hover:bg-zinc-50 dark:hover:bg-[#262520] transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {loadingMore ? 'Loading earlier updates...' : 'Earlier notifications'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
