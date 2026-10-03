import React, { useState } from 'react';
import { Phone, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';

interface VolunteerWhatsAppPreferencesProps {
  variant?: 'banner' | 'settings';
  volunteerProfile?: any;
  onConsentUpdated?: (newStatus: 'opted_in' | 'opted_out', updatedProfile?: any) => void;
  onOpenEditProfile?: () => void;
  showSuccess?: (title: string, message: string) => void;
  showError?: (title: string, message: string) => void;
}

export const VolunteerWhatsAppPreferences: React.FC<VolunteerWhatsAppPreferencesProps> = ({
  variant = 'settings',
  volunteerProfile,
  onConsentUpdated,
  onOpenEditProfile,
  showSuccess,
  showError
}) => {
  const [loading, setLoading] = useState(false);
  const [isQuietDismissed, setIsQuietDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('koinonia_vol_wa_quiet_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const rawStatus = volunteerProfile?.whatsappConsentStatus || 
                    volunteerProfile?.whatsapp_consent_status || 
                    'unknown';
  const [whatsappStatus, setWhatsappStatus] = useState<'unknown' | 'opted_in' | 'opted_out'>(rawStatus);

  // Sync state if profile prop changes
  React.useEffect(() => {
    if (volunteerProfile?.whatsappConsentStatus) {
      setWhatsappStatus(volunteerProfile.whatsappConsentStatus);
    } else if (volunteerProfile?.whatsapp_consent_status) {
      setWhatsappStatus(volunteerProfile.whatsapp_consent_status);
    }
  }, [volunteerProfile?.whatsappConsentStatus, volunteerProfile?.whatsapp_consent_status]);

  // Synchronize across components without requiring page reload
  React.useEffect(() => {
    const handleSync = (e: any) => {
      if (e?.detail?.consentStatus) {
        setWhatsappStatus(e.detail.consentStatus);
      }
    };
    window.addEventListener('volunteer_whatsapp_consent_updated', handleSync);
    return () => {
      window.removeEventListener('volunteer_whatsapp_consent_updated', handleSync);
    };
  }, []);

  const phone = volunteerProfile?.phone || volunteerProfile?.whatsapp || volunteerProfile?.whatsappNumber || '';
  const hasPhone = Boolean(phone && String(phone).trim());
  const isDualRole = Boolean(volunteerProfile?.isDualRole);

  const handleOptIn = async () => {
    if (!hasPhone) {
      if (onOpenEditProfile) {
        onOpenEditProfile();
      } else if (showError) {
        showError('Phone Required', 'Add a phone number before enabling WhatsApp updates.');
      }
      return;
    }

    setLoading(true);
    try {
      const res = await api.volunteer.updateWhatsAppConsent({ action: 'opt_in' });
      if (res.success) {
        const newStatus = (res.consentStatus as 'opted_in') || 'opted_in';
        setWhatsappStatus(newStatus);
        if (volunteerProfile && typeof volunteerProfile === 'object') {
          volunteerProfile.whatsappConsentStatus = newStatus;
          volunteerProfile.whatsapp_consent_status = newStatus;
          if (res.profile?.whatsapp) {
            volunteerProfile.whatsapp = res.profile.whatsapp;
            volunteerProfile.whatsappNumber = res.profile.whatsapp;
          }
        }
        try {
          localStorage.setItem('koinonia_vol_wa_status', newStatus);
          window.dispatchEvent(new CustomEvent('volunteer_whatsapp_consent_updated', {
            detail: { consentStatus: newStatus, profile: res.profile }
          }));
        } catch {}
        if (showSuccess) {
          showSuccess('WhatsApp updates enabled', 'You will receive volunteer updates and duty reminders on WhatsApp.');
        }
        if (onConsentUpdated) {
          onConsentUpdated(newStatus, res.profile);
        }
      } else {
        if (showError) {
          showError('Could not enable', res.message || 'Failed to enable WhatsApp updates.');
        }
      }
    } catch (err: any) {
      if (showError) {
        showError('Error', err.message || 'An error occurred while enabling WhatsApp updates.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOptOut = async () => {
    setLoading(true);
    try {
      const res = await api.volunteer.updateWhatsAppConsent({ action: 'opt_out' });
      if (res.success) {
        const newStatus = (res.consentStatus as 'opted_out') || 'opted_out';
        setWhatsappStatus(newStatus);
        if (volunteerProfile && typeof volunteerProfile === 'object') {
          volunteerProfile.whatsappConsentStatus = newStatus;
          volunteerProfile.whatsapp_consent_status = newStatus;
        }
        try {
          localStorage.setItem('koinonia_vol_wa_status', newStatus);
          window.dispatchEvent(new CustomEvent('volunteer_whatsapp_consent_updated', {
            detail: { consentStatus: newStatus, profile: res.profile }
          }));
        } catch {}
        if (showSuccess) {
          showSuccess('WhatsApp updates turned off', 'In-app, push, and email updates remain active.');
        }
        if (onConsentUpdated) {
          onConsentUpdated(newStatus, res.profile);
        }
      } else {
        if (showError) {
          showError('Could not turn off', res.message || 'Failed to turn off WhatsApp updates.');
        }
      }
    } catch (err: any) {
      if (showError) {
        showError('Error', err.message || 'An error occurred while turning off WhatsApp updates.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuietDismiss = () => {
    try {
      localStorage.setItem('koinonia_vol_wa_quiet_dismissed', 'true');
    } catch {}
    setIsQuietDismissed(true);
  };

  // BANNER VARIANT (Used on Volunteer Home / Event Dashboard)
  if (variant === 'banner') {
    // Only show quiet banner if status is unknown and not dismissed
    if (whatsappStatus !== 'unknown' || isQuietDismissed) {
      return null;
    }

    return (
      <div 
        data-component-version="volunteer-whatsapp-quiet-banner-v1" 
        className="bg-[#FAF8F3] border border-[#E5D5AE] rounded-2xl p-4 flex items-start justify-between gap-3 shadow-2xs text-left font-sans"
        id="volunteer-wa-banner"
      >
        <div className="flex items-start gap-3 w-full">
          <Phone className="w-5 h-5 text-[#9A7326] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-[#18181B]">Get updates on WhatsApp</h4>
            <p className="text-[11px] text-[#6B7280] mt-0.5 leading-relaxed">
              Receive important volunteer updates, duty reminders and event information on WhatsApp.
            </p>

            {!hasPhone && (
              <div className="mt-2 text-[11px] text-amber-800 bg-amber-50/80 p-2 rounded-xl border border-amber-200/60 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                <span>Add a phone number before enabling WhatsApp updates.</span>
              </div>
            )}

            <div className="mt-3 flex items-center gap-3">
              {hasPhone ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleOptIn}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#18181B] text-white hover:bg-zinc-800 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
                  id="volunteer-enable-wa-btn"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  <span>Enable WhatsApp updates</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenEditProfile}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#18181B] text-white hover:bg-zinc-800 transition-all cursor-pointer shadow-2xs"
                  id="volunteer-add-phone-btn"
                >
                  Add phone number
                </button>
              )}
              <button
                type="button"
                onClick={handleQuietDismiss}
                className="text-xs text-[#6B7280] hover:text-[#18181B] font-medium cursor-pointer"
                id="volunteer-dismiss-wa-btn"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SETTINGS / PROFILE CARD VARIANT (Used on Volunteer Profile / Settings)
  const isOptedIn = whatsappStatus === 'opted_in';

  return (
    <div 
      className="bg-white rounded-2xl border border-[#EAE8E1] p-5 shadow-xs font-sans text-left space-y-4"
      data-component-version="volunteer-whatsapp-settings-v1"
      id="volunteer-whatsapp-settings-card"
    >
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">
          WhatsApp updates
        </h3>
        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
          Receive important volunteer updates, duty reminders and event information on WhatsApp.
        </p>
      </div>

      <div className="divide-y divide-zinc-100">
        <div className="py-3.5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-zinc-900">
                {isOptedIn ? 'WhatsApp updates are on' : 'Get updates on WhatsApp'}
              </p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                {isOptedIn
                  ? (isDualRole
                      ? (phone ? `WhatsApp updates are active for your account (${phone}).` : 'WhatsApp updates are enabled for your account.')
                      : (phone ? `Active for ${phone}. You can receive volunteer updates and duty reminders on WhatsApp.` : 'You can receive volunteer updates and duty reminders on WhatsApp.'))
                  : 'Receive important volunteer updates, duty reminders and event information on WhatsApp.'}
              </p>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              {isOptedIn ? (
                <>
                  <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold tracking-wider uppercase bg-[#C59B27] text-white">
                    On
                  </span>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleOptOut}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer disabled:opacity-50"
                    id="volunteer-wa-opt-out-btn"
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Turn off WhatsApp updates'}
                  </button>
                </>
              ) : (
                <>
                  {whatsappStatus === 'opted_out' && (
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold tracking-wider uppercase bg-zinc-200 text-zinc-700">
                      Off
                    </span>
                  )}
                  {hasPhone ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleOptIn}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#9A7326] hover:bg-[#7D5B18] text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      id="volunteer-wa-opt-in-btn"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      <span>Enable WhatsApp updates</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onOpenEditProfile}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#FAF8F3] border border-[#E5D5AE] text-[#3F3F46] hover:border-[#C59B27] hover:text-[#9A7326] transition-colors cursor-pointer"
                      id="volunteer-wa-edit-phone-btn"
                    >
                      Add phone number
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {!hasPhone && !isOptedIn && (
            <p className="text-[11px] text-amber-800 bg-amber-50/80 p-2 rounded-xl border border-amber-200/60 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-700" />
              <span>Add a phone number before enabling WhatsApp updates.</span>
            </p>
          )}

          {isOptedIn && (
            <p className="text-[11px] text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>WhatsApp updates are active. In-app, push, and email updates also remain active.</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
