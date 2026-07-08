import React, { useState, useEffect } from 'react';
import { 
  User, Mail, Phone, MapPin, Shield, Calendar, RefreshCw, 
  HelpCircle, Lock, LogOut, CheckCircle2, AlertTriangle, 
  ExternalLink, MessageSquare, Copy, Check 
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';

interface VolunteerProfileViewProps {
  onSignOut: () => void;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
  showWarning: (title: string, message: string) => void;
  isOffline?: boolean;
}

export const VolunteerProfileView: React.FC<VolunteerProfileViewProps> = ({
  onSignOut,
  showSuccess,
  showError,
  showWarning,
  isOffline = false
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [profileData, setProfileData] = useState<any>(null);
  const [sendingReset, setSendingReset] = useState<boolean>(false);
  const [resetSent, setResetSent] = useState<boolean>(false);
  const [copiedContact, setCopiedContact] = useState<boolean>(false);

  // Load and cache profile data
  const fetchProfile = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.volunteer.getProfile();
      if (data && data.success) {
        setProfileData(data);
        // Cache to localStorage for offline fallback
        localStorage.setItem('koinonia_cached_volunteer_profile', JSON.stringify(data));
      }
    } catch (err: any) {
      console.error('Error fetching volunteer profile:', err);
      // Try to load from cache
      const cached = localStorage.getItem('koinonia_cached_volunteer_profile');
      if (cached) {
        setProfileData(JSON.parse(cached));
        showWarning('Offline mode', 'Using cached profile data.');
      } else {
        const apiErr = extractApiError(err);
        showError('Profile Error', apiErr.message || 'Could not load profile details.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handlePasswordReset = async () => {
    if (!profileData?.user?.email) return;
    setSendingReset(true);
    try {
      const email = profileData.user.email;
      await api.volunteer.requestPasswordReset(email);
      setResetSent(true);
      showSuccess(
        'Reset Link Sent',
        `A password reset link has been successfully sent to ${email}. Please check your inbox.`
      );
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Reset Error', apiErr.message || 'Could not send reset email.');
    } finally {
      setSendingReset(false);
    }
  };

  const copyLeadContact = () => {
    if (!profileData?.help) return;
    const contactInfo = `Lead: ${profileData.help.eventLeadName || 'Pastor Isaac'}\nPhone: ${profileData.help.eventLeadPhone || '+234 803 123 4567'}\nEmail: ${profileData.help.eventLeadEmail || 'isaac@koinoniaglobal.org'}`;
    navigator.clipboard.writeText(contactInfo);
    setCopiedContact(true);
    showSuccess('Copied', 'Lead contact information copied to clipboard.');
    setTimeout(() => setCopiedContact(false), 2000);
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return 'No scans recorded';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  if (loading && !profileData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4" id="profile-loading-stage">
        <div className="w-10 h-10 border-3 border-[#C59B27]/30 border-t-[#C59B27] rounded-full animate-spin"></div>
        <p className="text-xs text-gray-400 font-mono tracking-wider uppercase">Loading profile...</p>
      </div>
    );
  }

  // Fallback state if no data could be fetched or found in cache
  const finalUser = profileData?.user || { fullName: 'Event Worker', email: 'N/A' };
  const finalProfile = profileData?.volunteerProfile || { status: 'approved', preferredTeam: 'General Team', assignedTeam: 'General Team', assignedArea: 'General Hall', accessScope: 'General Access' };
  const finalEvent = profileData?.event || { name: 'Children and Teens', section: 'The General Assembly' };
  const finalActivity = profileData?.activity || { checkedInByYou: 0, lastScanAt: null, pendingUpdates: 0 };
  const finalHelp = profileData?.help || { eventLeadName: 'Pastor Isaac', eventLeadPhone: '+234 803 123 4567', eventLeadEmail: 'isaac@koinoniaglobal.org' };

  return (
    <div 
      className="space-y-6 pb-16 animate-fade-in" 
      data-view-version="volunteer-profile-v1"
      id="volunteer-profile-view-container"
    >
      {/* 1. Header Profile Card */}
      <div 
        className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs relative overflow-hidden"
        data-component-version="volunteer-profile-sub-v1"
        id="profile-header-card"
      >
        <div className="flex items-start space-x-4">
          {/* Avatar frame */}
          <div className="relative shrink-0">
            {finalUser.photoUrl ? (
              <img 
                src={finalUser.photoUrl} 
                alt={finalUser.fullName}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-[#C59B27]/20 shadow-xs"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-[#C59B27]/10 flex items-center justify-center text-[#C59B27] border-2 border-[#C59B27]/20 shadow-xs">
                <User className="h-8 w-8" />
              </div>
            )}
            {/* Status Badge */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center shadow-xs" title="Ready to serve">
              <Check className="h-3 w-3 text-white stroke-[3]" />
            </div>
          </div>

          {/* User info */}
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 truncate leading-tight font-sans">
                {finalUser.fullName}
              </h2>
              <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wider uppercase bg-emerald-50 text-emerald-700 border border-emerald-100">
                Ready
              </span>
            </div>
            <p className="text-xs text-gray-400 truncate">{finalUser.email}</p>
            <p className="text-[10px] font-bold font-mono text-[#C59B27] tracking-wider uppercase">
              {finalProfile.assignedTeam}
            </p>
          </div>
        </div>

        {/* Detailed Meta Items */}
        <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-gray-100">
          <div className="bg-gray-50/50 rounded-xl p-2.5 border border-gray-100 flex items-center space-x-2.5">
            <Shield className="h-4 w-4 text-[#C59B27] shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-0.5">Authorization</p>
              <p className="text-[11px] font-semibold text-gray-800 truncate">{finalProfile.accessScope}</p>
            </div>
          </div>

          <div className="bg-gray-50/50 rounded-xl p-2.5 border border-gray-100 flex items-center space-x-2.5">
            <MapPin className="h-4 w-4 text-[#C59B27] shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-0.5">Assigned Area</p>
              <p className="text-[11px] font-semibold text-gray-800 truncate">{finalProfile.assignedArea}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Today's Activity Stats Section */}
      <div 
        className="space-y-2.5"
        data-component-version="volunteer-profile-sub-v1"
        id="profile-activity-section"
      >
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[10px] font-mono font-bold text-gray-400 tracking-wider uppercase">Today's Activity</h3>
          <span className="text-[10px] text-[#C59B27] font-semibold flex items-center space-x-1 font-mono">
            <span>Saved updates</span>
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 text-center space-y-1">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mx-auto" />
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Checked In</p>
            <p className="text-lg font-extrabold text-gray-900 leading-tight">{finalActivity.checkedInByYou}</p>
          </div>

          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 text-center space-y-1 col-span-2 flex flex-col justify-between">
            <div className="flex items-center justify-between text-left">
              <div className="space-y-0.5">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Last Scan</p>
                <p className="text-xs font-bold text-gray-800 leading-tight">
                  {formatTime(finalActivity.lastScanAt)}
                </p>
              </div>
              <Calendar className="h-4 w-4 text-[#C59B27]" />
            </div>
            
            <div className="border-t border-gray-100 pt-2 flex items-center justify-between text-[10px]">
              <span className="text-gray-400 font-medium">Sync Queue</span>
              <span className="font-bold text-emerald-600 font-mono">Synced (0)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Help & Emergency Support Section */}
      <div 
        className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4"
        data-component-version="volunteer-profile-sub-v1"
        id="profile-help-section"
      >
        <div className="flex items-start space-x-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-gray-900">Need Assistance?</h4>
            <p className="text-xs text-gray-500 leading-normal">
              For security escalation, logistics, or child issues, reach the event team lead immediately:
            </p>
          </div>
        </div>

        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 space-y-3.5 relative">
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Event Lead</p>
              <h5 className="text-xs font-bold text-gray-800">{finalHelp.eventLeadName || 'Pastor Isaac'}</h5>
              <p className="text-[10px] text-gray-400">Children and Teens &bull; Lead Coordinator</p>
            </div>
            <button 
              onClick={copyLeadContact}
              className="p-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors text-gray-400 hover:text-gray-600 cursor-pointer"
              title="Copy details"
            >
              {copiedContact ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3.5 pt-3.5 border-t border-gray-200/50">
            <a 
              href={`tel:${finalHelp.eventLeadPhone || '+2348031234567'}`}
              className="py-2.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center space-x-2 text-gray-700 font-bold text-xs tracking-wide transition-colors cursor-pointer"
            >
              <Phone className="h-3.5 w-3.5 text-gray-400" />
              <span>Call Lead</span>
            </a>
            
            <a 
              href={`https://wa.me/${(finalHelp.eventLeadPhone || '+2348031234567').replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center space-x-2 text-gray-700 font-bold text-xs tracking-wide transition-colors cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      </div>

      {/* 4. Settings Actions & Sign Out Section */}
      <div 
        className="space-y-3"
        data-component-version="volunteer-profile-sub-v1"
        id="profile-actions-section"
      >
        {/* Reset password card */}
        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center shrink-0">
              <Lock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h5 className="text-xs font-bold text-gray-800 leading-tight">Change Password</h5>
              <p className="text-[10px] text-gray-400 truncate">Request a secure password reset link via email</p>
            </div>
          </div>
          
          <button
            onClick={handlePasswordReset}
            disabled={sendingReset || resetSent}
            className="shrink-0 text-xs font-bold text-[#C59B27] hover:text-[#A47E1F] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors font-mono"
          >
            {sendingReset ? 'Sending...' : resetSent ? 'Sent' : 'Reset Link'}
          </button>
        </div>

        {/* Sign Out Card */}
        <button
          onClick={onSignOut}
          className="w-full bg-white border border-rose-100 hover:bg-rose-50/50 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all group"
          id="btn-profile-signout"
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 group-hover:bg-rose-100 transition-colors">
              <LogOut className="h-4 w-4" />
            </div>
            <div className="text-left">
              <h5 className="text-xs font-bold text-rose-600 leading-tight">Sign Out</h5>
              <p className="text-[10px] text-rose-400">Securely sign out of your Volunteer Access session</p>
            </div>
          </div>
          <AlertTriangle className="h-4 w-4 text-rose-300 group-hover:text-rose-500 transition-colors" />
        </button>
      </div>
    </div>
  );
};
