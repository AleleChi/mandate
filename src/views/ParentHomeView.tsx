import React, { useState, useEffect } from 'react';
import { AppRoute, BottomNavTab, ChildItem, ParentProfile } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { Button } from '../components/common/Button';
import { EventPassPreviewCard } from '../components/common/EventPassPreviewCard';
import { BrandLogo } from '../components/common/BrandLogo';
import { Calendar, Clock, Plus, ShieldCheck, QrCode, Home, Users, Activity, User, Info, X, MessageCircle, Mail, Smile, Ticket, HelpCircle, Shield, ChevronRight, Lock, LogOut, Bell, ArrowLeft, Check, AlertCircle, Menu, Fingerprint, MapPin, RefreshCw, CheckCircle2, Phone, Copy } from 'lucide-react';
import { REAL_ASSETS } from '../config/assets';
import { useNotification } from '../context/NotificationContext';
import { ThemeSwitcher } from '../components/common/ThemeSwitcher';
import { api } from '../services/api';
import { soundUtility } from '../utils/sound';
import { subscribeUserToPush, getPushNotificationStatus, GranularPushStatus } from '../utils/pushSubscription';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { SafeImage } from '../components/common/SafeImage';
import { DeviceSecuritySettings } from '../components/common/DeviceSecuritySettings';
import { DeviceSecurityModal } from '../components/common/DeviceSecurityModal';
import { MobileNotificationCentre } from '../components/common/MobileNotificationCentre';
import { SharedNotificationSettings } from '../components/common/SharedNotificationSettings';
import { PwaInstallBanner, PwaInstallGuideModal } from '../components/common/PwaInstallBanner';
import { isAppInstalled, promptPwaInstall } from '../utils/pwaInstall';
import { Download } from 'lucide-react';
import parentHeroImg from '../assets/images/parent_hero_1783622066454.jpg';
import * as QRCodeLib from 'qrcode';

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
  onSwitchExperience?: (target: 'parent' | 'volunteer') => Promise<boolean>;
  isSwitchingExperience?: boolean;
  onUpdateProfile?: (profile: ParentProfile) => void;
}

// Check whether photo is a custom uploaded image vs sample default asset
const isRealUploadedPhoto = (url?: string) => {
  if (!url || !url.trim()) return false;
  if (url === REAL_ASSETS.passAvatar || url === REAL_ASSETS.workerAvatar) return false;
  return true;
};

// Clean fallback avatar component that guarantees no broken images or squished alt text
const getInitials = (fullName: string): string => {
  if (!fullName || !fullName.trim()) return 'CH';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const FallbackAvatar: React.FC<{
  src?: string;
  name: string;
  className?: string;
}> = ({ src, name, className = '' }) => {
  const [error, setError] = useState(false);

  if (src && src.trim() !== '' && !error) {
    const resolved = resolveMediaUrl(src);
    return (
      <div className={`overflow-hidden bg-[#FAF6EB] dark:bg-[#262520] flex items-center justify-center shrink-0 ${className}`}>
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
      className={`bg-[#FAF6EB] dark:bg-[#262520] border border-[#E5D5AE] dark:border-[#3A3835] flex items-center justify-center select-none font-serif-koinonia shrink-0 text-[#9A7326] dark:text-[#B8B0A5] ${className}`}
    >
      <span>{getInitials(name)}</span>
    </div>
  );
};

export const formatPassEventDates = (activeEvent?: { startsAt?: string; starts_at?: string; endsAt?: string; ends_at?: string } | null): string => {
  if (!activeEvent) return '18th to 22nd November 2026';
  const starts = activeEvent.startsAt || activeEvent.starts_at;
  const ends = activeEvent.endsAt || activeEvent.ends_at;
  if (!starts || !ends) return '18th to 22nd November 2026';
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
    } catch (e) { return dateStr; }
  };
  const formattedStarts = formatDateStr(starts);
  const formattedEnds = formatDateStr(ends);
  if (formattedStarts === formattedEnds) return formattedStarts;
  return `${formattedStarts} – ${formattedEnds}`;
};

export function buildParentPassWhatsAppShareUrl(eventTitle?: string | null, childName?: string | null, passCode?: string | null): string {
  const cleanTitle = (eventTitle || 'The General Assembly').trim();
  const cleanChild = (childName || 'Child').trim();
  const cleanCode = (passCode || '').trim();
  const messageLines = [
    'Koinonia Children & Teens',
    cleanTitle,
    '',
    `Pass for: ${cleanChild}`,
    `Pass code: ${cleanCode}`,
    '',
    'Present the QR or this code at the authorised check-in point.'
  ];
  return `https://wa.me/?text=${encodeURIComponent(messageLines.join('\n'))}`;
}

