import React, { useEffect, useState, useCallback } from 'react';
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
  onNavigate?: (path: string) => void;
  onUnreadCountChange?: (count: number) => void;
}

/**
 * Humanizes technical system copy into natural, role-appropriate language.
 */
function humanizeNotificationCopy(text: string): string {
  if (!text) return '';
  return text
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
    return <ShieldAlert className="w-4 h-4 text-[#B45309] shrink-0" />;
  }
  if (lower.includes('location') || lower.includes('duty') || lower.includes('serving') || lower.includes('hall')) {
    return <MapPin className="w-4 h-4 text-[#9A7326] shrink-0" />;
  }
  if (lower.includes('pass') || lower.includes('check-in') || lower.includes('checked in') || lower.includes('ticket')) {
    return <Ticket className="w-4 h-4 text-[#9A7326] shrink-0" />;
  }
  if (lower.includes('child') || lower.includes('selected') || lower.includes('application') || lower.includes('approved')) {
    return <Users className="w-4 h-4 text-[#9A7326] shrink-0" />;
  }
  return <Bell className="w-4 h-4 text-[#9A7326] shrink-0" />;
}

export const MobileNotificationCentre: React.FC<MobileNotificationCentreProps> = ({
  isOpen,
  onClose,
  role,
  onNavigate,
  onUnreadCountChange
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<NotificationItem | null>(null);

  const fetchNotifications = useCallback(async (pageNum = 1, isBackground = false) => {
    if (!isBackground && pageNum === 1) setLoading(true);
    if (pageNum > 1) setLoadingMore(true);

    try {
      const res = await api.parent.getNotificationsPaginated(false, role, pageNum, 25);
      if (res && Array.isArray(res.notifications)) {
        if (pageNum === 1) {
          setNotifications(res.notifications);
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
        if (onUnreadCountChange) onUnreadCountChange(unread);
      }
    } catch (err) {
      console.warn('[MobileNotificationCentre] fetch issue:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [role, onUnreadCountChange]);

  useEffect(() => {
    if (isOpen) {
      setSelectedNotif(null);
      fetchNotifications(1);
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

  return (
    <div 
      className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs transition-opacity duration-200"
      data-testid="mobile-notification-centre"
    >
      <div 
        className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl border-l border-[#EAE8E1] font-sans animate-in slide-in-from-right duration-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#EAE8E1] flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            {selectedNotif ? (
              <button
                onClick={() => setSelectedNotif(null)}
                className="p-1 -ml-1 text-zinc-500 hover:text-zinc-900 rounded-lg transition-colors cursor-pointer"
                aria-label="Back to notification list"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <Bell className="w-5 h-5 text-[#9A7326]" />
            )}
            <h2 className="text-base font-semibold text-zinc-900 tracking-tight">
              Notifications
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {!selectedNotif && unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-[#9A7326] hover:text-[#7D5B18] px-2 py-1 rounded-md transition-colors cursor-pointer"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
              aria-label="Close notifications"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {selectedNotif ? (
            /* Detailed view */
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-[#FAF8F5] border border-[#EAE8E1]">
                  {getNotificationIcon(selectedNotif.title, selectedNotif.message)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-900 leading-snug">
                    {humanizeNotificationCopy(selectedNotif.title)}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {formatNotificationTime(selectedNotif.createdAt)}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl">
                <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
                  {humanizeNotificationCopy(selectedNotif.message)}
                </p>
              </div>

              {/* Contextual Deep Link Button */}
              {role === 'parent' && selectedNotif.childId && onNavigate && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      onClose();
                      onNavigate(`/parent/children/${selectedNotif.childId}/status`);
                    }}
                    className="w-full py-2.5 px-4 bg-[#18181B] text-white text-xs font-medium rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    View child status
                  </button>
                </div>
              )}

              {role === 'volunteer' && onNavigate && (
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={() => {
                      onClose();
                      onNavigate('/volunteer/duty');
                    }}
                    className="w-full py-2.5 px-4 bg-[#18181B] text-white text-xs font-medium rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    View duty location
                  </button>
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin text-[#9A7326]" />
              <p className="text-xs">Loading updates...</p>
            </div>
          ) : notifications.length === 0 ? (
            /* Calm empty state */
            <div className="flex flex-col items-center justify-center py-24 px-6 text-center space-y-2">
              <Bell className="w-8 h-8 text-zinc-300 stroke-[1.5]" />
              <p className="text-sm font-medium text-zinc-800">No notifications yet</p>
              <p className="text-xs text-zinc-500 max-w-[240px] leading-relaxed">
                Updates about your event will appear here.
              </p>
            </div>
          ) : (
            /* Natural Date Grouping List */
            <div className="divide-y divide-zinc-100">
              {groups.map(group => (
                <div key={group.title} className="pb-1">
                  <div className="px-5 py-2.5 bg-zinc-50/70 border-y border-zinc-100 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                    {group.title}
                  </div>
                  <div>
                    {group.items.map(notif => {
                      const isUnread = !notif.isRead;
                      return (
                        <div
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className={`px-5 py-3.5 flex items-start gap-3 transition-colors cursor-pointer border-b border-zinc-100 last:border-b-0 ${
                            isUnread 
                              ? 'bg-[#FAF6EB]/35 hover:bg-[#FAF6EB]/60' 
                              : 'bg-white hover:bg-zinc-50/80'
                          }`}
                        >
                          <div className="mt-0.5 shrink-0">
                            {getNotificationIcon(notif.title, notif.message)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className={`text-xs leading-snug truncate ${isUnread ? 'font-semibold text-zinc-900' : 'font-normal text-zinc-800'}`}>
                                {humanizeNotificationCopy(notif.title)}
                              </h4>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isUnread && (
                                  <span className="text-[10px] text-[#9A7326] font-medium">
                                    New
                                  </span>
                                )}
                                <span className="text-[11px] text-zinc-400">
                                  {formatNotificationTime(notif.createdAt)}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-zinc-600 mt-1 leading-relaxed line-clamp-2">
                              {humanizeNotificationCopy(notif.message)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {hasMore && (
                <div className="p-4 text-center">
                  <button
                    onClick={() => fetchNotifications(page + 1)}
                    disabled={loadingMore}
                    className="text-xs font-medium text-[#9A7326] hover:text-[#7D5B18] py-1.5 px-3 rounded-lg border border-[#EAE8E1] hover:bg-zinc-50 transition-colors disabled:opacity-50 cursor-pointer"
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
  );
};
