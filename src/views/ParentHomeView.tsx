import React, { useState, useEffect } from 'react';
import { AppRoute, BottomNavTab, ChildItem, ParentProfile } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { Button } from '../components/common/Button';
import { EventPassPreviewCard } from '../components/common/EventPassPreviewCard';
import { Calendar, Clock, Plus, ShieldCheck, QrCode, Home, Users, Activity, User, Info, X, MessageCircle, Mail, Smile, Ticket, HelpCircle, Shield, ChevronRight, Lock, LogOut, Bell } from 'lucide-react';
import { REAL_ASSETS } from '../config/assets';
import { useNotification } from '../context/NotificationContext';
import { api } from '../services/api';
import { soundUtility } from '../utils/sound';

interface ParentHomeViewProps {
  onNavigate: (route: AppRoute) => void;
  parentProfile: ParentProfile;
  childrenList: ChildItem[];
  onAddChild?: (child: ChildItem) => void;
  onStartNewChild?: () => void;
  onResumeChildDraft?: (child: ChildItem) => void;
  initialTab?: BottomNavTab;
  onSignOut?: () => void;
  onDeleteChild?: (childId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  selectedChildId?: string;
  volunteerProfile?: any;
}

// Check whether photo is a custom uploaded image vs sample default asset
const isRealUploadedPhoto = (url?: string) => {
  if (!url || !url.trim()) return false;
  if (url === REAL_ASSETS.passAvatar || url === REAL_ASSETS.workerAvatar) return false;
  return true;
};

// Clean fallback avatar component that guarantees no broken images or squished alt text
const FallbackAvatar: React.FC<{
  src?: string;
  name: string;
  className?: string;
}> = ({ src, name, className = '' }) => {
  const [error, setError] = useState(false);

  const getInitials = (fullName: string) => {
    if (!fullName || !fullName.trim()) return 'SO';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  if (src && src.trim() !== '' && !error) {
    return (
      <div className={`overflow-hidden bg-[#FAF6EB] flex items-center justify-center shrink-0 ${className}`}>
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`bg-[#FAF6EB] border border-[#E5D5AE] flex items-center justify-center select-none font-serif-koinonia shrink-0 text-[#9A7326] ${className}`}
    >
      <span>{getInitials(name)}</span>
    </div>
  );
};

export const ParentHomeView: React.FC<ParentHomeViewProps> = ({
  onNavigate,
  parentProfile,
  childrenList,
  onAddChild,
  onStartNewChild,
  onResumeChildDraft,
  initialTab,
  onSignOut,
  onDeleteChild,
  selectedChildId,
  volunteerProfile
}) => {
  const { showInfo } = useNotification();
  const [activeTab, setActiveTab] = useState<BottomNavTab>(initialTab || 'Home');
  const [childToRemove, setChildToRemove] = useState<ChildItem | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState<boolean>(false);
  const [isPushEnabled, setIsPushEnabled] = useState<boolean>(false);

  useEffect(() => {
    setIsSoundOn(soundUtility.isEnabled());
    setIsPushEnabled(typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false);
  }, []);

  const unreadCount = notifications.filter(n => !n.readAt && !n.isRead).length;
  const prevUnreadCountRef = React.useRef(unreadCount);

  const fetchNotifications = async () => {
    try {
      const data = await api.parent.getNotifications(false, 'parent');
      const currentNotifications = data || [];
      const newUnreadCount = currentNotifications.filter((n: any) => !n.readAt && !n.isRead).length;
      if (newUnreadCount > prevUnreadCountRef.current) {
        soundUtility.playChime();
      }
      prevUnreadCountRef.current = newUnreadCount;
      setNotifications(currentNotifications);
    } catch (err) {
      console.error('Error fetching parent notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const getGreeting = () => {
    if (!parentProfile || !parentProfile.fullName || !parentProfile.fullName.trim()) {
      return 'Good morning';
    }
    const hour = new Date().getHours();
    const firstName = parentProfile.fullName.trim().split(/\s+/)[0];
    let greetingPrefix = 'Good morning';
    if (hour >= 12 && hour < 17) {
      greetingPrefix = 'Good afternoon';
    } else if (hour >= 17 || hour < 4) {
      greetingPrefix = 'Good evening';
    }
    return `${greetingPrefix}, ${firstName}`;
  };

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [selectedPassChild, setSelectedPassChild] = useState<ChildItem | null>(null);

  useEffect(() => {
    if (selectedChildId && childrenList.length > 0) {
      const match = childrenList.find(c => c.id === selectedChildId);
      if (match) {
        setSelectedPassChild(match);
      }
    }
  }, [selectedChildId, childrenList]);

  // New child form state
  const [newChild, setNewChild] = useState({
    name: '',
    age: '5',
    ageGroup: 'Ages 4 to 6',
    specialNeeds: ''
  });

  const handleTabChange = (tab: BottomNavTab) => {
    setActiveTab(tab);
    try {
      const pathMap: Record<BottomNavTab, string> = {
        Home: '/parent/home',
        Children: '/parent/children',
        Status: '/parent/status',
        Passes: '/parent/passes',
        Profile: '/parent/profile'
      };
      window.history.pushState(null, '', `#${pathMap[tab]}`);
    } catch {
      // Ignore history push errors in sandboxes
    }
  };

  const handleRemoveConfirm = async () => {
    if (!childToRemove || !onDeleteChild) return;
    setIsRemoving(true);
    try {
      const res = await onDeleteChild(childToRemove.id);
      if (res.success) {
        setChildToRemove(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRemoving(false);
    }
  };

  const handleSimulatedAddChild = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChild.name.trim()) return;
    const addedChild: ChildItem = {
      id: `child-${Date.now()}`,
      name: newChild.name,
      age: parseInt(newChild.age, 10) || 5,
      ageGroup: newChild.ageGroup,
      status: 'Under review',
      statusNote: 'Details sent for review',
      photoUrl: REAL_ASSETS.passAvatar,
      specialNeeds: newChild.specialNeeds
    };
    if (onAddChild) onAddChild(addedChild);
    setNewChild({ name: '', age: '5', ageGroup: 'Ages 4 to 6', specialNeeds: '' });
    setShowAddChildModal(false);
  };

  const renderHomeTab = () => {
    const underReviewCount = childrenList.filter(c => c.status === 'Under review').length;
    const passReadyCount = childrenList.filter(c => c.status === 'Pass ready').length;

    return (
      <div className="space-y-6 pt-1">
        {/* 1. Greeting header & 2. Parent profile photo */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-medium text-[#18181B] leading-snug">
              {getGreeting()}
            </h1>
            <p className="text-sm text-[#3F3F46] mt-1">
              Here is where things stand for your children.
            </p>
          </div>
          <div className="flex items-center space-x-2.5 shrink-0">
            <button
              onClick={() => setShowNotificationsDrawer(true)}
              className="relative p-2.5 rounded-xl border border-[#D9D6CE] bg-white hover:bg-[#FAF8F4] active:bg-[#FAF6EB] text-[#3F3F46] transition-all cursor-pointer shadow-2xs focus:outline-none"
              title="Notifications"
            >
              <Bell className="w-5 h-5 text-[#3F3F46]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#E07A5F] text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
                  {unreadCount}
                </span>
              )}
            </button>
            <FallbackAvatar
              src={isRealUploadedPhoto(parentProfile.photoUrl) ? parentProfile.photoUrl : undefined}
              name={parentProfile.fullName || 'Parent'}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl border border-[#D9D6CE] text-sm font-bold shadow-2xs"
            />
          </div>
        </div>

        {/* 3, 4, 5. Event hero card with image, Date/Time row, Continue button */}
        <div className="bg-white rounded-2xl border border-[#EAE8E1] shadow-sm overflow-hidden">
          <div className="relative h-44 sm:h-48 w-full bg-[#24221C] overflow-hidden flex flex-col justify-end p-4 sm:p-5">
            {REAL_ASSETS.heroMain && REAL_ASSETS.heroMain.trim() !== '' ? (
              <img src={REAL_ASSETS.heroMain} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#383226] via-[#242018] to-[#14120D]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none" />

            <div className="relative z-10">
              <span className="text-[11px] font-semibold tracking-wider text-[#D4AF37] uppercase block mb-1">
                CHILDREN AND TEENS
              </span>
              <h3 className="text-2xl sm:text-[26px] font-serif-koinonia font-bold text-white tracking-tight leading-tight">
                The General Assembly
              </h3>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4 bg-white">
            <div className="flex items-center text-xs sm:text-sm text-[#3F3F46] font-medium">
              <Calendar className="w-4 h-4 mr-3 text-[#B89047] shrink-0 stroke-[2]" />
              <span>18th to 22nd November 2026, 9:00 AM to 7:00 PM</span>
            </div>

            <button
              type="button"
              onClick={() => handleTabChange('Passes')}
              className="w-full py-3 px-4 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-sm transition-all shadow-2xs cursor-pointer focus:outline-none"
            >
              Continue
            </button>
          </div>
        </div>

        {/* 6. Summary cards */}
        <div className="space-y-3">
          <div className="bg-[#FAF8F4] border border-[#EAE8E1] rounded-2xl p-3.5 sm:p-4 flex items-center space-x-3.5 shadow-2xs">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border border-[#E5D5AE] flex items-center justify-center shrink-0 shadow-2xs">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#9A7326]" />
            </div>
            <span className="text-sm text-[#3F3F46]">
              Children added: <strong className="font-bold text-[#18181B]">{childrenList.length}</strong>
            </span>
          </div>

          <div className="bg-[#FAF8F4] border border-[#EAE8E1] rounded-2xl p-3.5 sm:p-4 flex items-center space-x-3.5 shadow-2xs">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border border-[#E5D5AE] flex items-center justify-center shrink-0 shadow-2xs">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-[#E07A5F]" />
            </div>
            <span className="text-sm text-[#3F3F46]">
              Under review: <strong className="font-bold text-[#18181B]">{underReviewCount}</strong>
            </span>
          </div>

          <div className="bg-[#FAF8F4] border border-[#EAE8E1] rounded-2xl p-3.5 sm:p-4 flex items-center space-x-3.5 shadow-2xs">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border border-[#E5D5AE] flex items-center justify-center shrink-0 shadow-2xs">
              <QrCode className="w-4 h-4 sm:w-5 sm:h-5 text-[#C59B27]" />
            </div>
            <span className="text-sm text-[#3F3F46]">
              Pass ready: <strong className="font-bold text-[#18181B]">{passReadyCount}</strong>
            </span>
          </div>
        </div>

        {/* 7. Your Children heading */}
        <div className="space-y-4 pt-1">
          <h3 className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
            Your Children
          </h3>

          {childrenList.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 border border-[#EAE8E1] text-center space-y-3 shadow-2xs">
              <h4 className="text-base sm:text-lg font-serif-koinonia font-bold text-[#18181B]">
                No children added yet
              </h4>
              <p className="text-xs sm:text-sm text-[#3F3F46] max-w-xs mx-auto leading-relaxed">
                Add each child who may attend the Children and Teens section.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onStartNewChild) onStartNewChild();
                    else onNavigate('/parent/children/new');
                  }}
                  className="py-3 px-6 bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-sm rounded-xl transition-all duration-200 shadow-2xs cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Add a child</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 8 & 9. Child cards */}
              <div className="space-y-4">
                {childrenList.map((child) => (
                  <div
                    key={child.id}
                    className="bg-white rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] shadow-2xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-base sm:text-lg font-serif-koinonia font-bold text-[#18181B] leading-snug">
                          {child.name}
                        </h4>
                        <p className="text-xs sm:text-sm text-[#3F3F46] mt-0.5">
                          {child.age} years
                        </p>
                      </div>
                      <StatusBadge status={child.status} size="sm" />
                    </div>

                    <p className="text-xs sm:text-sm text-[#3F3F46]">
                      {child.statusNote || (child.status === 'Pass ready' ? 'Event pass is available' : child.status === 'Incomplete' || child.status === 'Draft' ? 'Continue entering child details' : 'Details sent for review')}
                    </p>

                    <div className="pt-1">
                      {child.status === 'Pass ready' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPassChild(child);
                            handleTabChange('Passes');
                          }}
                          className="w-full py-2.5 px-4 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-xs sm:text-sm transition-all shadow-2xs cursor-pointer focus:outline-none"
                        >
                          View pass
                        </button>
                      ) : child.status === 'Incomplete' || child.status === 'Draft' ? (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (onResumeChildDraft) onResumeChildDraft(child);
                              else onNavigate('/parent/children/new');
                            }}
                            className="w-full py-2.5 px-4 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-xs sm:text-sm transition-all shadow-2xs cursor-pointer focus:outline-none"
                          >
                            Continue details
                          </button>
                          <button
                            type="button"
                            onClick={() => setChildToRemove(child)}
                            className="w-full py-2 px-4 rounded-xl text-[#6B7280] hover:text-[#4B5563] font-semibold text-xs transition-all cursor-pointer focus:outline-none text-center bg-transparent"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onNavigate(`/parent/children/${child.id}/status`);
                          }}
                          className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-[#FAF9F6] active:bg-[#F4F1EA] border border-[#18181B] text-[#18181B] font-semibold text-xs sm:text-sm transition-all cursor-pointer focus:outline-none"
                        >
                          View status
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 10. Add a child dashed card */}
              <button
                type="button"
                onClick={() => {
                  if (onStartNewChild) onStartNewChild();
                  else onNavigate('/parent/children/new');
                }}
                className="w-full py-3.5 px-5 rounded-2xl border-2 border-dashed border-[#C59B27]/50 bg-[#FAF8F4]/70 hover:bg-[#FAF8F4] active:bg-[#FAF6EB] text-[#9A7326] font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer focus:outline-none"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add a child</span>
              </button>
            </>
          )}
        </div>

        {/* 11. Save-progress note card */}
        <div className="bg-[#F3EFE6] p-3.5 sm:p-4 rounded-2xl border border-[#E5D5AE]/70 text-xs sm:text-sm text-[#3F3F46] flex items-start space-x-3 shadow-2xs">
          <Info className="w-4 h-4 sm:w-5 sm:h-5 text-[#9A7326] shrink-0 mt-0.5 stroke-[2]" />
          <p className="leading-relaxed">
            You can save progress and return before sending details for review.
          </p>
        </div>
      </div>
    );
  };

  const renderChildrenTab = () => (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif-koinonia font-bold text-[#18181B]">Children Profiles</h2>
          <p className="text-xs text-[#6B7280]">Identity check for arrival and pickup.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => {
          if (onStartNewChild) onStartNewChild();
          else onNavigate('/parent/children/new');
        }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>

      {childrenList.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 border border-[#EAE8E1] text-center space-y-3 shadow-sm">
          <h4 className="text-base sm:text-lg font-serif-koinonia font-bold text-[#18181B]">
            No children added yet
          </h4>
          <p className="text-xs sm:text-sm text-[#3F3F46] max-w-xs mx-auto leading-relaxed">
            Add each child who may attend the Children and Teens section.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                if (onStartNewChild) onStartNewChild();
                else onNavigate('/parent/children/new');
              }}
              className="py-3 px-6 bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-sm rounded-xl transition-all duration-200 shadow-2xs cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add a child</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {childrenList.map((child) => (
            <div key={child.id} className="bg-white rounded-3xl p-5 border border-[#EAE8E1] shadow-sm space-y-4">
              <div className="flex items-start space-x-4">
                <FallbackAvatar
                  src={isRealUploadedPhoto(child.photoUrl) ? child.photoUrl : undefined}
                  name={child.name}
                  className="w-16 h-16 rounded-2xl border border-[#D9D6CE] text-lg font-bold"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-[#18181B] truncate">{child.name}</h3>
                  <p className="text-xs text-[#B89047] font-semibold mt-0.5">{child.ageGroup} • {child.age} years old</p>
                  <div className="mt-2">
                    <StatusBadge status={child.status} />
                  </div>
                </div>
              </div>
              <div className="bg-[#FAF9F6] p-3 rounded-xl border border-[#EAE8E1] text-xs text-[#6B7280] flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#18181B]">Care Review Status: </span> {child.statusNote}
                </div>
                {(child.status === 'Incomplete' || child.status === 'Draft') && (
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setChildToRemove(child)}
                      className="py-1.5 px-3 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 font-semibold text-xs cursor-pointer bg-white"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onResumeChildDraft) onResumeChildDraft(child);
                        else onNavigate('/parent/children/new');
                      }}
                      className="py-1.5 px-3 rounded-lg bg-[#C59B27] hover:bg-[#B58E33] text-[#18181B] font-semibold text-xs cursor-pointer"
                    >
                      Continue details
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderStatusTab = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-serif-koinonia font-bold text-[#18181B]">Review Status</h2>
        <p className="text-xs text-[#6B7280]">Current progress from initial submission to event pass readiness.</p>
      </div>

      {childrenList.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-[#EAE8E1] text-center space-y-3 shadow-sm">
          <h4 className="text-base sm:text-lg font-serif-koinonia font-bold text-[#18181B]">
            No children added yet
          </h4>
          <p className="text-xs sm:text-sm text-[#3F3F46] max-w-xs mx-auto leading-relaxed">
            Add each child who may attend the Children and Teens section.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {childrenList.map((child) => (
            <div key={child.id} className="bg-white rounded-2xl p-5 border border-[#EAE8E1] shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#18181B] text-sm">{child.name}</span>
                <StatusBadge status={child.status} />
              </div>
              <p className="text-xs text-[#6B7280] leading-relaxed">{child.statusNote}</p>
              <div className="pt-2 border-t border-[#FAF9F6] flex items-center justify-between text-[11px] text-[#A1A1AA]">
                <span>Last updated today</span>
                <span className="font-semibold text-[#9A7326]">Verified protocol</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPassesTab = () => {
    const readyChildren = childrenList.filter(c => c.status === 'Pass ready');
    const displayChild = selectedPassChild || readyChildren[0] || childrenList[0];
    const isPassReady = displayChild && displayChild.status === 'Pass ready';

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-serif-koinonia font-bold text-[#18181B]">Event Passes</h2>
          <p className="text-xs text-[#6B7280]">Present digital pass during child arrival and verified pickup.</p>
        </div>

        {displayChild && isPassReady ? (
          <div className="space-y-4">
            <EventPassPreviewCard
              childName={displayChild.name}
              ageGroup={displayChild.ageGroup}
              status={displayChild.status}
              photoUrl={isRealUploadedPhoto(displayChild.photoUrl) ? displayChild.photoUrl : undefined}
            />

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => showInfo('Pass saving is not ready yet', 'You can still show this pass from the app.')}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-[#18181B] text-white text-xs font-semibold hover:bg-[#27272A] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Save pass</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  showInfo('Opening WhatsApp', 'You can share the pass from there.');
                }}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-white border border-[#EAE8E1] text-[#18181B] text-xs font-semibold hover:bg-[#FAF9F6] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
              >
                <MessageCircle className="w-4 h-4 text-[#B89047]" />
                <span>Share to WhatsApp</span>
              </button>
            </div>

            {childrenList.length > 1 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Switch child pass</span>
                <div className="grid grid-cols-2 gap-2">
                  {childrenList.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedPassChild(c)}
                      className={`p-3 rounded-2xl border text-left flex items-center space-x-2.5 transition-all cursor-pointer ${
                        displayChild.id === c.id
                          ? 'bg-[#FAF6EB] border-[#C59B27] shadow-sm'
                          : 'bg-white border-[#EAE8E1] hover:border-[#D9D6CE]'
                      }`}
                    >
                      <FallbackAvatar
                        src={isRealUploadedPhoto(c.photoUrl) ? c.photoUrl : undefined}
                        name={c.name}
                        className="w-8 h-8 rounded-lg text-xs font-bold"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[#18181B] block truncate">{c.name}</span>
                        <span className="text-[10px] text-[#6B7280] block truncate">{c.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : displayChild ? (
          <div className="bg-white rounded-3xl p-8 border border-[#EAE8E1] text-center space-y-4 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF6EB] text-[#C59B27] flex items-center justify-center mx-auto border border-[#E5D5AE]">
              <QrCode className="w-6 h-6 opacity-60" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#18181B]">Pass not ready yet</h3>
              <p className="text-xs text-[#6B7280] max-w-xs mx-auto">
                {displayChild.name} is currently <span className="font-semibold text-[#18181B]">{displayChild.status.toLowerCase()}</span>. Event passes are only available once details sent for review have been verified and marked pass ready.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={() => onNavigate(`/parent/children/${displayChild.id}/status`)}
                className="px-4 py-2 rounded-xl bg-[#18181B] text-white text-xs font-semibold hover:bg-[#27272A] transition-all cursor-pointer"
              >
                View child status
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-8 border border-[#EAE8E1] text-center space-y-3">
            <QrCode className="w-12 h-12 text-[#C59B27] mx-auto opacity-50" />
            <h3 className="text-base font-bold text-[#18181B]">Passes under preparation</h3>
            <p className="text-xs text-[#6B7280] max-w-xs mx-auto">
              Once details sent for review are verified by the care team, your digital passes will appear here.
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderProfileTab = () => (
    <div className="space-y-4 pt-1">
      {/* 1. Page title */}
      <div className="pt-2 pb-1">
        <h1 className="text-2xl sm:text-[26px] font-serif-koinonia font-bold text-[#18181B] tracking-tight">
          Profile
        </h1>
      </div>

      {/* 2. Parent profile card */}
      <div className="bg-white rounded-2xl border border-[#EAE8E1] p-5 shadow-2xs relative text-center">
        <div className="flex justify-end mb-1">
          <button
            type="button"
            onClick={() => onNavigate('/parent/profile/edit')}
            className="text-xs font-semibold text-[#B89047] hover:underline cursor-pointer focus:outline-none"
          >
            Edit details
          </button>
        </div>

        <div className="flex justify-center mb-3">
          <FallbackAvatar
            src={isRealUploadedPhoto(parentProfile.photoUrl) ? parentProfile.photoUrl : undefined}
            name={parentProfile.fullName || 'Parent Account'}
            className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl border border-[#D9D6CE] text-lg font-bold shadow-2xs"
          />
        </div>

        <h2 className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B] leading-tight">
          {parentProfile.fullName || 'Parent Account'}
        </h2>

        <div className="mt-1.5 mb-2.5">
          <span className="inline-block px-3 py-0.5 rounded-full bg-[#EFECE4] text-[#715D3A] text-xs font-semibold">
            Parent account
          </span>
        </div>

        <p className="text-xs sm:text-sm text-[#3F3F46]">
          {parentProfile.email || 'Not specified'}
        </p>

        <p className="text-xs sm:text-sm text-[#3F3F46] mt-0.5">
          {parentProfile.phone || 'Not specified'}
        </p>
      </div>

      {/* Volunteer Status / Switcher Banner */}
      {volunteerProfile && (volunteerProfile.status === 'active' || volunteerProfile.status === 'approved') && (
        <div className="bg-[#FAF6EB] border border-[#E5D5AE] rounded-2xl p-4.5 space-y-3 shadow-2xs text-left">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#FAF6EB] border border-[#E5D5AE] rounded-xl text-[#9A7326] shrink-0">
              <Users className="w-5 h-5 stroke-[1.75]" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-[#18181B] font-serif-koinonia leading-tight">Volunteer Access Active</h3>
              <p className="text-[11px] text-[#6B7280] mt-0.5 leading-tight truncate">Approved for the <span className="font-semibold text-gray-700">{volunteerProfile.preferred_team || 'event-day'}</span> team.</p>
            </div>
          </div>
          <Button
            variant="primary"
            fullWidth
            onClick={() => onNavigate('/volunteer/event')}
          >
            Switch to Volunteer Access
          </Button>
        </div>
      )}

      {volunteerProfile && volunteerProfile.status === 'pending_review' && (
        <div className="bg-amber-50/40 border border-amber-200/60 rounded-2xl p-4 text-left">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-amber-50 rounded-xl text-amber-600 shrink-0 mt-0.5 border border-amber-100">
              <Clock className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wide">Volunteer Status: Pending</h3>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                Your application to serve on the <span className="font-semibold">{volunteerProfile.preferred_team || 'event-day'}</span> team is currently under admin review.
              </p>
              <button
                onClick={() => onNavigate('/volunteer/pending-review')}
                className="text-xs font-semibold text-[#C59B27] hover:underline mt-2 flex items-center cursor-pointer"
              >
                View onboarding status <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {volunteerProfile && volunteerProfile.status === 'rejected' && (
        <div className="bg-red-50/40 border border-red-200/60 rounded-2xl p-4 text-left">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-red-50 rounded-xl text-red-600 shrink-0 mt-0.5 border border-red-100">
              <Shield className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-red-900 uppercase tracking-wide">Volunteer Status: Rejected</h3>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                Your request for volunteer access has been rejected by an administrator. Please contact support if you believe this is an error.
              </p>
            </div>
          </div>
        </div>
      )}

      {volunteerProfile && volunteerProfile.status === 'suspended' && (
        <div className="bg-gray-100/60 border border-gray-200 rounded-2xl p-4 text-left">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-gray-50 rounded-xl text-gray-500 shrink-0 mt-0.5 border border-gray-150">
              <Shield className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide">Volunteer Status: Suspended</h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Your volunteer profile has been suspended by an administrator.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Contact preference card */}
      <div className="bg-white rounded-2xl border border-[#EAE8E1] p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-1">
          <span className="text-[11px] font-semibold tracking-wider text-[#3F3F46] uppercase">
            CONTACT PREFERENCE
          </span>
          <button
            type="button"
            onClick={() => onNavigate('/parent/profile/edit')}
            className="text-xs font-semibold text-[#B89047] hover:underline cursor-pointer focus:outline-none"
          >
            Change
          </button>
        </div>

        <div className="flex items-center space-x-3 text-sm font-medium text-[#18181B] py-1">
          <MessageCircle className="w-4 h-4 text-[#B89047] stroke-[1.75] shrink-0" />
          <span>WhatsApp</span>
        </div>

        <div className="flex items-center space-x-3 text-sm font-medium text-[#18181B] py-1">
          <Mail className="w-4 h-4 text-[#B89047] stroke-[1.75] shrink-0" />
          <span>Email</span>
        </div>

        <p className="text-xs italic text-[#6B7280] pt-1">
          Important updates will be sent here.
        </p>
      </div>

      {/* 4. Parent details card */}
      <div className="bg-white rounded-2xl border border-[#EAE8E1] p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wider text-[#3F3F46] uppercase">
            PARENT DETAILS
          </span>
          <button
            type="button"
            onClick={() => onNavigate('/parent/profile/edit')}
            className="text-xs font-semibold text-[#B89047] hover:underline cursor-pointer focus:outline-none"
          >
            Edit details
          </button>
        </div>

        <div>
          <div className="text-xs text-[#6B7280]">Full name</div>
          <div className="text-sm font-semibold text-[#18181B] mt-0.5">
            {parentProfile.fullName || 'Not provided'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#6B7280]">Phone number</div>
          <div className="text-sm font-semibold text-[#18181B] mt-0.5">
            {parentProfile.phone || 'Not provided'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#6B7280]">WhatsApp number</div>
          <div className="text-sm font-semibold text-[#18181B] mt-0.5">
            {parentProfile.whatsapp || parentProfile.phone || 'Not provided'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#6B7280]">Home address</div>
          <div className="text-sm font-semibold text-[#18181B] mt-0.5 leading-relaxed whitespace-pre-line">
            {parentProfile.homeAddress || 'Not provided'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#6B7280]">Country</div>
          <div className="text-sm font-semibold text-[#18181B] mt-0.5">
            {parentProfile.country || 'Not provided'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#6B7280]">State / Region</div>
          <div className="text-sm font-semibold text-[#18181B] mt-0.5">
            {parentProfile.stateRegion || 'Not provided'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#6B7280]">City</div>
          <div className="text-sm font-semibold text-[#18181B] mt-0.5">
            {parentProfile.city || 'Not provided'}
          </div>
        </div>

        <div className="pt-1">
          <div className="text-xs text-[#6B7280] mb-2">Ministry involvement</div>
          <div className="bg-[#FAF8F4] border border-[#EAE8E1] rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-[#3F3F46]">Koinonia worker</span>
              <span className="font-semibold text-[#18181B]">{parentProfile.isWorker ? 'Yes' : 'No'}</span>
            </div>
            {parentProfile.isWorker && (
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-[#3F3F46]">Department</span>
                <span className="font-semibold text-[#18181B]">{parentProfile.department || 'Children Ministry'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Quick links card */}
      <div className="bg-white rounded-2xl border border-[#EAE8E1] shadow-2xs divide-y divide-[#FAF8F4] overflow-hidden">
        <button
          type="button"
          onClick={() => handleTabChange('Children')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] transition-colors cursor-pointer focus:outline-none text-left"
        >
          <div className="flex items-center space-x-3.5">
            <Smile className="w-4 h-4 text-[#6B7280] stroke-[1.75]" />
            <span className="text-sm font-medium text-[#18181B]">My children</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#D9D6CE]" />
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('Passes')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] transition-colors cursor-pointer focus:outline-none text-left"
        >
          <div className="flex items-center space-x-3.5">
            <Ticket className="w-4 h-4 text-[#6B7280] stroke-[1.75]" />
            <span className="text-sm font-medium text-[#18181B]">Passes</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#D9D6CE]" />
        </button>

        {!volunteerProfile ? (
          <button
            type="button"
            onClick={() => onNavigate('/parent/volunteer-request')}
            className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] transition-colors cursor-pointer focus:outline-none text-left animate-fade-in"
          >
            <div className="flex items-center space-x-3.5">
              <Users className="w-4 h-4 text-[#C59B27] stroke-[1.75]" />
              <span className="text-sm font-medium text-[#18181B]">Volunteer with Children & Teens</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#D9D6CE]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('/volunteer/event')}
            className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] transition-colors cursor-pointer focus:outline-none text-left animate-fade-in"
          >
            <div className="flex items-center space-x-3.5">
              <ShieldCheck className="w-4 h-4 text-[#C59B27] stroke-[1.75]" />
              <span className="text-sm font-medium text-[#18181B]">Switch to Volunteer Access</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#D9D6CE]" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            try {
              window.history.pushState(null, '', '#/parent/help');
            } catch {}
          }}
          className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] transition-colors cursor-pointer focus:outline-none text-left"
        >
          <div className="flex items-center space-x-3.5">
            <HelpCircle className="w-4 h-4 text-[#6B7280] stroke-[1.75]" />
            <span className="text-sm font-medium text-[#18181B]">Help and questions</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#D9D6CE]" />
        </button>

        <button
          type="button"
          onClick={() => {
            try {
              window.history.pushState(null, '', '#/parent/safety');
            } catch {}
          }}
          className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] transition-colors cursor-pointer focus:outline-none text-left"
        >
          <div className="flex items-center space-x-3.5">
            <Shield className="w-4 h-4 text-[#6B7280] stroke-[1.75]" />
            <span className="text-sm font-medium text-[#18181B]">Safety information</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#D9D6CE]" />
        </button>
      </div>

      {/* 6. Account actions card */}
      <div className="bg-white rounded-2xl border border-[#EAE8E1] shadow-2xs divide-y divide-[#FAF8F4] overflow-hidden">
        <button
          type="button"
          onClick={() => onNavigate('/parent/new-password')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] transition-colors cursor-pointer focus:outline-none text-left"
        >
          <div className="flex items-center space-x-3.5">
            <Lock className="w-4 h-4 text-[#6B7280] stroke-[1.75]" />
            <span className="text-sm font-medium text-[#18181B]">Change password</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#D9D6CE]" />
        </button>

        <button
          type="button"
          onClick={() => {
            if (onSignOut) {
              onSignOut();
            } else {
              onNavigate('/');
            }
          }}
          className="w-full p-4 flex items-center space-x-3.5 hover:bg-[#FEF2F2]/50 transition-colors cursor-pointer focus:outline-none text-left"
        >
          <LogOut className="w-4 h-4 text-[#C53030] stroke-[1.75]" />
          <span className="text-sm font-medium text-[#C53030]">Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50">
      {/* Top Header shown only on non-Home and non-Profile screens */}
      {activeTab !== 'Home' && activeTab !== 'Profile' && (
        <header className="sticky top-0 z-30 bg-[#FAF8F3]/95 backdrop-blur-md border-b border-[#EAE8E1]">
          <div className="px-5 h-15 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                onClick={() => onNavigate('/')}
                className="w-8 h-8 rounded-lg bg-[#18181B] text-[#D4AF37] flex items-center justify-center font-serif-koinonia font-bold text-base shadow-2xs select-none cursor-pointer"
              >
                K
              </div>
              <div className="flex flex-col">
                <span className="font-serif-koinonia font-bold text-sm text-[#18181B] tracking-wider uppercase leading-none">
                  PARENT HOME
                </span>
                <span className="text-[11px] text-[#6B7280] mt-0.5 font-medium">
                  Children and Teens
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowNotificationsDrawer(true)}
                className="relative p-2 rounded-xl border border-[#D9D6CE] bg-white hover:bg-[#FAF8F4] active:bg-[#FAF6EB] text-[#3F3F46] transition-all cursor-pointer shadow-2xs focus:outline-none"
                title="Notifications"
              >
                <Bell className="w-4 h-4 text-[#3F3F46]" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#E07A5F] text-[9px] font-bold text-white shadow-sm ring-1 ring-white">
                    {unreadCount}
                  </span>
                )}
              </button>
              <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#FAF6EB] text-[#9A7326] text-[10px] font-semibold border border-[#E5D5AE]">
                Official
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main Container framed to mobile shell width with 112px bottom padding so bottom nav never overlaps */}
      <main className="flex-1 w-full px-5 pt-5 pb-28">
        {activeTab === 'Home' && renderHomeTab()}
        {activeTab === 'Children' && renderChildrenTab()}
        {activeTab === 'Status' && renderStatusTab()}
        {activeTab === 'Passes' && renderPassesTab()}
        {activeTab === 'Profile' && renderProfileTab()}
      </main>

      {/* Fixed Bottom Navigation locked within the mobile app shell */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 max-w-[390px] mx-auto bg-white/95 backdrop-blur-md border-t border-[#EAE8E1] shadow-lg">
        <div className="px-2 h-16 flex items-center justify-around">
          {[
            { label: 'Home' as BottomNavTab, icon: <Home className="w-5 h-5" /> },
            { label: 'Children' as BottomNavTab, icon: <Users className="w-5 h-5" /> },
            { label: 'Status' as BottomNavTab, icon: <Activity className="w-5 h-5" /> },
            { label: 'Passes' as BottomNavTab, icon: <QrCode className="w-5 h-5" /> },
            { label: 'Profile' as BottomNavTab, icon: <User className="w-5 h-5" /> }
          ].map((item) => {
            const isActive = activeTab === item.label;
            return (
              <button
                key={item.label}
                onClick={() => handleTabChange(item.label)}
                className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-xl transition-all cursor-pointer focus:outline-none ${
                  isActive
                    ? 'text-[#B89047] font-semibold'
                    : 'text-[#6B7280] hover:text-[#18181B]'
                }`}
              >
                <div
                  className={`p-1 rounded-lg transition-transform ${
                    isActive ? 'bg-[#FAF6EB] scale-110 text-[#C59B27]' : ''
                  }`}
                >
                  {item.icon}
                </div>
                <span className="text-[11px] mt-0.5 tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Add Child Modal */}
      {showAddChildModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-[#EAE8E1] shadow-2xl max-w-md w-full animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#EAE8E1]">
              <h3 className="text-lg font-serif-koinonia font-bold text-[#18181B]">Add a child</h3>
              <button
                onClick={() => setShowAddChildModal(false)}
                className="p-1 rounded-lg hover:bg-black/5 cursor-pointer focus:outline-none"
              >
                <X className="w-5 h-5 text-[#6B7280]" />
              </button>
            </div>

            <form onSubmit={handleSimulatedAddChild} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#18181B] block mb-1">Child full name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grace Omikunle"
                  value={newChild.name}
                  onChange={(e) => setNewChild({ ...newChild, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-[#D9D6CE] text-sm focus:outline-none focus:ring-2 focus:ring-[#C59B27]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#18181B] block mb-1">Age (Years)</label>
                  <input
                    type="number"
                    required
                    value={newChild.age}
                    onChange={(e) => {
                      const val = e.target.value;
                      const ageNum = parseInt(val, 10) || 5;
                      let grp = 'Ages 4 to 6';
                      if (ageNum >= 10) grp = 'Teens (10+)';
                      else if (ageNum >= 7) grp = 'Ages 7 to 9';
                      setNewChild({ ...newChild, age: val, ageGroup: grp });
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-[#D9D6CE] text-sm focus:outline-none focus:ring-2 focus:ring-[#C59B27]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#18181B] block mb-1">Assigned Pavilion</label>
                  <input
                    type="text"
                    disabled
                    value={newChild.ageGroup}
                    className="w-full px-4 py-3 rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] text-xs font-semibold text-[#B89047]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#18181B] block mb-1">Special medical or care notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Mild peanut allergy"
                  value={newChild.specialNeeds}
                  onChange={(e) => setNewChild({ ...newChild, specialNeeds: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-[#D9D6CE] text-sm focus:outline-none focus:ring-2 focus:ring-[#C59B27]"
                />
              </div>

              <div className="pt-2 flex space-x-3">
                <Button type="button" variant="ghost" fullWidth onClick={() => setShowAddChildModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" fullWidth>
                  Send for review
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Draft Child Modal */}
      {childToRemove && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-[#EAE8E1] shadow-2xl max-w-sm w-full animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-serif-koinonia font-bold text-[#18181B] mb-2">
              Remove child?
            </h3>
            <p className="text-sm text-[#3F3F46] leading-relaxed mb-6">
              This will remove the child’s saved details from your Parent Access.
            </p>
            <div className="flex space-x-3">
              <button
                type="button"
                disabled={isRemoving}
                onClick={() => setChildToRemove(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-[#EAE8E1] text-[#3F3F46] hover:bg-[#FAF9F6] font-semibold text-sm transition-all focus:outline-none cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRemoving}
                onClick={handleRemoveConfirm}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold text-sm transition-all focus:outline-none cursor-pointer text-center"
              >
                {isRemoving ? 'Removing...' : 'Remove child'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Drawer Bottom Sheet */}
      {showNotificationsDrawer && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white rounded-t-[32px] max-h-[85%] overflow-hidden flex flex-col border-t border-[#EAE8E1] shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="px-5 py-4.5 border-b border-[#FAF9F6] flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Bell className="w-5 h-5 text-[#C59B27]" />
                <h3 className="text-base font-serif-koinonia font-bold text-[#18181B]">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <span className="bg-[#E07A5F] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-4">
                {unreadCount > 0 && (
                  <button
                    onClick={async () => {
                      try {
                        for (const notif of notifications) {
                          const isUnread = !notif.readAt && !notif.isRead;
                          if (isUnread) {
                            await api.parent.markNotificationAsRead(notif.id);
                          }
                        }
                        fetchNotifications();
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="text-xs font-semibold text-[#9A7326] hover:underline cursor-pointer focus:outline-none"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setShowNotificationsDrawer(false)}
                  className="p-1 rounded-lg hover:bg-black/5 cursor-pointer focus:outline-none"
                >
                  <X className="w-5 h-5 text-[#6B7280]" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5 min-h-[280px]">
              {notifications.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <Bell className="w-10 h-10 text-[#D9D6CE] mx-auto stroke-[1.5]" />
                  <p className="text-sm font-medium text-[#3F3F46]">No reminders yet</p>
                  <p className="text-xs text-[#6B7280] max-w-[240px] mx-auto leading-relaxed">
                    Personalized event schedules, check-in details, and pickup reminders will appear here.
                  </p>
                </div>
              ) : (
                notifications.map((notif) => {
                  const isUnread = !notif.readAt && !notif.isRead;
                  return (
                    <div
                      key={notif.id}
                      onClick={async () => {
                        if (isUnread) {
                          try {
                            await api.parent.markNotificationAsRead(notif.id);
                            fetchNotifications();
                          } catch (e) {
                            console.error(e);
                          }
                        }
                      }}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                        isUnread
                          ? 'bg-[#FAF8F4] border-[#C59B27]/40 shadow-2xs'
                          : 'bg-white border-[#EAE8E1] hover:border-[#D9D6CE]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-serif-koinonia font-bold text-[#18181B] leading-snug">
                          {notif.title}
                        </h4>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-[#E07A5F] shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-[#3F3F46] mt-2 leading-relaxed whitespace-pre-wrap">
                        {notif.message}
                      </p>
                      <div className="text-[10px] text-[#A1A1AA] mt-3 font-mono">
                        {new Date(notif.createdAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })} • {new Date(notif.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sound & Push Settings footer panel */}
            <div className="px-5 py-4 bg-[#FAF8F4] border-t border-[#EAE8E1] flex flex-col gap-3 shrink-0">
              {/* Sound toggle */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-[#18181B]">Sound Notifications</span>
                  <span className="text-[10px] text-[#6B7280]">Play gentle chime for new alerts</span>
                </div>
                <button
                  onClick={() => {
                    const nextVal = !isSoundOn;
                    setIsSoundOn(nextVal);
                    soundUtility.setEnabled(nextVal);
                    if (nextVal) {
                      soundUtility.playChime(true);
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all ${
                    isSoundOn 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                      : 'bg-white border border-[#D9D6CE] text-[#3F3F46]'
                  }`}
                >
                  {isSoundOn ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Push notifications button */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-[#EAE8E1]/60">
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-[#18181B]">Push Notifications</span>
                  <span className="text-[10px] text-[#6B7280]">Receive instant device updates</span>
                </div>
                {isPushEnabled ? (
                  <span className="px-3.5 py-1.5 rounded-full text-[10px] font-bold bg-[#FAF6EB] text-[#C59B27] border border-[#EAE8E1] tracking-wider uppercase">
                    Active
                  </span>
                ) : (
                  <button
                    onClick={async () => {
                      if (typeof Notification === 'undefined') {
                        showInfo('Browser Limit', 'Push notifications are not supported on this browser.');
                        return;
                      }
                      const permission = await Notification.requestPermission();
                      if (permission === 'granted') {
                        setIsPushEnabled(true);
                        showInfo('Push notifications enabled!', 'You will now receive alerts.');
                        try {
                          await api.parent.savePushSubscription({
                            endpoint: 'https://fcm.googleapis.com/fcm/send/mock-token',
                            keys: {
                              p256dh: 'mock-p256dh-key',
                              auth: 'mock-auth-key'
                            }
                          });
                        } catch (err) {
                          console.warn('Subscription save failed:', err);
                        }
                      } else {
                        showInfo('Permission denied', 'Device blocked. Please update your browser settings.');
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-full text-[10px] font-bold bg-white border border-[#D9D6CE] text-[#3F3F46] hover:border-[#C59B27] hover:text-[#9A7326] transition-all"
                  >
                    Enable
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
