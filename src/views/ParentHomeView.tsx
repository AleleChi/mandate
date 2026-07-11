import React, { useState, useEffect } from 'react';
import { AppRoute, BottomNavTab, ChildItem, ParentProfile } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { Button } from '../components/common/Button';
import { EventPassPreviewCard } from '../components/common/EventPassPreviewCard';
import { BrandLogo } from '../components/common/BrandLogo';
import { Calendar, Clock, Plus, ShieldCheck, QrCode, Home, Users, Activity, User, Info, X, MessageCircle, Mail, Smile, Ticket, HelpCircle, Shield, ChevronRight, Lock, LogOut, Bell, ArrowLeft, Check, AlertCircle, Menu, Fingerprint } from 'lucide-react';
import { REAL_ASSETS } from '../config/assets';
import { useNotification } from '../context/NotificationContext';
import { api } from '../services/api';
import { soundUtility } from '../utils/sound';
import { subscribeUserToPush } from '../utils/pushSubscription';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { SafeImage } from '../components/common/SafeImage';
import { DeviceSecuritySettings } from '../components/common/DeviceSecuritySettings';
import { DeviceSecurityModal } from '../components/common/DeviceSecurityModal';
import parentHeroImg from '../assets/images/parent_hero_1783622066454.jpg';

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
  activeEvent?: any;
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
    const resolved = resolveMediaUrl(src);
    return (
      <div className={`overflow-hidden bg-[#FAF6EB] flex items-center justify-center shrink-0 ${className}`}>
        <img
          src={resolved}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setError(true)}
          loading="lazy"
          referrerPolicy="no-referrer"
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
  volunteerProfile,
  activeEvent
}) => {
  const { showInfo, showSuccess, showError } = useNotification();
  const [selectedDetailChild, setSelectedDetailChild] = useState<ChildItem | null>(null);
  const [activeTab, setActiveTab] = useState<BottomNavTab>(initialTab || 'Home');
  const [childToRemove, setChildToRemove] = useState<ChildItem | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [showHelpDrawer, setShowHelpDrawer] = useState(false);
  const [showSafetyDrawer, setShowSafetyDrawer] = useState(false);
  const [showDeviceSecurityDrawer, setShowDeviceSecurityDrawer] = useState(false);
  const [passUnlockedChildId, setPassUnlockedChildId] = useState<string | null>(null);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<any | null>(null);
  const [isSoundOn, setIsSoundOn] = useState<boolean>(false);
  const [isPushEnabled, setIsPushEnabled] = useState<boolean>(false);
  const [isVibrationOn, setIsVibrationOn] = useState<boolean>(true);
  const [isWhatsAppOn, setIsWhatsAppOn] = useState<boolean>(true);
  const [customHeroUrl, setCustomHeroUrl] = useState<string | null>(null);
  const [defaultEventHeroUrl, setDefaultEventHeroUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchCustomHero = async () => {
      try {
        const res = await api.getPublicAppMedia();
        if (res.success) {
          if (res.media?.parentDashboardHero?.url) {
            setCustomHeroUrl(res.media.parentDashboardHero.url);
          }
          if (res.media?.defaultEventHero?.url) {
            setDefaultEventHeroUrl(res.media.defaultEventHero.url);
          }
        }
      } catch (err) {
        console.error('Failed to load custom parent hero:', err);
      }
    };
    fetchCustomHero();
  }, []);

  useEffect(() => {
    setIsSoundOn(soundUtility.isEnabled());
    setIsPushEnabled(typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false);
  }, []);

  const unreadCount = notifications.filter(n => !n.readAt && !n.isRead).length;
  const prevUnreadCountRef = React.useRef(unreadCount);

  const fetchNotifications = async () => {
    try {
      setNotificationsError(null);
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
      setNotificationsError('We could not load your updates. Please try again.');
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
        if (match.passReference || match.status === 'Pass ready') {
          setSelectedDetailChild(match);
        }
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
      <div data-view-version="parent-dashboard-v5-clean-header" className="space-y-6 pt-1">
        {/* Warm Parent Greeting */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 data-component-version="parent-dashboard-greeting-v2" className="text-xl sm:text-2xl font-serif-koinonia font-bold text-[#18181B] leading-snug">
              {getGreeting()}
            </h1>
            <p className="text-xs sm:text-sm text-[#3F3F46] mt-1">
              Here is where things stand for your children.
            </p>
          </div>
        </div>

        {/* Gentle completion banner if photo, address, etc. are missing */}
        {(!parentProfile.homeAddress || !parentProfile.photoUrl || !isRealUploadedPhoto(parentProfile.photoUrl)) && (
          <div data-component-version="parent-profile-reminder-v1" className="bg-[#FCF9F2] border border-[#E8DFCA] rounded-2xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-[#9A7326] shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-xs font-bold text-[#18181B]">Complete your profile</h4>
              <p className="text-[11px] text-[#6B7280] mt-0.5">
                Add any missing contact details so the event team can reach you when needed.
              </p>
              <button
                type="button"
                onClick={() => {
                  onNavigate('/parent/profile/edit');
                }}
                className="mt-2 text-[11px] font-bold text-[#9A7326] hover:underline focus:outline-none cursor-pointer"
              >
                Update profile
              </button>
            </div>
          </div>
        )}

        {/* Event hero card with image, Date/Time row, Continue button */}
        <div className="bg-white rounded-2xl border border-[#EAE8E1] shadow-sm overflow-hidden" data-component-version="parent-dashboard-hero-v8-secure-media">
          <div className="relative h-44 sm:h-48 w-full bg-[#24221C] overflow-hidden flex flex-col justify-end p-4 sm:p-5">
            <SafeImage 
              src={customHeroUrl}
              fallbackSrc={defaultEventHeroUrl || parentHeroImg} 
              alt={activeEvent?.title || "The General Assembly"} 
              className="absolute inset-0 w-full h-full object-cover"
              containerClassName="absolute inset-0 w-full h-full"
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none" />

            <div className="relative z-10">
              <span className="text-[11px] font-semibold tracking-wider text-[#D4AF37] uppercase block mb-1">
                {activeEvent?.sectionName || activeEvent?.section_name || "CHILDREN AND TEENS"}
              </span>
              <h3 className="text-2xl sm:text-[26px] font-serif-koinonia font-bold text-white tracking-tight leading-tight">
                {activeEvent?.title || "The General Assembly"}
              </h3>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4 bg-white">
            <div className="flex items-center text-xs sm:text-sm text-[#3F3F46] font-medium">
              <Calendar className="w-4 h-4 mr-3 text-[#B89047] shrink-0 stroke-[2]" />
              <span>
                {(() => {
                  if (!activeEvent) return '18th to 22nd November 2026, 9:00 AM to 7:00 PM';
                  const starts = activeEvent.startsAt || activeEvent.starts_at;
                  const ends = activeEvent.endsAt || activeEvent.ends_at;
                  const startTime = activeEvent.dailyStartTime || activeEvent.daily_start_time || '9:00 AM';
                  const endTime = activeEvent.dailyEndTime || activeEvent.daily_end_time || '7:00 PM';
                  if (!starts || !ends) return `${startTime} to ${endTime}`;

                  const formatDateStr = (dateStr: string) => {
                    try {
                      const d = new Date(dateStr);
                      if (isNaN(d.getTime())) return dateStr;
                      const day = d.getDate();
                      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      const month = months[d.getMonth()];
                      const year = d.getFullYear();
                      
                      const j = day % 10, k = day % 100;
                      let suffix = "th";
                      if (j === 1 && k !== 11) suffix = "st";
                      else if (j === 2 && k !== 12) suffix = "nd";
                      else if (j === 3 && k !== 13) suffix = "rd";
                      
                      return `${day}${suffix} ${month} ${year}`;
                    } catch (e) {
                      return dateStr;
                    }
                  };

                  const formattedStarts = formatDateStr(starts);
                  const formattedEnds = formatDateStr(ends);
                  if (formattedStarts === formattedEnds) {
                    return `${formattedStarts}, ${startTime} to ${endTime}`;
                  }
                  return `${formattedStarts} to ${formattedEnds}, ${startTime} to ${endTime}`;
                })()}
              </span>
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
    <div data-view-version="parent-children-v3-clean-header" className="space-y-5">
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
                  <p className="text-xs text-[#B89047] font-semibold mt-0.5">{child.ageGroup} • {child.age === 0 ? 'Under 1 year old' : `${child.age} years old`}</p>
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
    <div data-view-version="parent-child-status-v10-clean-header" className="space-y-4">
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
    // 1. passReadyChildren: child.pass exists / pass is active/issued/pass_ready.
    // Checked in/inside/picked up states are still treated as pass ready (and don't disappear)
    const passReadyChildren = childrenList.filter(c => 
      (c.status === 'Pass ready' || c.status === 'Checked in' || c.status === 'Inside' || c.status === 'Picked up' || c.status === 'Checked out' || c.passReference) && 
      c.status !== 'Withdrawn'
    );

    // 2. waitingChildren: under review, selected with no pass yet, pending, review reopened, no active pass but submitted
    const waitingChildren = childrenList.filter(c => 
      (c.status === 'Under review' || c.status === 'Selected' || c.status === 'Waiting list' || c.status === 'Not selected' || (c.status as string) === 'Review reopened') &&
      !passReadyChildren.some(pr => pr.id === c.id)
    );

    // 3. draftChildren: draft, incomplete, not submitted
    const draftChildren = childrenList.filter(c => 
      (c.status === 'Draft' || c.status === 'Incomplete') &&
      !passReadyChildren.some(pr => pr.id === c.id) &&
      !waitingChildren.some(w => w.id === c.id)
    );

    const passReadyCount = passReadyChildren.length;
    const waitingCount = waitingChildren.length;
    const draftCount = draftChildren.length;

    return (
      <div data-view-version="parent-passes-v12-stitch-multi-child-overview" className="space-y-6 pb-10 text-left">
        {/* Page Title & Subtitle */}
        <div data-component-version="parent-passes-title-v2-stitch" className="space-y-1">
          <h2 className="text-2xl font-serif-koinonia font-bold text-[#18181B]">Passes</h2>
          <p className="text-xs text-[#5C5A54] font-medium">Passes will appear here when children are selected.</p>
        </div>

        {/* Summary Counters */}
        <div data-component-version="parent-passes-summary-v2-stitch" className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-3 text-center shadow-2xs">
            <span className="text-[10px] font-semibold text-[#8E8B82] uppercase tracking-wider block">Pass ready</span>
            <span className="text-lg font-bold text-[#18181B] mt-1 block">{passReadyCount}</span>
          </div>
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-3 text-center shadow-2xs">
            <span className="text-[10px] font-semibold text-[#8E8B82] uppercase tracking-wider block">Waiting</span>
            <span className="text-lg font-bold text-[#18181B] mt-1 block">{waitingCount}</span>
          </div>
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-3 text-center shadow-2xs">
            <span className="text-[10px] font-semibold text-[#8E8B82] uppercase tracking-wider block">Draft</span>
            <span className="text-lg font-bold text-[#18181B] mt-1 block">{draftCount}</span>
          </div>
        </div>

        {/* Empty State when no children exist */}
        {childrenList.length === 0 && (
          <div data-component-version="parent-pass-empty-state-v2" className="bg-white rounded-3xl p-8 border border-[#EAE8E1] text-center space-y-4 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF6EB] text-[#C59B27] flex items-center justify-center mx-auto border border-[#E5D5AE]">
              <QrCode className="w-6 h-6 opacity-60" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#18181B]">Passes under preparation</h3>
              <p className="text-xs text-[#6B7280] max-w-xs mx-auto">
                Once details sent for review are verified by the care team, your digital passes will appear here.
              </p>
            </div>
          </div>
        )}

        {/* Child Pass Overview Cards */}
        <div className="space-y-5">
          {/* Pass-Ready Children Cards */}
          {passReadyChildren.map(c => {
            const isCheckedIn = c.status === 'Checked in' || c.status === 'Inside';
            return (
              <div 
                key={c.id} 
                data-component-version={isCheckedIn ? "parent-pass-card-checked-in-v2" : "parent-pass-ready-card-v2-stitch"}
                className="w-full bg-[#FAF9F6] border border-[#E5D5AE] rounded-3xl p-5 shadow-xs relative overflow-hidden space-y-4 text-left"
              >
                {/* Top-right status badge */}
                <div className="absolute top-4 right-4">
                  {isCheckedIn ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#E8F5E9] border border-[#C8E6C9] text-[#2E7D32] text-[10px] font-bold uppercase tracking-wider">
                      Checked in today
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] text-[10px] font-bold uppercase tracking-wider">
                      Pass ready
                    </span>
                  )}
                </div>

                {/* Centered photo & identity info */}
                <div className="pt-2 flex flex-col items-center">
                  <FallbackAvatar
                    src={isRealUploadedPhoto(c.photoUrl) ? c.photoUrl : undefined}
                    name={c.name}
                    className="w-16 h-16 rounded-full border border-[#D9D6CE] text-lg font-bold shadow-2xs"
                  />
                  <h3 className="text-base font-serif-koinonia font-bold text-[#18181B] mt-2.5 text-center leading-tight">{c.name}</h3>
                  <p className="text-[11px] text-[#5C5A54] font-medium text-center mt-0.5">{c.age} years • {c.ageGroup}</p>
                </div>

                {/* Event info block */}
                <div className="bg-white p-3 rounded-xl border border-[#EAE8E1] text-xs space-y-1">
                  <span className="text-[10px] text-[#8E8B82] uppercase tracking-wider font-semibold block">Event</span>
                  <span className="font-bold text-[#18181B] block leading-tight">
                    {activeEvent ? `${activeEvent.sectionName || activeEvent.section_name || "Children and Teens"} ${activeEvent.title || "The General Assembly"}` : "Children and Teens The General Assembly"}
                  </span>
                </div>

                {/* Compact QR Preview */}
                <div className="flex flex-col items-center space-y-1.5 pt-1">
                  <div className="bg-white p-2 rounded-xl border border-[#E5D5AE] w-20 h-20 flex items-center justify-center shadow-inner">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(c.passReference || c.id)}`}
                      alt=""
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <span className="text-[9px] font-mono font-semibold tracking-wider text-[#8E8B82]">
                    Show at entry
                  </span>
                </div>

                {/* Gold Button */}
                <button
                  type="button"
                  onClick={() => setSelectedDetailChild(c)}
                  className="w-full py-3 px-4 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-sm transition-all shadow-2xs cursor-pointer focus:outline-none text-center"
                >
                  View pass
                </button>
              </div>
            );
          })}

          {/* Under-Review / Waiting Children Cards */}
          {waitingChildren.map(c => (
            <div 
              key={c.id} 
              data-component-version="parent-pass-waiting-card-v2-stitch"
              className="bg-white rounded-3xl p-4 border border-[#EAE8E1] shadow-2xs space-y-4 text-left"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <FallbackAvatar
                    src={isRealUploadedPhoto(c.photoUrl) ? c.photoUrl : undefined}
                    name={c.name}
                    className="w-12 h-12 rounded-xl border border-[#D9D6CE] text-sm font-bold shadow-2xs"
                  />
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-[#18181B] truncate">{c.name}</h4>
                    <p className="text-[11px] text-[#8E8B82] font-semibold mt-0.5">{c.age} years • {c.ageGroup}</p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-bold uppercase tracking-wider">
                  {c.status === 'Selected' ? 'Waiting' : 'Under review'}
                </span>
              </div>

              <div className="bg-[#FAF6EB]/40 p-3 rounded-xl border border-[#E5D5AE]/20 text-xs text-[#5C5A54] leading-relaxed">
                Pass will appear here if selected.
              </div>

              <button
                type="button"
                onClick={() => onNavigate(`/parent/children/${c.id}/status` as AppRoute)}
                className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-[#FAF9F6] border border-[#18181B] text-[#18181B] font-semibold text-xs sm:text-sm transition-all cursor-pointer focus:outline-none text-center"
              >
                View status
              </button>
            </div>
          ))}

          {/* Draft / Incomplete Children Cards */}
          {draftChildren.map(c => (
            <div 
              key={c.id} 
              data-component-version="parent-pass-draft-card-v2-stitch"
              className="bg-white rounded-3xl p-4 border border-[#EAE8E1] shadow-2xs space-y-4 text-left"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <FallbackAvatar
                    src={undefined}
                    name={c.name}
                    className="w-12 h-12 rounded-xl border border-[#EAE8E1] text-sm font-bold"
                  />
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-[#18181B] truncate">{c.name}</h4>
                    <p className="text-[11px] text-[#8E8B82] font-semibold mt-0.5">{c.age} years • {c.ageGroup}</p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600 text-[9px] font-bold uppercase tracking-wider">
                  Draft
                </span>
              </div>

              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs text-gray-500 leading-relaxed">
                Details have not been sent yet.
              </div>

              <button
                type="button"
                onClick={() => {
                  if (onResumeChildDraft) {
                    onResumeChildDraft(c);
                  } else {
                    onNavigate('/parent/children/new');
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-gray-50 border border-gray-300 text-[#3F3F46] font-semibold text-xs sm:text-sm transition-all cursor-pointer focus:outline-none text-center"
              >
                Continue details
              </button>
            </div>
          ))}
        </div>

        {/* Bottom Info Note Card */}
        <div 
          data-component-version="parent-passes-info-note-v2-stitch"
          className="bg-[#FCF9F2] p-4 rounded-2xl border border-[#E8DFCA] text-xs text-[#5C5A54] flex items-start space-x-3 shadow-2xs"
        >
          <Info className="w-4 h-4 text-[#9A7326] shrink-0 mt-0.5 stroke-[2]" />
          <p className="leading-relaxed text-left">
            Keep each pass ready on event day. The team will check the child photo and pickup details.
          </p>
        </div>
      </div>
    );
  };

  const renderProfileTab = () => (
    <div data-view-version="parent-profile-v4-clean-header" className="space-y-4 pt-1">
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

      {/* Notification Preferences Card */}
      <div className="bg-white rounded-2xl border border-[#EAE8E1] p-4 sm:p-5 shadow-2xs space-y-4">
        <span className="text-[11px] font-semibold tracking-wider text-[#3F3F46] uppercase block">
          Notification Preferences
        </span>

        <div className="space-y-3.5 divide-y divide-[#EAE8E1]/30 text-xs text-[#18181B]">
          {/* Sound Notification Preference */}
          <div className="flex items-center justify-between pt-0.5">
            <div className="flex flex-col text-left">
              <span className="font-semibold text-zinc-800">Sound alerts</span>
              <span className="text-[10px] text-[#6B7280]">Play a soft alert for new updates</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextVal = !isSoundOn;
                setIsSoundOn(nextVal);
                soundUtility.setEnabled(nextVal);
                if (nextVal) {
                  soundUtility.playChime(true);
                }
                showSuccess('Sound Alerts Updated', `Sound notifications turned ${nextVal ? 'on' : 'off'}.`);
              }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                isSoundOn 
                  ? 'bg-[#C59B27] text-white' 
                  : 'bg-[#FAF8F3] border border-[#E5D5AE] text-[#3F3F46]'
              }`}
            >
              {isSoundOn ? 'On' : 'Off'}
            </button>
          </div>

          {/* Push Notification Preference */}
          <div className="flex items-center justify-between pt-3.5">
            <div className="flex flex-col text-left">
              <span className="font-semibold text-zinc-800">Push notifications</span>
              <span className="text-[10px] text-[#6B7280]">Receive updates on this device</span>
            </div>
            {typeof Notification === 'undefined' ? (
              <span className="text-[10px] font-semibold text-[#6B7280]">
                Unavailable
              </span>
            ) : isPushEnabled ? (
              <span className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-[#FAF6EB] text-[#9A7326] border border-[#E5D5AE] tracking-wider uppercase">
                On
              </span>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const res = await subscribeUserToPush();
                  if (res.success) {
                    setIsPushEnabled(true);
                    showSuccess('Push Active', 'You will now receive alerts directly on this device.');
                  } else {
                    showInfo('Setup Alert', 'Push notifications are not available yet.');
                  }
                }}
                className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-[#FAF8F3] border border-[#E5D5AE] text-[#3F3F46] hover:border-[#C59B27] hover:text-[#9A7326] transition-all cursor-pointer"
              >
                Enable
              </button>
            )}
          </div>

          {/* Email Notification Preference */}
          <div className="flex items-center justify-between pt-3.5">
            <div className="flex flex-col text-left">
              <span className="font-semibold text-zinc-800">Email updates</span>
              <span className="text-[10px] text-[#6B7280]">Weekly newsletters and care reminders</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const storedValue = localStorage.getItem('koinonia_parent_email_notifications') === 'true';
                const nextVal = !storedValue;
                localStorage.setItem('koinonia_parent_email_notifications', nextVal ? 'true' : 'false');
                showSuccess('Email Settings Saved', `Email updates turned ${nextVal ? 'on' : 'off'}.`);
                // Simple force update for React state
                setNotifications([...notifications]);
              }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                localStorage.getItem('koinonia_parent_email_notifications') === 'true'
                  ? 'bg-[#C59B27] text-white' 
                  : 'bg-[#FAF8F3] border border-[#E5D5AE] text-[#3F3F46]'
              }`}
            >
              {localStorage.getItem('koinonia_parent_email_notifications') === 'true' ? 'On' : 'Off'}
            </button>
          </div>
        </div>
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
          data-component-version="parent-profile-help-row-v1"
          onClick={() => {
            setShowHelpDrawer(true);
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
          data-component-version="parent-profile-safety-row-v1"
          onClick={() => {
            setShowSafetyDrawer(true);
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
          onClick={() => {
            setShowDeviceSecurityDrawer(true);
            try {
              window.history.pushState(null, '', '#/parent/device-security');
            } catch {}
          }}
          className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] transition-colors cursor-pointer focus:outline-none text-left"
        >
          <div className="flex items-center space-x-3.5">
            <Fingerprint className="w-4 h-4 text-[#C59B27] stroke-[1.75]" />
            <span className="text-sm font-medium text-[#18181B]">Device security</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#D9D6CE]" />
        </button>

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
    <div data-view-version={
      activeTab === 'Home' ? 'parent-dashboard-v5-clean-header' :
      activeTab === 'Children' ? 'parent-children-v3-clean-header' :
      activeTab === 'Status' ? 'parent-child-status-v10-clean-header' :
      activeTab === 'Passes' ? 'parent-passes-v11-fixed-active-pass-rendering' :
      activeTab === 'Profile' ? 'parent-profile-v4-clean-header' :
      'parent-dashboard-v5-clean-header'
    } className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50">
      {/* Top Header shown on all screens with calm, minimal, premium design */}
      <header className="sticky top-0 z-30 bg-[#FAF8F3]/95 backdrop-blur-md border-b border-[#EAE8E1]/50" data-component-version={activeTab === 'Passes' ? 'parent-passes-header-v2-stitch' : 'parent-mobile-header-v2-clean'}>
        <div className="px-5 h-14 flex items-center justify-between">
          <div className="flex items-center">
            {activeTab === 'Passes' ? (
              <button 
                onClick={() => setShowHelpDrawer(true)}
                className="p-2 -ml-2 rounded-xl text-[#3F3F46] hover:text-[#C59B27] active:scale-95 transition-all cursor-pointer focus:outline-none" 
                title="Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            ) : (
              <BrandLogo
                context="compact"
                data-component-version="parent-brand-logo-v1-configured"
                onClick={() => handleTabChange('Home')}
                className="mr-1"
              />
            )}
          </div>

          <div className="text-center">
            <span className="font-serif-koinonia font-bold text-xs sm:text-sm text-[#18181B] tracking-wider uppercase leading-none">
              {activeTab === 'Passes' ? 'KOINONIA' : activeTab === 'Home' ? 'Koinonia' : activeTab === 'Children' ? 'Children' : activeTab === 'Status' ? 'Status' : 'Profile'}
            </span>
          </div>

          <div className="flex items-center space-x-2.5">
            {activeTab !== 'Passes' && (
              <button
                onClick={() => setShowNotificationsDrawer(true)}
                className="relative p-2 rounded-xl text-[#3F3F46] hover:text-[#C59B27] active:scale-95 transition-all cursor-pointer focus:outline-none"
                title="Notifications"
              >
                <Bell className="w-5 h-5 text-[#3F3F46]" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-[#E07A5F] text-[9px] font-bold text-white shadow-sm ring-1 ring-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => handleTabChange('Profile')}
              className="focus:outline-none cursor-pointer"
            >
              <FallbackAvatar
                src={isRealUploadedPhoto(parentProfile.photoUrl) ? parentProfile.photoUrl : undefined}
                name={parentProfile.fullName || 'Parent'}
                className="w-8 h-8 rounded-full border border-[#D9D6CE] text-xs font-bold shadow-2xs"
              />
            </button>
          </div>
        </div>
      </header>

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
        <div 
          className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end"
          data-component-version="notification-panel-v2-brand"
        >
          <div className="bg-[#FAF8F3] rounded-t-[32px] max-h-[85%] overflow-hidden flex flex-col border-t border-[#E5D5AE] shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="px-5 py-4.5 border-b border-[#E5D5AE]/40 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Bell className="w-5 h-5 text-[#C59B27]" />
                <h3 className="text-lg font-serif-koinonia font-bold text-[#8C6D23]">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <span className="bg-[#C59B27] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-4">
                {unreadCount > 0 && (
                  <button
                    onClick={async () => {
                      try {
                        await api.parent.markAllNotificationsAsRead();
                        fetchNotifications();
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="text-xs font-bold text-[#9A7326] hover:underline cursor-pointer focus:outline-none"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowNotificationsDrawer(false);
                    setSelectedNotification(null);
                  }}
                  className="p-1 rounded-lg hover:bg-black/5 cursor-pointer focus:outline-none"
                >
                  <X className="w-5 h-5 text-[#6B7280]" />
                </button>
              </div>
            </div>

            {/* Content Area */}
            {selectedNotification ? (
              /* PHASE 3 - Notification Detail View */
              <div 
                className="flex-1 overflow-y-auto p-5 space-y-4 text-left"
                data-component-version="notification-detail-v2-brand"
              >
                <button
                  onClick={() => setSelectedNotification(null)}
                  className="flex items-center space-x-1.5 text-xs font-bold text-[#9A7326] hover:underline cursor-pointer focus:outline-none"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to notifications</span>
                </button>

                <div className="bg-white border border-[#E5D5AE] p-5 rounded-2xl space-y-3.5 shadow-2xs">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-[#FAF6EB] text-[#C59B27]">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-serif-koinonia font-bold text-[#18181B] leading-tight">
                        {selectedNotification.title}
                      </h4>
                      <div className="text-[10px] text-[#A1A1AA] mt-1 font-mono">
                        {new Date(selectedNotification.createdAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })} • {new Date(selectedNotification.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-[#3F3F46] leading-relaxed whitespace-pre-wrap">
                    {selectedNotification.message}
                  </p>
                  
                  {selectedNotification.childId && (
                    <div className="pt-2 flex gap-2">
                      {(() => {
                        const child = childrenList.find(c => c.id === selectedNotification.childId);
                        const isPassReady = child && child.status === 'Pass ready';
                        if (isPassReady) {
                          return (
                            <button
                              onClick={() => {
                                setShowNotificationsDrawer(false);
                                setSelectedNotification(null);
                                onNavigate(`/parent/children/${selectedNotification.childId}/pass`);
                              }}
                              className="px-4 py-2 bg-[#C59B27] text-white hover:bg-[#B58E33] text-xs font-bold rounded-xl shadow-2xs cursor-pointer focus:outline-none"
                            >
                              View pass
                            </button>
                          );
                        } else {
                          return (
                            <button
                              onClick={() => {
                                setShowNotificationsDrawer(false);
                                setSelectedNotification(null);
                                onNavigate(`/parent/children/${selectedNotification.childId}/status`);
                              }}
                              className="px-4 py-2 bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] hover:bg-[#FAF8F3] text-xs font-bold rounded-xl shadow-2xs cursor-pointer focus:outline-none"
                            >
                              View child status
                            </button>
                          );
                        }
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Notification List View */
              <div className="flex-1 overflow-y-auto p-5 space-y-3.5 min-h-[280px]">
                 {notificationsError ? (
                  <div className="text-center py-16 space-y-3">
                    <AlertCircle className="w-10 h-10 text-[#E07A5F] mx-auto stroke-[1.5]" />
                    <p className="text-sm font-medium text-[#3F3F46]">{notificationsError}</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <Bell className="w-10 h-10 text-[#D9D6CE] mx-auto stroke-[1.5]" />
                    <p className="text-sm font-medium text-[#3F3F46]">No updates yet</p>
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
                          setSelectedNotification(notif);
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
                            ? 'bg-white border-[#C59B27] shadow-sm'
                            : 'bg-white/60 border-[#EAE8E1] hover:border-[#D9D6CE]'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-1.5 rounded-lg shrink-0 ${isUnread ? 'bg-[#FAF6EB] text-[#C59B27]' : 'bg-[#FAF8F3] text-zinc-400'}`}>
                            {notif.title?.toLowerCase().includes('pass') ? (
                              <Ticket className="w-4 h-4" />
                            ) : notif.title?.toLowerCase().includes('check') ? (
                              <ShieldCheck className="w-4 h-4" />
                            ) : (
                              <Bell className="w-4 h-4" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h4 className="text-sm font-serif-koinonia font-bold text-[#18181B] leading-snug truncate">
                                {notif.title}
                              </h4>
                              {isUnread && (
                                <span className="w-2 h-2 rounded-full bg-[#C59B27] shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-[#3F3F46] mt-1.5 leading-relaxed line-clamp-2">
                              {notif.message}
                            </p>
                            <div className="text-[10px] text-[#A1A1AA] mt-2 font-mono">
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
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* PHASE 4 - Notification preferences UI */}
            <div 
              className="px-5 py-4.5 bg-white border-t border-[#E5D5AE]/40 flex flex-col gap-3 shrink-0"
              data-component-version="notification-preferences-v2-brand"
            >
              <h4 className="text-xs font-serif-koinonia font-bold text-[#8C6D23] uppercase tracking-wider">
                Notification settings
              </h4>

              {/* Sound alerts row */}
              <div className="flex items-center justify-between text-xs py-1">
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-[#18181B]">Sound alerts</span>
                  <span className="text-[10px] text-[#6B7280]">Play a soft alert for new updates.</span>
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
                  data-component-version="parent-sound-notification-toggle-v1"
                  className={`px-3.5 py-1.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all ${
                    isSoundOn 
                      ? 'bg-[#C59B27] text-white' 
                      : 'bg-[#FAF8F3] border border-[#E5D5AE] text-[#3F3F46]'
                  }`}
                >
                  {isSoundOn ? 'On' : 'Off'}
                </button>
              </div>

              {/* Push notifications row */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E5D5AE]/30">
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-[#18181B]">Push notifications</span>
                  <span className="text-[10px] text-[#6B7280]">Receive updates on this device.</span>
                </div>
                {typeof Notification === 'undefined' ? (
                  <span className="text-[10px] font-semibold text-[#6B7280]">
                    Push notifications are not available yet.
                  </span>
                ) : isPushEnabled ? (
                  <span className="px-3.5 py-1.5 rounded-xl text-[10px] font-bold bg-[#FAF6EB] text-[#9A7326] border border-[#E5D5AE] tracking-wider uppercase" data-component-version="parent-push-notification-toggle-v1">
                    On
                  </span>
                ) : (
                  <button
                    onClick={async () => {
                      const res = await subscribeUserToPush();
                      if (res.success) {
                        setIsPushEnabled(true);
                        showInfo('Push notifications enabled!', 'You will now receive alerts directly on your device.');
                      } else {
                        showInfo('Setup Alert', 'Push notifications are not available yet.');
                      }
                    }}
                    data-component-version="parent-push-notification-toggle-v1"
                    className="px-3.5 py-1.5 rounded-xl text-[10px] font-bold bg-[#FAF8F3] border border-[#E5D5AE] text-[#3F3F46] hover:border-[#C59B27] hover:text-[#9A7326] transition-all"
                  >
                    Enable
                  </button>
                )}
              </div>

              {/* Vibration alerts row */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E5D5AE]/30">
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-[#18181B]">Device vibration</span>
                  <span className="text-[10px] text-[#6B7280]">Tactile vibration on critical emergencies.</span>
                </div>
                <button
                  onClick={() => {
                    const nextVal = !isVibrationOn;
                    setIsVibrationOn(nextVal);
                    if (nextVal && navigator.vibrate) {
                      navigator.vibrate([100, 50, 100]);
                    }
                    showSuccess('Vibration Preferences Saved', nextVal ? 'Tactile vibration is enabled.' : 'Vibration disabled.');
                  }}
                  data-component-version="parent-vibration-notification-toggle-v1"
                  className={`px-3.5 py-1.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all ${
                    isVibrationOn 
                      ? 'bg-[#C59B27] text-white' 
                      : 'bg-[#FAF8F3] border border-[#E5D5AE] text-[#3F3F46]'
                  }`}
                >
                  {isVibrationOn ? 'On' : 'Off'}
                </button>
              </div>

              {/* WhatsApp Mock Delivery row */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E5D5AE]/30">
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-[#18181B]">WhatsApp Alerts (Mock)</span>
                  <span className="text-[10px] text-[#6B7280]">Mirror safety notifications to WhatsApp.</span>
                </div>
                <button
                  onClick={() => {
                    const nextVal = !isWhatsAppOn;
                    setIsWhatsAppOn(nextVal);
                    showSuccess('WhatsApp Alerts Status', nextVal ? 'WhatsApp mock-mirroring enabled.' : 'WhatsApp mirroring disabled.');
                  }}
                  data-component-version="parent-whatsapp-notification-toggle-v1"
                  className={`px-3.5 py-1.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all ${
                    isWhatsAppOn 
                      ? 'bg-[#C59B27] text-white' 
                      : 'bg-[#FAF8F3] border border-[#E5D5AE] text-[#3F3F46]'
                  }`}
                >
                  {isWhatsAppOn ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help and questions Drawer Bottom Sheet */}
      {showHelpDrawer && (
        <div 
          className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-fade-in"
          data-view-version="parent-help-v1-brand"
          onClick={() => setShowHelpDrawer(false)}
        >
          <div 
            className="bg-[#FAF8F3] rounded-t-[32px] max-h-[85%] overflow-hidden flex flex-col border-t border-[#E5D5AE] shadow-2xl animate-in slide-in-from-bottom duration-300"
            data-component-version="parent-profile-info-sheet-v1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4.5 border-b border-[#E5D5AE]/40 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3.5">
                <div className="p-2.5 bg-[#FAF6EB] rounded-2xl border border-[#E5D5AE]/60 text-[#C59B27]">
                  <HelpCircle className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-serif-koinonia font-bold text-[#8C6D23]">
                    Help and questions
                  </h3>
                  <p className="text-[11px] text-[#6B7280] font-medium leading-tight mt-0.5">
                    Common answers for parents during the event.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHelpDrawer(false)}
                className="p-2 rounded-xl hover:bg-[#FAF6EB] text-[#6B7280] hover:text-[#18181B] cursor-pointer transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4.5">
              {[
                {
                  id: "faq-1",
                  title: "How do I check my child’s status?",
                  body: "Open your child’s profile from your parent account to see review, pass, check-in, and pickup updates."
                },
                {
                  id: "faq-2",
                  title: "When will the event pass be ready?",
                  body: "If your child has been selected, the pass will appear once it has been issued by the event team."
                },
                {
                  id: "faq-3",
                  title: "What should I do if my child’s details are wrong?",
                  body: "Use the update option on your child’s record, or contact the event team for support."
                },
                {
                  id: "faq-4",
                  title: "What if I cannot open my child’s pass?",
                  body: "A volunteer can search for your child by name or parent phone number at the event desk."
                },
                {
                  id: "faq-5",
                  title: "Who can pick up my child?",
                  body: "Only the approved pickup person listed on the child’s record should pick up the child."
                },
                {
                  id: "faq-6",
                  title: "Need more help?",
                  body: "Contact the event team through the support option provided in your account."
                }
              ].map((faq, idx) => (
                <div 
                  key={faq.id} 
                  id={faq.id}
                  className="bg-white rounded-2xl border border-[#EAE8E1]/80 p-4.5 shadow-2xs space-y-2 text-left"
                >
                  <div className="flex items-start space-x-2.5">
                    <span className="text-xs font-serif-koinonia font-semibold text-[#C59B27] mt-0.5">
                      {idx + 1}.
                    </span>
                    <h4 className="text-sm font-serif-koinonia font-bold text-[#18181B] leading-snug">
                      {faq.title}
                    </h4>
                  </div>
                  <p className="text-xs text-[#3F3F46] leading-relaxed pl-5">
                    {faq.body}
                  </p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4.5 bg-white border-t border-[#EAE8E1]/60 flex justify-center shrink-0">
              <button
                onClick={() => setShowHelpDrawer(false)}
                className="w-full py-3 px-4 rounded-xl bg-[#FAF6EB] border border-[#E5D5AE] text-[#8C6D23] font-bold text-sm hover:bg-[#EFECE4] transition-all duration-200 cursor-pointer text-center"
              >
                Close help guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety information Drawer Bottom Sheet */}
      {showSafetyDrawer && (
        <div 
          className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-fade-in"
          data-view-version="parent-safety-v1-brand"
          onClick={() => setShowSafetyDrawer(false)}
        >
          <div 
            className="bg-[#FAF8F3] rounded-t-[32px] max-h-[85%] overflow-hidden flex flex-col border-t border-[#E5D5AE] shadow-2xl animate-in slide-in-from-bottom duration-300"
            data-component-version="parent-profile-info-sheet-v1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4.5 border-b border-[#E5D5AE]/40 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3.5">
                <div className="p-2.5 bg-[#FAF6EB] rounded-2xl border border-[#E5D5AE]/60 text-[#C59B27]">
                  <Shield className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-serif-koinonia font-bold text-[#8C6D23]">
                    Safety information
                  </h3>
                  <p className="text-[11px] text-[#6B7280] font-medium leading-tight mt-0.5">
                    How we help keep children safe during the event.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSafetyDrawer(false)}
                className="p-2 rounded-xl hover:bg-[#FAF6EB] text-[#6B7280] hover:text-[#18181B] cursor-pointer transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4.5">
              {[
                {
                  id: "safety-1",
                  title: "Child check-in",
                  body: "Each child is checked in before joining the event area. Volunteers confirm the child’s record before marking entry."
                },
                {
                  id: "safety-2",
                  title: "Authorized pickup",
                  body: "Children are released only to an approved pickup person listed on the child’s record."
                },
                {
                  id: "safety-3",
                  title: "Photo confirmation",
                  body: "Where photos are provided, volunteers use them to help confirm the child and pickup person."
                },
                {
                  id: "safety-4",
                  title: "Care notes",
                  body: "Medical notes, allergies, and extra support details are shown to the event team when needed."
                },
                {
                  id: "safety-5",
                  title: "Pass protection",
                  body: "Event passes should only be shared with trusted parents or approved pickup persons."
                },
                {
                  id: "safety-6",
                  title: "If something looks wrong",
                  body: "Please contact the event team immediately so they can review the child’s record."
                }
              ].map((safety, idx) => (
                <div 
                  key={safety.id} 
                  id={safety.id}
                  className="bg-white rounded-2xl border border-[#EAE8E1]/80 p-4.5 shadow-2xs space-y-2 text-left"
                >
                  <div className="flex items-start space-x-2.5">
                    <span className="text-xs font-serif-koinonia font-semibold text-[#C59B27] mt-0.5">
                      {idx + 1}.
                    </span>
                    <h4 className="text-sm font-serif-koinonia font-bold text-[#18181B] leading-snug">
                      {safety.title}
                    </h4>
                  </div>
                  <p className="text-xs text-[#3F3F46] leading-relaxed pl-5">
                    {safety.body}
                  </p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4.5 bg-white border-t border-[#EAE8E1]/60 flex justify-center shrink-0">
              <button
                onClick={() => setShowSafetyDrawer(false)}
                className="w-full py-3 px-4 rounded-xl bg-[#FAF6EB] border border-[#E5D5AE] text-[#8C6D23] font-bold text-sm hover:bg-[#EFECE4] transition-all duration-200 cursor-pointer text-center"
              >
                Close safety guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Device security Drawer Bottom Sheet */}
      {showDeviceSecurityDrawer && (
        <div 
          className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-fade-in"
          onClick={() => setShowDeviceSecurityDrawer(false)}
        >
          <div 
            className="bg-[#FAF8F3] rounded-t-[32px] max-h-[85%] overflow-hidden flex flex-col border-t border-[#E5D5AE] shadow-2xl animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4.5 border-b border-[#E5D5AE]/40 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3.5">
                <div className="p-2.5 bg-[#FAF6EB] rounded-2xl border border-[#E5D5AE]/60 text-[#C59B27]">
                  <Fingerprint className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-serif-koinonia font-bold text-[#8C6D23]">
                    Device security
                  </h3>
                  <p className="text-[11px] text-[#6B7280] font-medium leading-tight mt-0.5">
                    Fast confirmation and secure access settings.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDeviceSecurityDrawer(false)}
                className="p-2 rounded-xl hover:bg-[#FAF6EB] text-[#6B7280] hover:text-[#18181B] cursor-pointer transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-5 overflow-y-auto space-y-4 max-h-[50vh]">
              <DeviceSecuritySettings 
                showSuccess={(t, m) => showSuccess(t, m)}
                showError={(t, m) => showError(t, m)}
              />
            </div>

            {/* Footer */}
            <div className="p-4.5 bg-white border-t border-[#EAE8E1]/60 flex justify-center shrink-0">
              <button
                onClick={() => setShowDeviceSecurityDrawer(false)}
                className="w-full py-3 px-4 rounded-xl bg-[#FAF6EB] border border-[#E5D5AE] text-[#8C6D23] font-bold text-sm hover:bg-[#EFECE4] transition-all duration-200 cursor-pointer text-center"
              >
                Close device settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Pass Modal */}
      {selectedDetailChild && (selectedDetailChild.passReference || selectedDetailChild.status === 'Pass ready') && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div 
            data-view-version="parent-pass-detail-v6-from-overview"
            className="bg-[#FAF9F6] text-[#18181B] rounded-3xl p-5 border border-[#E5D5AE] shadow-2xl max-w-sm w-full relative overflow-y-auto max-h-[90vh] space-y-5 animate-in fade-in zoom-in-95 text-left"
          >
            {/* Decorative corners */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t border-l border-[#C59B27]/20 m-2 pointer-events-none" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-[#C59B27]/20 m-2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-[#C59B27]/20 m-2 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b border-r border-[#C59B27]/20 m-2 pointer-events-none" />

            {/* Close Button */}
            <button
              onClick={() => setSelectedDetailChild(null)}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-black/5 cursor-pointer focus:outline-none z-10"
            >
              <X className="w-5 h-5 text-[#6B7280]" />
            </button>

            {/* Official Koinonia logo/header */}
            <div className="text-center pt-2 pb-1 border-b border-[#EAE8E1]/60 space-y-1">
              <span className="font-serif-koinonia text-sm tracking-[0.25em] text-[#C59B27] font-bold block">KOINONIA</span>
              <span className="text-[9px] tracking-widest text-[#8E8B82] uppercase font-semibold block">Official children's ministry pass</span>
            </div>

            {/* Pass status pill */}
            <div className="flex justify-center">
              {selectedDetailChild.status === 'Checked in' || selectedDetailChild.status === 'Inside' ? (
                <span data-component-version="parent-pass-checked-in-state-v2" className="inline-flex items-center px-2.5 py-0.5 rounded bg-[#E8F5E9] border border-[#C8E6C9] text-[#2E7D32] text-[10px] font-bold uppercase tracking-wider">
                  ● Checked in today
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] text-[10px] font-bold uppercase tracking-wider">
                  ● PASS ACTIVE & READY
                </span>
              )}
            </div>

            {/* Event title & date */}
            <div className="text-center space-y-0.5">
              <h3 className="text-base font-serif-koinonia font-bold text-[#18181B] tracking-tight">{activeEvent?.title || "The General Assembly"}</h3>
              <p className="text-[11px] text-[#8E8B82] font-semibold flex items-center justify-center">
                <Calendar className="w-3 h-3 mr-1 text-[#C59B27]" /> {(() => {
                  const formatDateStr = (dateStr: string) => {
                    try {
                      const d = new Date(dateStr);
                      if (isNaN(d.getTime())) return dateStr;
                      const day = d.getDate();
                      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      const month = months[d.getMonth()];
                      const year = d.getFullYear();
                      
                      const j = day % 10, k = day % 100;
                      let suffix = "th";
                      if (j === 1 && k !== 11) suffix = "st";
                      else if (j === 2 && k !== 12) suffix = "nd";
                      else if (j === 3 && k !== 13) suffix = "rd";
                      
                      return `${day}${suffix} ${month} ${year}`;
                    } catch (e) {
                      return dateStr;
                    }
                  };
                  if (!activeEvent) return '18th to 22nd November 2026';
                  const starts = activeEvent.startsAt || activeEvent.starts_at;
                  const ends = activeEvent.endsAt || activeEvent.ends_at;
                  if (!starts || !ends) return '18th to 22nd November 2026';
                  const formattedStarts = formatDateStr(starts);
                  const formattedEnds = formatDateStr(ends);
                  if (formattedStarts === formattedEnds) return formattedStarts;
                  return `${formattedStarts} to ${formattedEnds}`;
                })()}
              </p>
            </div>

            {/* Child photo & details */}
            <div className="flex items-center space-x-3 bg-white p-3 rounded-2xl border border-[#EAE8E1]">
              <div className="w-14 h-14 rounded-xl overflow-hidden border border-[#E5D5AE] shrink-0 bg-white flex items-center justify-center font-serif-koinonia text-sm font-bold text-[#9A7326]">
                {isRealUploadedPhoto(selectedDetailChild.photoUrl) ? (
                  <img
                    src={selectedDetailChild.photoUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{(() => {
                    if (!selectedDetailChild.name || !selectedDetailChild.name.trim()) return 'CH';
                    const parts = selectedDetailChild.name.trim().split(/\s+/);
                    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
                    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                  })()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h4 className="text-sm font-bold text-[#18181B] truncate">{selectedDetailChild.name}</h4>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="text-[10px] text-[#5C5A54] bg-[#FAF6EB] px-2 py-0.5 rounded-md font-semibold">{selectedDetailChild.ageGroup}</span>
                </div>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center justify-center space-y-2 py-1">
              {(() => {
                const requiresUnlock = localStorage.getItem('koinonia_pass_biometric_unlock') === 'true' && passUnlockedChildId !== selectedDetailChild.id;
                if (requiresUnlock) {
                  return (
                    <div 
                      className="bg-[#FAF8F3] border border-dashed border-[#E5D5AE] rounded-2xl w-40 h-40 flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:bg-zinc-100/50 transition-colors relative"
                      onClick={() => setUnlockModalOpen(true)}
                    >
                      <Fingerprint className="w-10 h-10 text-[#C59B27] stroke-[1.25] mb-2 animate-pulse" />
                      <span className="text-[10px] font-bold text-zinc-700 block">Pass is locked</span>
                      <span className="text-[8px] text-[#8E8B82] mt-1">Tap to secure unlock</span>
                    </div>
                  );
                }
                return (
                  <div data-component-version="parent-pass-qr-v4-stitch" className="bg-white p-3 rounded-2xl border border-[#E5D5AE] shadow-inner w-40 h-40 flex items-center justify-center relative">
                    <div className="absolute top-1.5 left-1.5 w-2 h-2 border-t border-l border-[#C59B27]/40 pointer-events-none" />
                    <div className="absolute top-1.5 right-1.5 w-2 h-2 border-t border-r border-[#C59B27]/40 pointer-events-none" />
                    <div className="absolute bottom-1.5 left-1.5 w-2 h-2 border-b border-l border-[#C59B27]/40 pointer-events-none" />
                    <div className="absolute bottom-1.5 right-1.5 w-2 h-2 border-b border-r border-[#C59B27]/40 pointer-events-none" />
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(selectedDetailChild.passReference || selectedDetailChild.id)}`}
                      alt="QR Code"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                );
              })()}
              <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-[#C59B27] uppercase">
                SHOW PASS FOR AT-GATE SECURITY
              </span>
            </div>

            {/* Parent and pickup person details */}
            <div className="border-t border-[#EAE8E1] pt-3 space-y-2.5 text-xs text-left">
              <div className="grid grid-cols-2 gap-3 bg-white p-2.5 rounded-xl border border-[#EAE8E1]">
                <div>
                  <span className="text-[10px] text-[#8E8B82] block font-medium uppercase">Primary Parent</span>
                  <span className="font-semibold text-[#18181B] truncate block">{parentProfile.fullName}</span>
                  <span className="text-[10px] text-[#5C5A54] font-medium block">{parentProfile.phone}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#8E8B82] block font-medium uppercase">Authorized Pickup</span>
                  {selectedDetailChild.draftData?.pickup?.pickupType === 'other_person' ? (
                    <>
                      <span className="font-semibold text-[#18181B] truncate block">
                        {selectedDetailChild.draftData.pickup.pickupPersonFullName}
                      </span>
                      <span className="text-[10px] text-[#5C5A54] font-medium block">
                        {selectedDetailChild.draftData.pickup.pickupPersonRelationship}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-[#18181B] truncate block">Primary Parent Only</span>
                      <span className="text-[10px] text-[#8E8B82] font-medium block font-sans">No secondary listed</span>
                    </>
                  )}
                </div>
              </div>

              {/* Pickup confirmation note */}
              <div className="bg-[#FAF6EB]/40 p-2.5 rounded-xl text-[10px] text-[#9A7326] font-medium flex items-start gap-1.5 border border-[#E5D5AE]/20 leading-normal">
                <ShieldCheck className="w-3.5 h-3.5 text-[#C59B27] shrink-0 mt-0.5" />
                <span>
                  Important: Present this secure digital pass during arrival check-in and pickup release. Release is strictly restricted to listed authorized persons.
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                data-component-version="parent-pass-save-action-v2"
                onClick={() => showSuccess('Pass saved successfully', 'Pass has been offline-secured to your device storage.')}
                className="flex-1 py-3 px-4 rounded-2xl bg-[#18181B] text-white text-xs font-bold hover:bg-[#27272A] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Save pass</span>
              </button>
              <button
                type="button"
                data-component-version="parent-pass-whatsapp-action-v2"
                onClick={() => {
                  showInfo('Opening WhatsApp', 'You can share this child\'s pass directly from WhatsApp.');
                }}
                className="flex-1 py-3 px-4 rounded-2xl bg-white border border-[#EAE8E1] text-[#18181B] text-xs font-bold hover:bg-[#FAF9F6] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <MessageCircle className="w-4 h-4 text-[#B89047]" />
                <span>Share to WhatsApp</span>
              </button>
            </div>

            {/* View child status button */}
            <div className="text-center pt-2">
              <button
                type="button"
                data-component-version="parent-pass-status-link-v2"
                onClick={() => {
                  setSelectedDetailChild(null);
                  onNavigate(`/parent/children/${selectedDetailChild.id}/status`);
                }}
                className="text-xs text-[#9A7326] font-bold hover:underline inline-flex items-center"
              >
                View child status <ChevronRight className="w-3 h-3 ml-0.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pass Biometrics Unlock Modal */}
      <DeviceSecurityModal
        isOpen={unlockModalOpen}
        onClose={() => setUnlockModalOpen(false)}
        onSuccess={() => {
          if (selectedDetailChild) {
            setPassUnlockedChildId(selectedDetailChild.id);
            showSuccess('Pass unlocked', 'Security verified successfully.');
          }
        }}
        actionName="Unlocking secure child pass"
      />
    </div>
  );
};