export async function renderPassCredentialToPngBlob({
  eventTitle,
  eventDates,
  childName,
  childAgeLabel,
  childPhotoUrl,
  effectivePassCode,
  parentName,
  parentPhone,
  pickupName,
  pickupRelation,
}: {
  eventTitle: string;
  eventDates: string;
  childName: string;
  childAgeLabel: string;
  childPhotoUrl?: string | null;
  effectivePassCode: string;
  parentName: string;
  parentPhone: string;
  pickupName: string;
  pickupRelation: string;
}): Promise<Blob> {
  if (typeof document === 'undefined') {
    const placeholder = `PNG-MOCK:${childName}:${effectivePassCode}`;
    return new Blob([placeholder], { type: 'image/png' });
  }

  const width = 1080;
  const height = 1580;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  if (document.fonts) {
    try {
      await document.fonts.ready;
    } catch (_) {}
  }

  // 1. Warm ivory background
  ctx.fillStyle = '#FDFCF8';
  ctx.fillRect(0, 0, width, height);

  // 2. Framing & Corner brackets
  ctx.strokeStyle = '#D9CFB0';
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  const cornerSize = 32;
  ctx.strokeStyle = 'rgba(197, 155, 39, 0.45)';
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.moveTo(50, 50 + cornerSize);
  ctx.lineTo(50, 50);
  ctx.lineTo(50 + cornerSize, 50);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width - 50 - cornerSize, 50);
  ctx.lineTo(width - 50, 50);
  ctx.lineTo(width - 50, 50 + cornerSize);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(50, height - 50 - cornerSize);
  ctx.lineTo(50, height - 50);
  ctx.lineTo(50 + cornerSize, height - 50);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width - 50 - cornerSize, height - 50);
  ctx.lineTo(width - 50, height - 50);
  ctx.lineTo(width - 50, height - 50 - cornerSize);
  ctx.stroke();

  // 3. Header
  ctx.textAlign = 'center';
  ctx.fillStyle = '#C59B27';
  ctx.font = 'bold 26px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText('K O I N O N I A', width / 2, 115);

  ctx.fillStyle = '#8E8B82';
  ctx.font = '600 18px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText('CHILDREN & TEENS · OFFICIAL PASS', width / 2, 152);

  ctx.strokeStyle = '#E8E0CA';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(72, 185);
  ctx.lineTo(width - 72, 185);
  ctx.stroke();

  // 4. Event Title & Dates
  ctx.fillStyle = '#18181B';
  ctx.font = '600 42px "Cormorant Garamond", Georgia, serif';
  ctx.fillText(eventTitle, width / 2, 240);

  ctx.fillStyle = '#6B6860';
  ctx.font = '500 22px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText(eventDates, width / 2, 280);

  // Status Badge
  const badgeWidth = 140;
  const badgeHeight = 32;
  const badgeX = (width - badgeWidth) / 2;
  const badgeY = 302;
  ctx.fillStyle = '#FAF6EB';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 6);
  } else {
    ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
  }
  ctx.fill();
  ctx.strokeStyle = '#E5D5AE';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#8C6D23';
  ctx.font = 'bold 15px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText('PASS ACTIVE', width / 2, badgeY + 22);

  ctx.strokeStyle = '#EDE6D4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(72, 355);
  ctx.lineTo(width - 72, 355);
  ctx.stroke();

  // 5. Child Identity
  const avatarY = 425;
  const avatarRadius = 50;
  let photoDrawn = false;
  if (childPhotoUrl && isRealUploadedPhoto(childPhotoUrl)) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = childPhotoUrl;
        setTimeout(() => resolve(false), 2000);
      });
      if (loaded) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(width / 2, avatarY, avatarRadius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, (width / 2) - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
        ctx.restore();
        ctx.strokeStyle = '#D9CFB0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(width / 2, avatarY, avatarRadius, 0, Math.PI * 2);
        ctx.stroke();
        photoDrawn = true;
      }
    } catch (_) {}
  }

  if (!photoDrawn) {
    ctx.fillStyle = '#F5F1E8';
    ctx.beginPath();
    ctx.arc(width / 2, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#D9CFB0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width / 2, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#9A7326';
    ctx.font = 'bold 44px "Cormorant Garamond", Georgia, serif';
    ctx.fillText(getInitials(childName), width / 2, avatarY + 15);
  }

  ctx.fillStyle = '#18181B';
  ctx.font = 'bold 46px "Cormorant Garamond", Georgia, serif';
  ctx.fillText(childName, width / 2, 520);

  ctx.fillStyle = '#6B6860';
  ctx.font = '500 22px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText(childAgeLabel, width / 2, 555);

  ctx.strokeStyle = '#EDE6D4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(72, 585);
  ctx.lineTo(width - 72, 585);
  ctx.stroke();

  // 6. QR Code (Generous quiet zone)
  const qrBoxSize = 380;
  const qrBoxX = (width - qrBoxSize) / 2;
  const qrBoxY = 620;

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 18);
  } else {
    ctx.rect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);
  }
  ctx.fill();
  ctx.strokeStyle = '#D9CFB0';
  ctx.lineWidth = 2;
  ctx.stroke();

  const qrCorner = 18;
  ctx.strokeStyle = 'rgba(197, 155, 39, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(qrBoxX + 12, qrBoxY + 12 + qrCorner); ctx.lineTo(qrBoxX + 12, qrBoxY + 12); ctx.lineTo(qrBoxX + 12 + qrCorner, qrBoxY + 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(qrBoxX + qrBoxSize - 12 - qrCorner, qrBoxY + 12); ctx.lineTo(qrBoxX + qrBoxSize - 12, qrBoxY + 12); ctx.lineTo(qrBoxX + qrBoxSize - 12, qrBoxY + 12 + qrCorner); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(qrBoxX + 12, qrBoxY + qrBoxSize - 12 - qrCorner); ctx.lineTo(qrBoxX + 12, qrBoxY + qrBoxSize - 12); ctx.lineTo(qrBoxX + 12 + qrCorner, qrBoxY + qrBoxSize - 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(qrBoxX + qrBoxSize - 12 - qrCorner, qrBoxY + qrBoxSize - 12); ctx.lineTo(qrBoxX + qrBoxSize - 12, qrBoxY + qrBoxSize - 12); ctx.lineTo(qrBoxX + qrBoxSize - 12, qrBoxY + qrBoxSize - 12 - qrCorner); ctx.stroke();

  const qrDataUrl = await QRCodeLib.toDataURL(effectivePassCode, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#18181B', light: '#FFFFFF' }
  });

  const qrImg = new Image();
  await new Promise<void>((resolve, reject) => {
    qrImg.onload = () => resolve();
    qrImg.onerror = reject;
    qrImg.src = qrDataUrl;
  });
  ctx.drawImage(qrImg, (width - 320) / 2, qrBoxY + 30, 320, 320);

  // Pass Code Container
  const codeBoxWidth = 520;
  const codeBoxHeight = 88;
  const codeBoxX = (width - codeBoxWidth) / 2;
  const codeBoxY = 1030;

  ctx.fillStyle = '#FAF9F6';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(codeBoxX, codeBoxY, codeBoxWidth, codeBoxHeight, 12);
  } else {
    ctx.rect(codeBoxX, codeBoxY, codeBoxWidth, codeBoxHeight);
  }
  ctx.fill();
  ctx.strokeStyle = '#E8E0CA';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#9A907A';
  ctx.font = 'bold 15px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText('PASS CODE', width / 2, codeBoxY + 30);

  ctx.fillStyle = '#18181B';
  ctx.font = 'bold 34px "JetBrains Mono", monospace';
  ctx.fillText(effectivePassCode, width / 2, codeBoxY + 68);

  ctx.fillStyle = '#C59B27';
  ctx.font = 'bold 16px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText('SHOW PASS FOR AT-GATE SECURITY', width / 2, 1150);

  ctx.strokeStyle = '#EDE6D4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(72, 1180);
  ctx.lineTo(width - 72, 1180);
  ctx.stroke();

  // 7. Authorization Details (Two Columns)
  ctx.textAlign = 'left';
  const col1X = 120;
  const col2X = 560;

  ctx.fillStyle = '#9A907A';
  ctx.font = 'bold 16px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText('PRIMARY PARENT', col1X, 1225);

  ctx.fillStyle = '#18181B';
  ctx.font = '600 24px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText(parentName, col1X, 1262);

  ctx.fillStyle = '#6B6860';
  ctx.font = '500 20px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText(parentPhone, col1X, 1295);

  ctx.fillStyle = '#9A907A';
  ctx.font = 'bold 16px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText('AUTHORISED PICKUP', col2X, 1225);

  ctx.fillStyle = '#18181B';
  ctx.font = '600 24px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText(pickupName, col2X, 1262);

  ctx.fillStyle = '#6B6860';
  ctx.font = '500 20px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText(pickupRelation, col2X, 1295);

  ctx.strokeStyle = '#EDE6D4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(72, 1345);
  ctx.lineTo(width - 72, 1345);
  ctx.stroke();

  // 8. Security Instruction Note at Bottom
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6B6860';
  ctx.font = '500 21px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText('Present this pass at arrival and pickup.', width / 2, 1405);
  ctx.fillText('Release is restricted to authorised persons.', width / 2, 1440);

  // 9. Convert Canvas to Blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to generate PNG blob from canvas'));
    }, 'image/png');
  });
}

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
  activeEvent,
  onSwitchExperience,
  isSwitchingExperience = false,
  onUpdateProfile
}) => {
  const { showInfo, showSuccess, showError } = useNotification();
  const [selectedDetailChild, setSelectedDetailChild] = useState<ChildItem | null>(null);
  const [activeTab, setActiveTab] = useState<BottomNavTab>(initialTab || 'Home');
  const [childToRemove, setChildToRemove] = useState<ChildItem | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isSavingPass, setIsSavingPass] = useState(false);
  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [showHelpDrawer, setShowHelpDrawer] = useState(false);
  const [showSafetyDrawer, setShowSafetyDrawer] = useState(false);
  const [unlockedPassByChildId, setUnlockedPassByChildId] = useState<Record<string, { passReference: string; passLocked: boolean; pass?: any; child?: any }>>({});
  const [unlockedPassReferences, setUnlockedPassReferences] = useState<Record<string, string>>({});
  const [passUnlockedChildId, setPassUnlockedChildId] = useState<string | null>(null);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);

  const isPassUnlockedForChild = (childId: string | undefined | null): boolean => {
    if (!childId) return false;
    const isBiometricRequired = typeof window !== 'undefined' && localStorage.getItem('koinonia_pass_biometric_unlock') === 'true';
    if (!isBiometricRequired) return true;
    const unlocked = unlockedPassByChildId[childId];
    if (unlocked && !unlocked.passLocked && !!unlocked.passReference) return true;
    return !!unlockedPassReferences[childId];
  };

  const [selectedNotification, setSelectedNotification] = useState<any | null>(null);
  const [isSoundOn, setIsSoundOn] = useState<boolean>(false);
  const [pushStatus, setPushStatus] = useState<GranularPushStatus>('needed');
  const [isVibrationOn, setIsVibrationOn] = useState<boolean>(true);
  const [whatsappStatus, setWhatsappStatus] = useState<'unknown' | 'opted_in' | 'opted_out'>(
    parentProfile.whatsappConsentStatus || 'unknown'
  );
  const [whatsappNumber, setWhatsappNumber] = useState<string>(
    parentProfile.whatsapp || parentProfile.whatsappNumber || parentProfile.phone || ''
  );
  const [isWaQuietDismissed, setIsWaQuietDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('koinonia_wa_quiet_dismissed') === 'true';
    } catch {
      return false;
    }
  });
  const [showWaOptInModal, setShowWaOptInModal] = useState(false);
  const [waModalPhone, setWaModalPhone] = useState<string>(
    parentProfile.whatsapp || parentProfile.whatsappNumber || parentProfile.phone || ''
  );
  const [waConsentLoading, setWaConsentLoading] = useState(false);

  // Sync WhatsApp consent status and number whenever parentProfile updates from server
  useEffect(() => {
    if (parentProfile.whatsappConsentStatus) {
      setWhatsappStatus(parentProfile.whatsappConsentStatus);
    }
    const currentNumber = parentProfile.whatsapp || parentProfile.whatsappNumber || parentProfile.phone || '';
    if (currentNumber) {
      setWhatsappNumber(currentNumber);
      setWaModalPhone(currentNumber);
    }
  }, [parentProfile.whatsappConsentStatus, parentProfile.whatsapp, parentProfile.whatsappNumber, parentProfile.phone]);

  const handleOptInWhatsApp = async (phone: string) => {
    if (!phone.trim()) {
      showError('Phone Required', 'Please enter a valid WhatsApp phone number.');
      return;
    }
    setWaConsentLoading(true);
    try {
      const res = await api.parent.updateWhatsAppConsent({ action: 'opt_in', whatsappNumber: phone.trim() });
      if (res.success) {
        setWhatsappStatus('opted_in');
        setWhatsappNumber(phone.trim());
        setShowWaOptInModal(false);
        showSuccess('WhatsApp updates enabled', 'You will receive important updates on WhatsApp.');
        if (res.profile && onUpdateProfile) {
          onUpdateProfile(res.profile);
        }
      } else {
        showError('Failed', res.message || 'Could not enable WhatsApp updates.');
      }
    } catch (err: any) {
      showError('Error', err.message || 'An error occurred while enabling WhatsApp updates.');
    } finally {
      setWaConsentLoading(false);
    }
  };

  const handleOptOutWhatsApp = async () => {
    setWaConsentLoading(true);
    try {
      const res = await api.parent.updateWhatsAppConsent({ action: 'opt_out' });
      if (res.success) {
        setWhatsappStatus('opted_out');
        showSuccess('WhatsApp updates turned off', 'In-app, push, and email updates remain active.');
        if (res.profile && onUpdateProfile) {
          onUpdateProfile(res.profile);
        }
      } else {
        showError('Failed', res.message || 'Could not disable WhatsApp updates.');
      }
    } catch (err: any) {
      showError('Error', err.message || 'An error occurred while disabling WhatsApp updates.');
    } finally {
      setWaConsentLoading(false);
    }
  };
  const [customHeroUrl, setCustomHeroUrl] = useState<string | null>(null);
  const [defaultEventHeroUrl, setDefaultEventHeroUrl] = useState<string | null>(null);

  const [showArrivalGuideModal, setShowArrivalGuideModal] = useState(false);
  const [selectedArrivalChild, setSelectedArrivalChild] = useState<ChildItem | null>(null);
  const [showPickupDetailsModal, setShowPickupDetailsModal] = useState(false);
  const [selectedPickupChild, setSelectedPickupChild] = useState<ChildItem | null>(null);
  const [pwaGuidePlatform, setPwaGuidePlatform] = useState<'ios' | 'browser' | null>(null);

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
    // Verify actual push status: permission + SW active + PushSubscription exists
    if (typeof window !== 'undefined' && 'PushManager' in window) {
      getPushNotificationStatus().then((details) => {
        setPushStatus(details.status);
      }).catch(() => {
        setPushStatus('needed');
      });
    } else {
      setPushStatus('unsupported');
    }
  }, []);

  const unreadCount = notifications.filter(n => !n.readAt && !n.isRead).length;
  const prevUnreadCountRef = React.useRef(unreadCount);

  const handleUnreadCountChange = React.useCallback((count: number) => {
    prevUnreadCountRef.current = count;
    if (count === 0) {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true, readAt: n.readAt || new Date().toISOString() })));
    }
  }, []);

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
    if (initialTab === 'Status') {
      onNavigate('/parent/status');
    } else if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, onNavigate]);

  useEffect(() => {
    if (activeTab === 'Status') {
      onNavigate('/parent/status');
    }
  }, [activeTab, onNavigate]);

  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [selectedPassChild, setSelectedPassChild] = useState<ChildItem | null>(null);

  useEffect(() => {
    if (selectedChildId && childrenList.length > 0) {
      const match = childrenList.find(c => c.id === selectedChildId);
      if (match) {
        setSelectedPassChild(match);
        if (match.passReference || match.passLocked || match.status === 'Pass ready' || match.status === 'Checked in' || match.status === 'Inside' || match.status === 'Picked up' || match.status === 'Checked out') {
          const unlocked = unlockedPassByChildId[match.id];
          if (unlocked) {
            setSelectedDetailChild({
              ...match,
              passReference: unlocked.passReference,
              passLocked: false,
              pass: unlocked.pass || match.pass
            });
          } else {
            setSelectedDetailChild(match);
          }
        }
      }
    }
  }, [selectedChildId, childrenList, unlockedPassByChildId]);

  // New child form state
  const [newChild, setNewChild] = useState({
    name: '',
    age: '5',
    ageGroup: 'Ages 4 to 6',
    specialNeeds: ''
  });

  const handleTabChange = (tab: BottomNavTab) => {
    if (tab === 'Status') {
      onNavigate('/parent/status');
      return;
    }
    setActiveTab(tab);
    try {
      const pathMap: Record<BottomNavTab, string> = {
        Home: '/parent/home',
        Children: '/parent/children',
        Status: '/parent/status',
        Passes: '/parent/passes',
        Profile: '/parent/profile'
      };
      if (onNavigate) {
        onNavigate(pathMap[tab]);
      } else {
        window.history.pushState(null, '', pathMap[tab]);
      }
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
    const passReadyCount = childrenList.filter(c =>
      c.status === 'Pass ready' ||
      c.status === 'Checked in' ||
      c.status === 'Inside' ||
      c.status === 'Picked up' ||
      c.status === 'Checked out' ||
      Boolean(c.passReference || (c.pass && (c.pass.passCode || c.pass.passLocked)))
    ).length;

    return (
      <div data-view-version="parent-dashboard-v5-clean-header" className="space-y-6 pt-1">
        {/* Warm Parent Greeting */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 data-component-version="parent-dashboard-greeting-v2" className="text-xl sm:text-2xl font-serif-koinonia font-bold text-[#18181B] dark:text-[#F0EBE3] leading-snug">
              {getGreeting()}
            </h1>
            <p className="text-xs sm:text-sm text-[#3F3F46] dark:text-[#B8B0A5] mt-1">
              Here is where things stand for your children.
            </p>
          </div>
          <div className="shrink-0 pt-0.5">
            <ThemeSwitcher />
          </div>
        </div>

        {/* Gentle completion banner if photo, address, etc. are missing */}
        {(!parentProfile.homeAddress || !parentProfile.photoUrl || !isRealUploadedPhoto(parentProfile.photoUrl)) && (
          <div data-component-version="parent-profile-reminder-v1" className="bg-[#FCF9F2] dark:bg-[#21211E] border border-[#E8DFCA] dark:border-[#302E29] rounded-2xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-[#9A7326] dark:text-[#C59B27] shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-xs font-bold text-[#18181B] dark:text-[#F0EBE3]">Complete your profile</h4>
              <p className="text-[11px] text-[#6B7280] dark:text-[#B8B0A5] mt-0.5">
                Add any missing contact details so the event team can reach you when needed.
              </p>
              <button
                type="button"
                onClick={() => {
                  onNavigate('/parent/profile/edit');
                }}
                className="mt-2 text-[11px] font-bold text-[#9A7326] dark:text-[#D4AF37] hover:underline focus:outline-none cursor-pointer"
              >
                Update profile
              </button>
            </div>
          </div>
        )}

        {/* Quiet WhatsApp Opt-in Prompt for existing parents */}
        {whatsappStatus === 'unknown' && !isWaQuietDismissed && (
          <div data-component-version="parent-whatsapp-quiet-banner-v1" className="bg-[#FAF8F3] dark:bg-[#21211E] border border-[#E5D5AE] dark:border-[#302E29] rounded-2xl p-4 flex items-start justify-between gap-3 shadow-2xs">
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-[#9A7326] dark:text-[#C59B27] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-[#18181B] dark:text-[#F0EBE3]">Get updates on WhatsApp</h4>
                <p className="text-[11px] text-[#6B7280] dark:text-[#B8B0A5] mt-0.5">
                  Receive important registration and event updates on WhatsApp.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setWaModalPhone(whatsappNumber || parentProfile.phone || '');
                      setShowWaOptInModal(true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#18181B] dark:bg-[#262520] text-white dark:text-[#F0EBE3] border border-transparent dark:border-[#3A3835] hover:bg-zinc-800 dark:hover:bg-[#2A2926] transition-all cursor-pointer shadow-2xs"
                  >
                    Enable WhatsApp updates
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem('koinonia_wa_quiet_dismissed', 'true');
                      } catch {}
                      setIsWaQuietDismissed(true);
                    }}
                    className="text-xs text-[#6B7280] dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3] font-medium cursor-pointer"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Event hero card with image, Date/Time row, Continue button */}
        <div className="bg-white dark:bg-[#21211E] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] shadow-sm overflow-hidden" data-component-version="parent-dashboard-hero-v8-secure-media">
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

          <div className="p-4 sm:p-5 space-y-4 bg-white dark:bg-[#21211E]">
            <div className="flex items-center text-xs sm:text-sm text-[#3F3F46] dark:text-[#B8B0A5] font-medium">
              <Calendar className="w-4 h-4 mr-3 text-[#B89047] dark:text-[#C59B27] shrink-0 stroke-[2]" />
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
              onClick={() => {
                const draftChild = childrenList.find(c => c.status === 'Draft' || c.status === 'Incomplete');
                if (draftChild) {
                  if (onResumeChildDraft) {
                    onResumeChildDraft(draftChild);
                  } else {
                    onNavigate('/parent/children/new');
                  }
                } else if (childrenList.length === 0) {
                  if (onStartNewChild) {
                    onStartNewChild();
                  } else {
                    onNavigate('/parent/children/new');
                  }
                } else {
                  handleTabChange('Children');
                }
              }}
              className="w-full py-3 px-4 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-sm transition-all shadow-2xs cursor-pointer focus:outline-none"
            >
              Continue
            </button>
          </div>
        </div>

        {/* My Children Today Section */}
        <div className="space-y-3 pt-1" data-component-version="parent-my-children-today-v1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B] dark:text-[#F0EBE3] tracking-tight">
              My children today
            </h3>
            <span className="text-xs text-[#71717A] dark:text-[#B8B0A5] font-medium">
              {childrenList.length} registered
            </span>
          </div>

          {childrenList.length === 0 ? (
            <div className="bg-white dark:bg-[#21211E] rounded-2xl p-4 border border-[#EAE8E1] dark:border-[#302E29] text-center space-y-2 shadow-2xs">
              <p className="text-xs text-[#52525B] dark:text-[#B8B0A5]">
                No children registered for today's event yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {childrenList.map((child) => {
                const isCheckedIn = child.status === 'Checked in' || child.status === 'Inside';
                
                // Derive dynamic location details based on age group
                const ageGrp = (child.ageGroup || child.draftData?.ageGroup || '').toLowerCase();
                let plannedLocation = "Pre-Primary Room";
                let checkInPoint = "Children's Entrance B";
                let pickupPoint = "Family Collection Desk B";

                if (ageGrp.includes('0') || ageGrp.includes('1') || ageGrp.includes('2') || ageGrp.includes('3') || child.age < 4) {
                  plannedLocation = "Infant & Toddler Care";
                  checkInPoint = "Children's Entrance A";
                  pickupPoint = "Family Collection Desk A";
                } else if (ageGrp.includes('7') || ageGrp.includes('8') || ageGrp.includes('9') || (child.age >= 7 && child.age <= 9)) {
                  plannedLocation = "Junior Hall";
                  checkInPoint = "Children's Entrance C";
                  pickupPoint = "Family Collection Desk C";
                } else if (ageGrp.includes('10') || ageGrp.includes('11') || ageGrp.includes('12') || (child.age >= 10 && child.age <= 12)) {
                  plannedLocation = "Pre-Teens Hall";
                  checkInPoint = "Children's Entrance C";
                  pickupPoint = "Family Collection Desk C";
                } else if (child.age >= 13) {
                  plannedLocation = "Teens Chapel";
                  checkInPoint = "Main Youth Entrance";
                  pickupPoint = "Family Collection Desk D";
                }

                // Format age nicely: e.g. "Under 1 year" or "1 year" or "3 years"
                const ageNum = typeof child.age === 'number' ? child.age : parseInt(child.age, 10) || 0;
                const ageLabel = ageNum < 1 ? 'Under 1 year' : ageNum === 1 ? '1 year' : `${ageNum} years`;
                
                // Clean ageGroup: remove "(Review Needed)", change "Under 4" to "Under 4s"
                const rawGroup = child.ageGroup || '';
                const hasReviewNeeded = rawGroup.toLowerCase().includes('review') || child.needsAgeReview;
                let cleanAgeGroup = rawGroup.replace(/\s*\(Review Needed\)/gi, '').trim();
                if (cleanAgeGroup === 'Under 4' || ageNum < 4) {
                  cleanAgeGroup = 'Under 4s';
                }
                if (!cleanAgeGroup) cleanAgeGroup = 'Children';

                return (
                  <div
                    key={`today-${child.id}`}
                    data-component-version="parent-arrival-card-v2"
                    className="bg-[#FDFCF8] dark:bg-[#21211E] rounded-[20px] p-5 border border-[#EDE6D4] dark:border-[#302E29] shadow-2xs font-sans transition-colors"
                  >
                    {/* Identity row */}
                    <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#EDE6D4] dark:border-[#302E29]">
                      <div className="flex items-start space-x-3.5 min-w-0">
                        <FallbackAvatar src={child.photoUrl} name={child.name} className="w-11 h-11 rounded-full shrink-0 border border-[#D9CFB0] dark:border-[#3A3835]" />
                        <div className="min-w-0">
                          <h4 className="text-[15px] font-sans font-semibold text-[#18181B] dark:text-[#F0EBE3] truncate leading-tight">
                            {child.name}
                          </h4>
                          <p className="text-xs text-[#71717A] dark:text-[#B8B0A5] mt-0.5 font-sans">
                            {ageLabel} · {cleanAgeGroup}
                          </p>
                          {hasReviewNeeded && (
                            <p className="text-[11px] text-amber-800 dark:text-amber-400 font-sans mt-0.5 font-medium">
                              Age needs confirmation
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 pt-0.5">
                        {child.status === 'Pass ready' ? (
                          <span className="shrink-0 text-[8.5px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded border bg-[#F0FAF1] border-[#BDE0C0] text-[#2E6B32] dark:bg-transparent dark:border-[#3A4E3B] dark:text-[#7DBF80]">
                            Pass ready
                          </span>
                        ) : (
                          <StatusBadge status={child.status} size="sm" />
                        )}
                      </div>
                    </div>

                    {/* Operational Details (clean editorial/operational hierarchy, no nested card) */}
                    <div className="py-4 space-y-3.5 text-xs font-sans">
                      {!isCheckedIn ? (
                        <>
                          <div className="space-y-1">
                            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#9A907A] dark:text-[#7A7570] block">
                              Arrival
                            </span>
                            <div className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3]">
                              {plannedLocation}
                            </div>
                            <div className="text-xs text-[#6B6860] dark:text-[#B8B0A5] font-medium">
                              {checkInPoint}
                            </div>
                          </div>

                          <div className="space-y-1 pt-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#9A907A] dark:text-[#7A7570] block">
                              Status
                            </span>
                            <div className="text-xs font-semibold text-[#B89047] dark:text-[#C59B27]">
                              Not checked in
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#9A907A] dark:text-[#7A7570] block">
                              Current Location
                            </span>
                            <div className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3]">
                              {plannedLocation}
                            </div>
                            <div className="text-xs text-[#6B6860] dark:text-[#B8B0A5] font-medium">
                              Pickup: {pickupPoint}
                            </div>
                          </div>

                          <div className="space-y-1 pt-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#9A907A] dark:text-[#7A7570] block">
                              Status
                            </span>
                            <div className="text-xs font-semibold text-[#2E6B32] dark:text-[#7DBF80]">
                              Checked in
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Action Row */}
                    <div className="pt-2 border-t border-[#EDE6D4] dark:border-[#302E29]">
                      {!isCheckedIn ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedArrivalChild(child);
                            setShowArrivalGuideModal(true);
                          }}
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center justify-between text-xs sm:text-sm font-semibold text-[#9A7326] dark:text-[#C59B27] hover:bg-[#FAF6EB] dark:hover:bg-[#262520] active:bg-[#F5F0E1] dark:active:bg-[#2A2926] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40"
                        >
                          <span>View arrival guide</span>
                          <ChevronRight className="w-4 h-4 text-[#C59B27] shrink-0" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPickupChild(child);
                            setShowPickupDetailsModal(true);
                          }}
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center justify-between text-xs sm:text-sm font-semibold text-[#9A7326] dark:text-[#C59B27] hover:bg-[#FAF6EB] dark:hover:bg-[#262520] active:bg-[#F5F0E1] dark:active:bg-[#2A2926] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40"
                        >
                          <span>View pickup details</span>
                          <ChevronRight className="w-4 h-4 text-[#C59B27] shrink-0" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 6. Summary cards */}
        <div className="space-y-3">
          <div className="bg-[#FAF8F4] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-3.5 sm:p-4 flex items-center space-x-3.5 shadow-2xs">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-[#262520] border border-[#E5D5AE] dark:border-[#302E29] flex items-center justify-center shrink-0 shadow-2xs">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#9A7326] dark:text-[#C59B27]" />
            </div>
            <span className="text-sm text-[#3F3F46] dark:text-[#B8B0A5]">
              Children added: <strong className="font-bold text-[#18181B] dark:text-[#F0EBE3]">{childrenList.length}</strong>
            </span>
          </div>

          <div className="bg-[#FAF8F4] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-3.5 sm:p-4 flex items-center space-x-3.5 shadow-2xs">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-[#262520] border border-[#E5D5AE] dark:border-[#302E29] flex items-center justify-center shrink-0 shadow-2xs">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-[#E07A5F] dark:text-[#C59B27]" />
            </div>
            <span className="text-sm text-[#3F3F46] dark:text-[#B8B0A5]">
              Under review: <strong className="font-bold text-[#18181B] dark:text-[#F0EBE3]">{underReviewCount}</strong>
            </span>
          </div>

          <div className="bg-[#FAF8F4] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-3.5 sm:p-4 flex items-center space-x-3.5 shadow-2xs">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-[#262520] border border-[#E5D5AE] dark:border-[#302E29] flex items-center justify-center shrink-0 shadow-2xs">
              <QrCode className="w-4 h-4 sm:w-5 sm:h-5 text-[#C59B27]" />
            </div>
            <span className="text-sm text-[#3F3F46] dark:text-[#B8B0A5]">
              Pass ready: <strong className="font-bold text-[#18181B] dark:text-[#F0EBE3]">{passReadyCount}</strong>
            </span>
          </div>
        </div>

        {/* 7. Your Children heading */}
        <div className="space-y-4 pt-1">
          <h3 className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B] dark:text-[#F0EBE3] tracking-tight">
            Your Children
          </h3>

          {childrenList.length === 0 ? (
            <div className="bg-white dark:bg-[#21211E] rounded-2xl p-6 border border-[#EAE8E1] dark:border-[#302E29] text-center space-y-3 shadow-2xs">
              <h4 className="text-base sm:text-lg font-serif-koinonia font-bold text-[#18181B] dark:text-[#F0EBE3]">
                No children added yet
              </h4>
              <p className="text-xs sm:text-sm text-[#3F3F46] dark:text-[#B8B0A5] max-w-xs mx-auto leading-relaxed">
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
                {childrenList.map((child) => {
                  const cAgeNum = typeof child.age === 'number' ? child.age : parseInt(child.age, 10) || 0;
                  const cAgeLabel = cAgeNum < 1 ? 'Under 1 year' : cAgeNum === 1 ? '1 year' : `${cAgeNum} years`;
                  const cRawGroup = child.ageGroup || '';
                  const cHasReview = cRawGroup.toLowerCase().includes('review') || child.needsAgeReview;
                  let cCleanGroup = cRawGroup.replace(/\s*\(Review Needed\)/gi, '').trim();
                  if (cCleanGroup === 'Under 4' || cAgeNum < 4) cCleanGroup = 'Under 4s';

                  return (
                    <div
                      key={child.id}
                      className="bg-white dark:bg-[#21211E] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] dark:border-[#302E29] shadow-2xs space-y-3 font-sans"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="text-base font-sans font-semibold text-[#18181B] dark:text-[#F0EBE3] leading-snug truncate">
                            {child.name}
                          </h4>
                          <p className="text-xs text-[#71717A] dark:text-[#B8B0A5] mt-0.5 font-sans">
                            {cAgeLabel}{cCleanGroup ? ` · ${cCleanGroup}` : ''}
                          </p>
                          {cHasReview && (
                            <p className="text-[11px] text-amber-800 dark:text-amber-400 font-sans mt-0.5 font-medium">
                              Age needs confirmation
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 pt-0.5">
                          <StatusBadge status={child.status} size="sm" />
                        </div>
                      </div>

                      <p className="text-xs text-[#3F3F46] dark:text-[#B8B0A5] font-sans">
                        {child.statusNote || (child.status === 'Pass ready' ? 'Event pass is available' : child.status === 'Incomplete' || child.status === 'Draft' ? 'Continue entering child details' : 'Details sent for review')}
                      </p>

                    <div className="pt-1">
                      {child.status === 'Pass ready' || child.status === 'Checked in' || child.status === 'Inside' || child.status === 'Picked up' || child.passReference ? (
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
                            className="w-full py-2 px-4 rounded-xl text-[#6B7280] dark:text-[#B8B0A5] hover:text-[#4B5563] dark:hover:text-[#F0EBE3] font-semibold text-xs transition-all cursor-pointer focus:outline-none text-center bg-transparent"
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
                          className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-[#262520] hover:bg-[#FAF9F6] dark:hover:bg-[#2A2926] active:bg-[#F4F1EA] dark:active:bg-[#302E29] border border-[#18181B] dark:border-[#3A3835] text-[#18181B] dark:text-[#F0EBE3] font-semibold text-xs sm:text-sm transition-all cursor-pointer focus:outline-none"
                        >
                          View status
                        </button>
                      )}
                    </div>
                    </div>
                  );
                })}
              </div>

              {/* 10. Add a child dashed card */}
              <button
                type="button"
                onClick={() => {
                  if (onStartNewChild) onStartNewChild();
                  else onNavigate('/parent/children/new');
                }}
                className="w-full py-3.5 px-5 rounded-2xl border-2 sm:border border-dashed border-[#C59B27]/50 dark:border-[#3A3835] bg-[#FAF8F4]/70 hover:bg-[#FAF8F4] active:bg-[#FAF6EB] dark:bg-[#21211E] dark:hover:bg-[#2A2926] text-[#9A7326] dark:text-[#D4AF37] font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer focus:outline-none"
              >
                <Plus className="w-4 h-4 stroke-[2.5] text-[#9A7326] dark:text-[#D4AF37]" />
                <span>Add a child</span>
              </button>
            </>
          )}
        </div>

        {/* 11. Save-progress note card */}
        <div className="bg-[#F3EFE6] dark:bg-[#21211E] p-3.5 sm:p-4 rounded-2xl border border-[#E5D5AE]/70 dark:border-[#302E29] text-xs sm:text-sm text-[#3F3F46] dark:text-[#B8B0A5] flex items-start space-x-3 shadow-2xs">
          <Info className="w-4 h-4 sm:w-5 sm:h-5 text-[#9A7326] dark:text-[#C59B27] shrink-0 mt-0.5 stroke-[2]" />
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
          <h2 className="text-xl font-serif-koinonia font-bold text-[#18181B] dark:text-[#F0EBE3]">Children Profiles</h2>
          <p className="text-xs text-[#6B7280] dark:text-[#B8B0A5]">Identity check for arrival and pickup.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => {
          if (onStartNewChild) onStartNewChild();
          else onNavigate('/parent/children/new');
        }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>

      {childrenList.length === 0 ? (
        <div className="bg-white dark:bg-[#21211E] rounded-3xl p-8 border border-[#EAE8E1] dark:border-[#302E29] text-center space-y-3 shadow-sm">
          <h4 className="text-base sm:text-lg font-serif-koinonia font-bold text-[#18181B] dark:text-[#F0EBE3]">
            No children added yet
          </h4>
          <p className="text-xs sm:text-sm text-[#3F3F46] dark:text-[#B8B0A5] max-w-xs mx-auto leading-relaxed">
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
            <div key={child.id} className="bg-white dark:bg-[#21211E] rounded-3xl p-5 border border-[#EAE8E1] dark:border-[#302E29] shadow-sm space-y-4">
              <div className="flex items-start space-x-4">
                <FallbackAvatar
                  src={isRealUploadedPhoto(child.photoUrl) ? child.photoUrl : undefined}
                  name={child.name}
                  className="w-16 h-16 rounded-2xl border border-[#D9D6CE] dark:border-[#3A3835] text-lg font-bold"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-[#18181B] dark:text-[#F0EBE3] truncate">{child.name}</h3>
                  <p className="text-xs text-[#9A7326] dark:text-[#B8B0A5] font-medium mt-0.5 font-sans">
                    {child.age === 0 ? 'Under 1 year' : `${child.age} years`} · {((child.ageGroup || '').replace(/\s*\(Review Needed\)/gi, '').trim() || 'Children') === 'Under 4' ? 'Under 4s' : ((child.ageGroup || '').replace(/\s*\(Review Needed\)/gi, '').trim() || 'Children')}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={child.status} />
                  </div>
                </div>
              </div>
              <div className="bg-[#FAF9F6] dark:bg-[#262520] p-3 rounded-xl border border-[#EAE8E1] dark:border-[#302E29] text-xs text-[#6B7280] dark:text-[#B8B0A5] flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#18181B] dark:text-[#F0EBE3]">Care Review Status: </span>
                  <span className={child.status === 'Draft' || child.status === 'Incomplete' ? "text-[#9A7326] dark:text-[#C59B27]" : "text-[#6B7280] dark:text-[#B8B0A5]"}>
                    {child.statusNote || (child.status === 'Pass ready' ? 'Event pass is available' : 'Details sent for review')}
                  </span>
                </div>
                {(child.status === 'Incomplete' || child.status === 'Draft') && (
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setChildToRemove(child)}
                      className="py-1.5 px-3 rounded-lg border border-gray-200 dark:border-[#3A3835] text-gray-500 dark:text-[#B8B0A5] hover:text-gray-700 dark:hover:text-[#F0EBE3] font-semibold text-xs cursor-pointer bg-white dark:bg-[#21211E]"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onResumeChildDraft) onResumeChildDraft(child);
                        else onNavigate('/parent/children/new');
                      }}
                      className="py-1.5 px-3 rounded-lg bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-xs cursor-pointer"
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

  // Canonical child status is rendered in ChildStatusView with 'Confirmed by team' verification
  const renderStatusTab = () => null;

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

    // 3. draftChildren: draft, incomplete, not registered / not submitted
    const draftChildren = childrenList.filter(c => 
      (c.status === 'Draft' || c.status === 'Incomplete' || c.status === 'Not registered') &&
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
          <h2 className="text-2xl font-serif-koinonia font-bold text-[#18181B] dark:text-[#F0EBE3]">Passes</h2>
          <p className="text-xs text-[#5C5A54] dark:text-[#B8B0A5] font-medium">Passes will appear here when children are selected.</p>
        </div>

        {/* Summary Counters */}
        <div data-component-version="parent-passes-summary-v2-stitch" className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-3 text-center shadow-2xs">
            <span className="text-[10px] font-semibold text-[#8E8B82] dark:text-[#B8B0A5] uppercase tracking-wider block">Pass ready</span>
            <span className="text-lg font-bold text-[#18181B] dark:text-[#F0EBE3] mt-1 block">{passReadyCount}</span>
          </div>
          <div className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-3 text-center shadow-2xs">
            <span className="text-[10px] font-semibold text-[#8E8B82] dark:text-[#B8B0A5] uppercase tracking-wider block">Waiting</span>
            <span className="text-lg font-bold text-[#18181B] dark:text-[#F0EBE3] mt-1 block">{waitingCount}</span>
          </div>
          <div className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-3 text-center shadow-2xs">
            <span className="text-[10px] font-semibold text-[#8E8B82] dark:text-[#B8B0A5] uppercase tracking-wider block">Draft</span>
            <span className="text-lg font-bold text-[#18181B] dark:text-[#F0EBE3] mt-1 block">{draftCount}</span>
          </div>
        </div>

        {/* Empty State when no children exist */}
        {childrenList.length === 0 && (
          <div data-component-version="parent-pass-empty-state-v2" className="bg-white dark:bg-[#21211E] rounded-3xl p-8 border border-[#EAE8E1] dark:border-[#302E29] text-center space-y-4 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF6EB] dark:bg-[#262520] text-[#C59B27] flex items-center justify-center mx-auto border border-[#E5D5AE] dark:border-[#3A3835]">
              <QrCode className="w-6 h-6 opacity-60" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#18181B] dark:text-[#F0EBE3]">Passes under preparation</h3>
              <p className="text-xs text-[#6B7280] dark:text-[#B8B0A5] max-w-xs mx-auto">
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
                data-component-version={isCheckedIn ? "parent-pass-card-checked-in-v3" : "parent-pass-ready-card-v3"}
                className="w-full bg-[#FDFCF8] dark:bg-[#1C1C19] border border-[#D9CFB0] dark:border-[#2E2C26] rounded-2xl overflow-hidden text-left"
              >
                {/* Credential header stripe */}
                <div className="px-5 pt-5 pb-4 border-b border-[#E8E0CA] dark:border-[#2A2825] flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FallbackAvatar
                      src={isRealUploadedPhoto(c.photoUrl) ? c.photoUrl : undefined}
                      name={c.name}
                      className="w-11 h-11 rounded-full border border-[#D9CFB0] dark:border-[#3A3835] text-sm font-bold shrink-0"
                    />
                    <div className="min-w-0">
                      <h3 className="font-serif-koinonia text-[19px] font-semibold text-[#18181B] dark:text-[#F0EBE3] leading-snug truncate">{c.name}</h3>
                      <p className="text-[11px] text-[#6B6860] dark:text-[#B8B0A5] font-medium mt-px">{c.age} yrs · {c.ageGroup}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[9px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded border ${
                    isCheckedIn
                      ? 'bg-[#F0FAF1] border-[#BDE0C0] text-[#2E6B32] dark:bg-transparent dark:border-[#3A4E3B] dark:text-[#7DBF80]'
                      : 'bg-[#FAF6EB] border-[#E5D5AE] text-[#8C6D23] dark:bg-transparent dark:border-[#3A3835] dark:text-[#C59B27]'
                  }`}>
                    {isCheckedIn ? 'Checked in' : 'Pass ready'}
                  </span>
                </div>

                {/* Body */}
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  {/* Event label */}
                  <div className="min-w-0 flex-1">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A907A] dark:text-[#8E8B82] block">Event</span>
                    <span className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3] leading-snug block mt-0.5 line-clamp-2">
                      {activeEvent ? (activeEvent.title || 'The General Assembly') : 'The General Assembly'}
                    </span>
                  </div>
                  {/* Compact QR */}
                  <div className="shrink-0 bg-white dark:bg-[#262520] p-1.5 border border-[#D9CFB0] dark:border-[#3A3835] rounded-lg w-[72px] h-[72px] flex items-center justify-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(c.passReference || '')}`}
                      alt=""
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>

                {/* Footer action */}
                <div className="px-5 pb-5">
                  <button
                    type="button"
                    onClick={() => {
                      const unlocked = unlockedPassByChildId[c.id];
                      if (unlocked) {
                        setSelectedDetailChild({
                          ...c,
                          passReference: unlocked.passReference,
                          passLocked: false,
                          pass: unlocked.pass || c.pass
                        });
                      } else {
                        setSelectedDetailChild(c);
                      }
                    }}
                    className="w-full py-2.5 px-4 rounded-lg bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-sm tracking-wide transition-colors cursor-pointer focus:outline-none text-center"
                  >
                    Open pass
                  </button>
                </div>
              </div>
            );
          })}

          {/* Under-Review / Waiting Children Cards */}
          {waitingChildren.map(c => (
            <div 
              key={c.id} 
              data-component-version="parent-pass-waiting-card-v2-stitch"
              className="bg-white dark:bg-[#21211E] rounded-3xl p-4 border border-[#EAE8E1] dark:border-[#302E29] shadow-2xs space-y-4 text-left"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <FallbackAvatar
                    src={isRealUploadedPhoto(c.photoUrl) ? c.photoUrl : undefined}
                    name={c.name}
                    className="w-12 h-12 rounded-xl border border-[#D9D6CE] dark:border-[#3A3835] text-sm font-bold shadow-2xs"
                  />
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-[#18181B] dark:text-[#F0EBE3] truncate">{c.name}</h4>
                    <p className="text-[11px] text-[#8E8B82] dark:text-[#B8B0A5] font-semibold mt-0.5">{c.age} years • {c.ageGroup}</p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 dark:bg-[#262520] border border-amber-200 dark:border-[#3A3835] text-amber-700 dark:text-[#C59B27] text-[9px] font-bold uppercase tracking-wider">
                  {c.status === 'Selected' ? 'Waiting' : 'Under review'}
                </span>
              </div>

              <div className="bg-[#FAF6EB]/40 dark:bg-[#262520] p-3 rounded-xl border border-[#E5D5AE]/20 dark:border-[#3A3835] text-xs text-[#5C5A54] dark:text-[#B8B0A5] leading-relaxed">
                Pass will appear here if selected.
              </div>

              <button
                type="button"
                onClick={() => onNavigate(`/parent/children/${c.id}/status` as AppRoute)}
                className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-[#262520] hover:bg-[#FAF9F6] dark:hover:bg-[#2A2926] border border-[#18181B] dark:border-[#3A3835] text-[#18181B] dark:text-[#F0EBE3] font-semibold text-xs sm:text-sm transition-all cursor-pointer focus:outline-none text-center"
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
              className="bg-white dark:bg-[#21211E] rounded-3xl p-4 border border-[#EAE8E1] dark:border-[#302E29] shadow-2xs space-y-4 text-left"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <FallbackAvatar
                    src={undefined}
                    name={c.name}
                    className="w-12 h-12 rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] text-sm font-bold"
                  />
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-[#18181B] dark:text-[#F0EBE3] truncate">{c.name}</h4>
                    <p className="text-[11px] text-[#8E8B82] dark:text-[#B8B0A5] font-semibold mt-0.5">{c.age} years • {c.ageGroup}</p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#262520] border border-gray-200 dark:border-[#3A3835] text-gray-600 dark:text-[#B8B0A5] text-[9px] font-bold uppercase tracking-wider">
                  Draft
                </span>
              </div>

              <div className="bg-gray-50 dark:bg-[#262520] p-3 rounded-xl border border-gray-100 dark:border-[#3A3835] text-xs text-gray-500 dark:text-[#B8B0A5] leading-relaxed">
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
                className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-[#21211E] hover:bg-gray-50 dark:hover:bg-[#2A2926] border border-gray-300 dark:border-[#3A3835] text-[#3F3F46] dark:text-[#F0EBE3] font-semibold text-xs sm:text-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40 text-center"
              >
                Continue details
              </button>
            </div>
          ))}
        </div>

        {/* Bottom Info Note Card */}
        <div 
          data-component-version="parent-passes-info-note-v2-stitch"
          className="bg-[#FCF9F2] dark:bg-[#21211E] p-4 rounded-2xl border border-[#E8DFCA] dark:border-[#302E29] text-xs text-[#5C5A54] dark:text-[#B8B0A5] flex items-start space-x-3 shadow-2xs"
        >
          <Info className="w-4 h-4 text-[#9A7326] dark:text-[#C59B27] shrink-0 mt-0.5 stroke-[2]" />
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
      <div className="bg-white dark:bg-[#21211E] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] p-5 shadow-2xs relative text-center">
        <div className="flex justify-end mb-1">
          <button
            type="button"
            onClick={() => onNavigate('/parent/profile/edit')}
            className="text-xs font-semibold text-[#B89047] dark:text-[#C59B27] hover:underline cursor-pointer focus:outline-none"
          >
            Edit details
          </button>
        </div>

        <div className="flex justify-center mb-3">
          <FallbackAvatar
            src={isRealUploadedPhoto(parentProfile.photoUrl) ? parentProfile.photoUrl : undefined}
            name={parentProfile.fullName || 'Parent Account'}
            className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl border border-[#D9D6CE] dark:border-[#3A3835] dark:bg-[#262520] dark:text-[#B8B0A5] text-lg font-bold shadow-2xs"
          />
        </div>

        <h2 className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B] dark:text-[#F0EBE3] leading-tight">
          {parentProfile.fullName || 'Parent Account'}
        </h2>

        <div className="mt-1.5 mb-2.5">
          <span className="inline-block px-3 py-0.5 rounded-full bg-[#EFECE4] dark:bg-[#262520] border border-transparent dark:border-[#3A3835] text-[#715D3A] dark:text-[#B8B0A5] text-xs font-semibold">
            Parent account
          </span>
        </div>

        <p className="text-xs sm:text-sm text-[#3F3F46] dark:text-[#B8B0A5]">
          {parentProfile.email || 'Not specified'}
        </p>

        <p className="text-xs sm:text-sm text-[#3F3F46] dark:text-[#B8B0A5] mt-0.5">
          {parentProfile.phone || 'Not specified'}
        </p>
      </div>

      {/* Volunteer Status / Switcher Banner */}
      {volunteerProfile && (volunteerProfile.status === 'active' || volunteerProfile.status === 'approved') && (
        <div className="bg-[#FAF6EB] dark:bg-[#21211E] border border-[#E5D5AE] dark:border-[#302E29] rounded-2xl p-4.5 space-y-3 shadow-2xs text-left">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#FAF6EB] dark:bg-[#262520] border border-[#E5D5AE] dark:border-[#3A3835] rounded-xl text-[#9A7326] dark:text-[#C59B27] shrink-0">
              <Users className="w-5 h-5 stroke-[1.75]" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-[#18181B] dark:text-[#F0EBE3] font-serif-koinonia leading-tight">Volunteer Access Active</h3>
              <p className="text-[11px] text-[#6B7280] dark:text-[#B8B0A5] mt-0.5 leading-tight truncate">Approved for the <span className="font-semibold text-gray-700 dark:text-[#F0EBE3]">{volunteerProfile.preferred_team || 'event-day'}</span> team.</p>
            </div>
          </div>
          <Button
            variant="primary"
            fullWidth
            disabled={isSwitchingExperience}
            onClick={() => {
              if (onSwitchExperience) {
                onSwitchExperience('volunteer');
              } else {
                onNavigate('/volunteer/event');
              }
            }}
          >
            {isSwitchingExperience ? 'Switching…' : 'Switch to Volunteer Access'}
          </Button>
        </div>
      )}

      {volunteerProfile && volunteerProfile.status === 'pending_review' && (
        <div className="bg-amber-50/40 dark:bg-[#21211E] border border-amber-200/60 dark:border-[#302E29] rounded-2xl p-4 text-left">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-amber-50 dark:bg-[#262520] rounded-xl text-amber-600 dark:text-[#C59B27] shrink-0 mt-0.5 border border-amber-100 dark:border-[#3A3835]">
              <Clock className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-900 dark:text-[#F0EBE3] uppercase tracking-wide">Volunteer Status: Pending</h3>
              <p className="text-xs text-amber-700 dark:text-[#B8B0A5] mt-1 leading-relaxed">
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
        <div className="bg-red-50/40 dark:bg-[#21211E] border border-red-200/60 dark:border-[#302E29] rounded-2xl p-4 text-left">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-red-50 dark:bg-[#262520] rounded-xl text-red-600 dark:text-red-400 shrink-0 mt-0.5 border border-red-100 dark:border-[#3A3835]">
              <Shield className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-red-900 dark:text-[#F0EBE3] uppercase tracking-wide">Volunteer Status: Rejected</h3>
              <p className="text-xs text-red-700 dark:text-[#B8B0A5] mt-1 leading-relaxed">
                Your request for volunteer access has been rejected by an administrator. Please contact support if you believe this is an error.
              </p>
            </div>
          </div>
        </div>
      )}

      {volunteerProfile && volunteerProfile.status === 'suspended' && (
        <div className="bg-gray-100/60 dark:bg-[#21211E] border border-gray-200 dark:border-[#302E29] rounded-2xl p-4 text-left">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-gray-50 dark:bg-[#262520] rounded-xl text-gray-500 dark:text-[#B8B0A5] shrink-0 mt-0.5 border border-gray-150 dark:border-[#3A3835]">
              <Shield className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-800 dark:text-[#F0EBE3] uppercase tracking-wide">Volunteer Status: Suspended</h3>
              <p className="text-xs text-gray-600 dark:text-[#B8B0A5] mt-1 leading-relaxed">
                Your volunteer profile has been suspended by an administrator.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Contact preference card */}
      <div className="bg-white dark:bg-[#21211E] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-1">
          <span className="text-[11px] font-semibold tracking-wider text-[#3F3F46] dark:text-[#B8B0A5] uppercase">
            CONTACT PREFERENCE
          </span>
          <button
            type="button"
            onClick={() => onNavigate('/parent/profile/edit')}
            className="text-xs font-semibold text-[#B89047] dark:text-[#C59B27] hover:underline cursor-pointer focus:outline-none"
          >
            Change
          </button>
        </div>

        <div className="flex items-center space-x-3 text-sm font-medium text-[#18181B] dark:text-[#F0EBE3] py-1">
          <MessageCircle className="w-4 h-4 text-[#B89047] dark:text-[#C59B27] stroke-[1.75] shrink-0" />
          <span>WhatsApp</span>
        </div>

        <div className="flex items-center space-x-3 text-sm font-medium text-[#18181B] dark:text-[#F0EBE3] py-1">
          <Mail className="w-4 h-4 text-[#B89047] dark:text-[#C59B27] stroke-[1.75] shrink-0" />
          <span>Email</span>
        </div>

        <p className="text-xs italic text-[#6B7280] dark:text-[#B8B0A5] pt-1">
          Important updates will be sent here.
        </p>
      </div>

      {/* Notification Preferences Card */}
      <div className="bg-white dark:bg-[#21211E] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] p-4 sm:p-5 shadow-2xs space-y-4">
        <span className="text-[11px] font-semibold tracking-wider text-[#3F3F46] dark:text-[#B8B0A5] uppercase block">
          Notification Preferences
        </span>

        <div className="space-y-3.5 divide-y divide-[#EAE8E1]/30 dark:divide-[#302E29] text-xs text-[#18181B] dark:text-[#F0EBE3]">
          {/* Sound Notification Preference */}
          <div className="flex items-center justify-between pt-0.5">
            <div className="flex flex-col text-left">
              <span className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">Sound alerts</span>
              <span className="text-[10px] text-[#6B7280] dark:text-[#B8B0A5]">Play a soft alert for new updates</span>
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
                  ? 'bg-[#C59B27] text-white dark:text-[#1D1D1A]'
                  : 'bg-[#FAF8F3] dark:bg-[#262520] border border-[#E5D5AE] dark:border-[#3A3835] text-[#3F3F46] dark:text-[#B8B0A5] dark:hover:bg-[#2A2926]'
              }`}
            >
              {isSoundOn ? 'On' : 'Off'}
            </button>
          </div>

          {/* Appearance / Theme Preference */}
          <div className="flex items-center justify-between pt-3.5">
            <div className="flex flex-col text-left">
              <span className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">Theme</span>
              <span className="text-[10px] text-[#6B7280] dark:text-[#B8B0A5]">Switch between light and dark theme</span>
            </div>
            <ThemeSwitcher
              showLabel
              className="dark:!bg-[#C59B27] dark:!text-[#1D1D1A] dark:!border-[#C59B27] dark:hover:!bg-[#B88C22]"
            />
          </div>

          {/* Push Notification Preference */}
          <div className="flex items-center justify-between pt-3.5">
            <div className="flex flex-col text-left">
              <span className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">Push notifications</span>
              <span className="text-[10px] text-[#6B7280] dark:text-[#B8B0A5]">
                {pushStatus === 'enabled' ? 'Receiving alerts on this device' : 'Receive updates on this device'}
              </span>
              {pushStatus === 'needs_attention' && (
                <span className="text-[10px] text-amber-600 dark:text-[#C59B27] mt-0.5">Needs attention</span>
              )}
            </div>
            {pushStatus === 'unsupported' ? (
              <span className="text-[10px] font-semibold text-[#6B7280] dark:text-[#7A7570]">
                Unavailable
              </span>
            ) : pushStatus === 'blocked' ? (
              <span className="text-[10px] font-semibold text-red-500 dark:text-red-400">
                Blocked
              </span>
            ) : pushStatus === 'enabled' ? (
              <span className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-[#FAF6EB] dark:bg-[#C59B27] text-[#9A7326] dark:text-[#1D1D1A] border border-[#E5D5AE] dark:border-[#C59B27] tracking-wider uppercase">
                On
              </span>
            ) : pushStatus === 'needs_attention' ? (
              <button
                type="button"
                onClick={async () => {
                  const res = await subscribeUserToPush();
                  if (res.success) {
                    const details = await getPushNotificationStatus();
                    setPushStatus(details.status);
                    if (details.status === 'enabled') {
                      showSuccess('Push Active', 'You will now receive alerts directly on this device.');
                    } else {
                      showInfo('Setup Alert', 'Push notification setup could not be confirmed on the server.');
                    }
                  } else {
                    showInfo('Setup Alert', res.error || 'Could not connect push. Please try again.');
                  }
                }}
                className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-amber-50 dark:bg-[#262520] border border-amber-300 dark:border-[#3A3835] text-amber-700 dark:text-[#B8B0A5] hover:bg-amber-100 dark:hover:bg-[#2A2926] transition-all cursor-pointer"
              >
                Try again
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const res = await subscribeUserToPush();
                  if (res.success) {
                    const details = await getPushNotificationStatus();
                    setPushStatus(details.status);
                    if (details.status === 'enabled') {
                      showSuccess('Push Active', 'You will now receive alerts directly on this device.');
                    } else {
                      showInfo('Setup Alert', 'Push notification setup could not be confirmed on the server.');
                    }
                  } else {
                    showInfo('Setup Alert', res.error || 'Push notifications are not available yet.');
                  }
                }}
                className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-[#FAF8F3] dark:bg-[#262520] border border-[#E5D5AE] dark:border-[#3A3835] text-[#3F3F46] dark:text-[#B8B0A5] hover:border-[#C59B27] hover:text-[#9A7326] dark:hover:bg-[#2A2926] dark:hover:text-[#F0EBE3] transition-all cursor-pointer"
              >
                Enable
              </button>
            )}
          </div>

          {/* Email Notification Preference */}
          <div className="flex items-center justify-between pt-3.5">
            <div className="flex flex-col text-left">
              <span className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">Email updates</span>
              <span className="text-[10px] text-[#6B7280] dark:text-[#B8B0A5]">Weekly newsletters and care reminders</span>
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
                  ? 'bg-[#C59B27] text-white dark:text-[#1D1D1A]'
                  : 'bg-[#FAF8F3] dark:bg-[#262520] border border-[#E5D5AE] dark:border-[#3A3835] text-[#3F3F46] dark:text-[#B8B0A5] dark:hover:bg-[#2A2926]'
              }`}
            >
              {localStorage.getItem('koinonia_parent_email_notifications') === 'true' ? 'On' : 'Off'}
            </button>
          </div>

          {/* WhatsApp Notification Preference */}
          <div className="flex items-center justify-between pt-3.5 border-t border-[#FAF8F4] dark:border-[#302E29]">
            <div className="flex flex-col text-left">
              <span className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">WhatsApp updates</span>
              <span className="text-[10px] text-[#6B7280] dark:text-[#B8B0A5]">
                {whatsappStatus === 'opted_in'
                  ? (whatsappNumber ? `Active for ${whatsappNumber}` : 'Active for account')
                  : 'Important registration and event updates'}
              </span>
            </div>
            {whatsappStatus === 'opted_in' ? (
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold tracking-wider uppercase bg-[#C59B27] text-white dark:text-[#1D1D1A]">
                  On
                </span>
                <button
                  type="button"
                  disabled={waConsentLoading}
                  onClick={handleOptOutWhatsApp}
                  className="px-2.5 py-1 rounded-xl text-[10px] font-semibold text-[#71717A] dark:text-[#B8B0A5] hover:text-red-600 hover:bg-red-50 dark:bg-[#262520] dark:hover:bg-[#2A2926] dark:hover:text-red-400 border border-zinc-200 dark:border-[#3A3835] transition-all cursor-pointer"
                >
                  Turn off
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {whatsappStatus === 'opted_out' && (
                  <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold tracking-wider uppercase bg-zinc-200 dark:bg-[#262520] text-zinc-700 dark:text-[#B8B0A5] border border-transparent dark:border-[#3A3835]">
                    Off
                  </span>
                )}
                <button
                  type="button"
                  disabled={waConsentLoading}
                  onClick={() => {
                    setWaModalPhone(whatsappNumber || parentProfile.phone || '');
                    setShowWaOptInModal(true);
                  }}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-[#FAF8F3] dark:bg-[#262520] border border-[#E5D5AE] dark:border-[#3A3835] text-[#3F3F46] dark:text-[#B8B0A5] hover:border-[#C59B27] hover:text-[#9A7326] dark:hover:bg-[#2A2926] dark:hover:text-[#F0EBE3] tracking-wider uppercase transition-all cursor-pointer"
                >
                  {whatsappStatus === 'opted_out' ? 'Turn on' : 'Enable'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Parent details card */}
      <div className="bg-white dark:bg-[#21211E] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wider text-[#3F3F46] dark:text-[#B8B0A5] uppercase">
            PARENT DETAILS
          </span>
          <button
            type="button"
            onClick={() => onNavigate('/parent/profile/edit')}
            className="text-xs font-semibold text-[#B89047] dark:text-[#C59B27] hover:underline cursor-pointer focus:outline-none"
          >
            Edit details
          </button>
        </div>

        <div>
          <div className="text-xs text-[#6B7280] dark:text-[#B8B0A5]">Full name</div>
          <div className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3] mt-0.5">
            {parentProfile.fullName || 'Not provided'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#6B7280] dark:text-[#B8B0A5]">Phone number</div>
          <div className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3] mt-0.5">
            {parentProfile.phone || 'Not provided'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#6B7280] dark:text-[#B8B0A5]">WhatsApp number</div>
          <div className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3] mt-0.5">
            {parentProfile.whatsapp || parentProfile.phone || 'Not provided'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#6B7280] dark:text-[#B8B0A5]">Home address</div>
          <div className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3] mt-0.5 leading-relaxed whitespace-pre-line">
            {parentProfile.homeAddress || 'Not provided'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#6B7280] dark:text-[#B8B0A5]">Country</div>
          <div className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3] mt-0.5">
            {parentProfile.country || 'Not provided'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#6B7280] dark:text-[#B8B0A5]">State / Region</div>
          <div className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3] mt-0.5">
            {parentProfile.stateRegion || 'Not provided'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#6B7280] dark:text-[#B8B0A5]">City</div>
          <div className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3] mt-0.5">
            {parentProfile.city || 'Not provided'}
          </div>
        </div>

        <div className="pt-1">
          <div className="text-xs text-[#6B7280] dark:text-[#B8B0A5] mb-2">Ministry involvement</div>
          <div className="bg-[#FAF8F4] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-[#3F3F46] dark:text-[#B8B0A5]">Koinonia worker</span>
              <span className="font-semibold text-[#18181B] dark:text-[#F0EBE3]">{parentProfile.isWorker ? 'Yes' : 'No'}</span>
            </div>
            {parentProfile.isWorker && (
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-[#3F3F46] dark:text-[#B8B0A5]">Department</span>
                <span className="font-semibold text-[#18181B] dark:text-[#F0EBE3]">{parentProfile.department || 'Children Ministry'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Quick links card */}
      <div className="bg-white dark:bg-[#21211E] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] shadow-2xs divide-y divide-[#FAF8F4] dark:divide-[#302E29] overflow-hidden">
        <button
          type="button"
          onClick={() => handleTabChange('Children')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] dark:hover:bg-[#2A2926] transition-colors cursor-pointer focus:outline-none text-left"
        >
          <div className="flex items-center space-x-3.5">
            <Smile className="w-4 h-4 text-[#6B7280] dark:text-[#B8B0A5] stroke-[1.75]" />
            <span className="text-sm font-medium text-[#18181B] dark:text-[#F0EBE3]">My children</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#D9D6CE] dark:text-[#7A7570]" />
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('Passes')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] dark:hover:bg-[#2A2926] transition-colors cursor-pointer focus:outline-none text-left"
        >
          <div className="flex items-center space-x-3.5">
            <Ticket className="w-4 h-4 text-[#6B7280] dark:text-[#B8B0A5] stroke-[1.75]" />
            <span className="text-sm font-medium text-[#18181B] dark:text-[#F0EBE3]">Passes</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#D9D6CE] dark:text-[#7A7570]" />
        </button>

        {!volunteerProfile ? (
          <button
            type="button"
            onClick={() => onNavigate('/parent/volunteer-request')}
            className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] dark:hover:bg-[#2A2926] transition-colors cursor-pointer focus:outline-none text-left animate-fade-in"
          >
            <div className="flex items-center space-x-3.5">
              <Users className="w-4 h-4 text-[#C59B27] stroke-[1.75]" />
              <span className="text-sm font-medium text-[#18181B] dark:text-[#F0EBE3]">Volunteer with Children & Teens</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#D9D6CE] dark:text-[#7A7570]" />
          </button>
        ) : (
          <button
            type="button"
            disabled={isSwitchingExperience}
            onClick={() => {
              if (onSwitchExperience) {
                onSwitchExperience('volunteer');
              } else {
                onNavigate('/volunteer/event');
              }
            }}
            className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] dark:hover:bg-[#2A2926] transition-colors cursor-pointer focus:outline-none text-left animate-fade-in disabled:opacity-50"
          >
            <div className="flex items-center space-x-3.5">
              <ShieldCheck className="w-4 h-4 text-[#C59B27] stroke-[1.75]" />
              <span className="text-sm font-medium text-[#18181B] dark:text-[#F0EBE3]">
                {isSwitchingExperience ? 'Switching…' : 'Switch to Volunteer Access'}
              </span>
            </div>
            {isSwitchingExperience ? (
              <RefreshCw className="w-4 h-4 text-[#C59B27] animate-spin" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#D9D6CE] dark:text-[#7A7570]" />
            )}
          </button>
        )}

        <button
          type="button"
          data-component-version="parent-profile-help-row-v1"
          onClick={() => {
            setShowHelpDrawer(true);
          }}
          className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] dark:hover:bg-[#2A2926] transition-colors cursor-pointer focus:outline-none text-left"
        >
          <div className="flex items-center space-x-3.5">
            <HelpCircle className="w-4 h-4 text-[#6B7280] dark:text-[#B8B0A5] stroke-[1.75]" />
            <span className="text-sm font-medium text-[#18181B] dark:text-[#F0EBE3]">Help and questions</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#D9D6CE] dark:text-[#7A7570]" />
        </button>

        <button
          type="button"
          data-component-version="parent-profile-safety-row-v1"
          onClick={() => {
            setShowSafetyDrawer(true);
          }}
          className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] dark:hover:bg-[#2A2926] transition-colors cursor-pointer focus:outline-none text-left"
        >
          <div className="flex items-center space-x-3.5">
            <Shield className="w-4 h-4 text-[#6B7280] dark:text-[#B8B0A5] stroke-[1.75]" />
            <span className="text-sm font-medium text-[#18181B] dark:text-[#F0EBE3]">Safety information</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#D9D6CE] dark:text-[#7A7570]" />
        </button>
      </div>

      {/* 5b. Notification settings */}
      <SharedNotificationSettings
        role="parent"
        showSuccess={showSuccess}
        showError={showError}
      />

      {/* 5c. Device Security settings */}
      <DeviceSecuritySettings
        showSuccess={showSuccess}
        showError={showError}
      />

      {/* 6. Account actions card */}
      <div className="bg-white dark:bg-[#21211E] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] shadow-2xs divide-y divide-[#FAF8F4] dark:divide-[#302E29] overflow-hidden">
        {isAppInstalled() ? (
          <div className="w-full p-4 flex items-center justify-between text-left">
            <div className="flex items-center space-x-3.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-[#C59B27] stroke-[1.75]" />
              <div>
                <span className="text-sm font-medium text-[#18181B] dark:text-[#F0EBE3]">App installed</span>
                <p className="text-[11px] text-zinc-500 dark:text-[#B8B0A5] leading-tight">Koinonia Children & Teens is already installed on this device.</p>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={async () => {
              const outcome = await promptPwaInstall();
              if (outcome === 'accepted') {
                showSuccess('App installed', 'Koinonia Children & Teens has been added to your device.');
              } else if (outcome === 'manual_ios') {
                setPwaGuidePlatform('ios');
              } else if (outcome === 'manual_browser') {
                setPwaGuidePlatform('browser');
              } else if (outcome === 'already_installed') {
                showSuccess('Already installed', 'Koinonia Children & Teens is already installed on this device.');
              }
            }}
            className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] dark:hover:bg-[#2A2926] transition-colors cursor-pointer focus:outline-none text-left"
          >
            <div className="flex items-center space-x-3.5">
              <Download className="w-4 h-4 text-[#C59B27] stroke-[1.75]" />
              <div>
                <span className="text-sm font-medium text-[#18181B] dark:text-[#F0EBE3]">Install app</span>
                <p className="text-[11px] text-zinc-500 dark:text-[#B8B0A5] leading-tight">Add Koinonia Children & Teens to this device.</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#D9D6CE] dark:text-[#7A7570]" />
          </button>
        )}

        <button
          type="button"
          onClick={() => onNavigate('/parent/new-password')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#FAF8F4] dark:hover:bg-[#2A2926] transition-colors cursor-pointer focus:outline-none text-left"
        >
          <div className="flex items-center space-x-3.5">
            <Lock className="w-4 h-4 text-[#6B7280] dark:text-[#B8B0A5] stroke-[1.75]" />
            <span className="text-sm font-medium text-[#18181B] dark:text-[#F0EBE3]">Change password</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#D9D6CE] dark:text-[#7A7570]" />
        </button>

        <button
          type="button"
          onClick={() => {
            setUnlockedPassReferences({});
            try {
              if (typeof window !== 'undefined' && window.sessionStorage) {
                Object.keys(sessionStorage).forEach((key) => {
                  if (key.startsWith('koinonia_pass_unlocked_')) {
                    sessionStorage.removeItem(key);
                  }
                });
              }
            } catch {}
            api.request('/api/auth/sign-out', { method: 'POST' }).catch(() => {});
            if (onSignOut) {
              onSignOut();
            } else {
              onNavigate('/');
            }
          }}
          className="w-full p-4 flex items-center space-x-3.5 hover:bg-[#FEF2F2]/50 dark:hover:bg-[#2A2926] transition-colors cursor-pointer focus:outline-none text-left"
        >
          <LogOut className="w-4 h-4 text-[#C53030] dark:text-[#E05252] stroke-[1.75]" />
          <span className="text-sm font-medium text-[#C53030] dark:text-[#E05252]">Sign out</span>
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
    } className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] dark:bg-[#1D1D1A] text-[#18181B] dark:text-[#F0EBE3] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 dark:border-[#302E29]">
      {/* Top Header shown on all screens with calm, minimal, premium design */}
      <header className="sticky top-0 z-30 bg-[#FAF8F3]/95 dark:bg-[#1D1D1A]/95 backdrop-blur-md border-b border-[#EAE8E1]/50 dark:border-[#302E29]" data-component-version={activeTab === 'Passes' ? 'parent-passes-header-v2-stitch' : 'parent-mobile-header-v2-clean'}>
        <div className="px-5 h-14 flex items-center justify-between">
            <BrandLogo
              context="compact"
              data-component-version="parent-brand-logo-v1-configured"
              onClick={() => handleTabChange('Home')}
              className="mr-1"
            />

          <div className="text-center">
            <span className="font-serif-koinonia font-bold text-xs sm:text-sm text-[#18181B] dark:text-[#F0EBE3] tracking-wider uppercase leading-none">
              {activeTab === 'Passes' ? 'KOINONIA' : activeTab === 'Home' ? 'Koinonia' : activeTab === 'Children' ? 'Children' : activeTab === 'Status' ? 'Status' : 'Profile'}
            </span>
          </div>

          <div className="flex items-center space-x-2.5">
            {activeTab !== 'Passes' && (
              <button
                onClick={() => setShowNotificationsDrawer(true)}
                className="relative p-2 rounded-xl text-[#3F3F46] dark:text-[#B8B0A5] hover:text-[#C59B27] active:scale-95 transition-all cursor-pointer focus:outline-none"
                title="Notifications"
              >
                <Bell className="w-5 h-5 text-[#3F3F46] dark:text-[#B8B0A5]" />
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
                className="w-8 h-8 rounded-full border border-[#D9D6CE] dark:border-[#3A3835] text-xs font-bold shadow-2xs"
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
      <nav className="fixed bottom-0 left-0 right-0 z-40 max-w-[390px] mx-auto bg-white/95 dark:bg-[#1D1D1A]/95 backdrop-blur-md border-t border-[#EAE8E1] dark:border-[#302E29] shadow-lg">
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
                type="button"
                onClick={() => handleTabChange(item.label)}
                className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-xl transition-all cursor-pointer focus:outline-none ${
                  isActive
                    ? 'text-[#B89047] dark:text-[#D4AF37] font-semibold'
                    : 'text-[#6B7280] dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3]'
                }`}
              >
                <div
                  className={`p-1 rounded-lg transition-transform ${
                    isActive ? 'bg-[#FAF6EB] dark:bg-[#262520] scale-110 text-[#C59B27] dark:text-[#D4AF37]' : ''
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

      {/* Mobile Notification Centre */}
      <MobileNotificationCentre
        isOpen={showNotificationsDrawer}
        onClose={() => {
          setShowNotificationsDrawer(false);
          fetchNotifications();
        }}
        role="parent"
        surface="parent"
        onNavigate={onNavigate}
        onUnreadCountChange={handleUnreadCountChange}
      />

      {/* PWA In-App Install Banner */}
      <PwaInstallBanner />

      {/* Help and questions Drawer Bottom Sheet */}
      {showHelpDrawer && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-fade-in"
          data-view-version="parent-help-v1-brand"
          onClick={() => setShowHelpDrawer(false)}
        >
          <div 
            className="bg-[#FAF8F3] dark:bg-[#1D1D1A] rounded-t-[32px] max-h-[85%] overflow-hidden flex flex-col border-t border-[#E5D5AE] dark:border-[#302E29] shadow-2xl animate-in slide-in-from-bottom duration-300"
            data-component-version="parent-profile-info-sheet-v1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4.5 border-b border-[#E5D5AE]/40 dark:border-[#302E29] flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3.5">
                <div className="p-2.5 bg-[#FAF6EB] dark:bg-[#262520] rounded-2xl border border-[#E5D5AE]/60 dark:border-[#3A3835] text-[#C59B27]">
                  <HelpCircle className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-sans font-bold text-[#8C6D23] dark:text-[#F0EBE3]">
                    Help and questions
                  </h3>
                  <p className="text-[11px] text-[#6B7280] dark:text-[#B8B0A5] font-medium leading-tight mt-0.5">
                    Common answers for parents during the event.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHelpDrawer(false)}
                className="p-2 rounded-xl hover:bg-[#FAF6EB] dark:hover:bg-[#2A2926] text-[#6B7280] dark:text-[#7A7570] hover:text-[#18181B] dark:hover:text-[#F0EBE3] cursor-pointer transition-colors focus:outline-none"
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
                  className="bg-white dark:bg-[#21211E] rounded-2xl border border-[#EAE8E1]/80 dark:border-[#302E29] p-4.5 shadow-2xs space-y-2 text-left"
                >
                  <div className="flex items-start space-x-2.5">
                    <span className="text-xs font-sans font-bold text-[#C59B27] mt-0.5">
                      {idx + 1}.
                    </span>
                    <h4 className="text-sm font-sans font-bold text-[#18181B] dark:text-[#F0EBE3] leading-snug">
                      {faq.title}
                    </h4>
                  </div>
                  <p className="text-xs text-[#3F3F46] dark:text-[#B8B0A5] leading-relaxed pl-5">
                    {faq.body}
                  </p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4.5 bg-white dark:bg-[#1D1D1A] border-t border-[#EAE8E1]/60 dark:border-[#302E29] flex justify-center shrink-0">
              <button
                onClick={() => setShowHelpDrawer(false)}
                className="w-full py-3 px-4 rounded-xl bg-[#FAF6EB] dark:bg-[#262520] border border-[#E5D5AE] dark:border-[#3A3835] text-[#8C6D23] dark:text-[#B8B0A5] font-bold text-sm hover:bg-[#EFECE4] dark:hover:bg-[#2A2926] transition-all duration-200 cursor-pointer text-center"
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
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-fade-in"
          data-view-version="parent-safety-v1-brand"
          onClick={() => setShowSafetyDrawer(false)}
        >
          <div 
            className="bg-[#FAF8F3] dark:bg-[#1D1D1A] rounded-t-[32px] max-h-[85%] overflow-hidden flex flex-col border-t border-[#E5D5AE] dark:border-[#302E29] shadow-2xl animate-in slide-in-from-bottom duration-300"
            data-component-version="parent-profile-info-sheet-v1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4.5 border-b border-[#E5D5AE]/40 dark:border-[#302E29] flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3.5">
                <div className="p-2.5 bg-[#FAF6EB] dark:bg-[#262520] rounded-2xl border border-[#E5D5AE]/60 dark:border-[#3A3835] text-[#C59B27]">
                  <Shield className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-serif-koinonia font-bold text-[#8C6D23] dark:text-[#F0EBE3]">
                    Safety information
                  </h3>
                  <p className="text-[11px] text-[#6B7280] dark:text-[#B8B0A5] font-medium leading-tight mt-0.5">
                    How we help keep children safe during the event.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSafetyDrawer(false)}
                className="p-2 rounded-xl hover:bg-[#FAF6EB] dark:hover:bg-[#2A2926] text-[#6B7280] dark:text-[#7A7570] hover:text-[#18181B] dark:hover:text-[#F0EBE3] cursor-pointer transition-colors focus:outline-none"
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
                  className="bg-white dark:bg-[#21211E] rounded-2xl border border-[#EAE8E1]/80 dark:border-[#302E29] p-4.5 shadow-2xs space-y-2 text-left"
                >
                  <div className="flex items-start space-x-2.5">
                    <span className="text-xs font-sans font-bold text-[#C59B27] mt-0.5">
                      {idx + 1}.
                    </span>
                    <h4 className="text-sm font-sans font-bold text-[#18181B] dark:text-[#F0EBE3] leading-snug">
                      {safety.title}
                    </h4>
                  </div>
                  <p className="text-xs text-[#3F3F46] dark:text-[#B8B0A5] leading-relaxed pl-5">
                    {safety.body}
                  </p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4.5 bg-white dark:bg-[#1D1D1A] border-t border-[#EAE8E1]/60 dark:border-[#302E29] flex justify-center shrink-0">
              <button
                onClick={() => setShowSafetyDrawer(false)}
                className="w-full py-3 px-4 rounded-xl bg-[#FAF6EB] dark:bg-[#262520] border border-[#E5D5AE] dark:border-[#3A3835] text-[#8C6D23] dark:text-[#B8B0A5] font-bold text-sm hover:bg-[#EFECE4] dark:hover:bg-[#2A2926] transition-all duration-200 cursor-pointer text-center"
              >
                Close safety guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Pass Modal */}
      {selectedDetailChild && (selectedDetailChild.passReference || selectedDetailChild.passLocked || selectedDetailChild.status === 'Pass ready' || selectedDetailChild.status === 'Checked in' || selectedDetailChild.status === 'Inside' || selectedDetailChild.status === 'Picked up' || selectedDetailChild.status === 'Checked out') && (() => {
        const isBiometricRequired = typeof window !== 'undefined' && localStorage.getItem('koinonia_pass_biometric_unlock') === 'true';
        const unlocked = unlockedPassByChildId[selectedDetailChild.id];
        const effectivePassCode = unlocked?.passReference || unlockedPassReferences[selectedDetailChild.id] || (!isBiometricRequired ? selectedDetailChild.passReference : null);
        const isUnlocked = !isBiometricRequired || Boolean(
          (unlocked && !unlocked.passLocked && !!effectivePassCode) ||
          (!selectedDetailChild.passLocked && !!selectedDetailChild.passReference) ||
          (isPassUnlockedForChild(selectedDetailChild.id) && !!effectivePassCode)
        );
        const requiresUnlock = !isUnlocked;

        const handleSavePass = async () => {
          if (!effectivePassCode || requiresUnlock) {
            showError('Pass unavailable', 'Please unlock or wait for pass issuance before saving.');
            return;
          }
          if (isSavingPass) return;
          setIsSavingPass(true);
          try {
            const childName = (selectedDetailChild.name || 'Child').trim();
            const eventTitle = (activeEvent?.title || 'The General Assembly').trim();
            const eventDates = formatPassEventDates(activeEvent);
            const safeChildName = childName.replace(/[^a-zA-Z0-9_-]+/g, '-');
            const safePassCode = effectivePassCode.trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
            const filename = `Koinonia-Pass-${safeChildName}-${safePassCode}.png`;

            const pickupType = selectedDetailChild.draftData?.pickup?.pickupType;
            const isOtherPerson = pickupType === 'other_person';
            const pickupName = isOtherPerson
              ? (selectedDetailChild.draftData?.pickup?.pickupPersonFullName || 'Authorized Pickup')
              : 'Primary Parent Only';
            const pickupRelation = isOtherPerson
              ? (selectedDetailChild.draftData?.pickup?.pickupPersonRelationship || 'Secondary Authorized')
              : 'No secondary listed';

            const childAgeLabel = `${selectedDetailChild.age ? `${selectedDetailChild.age} yrs` : ''}${selectedDetailChild.ageGroup ? ` · ${selectedDetailChild.ageGroup}` : ''}`.trim();

            const blob = await renderPassCredentialToPngBlob({
              eventTitle,
              eventDates,
              childName,
              childAgeLabel,
              childPhotoUrl: selectedDetailChild.photoUrl,
              effectivePassCode,
              parentName: parentProfile.fullName,
              parentPhone: parentProfile.phone,
              pickupName,
              pickupRelation,
            });

            // Offline copy in localStorage
            try {
              localStorage.setItem(`koinonia_pass_offline_${selectedDetailChild.id}`, JSON.stringify({
                savedAt: new Date().toISOString(),
                childName,
                passCode: effectivePassCode,
                eventTitle,
                pickupSummary: pickupName,
              }));
            } catch (_) {}

            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

            showSuccess('Pass saved', 'Credential downloaded as PNG image.');
          } catch (saveErr) {
            console.error('[SavePass] Failed to generate/download pass:', saveErr);
            showError('Save failed', 'Unable to generate pass image. Please try again.');
          } finally {
            setIsSavingPass(false);
          }
        };

        const handleWhatsAppShare = () => {
          if (!effectivePassCode || requiresUnlock) {
            showError('Pass unavailable', 'Please unlock or wait for pass issuance before sharing.');
            return;
          }
          if (isSharingWhatsApp) return;
          try {
            setIsSharingWhatsApp(true);
            const eventTitle = activeEvent?.title;
            const childName = selectedDetailChild.name;
            const waUrl = buildParentPassWhatsAppShareUrl(eventTitle, childName, effectivePassCode);
            const win = window.open(waUrl, '_blank', 'noopener,noreferrer');
            if (win) {
              showSuccess('WhatsApp opened', 'Pass credential ready to share.');
            } else {
              showError('Opening WhatsApp blocked', 'Your browser blocked opening WhatsApp. Please allow pop-ups.');
            }
          } catch (err) {
            console.error('[WhatsAppShare] Failed to open WhatsApp:', err);
            showError('Sharing failed', 'Unable to open WhatsApp.');
          } finally {
            setIsSharingWhatsApp(false);
          }
        };

        return (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div
              data-view-version="parent-pass-detail-v7-credential"
              className="bg-[#FDFCF8] dark:bg-[#1D1D1A] text-[#18181B] dark:text-[#F0EBE3] rounded-2xl border border-[#D9CFB0] dark:border-[#302E29] shadow-xl max-w-sm w-full relative overflow-y-auto max-h-[92vh] text-left animate-in fade-in zoom-in-95"
            >
              {/* Document header */}
              <div className="px-6 pt-6 pb-5 border-b border-[#E8E0CA] dark:border-[#302E29] relative">
                {/* Decorative corner marks — credential feel */}
                <div className="absolute top-3 left-3 w-5 h-5 border-t border-l border-[#C59B27]/30 pointer-events-none" />
                <div className="absolute top-3 right-3 w-5 h-5 border-t border-r border-[#C59B27]/30 pointer-events-none" />

                <button
                  onClick={() => setSelectedDetailChild(null)}
                  className="absolute top-4 right-4 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer focus:outline-none z-10"
                >
                  <X className="w-4 h-4 text-[#8E8B82] dark:text-[#7A7570]" />
                </button>

                <div className="text-center space-y-1 pr-6">
                  <span className="text-[9px] tracking-[0.3em] text-[#C59B27] font-bold uppercase block">KOINONIA</span>
                  <span className="text-[8px] tracking-[0.18em] text-[#9A907A] dark:text-[#7A7570] uppercase font-semibold block">Children's Ministry · Official Pass</span>
                </div>
              </div>

              {/* Status + event */}
              <div className="px-6 pt-4 pb-3 border-b border-[#EDE6D4] dark:border-[#302E29] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-serif-koinonia text-[22px] font-semibold text-[#18181B] dark:text-[#F0EBE3] leading-snug">{activeEvent?.title || 'The General Assembly'}</h3>
                  {selectedDetailChild.status === 'Checked in' || selectedDetailChild.status === 'Inside' ? (
                    <span data-component-version="parent-pass-checked-in-state-v3" className="shrink-0 text-[8px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded border bg-[#F0FAF1] border-[#BDE0C0] text-[#2E6B32] dark:bg-transparent dark:border-[#3A4E3B] dark:text-[#7DBF80]">
                      Checked in
                    </span>
                  ) : (
                    <span className="shrink-0 text-[8px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded border bg-[#FAF6EB] border-[#E5D5AE] text-[#8C6D23] dark:bg-transparent dark:border-[#3A3835] dark:text-[#C59B27]">
                      Pass active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#6B6860] dark:text-[#7A7570] font-medium flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-[#C59B27] shrink-0" />
                  {(() => {
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
                      } catch (e) { return dateStr; }
                    };
                    if (!activeEvent) return '18th to 22nd November 2026';
                    const starts = activeEvent.startsAt || activeEvent.starts_at;
                    const ends = activeEvent.endsAt || activeEvent.ends_at;
                    if (!starts || !ends) return '18th to 22nd November 2026';
                    const formattedStarts = formatDateStr(starts);
                    const formattedEnds = formatDateStr(ends);
                    if (formattedStarts === formattedEnds) return formattedStarts;
                    return `${formattedStarts} – ${formattedEnds}`;
                  })()}
                </p>
              </div>

              {/* Child identity row */}
              <div className="px-6 py-4 border-b border-[#EDE6D4] dark:border-[#302E29] flex items-center gap-4">
                <div className="w-14 h-14 rounded-full overflow-hidden border border-[#D9CFB0] dark:border-[#3A3835] shrink-0 bg-[#F5F1E8] dark:bg-[#262520] flex items-center justify-center font-serif-koinonia text-lg font-semibold text-[#9A7326] dark:text-[#C59B27]">
                  {isRealUploadedPhoto(selectedDetailChild.photoUrl) ? (
                    <img src={selectedDetailChild.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>{getInitials(selectedDetailChild.name)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-serif-koinonia text-[22px] font-semibold text-[#18181B] dark:text-[#F0EBE3] leading-tight truncate">{selectedDetailChild.name}</h4>
                  <p className="text-[11px] text-[#6B6860] dark:text-[#B8B0A5] font-medium mt-0.5">{selectedDetailChild.age} yrs · {selectedDetailChild.ageGroup}</p>
                </div>
              </div>

              {/* QR + pass code */}
              <div className="px-6 py-5 border-b border-[#EDE6D4] dark:border-[#302E29] flex flex-col items-center gap-3">
                {(() => {
                  const isBiometricRequired = typeof window !== 'undefined' && localStorage.getItem('koinonia_pass_biometric_unlock') === 'true';
                  const unlocked = unlockedPassByChildId[selectedDetailChild.id];
                  const effectivePassCode = unlocked?.passReference || unlockedPassReferences[selectedDetailChild.id] || (!isBiometricRequired ? selectedDetailChild.passReference : null);
                  const isUnlocked = !isBiometricRequired || Boolean(
                    (unlocked && !unlocked.passLocked && !!effectivePassCode) ||
                    (!selectedDetailChild.passLocked && !!selectedDetailChild.passReference) ||
                    (isPassUnlockedForChild(selectedDetailChild.id) && !!effectivePassCode)
                  );
                  const requiresUnlock = !isUnlocked;
                  if (requiresUnlock) {
                    return (
                      <div
                        className="border border-dashed border-[#D9CFB0] dark:border-[#3A3835] rounded-xl w-40 h-40 flex flex-col items-center justify-center gap-2 text-center cursor-pointer hover:bg-[#FAF6EB]/60 dark:hover:bg-[#262520]/60 transition-colors"
                        onClick={() => setUnlockModalOpen(true)}
                      >
                        <Fingerprint className="w-9 h-9 text-[#C59B27] stroke-[1.25] animate-pulse" />
                        <span className="text-[10px] font-semibold text-[#3D3A32] dark:text-[#B8B0A5]">Pass is locked</span>
                        <span className="text-[9px] text-[#8E8B82] dark:text-[#7A7570]">Tap to unlock</span>
                      </div>
                    );
                  }
                  if (!effectivePassCode) {
                    return (
                      <div className="border border-dashed border-[#D9CFB0] dark:border-[#3A3835] rounded-xl w-40 h-40 flex flex-col items-center justify-center gap-2 text-center">
                        <Ticket className="w-8 h-8 text-[#C59B27] opacity-40" />
                        <span className="text-[10px] font-semibold text-[#3D3A32] dark:text-[#B8B0A5]">Pass pending</span>
                        <span className="text-[9px] text-[#8E8B82] dark:text-[#7A7570]">Code will appear once issued</span>
                      </div>
                    );
                  }
                  return (
                    <>
                      {/* QR */}
                      <div data-component-version="parent-pass-qr-v5" className="bg-white dark:bg-[#21211E] border border-[#D9CFB0] dark:border-[#3A3835] rounded-xl p-3 w-40 h-40 flex items-center justify-center relative">
                        <div className="absolute top-1.5 left-1.5 w-2.5 h-2.5 border-t border-l border-[#C59B27]/50 pointer-events-none" />
                        <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 border-t border-r border-[#C59B27]/50 pointer-events-none" />
                        <div className="absolute bottom-1.5 left-1.5 w-2.5 h-2.5 border-b border-l border-[#C59B27]/50 pointer-events-none" />
                        <div className="absolute bottom-1.5 right-1.5 w-2.5 h-2.5 border-b border-r border-[#C59B27]/50 pointer-events-none" />
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(effectivePassCode)}`}
                          alt="QR Code"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      {isBiometricRequired && (
                        <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-500 flex items-center justify-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          Unlocked for this session
                        </span>
                      )}

                      {/* Pass code */}
                      <div
                        data-component-version="parent-pass-code-display"
                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-[#E8E0CA] dark:border-[#3A3835] bg-[#FDFCF8] dark:bg-[#262520]"
                      >
                        <div>
                          <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#9A907A] dark:text-[#7A7570] block">PASS CODE</span>
                          <span className="text-sm font-mono font-bold tracking-wider text-[#18181B] dark:text-[#F0EBE3] select-all mt-0.5 block">{effectivePassCode}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (navigator?.clipboard?.writeText) {
                              navigator.clipboard.writeText(effectivePassCode);
                              showSuccess('Copied', 'Pass code copied to clipboard.');
                            }
                          }}
                          className="p-1.5 text-[#9A907A] dark:text-[#7A7570] hover:text-[#C59B27] dark:hover:text-[#C59B27] transition-colors cursor-pointer rounded hover:bg-[#FAF6EB] dark:hover:bg-[#302E29]"
                          title="Copy pass code"
                          aria-label="Copy pass code"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-[9px] text-[#9A907A] dark:text-[#7A7570] font-medium">Type this code if the QR cannot be scanned</span>
                    </>
                  );
                })()}
                <span className="text-[8px] font-bold tracking-[0.22em] text-[#C59B27] uppercase mt-1">SHOW PASS FOR AT-GATE SECURITY</span>
              </div>

              {/* Authorization details */}
              <div className="px-6 py-4.5 border-b border-[#EDE6D4] dark:border-[#302E29] grid grid-cols-2 gap-x-6 text-xs dark:bg-[#201F1B]">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A907A] dark:text-[#7A7570] block">Primary Parent</span>
                  <span className="font-semibold text-[#18181B] dark:text-[#F0EBE3] block truncate text-xs">{parentProfile.fullName}</span>
                  <span className="text-[10px] text-[#6B6860] dark:text-[#B8B0A5] font-medium block leading-normal">{parentProfile.phone}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A907A] dark:text-[#7A7570] block">Authorised Pickup</span>
                  {selectedDetailChild.draftData?.pickup?.pickupType === 'other_person' ? (
                    <>
                      <span className="font-semibold text-[#18181B] dark:text-[#F0EBE3] block truncate text-xs">{selectedDetailChild.draftData.pickup.pickupPersonFullName}</span>
                      <span className="text-[10px] text-[#6B6860] dark:text-[#B8B0A5] font-medium block leading-normal">{selectedDetailChild.draftData.pickup.pickupPersonRelationship}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-[#18181B] dark:text-[#F0EBE3] block text-xs">Primary Parent Only</span>
                      <span className="text-[10px] text-[#9A907A] dark:text-[#7A7570] font-medium block leading-normal">No secondary listed</span>
                    </>
                  )}
                </div>
              </div>

              {/* Security note */}
              <div className="px-6 py-3 border-b border-[#EDE6D4] dark:border-[#302E29]">
                <p className="text-[10px] text-[#6B6860] dark:text-[#7A7570] leading-relaxed flex items-start gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#C59B27] shrink-0 mt-px" />
                  Present this pass at arrival and pickup. Release is restricted to authorised persons listed above.
                </p>
              </div>

              {/* Action buttons */}
              <div className="px-6 py-5 space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    data-component-version="parent-pass-save-action-v3"
                    onClick={handleSavePass}
                    disabled={isSavingPass || !effectivePassCode || requiresUnlock}
                    aria-label={`Save pass credential for ${selectedDetailChild.name}`}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-[#18181B] dark:bg-[#F0EBE3] text-white dark:text-[#18181B] text-xs font-semibold tracking-wide hover:bg-[#27272A] dark:hover:bg-[#D9D6CE] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#C59B27] flex items-center justify-center gap-2"
                  >
                    {isSavingPass ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save pass</span>
                    )}
                  </button>
                  <button
                    type="button"
                    data-component-version="parent-pass-whatsapp-action-v3"
                    onClick={handleWhatsAppShare}
                    disabled={isSharingWhatsApp || !effectivePassCode || requiresUnlock}
                    aria-label={`Share pass via WhatsApp for ${selectedDetailChild.name}`}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-[#FDFCF8] dark:bg-[#21211E] border border-[#D9CFB0] dark:border-[#302E29] text-[#18181B] dark:text-[#F0EBE3] text-xs font-semibold tracking-wide hover:bg-[#FAF6EB] dark:hover:bg-[#262520] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#C59B27] flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4 text-[#B89047]" />
                    <span>{isSharingWhatsApp ? 'Opening...' : 'WhatsApp'}</span>
                  </button>
                </div>
                <div className="text-center">
                  <button
                    type="button"
                    data-component-version="parent-pass-status-link-v3"
                    onClick={() => {
                      setSelectedDetailChild(null);
                      onNavigate(`/parent/children/${selectedDetailChild.id}/status`);
                    }}
                    className="text-[11px] text-[#9A7326] dark:text-[#C59B27] font-semibold hover:underline inline-flex items-center gap-0.5"
                  >
                    View child status <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Bottom corner marks */}
              <div className="absolute bottom-3 left-3 w-5 h-5 border-b border-l border-[#C59B27]/30 pointer-events-none" />
              <div className="absolute bottom-3 right-3 w-5 h-5 border-b border-r border-[#C59B27]/30 pointer-events-none" />
            </div>
          </div>
        );
      })()}


      {/* Pass Biometrics Unlock Modal */}
      <DeviceSecurityModal
        isOpen={unlockModalOpen}
        onClose={() => setUnlockModalOpen(false)}
        childId={selectedDetailChild?.id || selectedChildId || undefined}
        onSuccess={async (credentialId?: string, passToken?: string) => {
          const targetChildId = selectedDetailChild?.id || selectedChildId;
          if (!targetChildId) return;

          const passRes = await api.parent.getChildPass(targetChildId, passToken);
          if (passRes && passRes.passReference) {
            const passRef = passRes.passReference;
            const updatedChildData = passRes.child ? {
              ...passRes.child,
              passLocked: false,
              passReference: passRef
            } : null;

            setUnlockedPassByChildId(prev => ({
              ...prev,
              [targetChildId]: {
                passReference: passRef,
                passLocked: false,
                pass: passRes.child?.pass || {
                  passCode: passRef,
                  qrPayload: passRef,
                  status: passRes.status,
                  issuedAt: passRes.issuedAt
                },
                child: updatedChildData
              }
            }));

            setUnlockedPassReferences(prev => ({
              ...prev,
              [targetChildId]: passRef
            }));

            setPassUnlockedChildId(targetChildId);

            setSelectedDetailChild(prev => {
              if (!prev || prev.id !== targetChildId) return prev;
              return {
                ...prev,
                ...(updatedChildData || {}),
                passReference: passRef,
                passLocked: false,
                pass: passRes.child?.pass || prev.pass
              };
            });

            showSuccess('Pass unlocked', 'Security verified for this session.');
          } else {
            // Pass endpoint returned 200 but no passReference — re-throw so modal stays open.
            throw new Error('Pass not ready');
          }
        }}
        actionName="Unlocking secure child pass"
      />

      {/* Family Arrival Plan Modal / Sheet */}
      {showArrivalGuideModal && selectedArrivalChild && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowArrivalGuideModal(false)}
        >
          <div 
            className="bg-white rounded-t-[28px] sm:rounded-2xl max-h-[90%] w-full max-w-md mx-auto overflow-hidden flex flex-col border border-[#EAE8E1] shadow-2xl animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#EAE8E1] flex items-center justify-between shrink-0 bg-[#FAF9F6]">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-[#FAF6EB] rounded-xl border border-[#E5D5AE] text-[#C59B27]">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-serif-koinonia font-bold text-[#18181B]">
                    Family arrival plan
                  </h3>
                  <p className="text-xs text-[#71717A]">
                    Arrival details for {selectedArrivalChild.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowArrivalGuideModal(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs text-[#3F3F46]">
              <div className="flex items-start space-x-3 p-3.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl">
                <FallbackAvatar src={selectedArrivalChild.photoUrl} name={selectedArrivalChild.name} className="w-10 h-10 rounded-full shrink-0" />
                <div>
                  <h4 className="font-bold text-sm text-[#18181B]">{selectedArrivalChild.name}</h4>
                  <p className="text-xs text-[#71717A]">{selectedArrivalChild.age} years • {selectedArrivalChild.ageGroup || 'Children'}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 bg-white border border-[#EAE8E1] rounded-2xl space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#9A7326]">Entry Gate</span>
                  <p className="text-sm font-bold text-[#18181B]">Children's Entrance B</p>
                  <p className="text-xs text-[#71717A]">Follow directional signs at Koinonia Pavilion ground level.</p>
                </div>

                <div className="p-3.5 bg-white border border-[#EAE8E1] rounded-2xl space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#9A7326]">Assigned Hall</span>
                  <p className="text-sm font-bold text-[#18181B]">Pre-Primary Room (Zone 2)</p>
                  <p className="text-xs text-[#71717A]">Volunteers will guide your child directly into their hall upon pass scan.</p>
                </div>

                <div className="p-3.5 bg-white border border-[#EAE8E1] rounded-2xl space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#9A7326]">Recommended Arrival Window</span>
                  <p className="text-sm font-bold text-[#18181B]">8:30 AM – 9:00 AM</p>
                  <p className="text-xs text-[#71717A]">Main session begins at 9:00 AM sharp.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowArrivalGuideModal(false);
                  setSelectedPassChild(selectedArrivalChild);
                  handleTabChange('Passes');
                }}
                className="w-full py-3 px-4 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] text-[#18181B] font-semibold text-xs sm:text-sm transition-all shadow-2xs cursor-pointer flex items-center justify-center space-x-2"
              >
                <QrCode className="w-4 h-4" />
                <span>Show Event Pass QR</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Family Pickup Plan Modal / Sheet */}
      {showPickupDetailsModal && selectedPickupChild && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowPickupDetailsModal(false)}
        >
          <div 
            className="bg-white rounded-t-[28px] sm:rounded-2xl max-h-[90%] w-full max-w-md mx-auto overflow-hidden flex flex-col border border-[#EAE8E1] shadow-2xl animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#EAE8E1] flex items-center justify-between shrink-0 bg-[#FAF9F6]">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-[#FAF6EB] rounded-xl border border-[#E5D5AE] text-[#C59B27]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-serif-koinonia font-bold text-[#18181B]">
                    Family pickup plan
                  </h3>
                  <p className="text-xs text-[#71717A]">
                    Pickup details for {selectedPickupChild.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPickupDetailsModal(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs text-[#3F3F46]">
              <div className="flex items-start space-x-3 p-3.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl">
                <FallbackAvatar src={selectedPickupChild.photoUrl} name={selectedPickupChild.name} className="w-10 h-10 rounded-full shrink-0" />
                <div>
                  <h4 className="font-bold text-sm text-[#18181B]">{selectedPickupChild.name}</h4>
                  <p className="text-xs text-[#71717A]">{selectedPickupChild.age} years • Checked in</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 bg-white border border-[#EAE8E1] rounded-2xl space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#9A7326]">Pickup Collection Point</span>
                  <p className="text-sm font-bold text-[#18181B]">Family Collection Desk B</p>
                  <p className="text-xs text-[#71717A]">Please present your pickup pass or photo ID at Collection Desk B.</p>
                </div>

                <div className="p-3.5 bg-white border border-[#EAE8E1] rounded-2xl space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#9A7326]">Authorized Pickup Person</span>
                  <p className="text-sm font-bold text-[#18181B]">
                    {selectedPickupChild.draftData?.pickup?.pickupPersonFullName || parentProfile.fullName || 'Parent / Guardian'}
                  </p>
                  <p className="text-xs text-[#71717A]">
                    Relationship: {selectedPickupChild.draftData?.pickup?.pickupPersonRelationship || 'Parent'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowPickupDetailsModal(false);
                  setSelectedPassChild(selectedPickupChild);
                  handleTabChange('Passes');
                }}
                className="w-full py-3 px-4 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] text-[#18181B] font-semibold text-xs sm:text-sm transition-all shadow-2xs cursor-pointer flex items-center justify-center space-x-2"
              >
                <QrCode className="w-4 h-4" />
                <span>Show Pickup Pass QR</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Opt-in Modal */}
      {showWaOptInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#21211E] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-[#262520] text-emerald-600 dark:text-[#C59B27] border border-transparent dark:border-[#3A3835] flex items-center justify-center">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#18181B] dark:text-[#F0EBE3]">Get updates on WhatsApp</h3>
                  <p className="text-xs text-[#6B7280] dark:text-[#B8B0A5]">Stay informed directly on your phone</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWaOptInModal(false)}
                className="text-zinc-400 dark:text-[#7A7570] hover:text-zinc-700 dark:hover:text-[#F0EBE3] cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#3F3F46] dark:text-[#B8B0A5] leading-relaxed">
              Receive important registration and event updates on WhatsApp. You can opt out at any time from your profile.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3] block">
                WhatsApp number
              </label>
              <input
                type="tel"
                value={waModalPhone}
                onChange={(e) => setWaModalPhone(e.target.value)}
                placeholder="+234 800 000 0000"
                className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3.5 py-2.5 text-sm text-[#18181B] dark:text-[#F0EBE3] focus:outline-none focus:border-[#C59B27]"
              />
              <p className="text-[11px] text-[#6B7280] dark:text-[#B8B0A5]">
                Enter with country code (e.g. +234 for Nigeria or local format).
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowWaOptInModal(false)}
                disabled={waConsentLoading}
                className="px-4 py-2 text-xs font-medium text-[#6B7280] dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={waConsentLoading || !waModalPhone.trim()}
                onClick={() => handleOptInWhatsApp(waModalPhone)}
                className="px-4 py-2 bg-[#18181B] dark:bg-[#C59B27] hover:bg-zinc-800 dark:hover:bg-[#B88C22] disabled:opacity-50 text-white dark:text-[#1D1D1A] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                {waConsentLoading ? 'Enabling...' : 'Enable WhatsApp updates'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Install Guide Modal for iOS / Android fallback */}
      <PwaInstallGuideModal
        isOpen={Boolean(pwaGuidePlatform)}
        onClose={() => setPwaGuidePlatform(null)}
        platform={pwaGuidePlatform || undefined}
      />
    </div>
  );
};
