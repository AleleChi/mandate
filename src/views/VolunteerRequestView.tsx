import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Sparkles, ShieldAlert } from 'lucide-react';
import { AppRoute, ParentProfile } from '../types';
import { api, extractApiError } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { Button } from '../components/common/Button';
import { PhotoUploadBox } from '../components/common/PhotoUploadBox';
import { InternationalWhatsAppField } from '../components/common/InternationalWhatsAppField';
import { inferCountryIsoFromE164, resolveConsistentCountryIso } from '../utils/countries';

interface VolunteerRequestViewProps {
  onNavigate: (route: AppRoute) => void;
  parentProfile: ParentProfile;
  volunteerProfile?: any;
  onRefreshAccess?: () => Promise<void>;
}

export const VolunteerRequestView: React.FC<VolunteerRequestViewProps> = ({
  onNavigate,
  parentProfile,
  volunteerProfile,
  onRefreshAccess
}) => {
  const { showSuccess, showError, showWarning } = useNotification();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [regStatus, setRegStatus] = useState<any>(null);

  useEffect(() => {
    api.auth.getRegistrationStatus().then((res) => {
      if (res && res.success) {
        setRegStatus(res);
      }
    }).catch((err) => {
      console.error('Failed to load volunteer registration status', err);
    });
  }, []);

  // Form Fields prefilled from parentProfile
  const [fullName, setFullName] = useState(parentProfile?.fullName || '');
  const [email] = useState(parentProfile?.email || '');
  const [phone, setPhone] = useState(parentProfile?.phone || '');
  const [whatsapp, setWhatsapp] = useState(parentProfile?.whatsapp || parentProfile?.phone || '');
  const initialWaIso = parentProfile?.whatsappCountryIso ||
    inferCountryIsoFromE164(parentProfile?.whatsapp) ||
    inferCountryIsoFromE164(parentProfile?.phone) ||
    'NG';
  const [whatsappCountryIso, setWhatsappCountryIso] = useState<string>(initialWaIso);
  const [isWhatsappSame, setIsWhatsappSame] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(parentProfile?.photoUrl || '');
  const [isKoinoniaWorker, setIsKoinoniaWorker] = useState(parentProfile?.isWorker || false);
  const [department, setDepartment] = useState(parentProfile?.department || '');
  const [preferredTeam, setPreferredTeam] = useState('Check-in Team');
  const [servingExperience, setServingExperience] = useState(false);
  const [note, setNote] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [agreedToWhatsApp, setAgreedToWhatsApp] = useState(false);

  const handleWhatsappSameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setIsWhatsappSame(checked);
    if (checked) {
      setWhatsapp(phone);
      const inferred = inferCountryIsoFromE164(phone);
      if (inferred) setWhatsappCountryIso(inferred);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPhone(val);
    if (isWhatsappSame) {
      setWhatsapp(val);
      const inferred = inferCountryIsoFromE164(val);
      if (inferred) setWhatsappCountryIso(inferred);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreedToWhatsApp) {
      showWarning('Consent Required', 'Please confirm consent to receive volunteer updates on WhatsApp.');
      return;
    }

    if (!agreed) {
      showWarning('Consent Required', 'You must agree to the Children Safety Policy & background checks to apply.');
      return;
    }

    const cleanWhatsapp = (isWhatsappSame ? phone : whatsapp).trim();
    if (!fullName.trim() || !phone.trim() || !cleanWhatsapp || !preferredTeam.trim()) {
      showWarning('Fields Required', 'Please fill in all required fields (Name, Phone, WhatsApp, Preferred Team).');
      return;
    }

    if (isKoinoniaWorker && !department.trim()) {
      showWarning('Department Required', 'Please specify your Koinonia department.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);

    try {
      const finalWaCountryIso = resolveConsistentCountryIso(
        isWhatsappSame ? (inferCountryIsoFromE164(phone) || whatsappCountryIso) : whatsappCountryIso,
        cleanWhatsapp
      );

      const payload = {
        fullName: fullName.trim(),
        phone: phone.trim(),
        whatsapp: cleanWhatsapp,
        whatsappCountryIso: finalWaCountryIso,
        whatsappConsent: agreedToWhatsApp,
        isKoinoniaWorker,
        department: isKoinoniaWorker ? department.trim() : null,
        preferredTeam,
        servingExperience,
        note: note.trim() || null,
        photoFileId: photoUrl || null
      };

      await api.volunteer.requestAccess(payload);

      showSuccess('Request Submitted', 'Your request has been received! Our team will review your application.');

      if (onRefreshAccess) {
        await onRefreshAccess();
      }

      onNavigate('/volunteer/pending-review');
    } catch (err: any) {
      const parsed = extractApiError(err);
      setErrorMsg(parsed.message);
      showError(parsed.message, parsed.description);
    } finally {
      setLoading(false);
    }
  };

  if (volunteerProfile && volunteerProfile.status === 'pending_review') {
    return (
      <div className="min-h-screen bg-[#FAF9F6] font-sans flex flex-col justify-between pb-12">
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#EAE8E1] bg-white sticky top-0 z-30">
          <button
            onClick={() => onNavigate('/parent/home')}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer focus:outline-none"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold font-sans text-[#18181B] tracking-wide uppercase">Volunteer Application</span>
          <div className="w-8" />
        </div>

        <div className="flex-1 max-w-md w-full mx-auto p-4 space-y-6 pt-8">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EAE8E1] shadow-sm space-y-5 text-center">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] text-xs font-bold uppercase tracking-wider mx-auto">
              <span>Application Submitted</span>
            </div>
            <h1 className="type-h1-app text-[#18181B]">
              Volunteer application submitted
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
              Your volunteer application has been received and is currently under review by the leadership team. You will receive updates once your profile has been approved.
            </p>

            <div className="space-y-3 pt-3">
              <Button
                type="button"
                onClick={() => onNavigate('/volunteer/pending-review')}
                className="w-full py-3.5 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-xs"
              >
                View Application Status
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onNavigate('/parent/home')}
                className="w-full py-3.5 text-zinc-700 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                Back to Parent Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (volunteerProfile && (volunteerProfile.status === 'active' || volunteerProfile.status === 'approved')) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] font-sans flex flex-col justify-between pb-12">
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#EAE8E1] bg-white sticky top-0 z-30">
          <button
            onClick={() => onNavigate('/parent/home')}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer focus:outline-none"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold font-sans text-[#18181B] tracking-wide uppercase">Volunteer Profile</span>
          <div className="w-8" />
        </div>

        <div className="flex-1 max-w-md w-full mx-auto p-4 space-y-6 pt-8">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EAE8E1] shadow-sm space-y-5 text-center">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-wider mx-auto">
              <span>Active Volunteer</span>
            </div>
            <h1 className="type-h1-app text-[#18181B]">
              You are an approved volunteer
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
              Your volunteer profile is active. You can switch to your volunteer workspace anytime to view your assigned event and duties.
            </p>

            <div className="space-y-3 pt-3">
              <Button
                type="button"
                onClick={() => onNavigate('/volunteer/event')}
                className="w-full py-3.5 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-xs"
              >
                Open Volunteer Workspace
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onNavigate('/parent/home')}
                className="w-full py-3.5 text-zinc-700 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                Back to Parent Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isVolunteerOpen = regStatus
    ? (regStatus.volunteer?.isOpen ?? regStatus.volunteerRegistrationEnabled ?? true)
    : true;

  if (regStatus && !isVolunteerOpen) {
    const isNotOpen = regStatus.volunteer?.state === 'not_open_yet';
    const eventName = regStatus.eventName || 'The General Assembly';

    return (
      <div className="min-h-screen bg-[#FAF9F6] font-sans flex flex-col justify-between pb-12">
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#EAE8E1] bg-white sticky top-0 z-30">
          <button
            onClick={() => onNavigate('/parent/home')}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer focus:outline-none"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold font-sans text-[#18181B] tracking-wide uppercase">Volunteer Request</span>
          <div className="w-8" />
        </div>

        <div className="flex-1 max-w-md w-full mx-auto p-4 space-y-6 pt-8">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EAE8E1] shadow-sm space-y-5 text-center">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] text-xs font-bold uppercase tracking-wider mx-auto">
              <span>{isNotOpen ? 'Registration Not Open' : 'Registration Closed'}</span>
            </div>
            <h1 className="type-h1-app text-[#18181B]">
              {isNotOpen ? 'Registration is not open yet' : 'Registration has closed'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
              {isNotOpen
                ? `Volunteer registration for ${eventName} has not started yet.${regStatus.volunteer?.opensAtFormatted ? ` Registration opens ${regStatus.volunteer.opensAtFormatted}.` : ''}`
                : `Volunteer registration for ${eventName} is now closed.`}
            </p>

            <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 text-xs text-zinc-600 leading-relaxed text-left space-y-1 mt-4">
              <p className="font-semibold text-zinc-900">Already a volunteer?</p>
              <p>
                If you already have an approved volunteer profile, you can sign in directly to access your volunteer duties.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Button
                type="button"
                onClick={() => onNavigate('/volunteer/sign-in')}
                className="w-full py-3.5 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-xs"
              >
                Volunteer Sign In
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onNavigate('/parent/home')}
                className="w-full py-3.5 text-zinc-700 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                Back to Parent Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] font-sans flex flex-col justify-between pb-12">
      {/* Header Bar */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-[#EAE8E1] bg-white sticky top-0 z-30">
        <button
          onClick={() => onNavigate('/parent/home')}
          className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer focus:outline-none"
          disabled={loading}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-bold font-sans text-[#18181B] tracking-wide uppercase">Volunteer Request</span>
        <div className="w-8" />
      </div>

      <div className="flex-1 max-w-md w-full mx-auto p-4 space-y-6">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EAE8E1] shadow-sm space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="type-h1-app text-[#18181B]">Volunteer with Children & Teens</h1>
            <p className="text-xs text-gray-500 leading-relaxed">
              Help us create a safe, engaging, and spiritually nourishing environment for our young ones. Fill out the application details below to begin.
            </p>
          </div>

          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-600 font-medium">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* PHOTO UPLOAD */}
            <div className="flex flex-col items-center justify-center space-y-2 pb-2">
              <label className="text-xs font-semibold text-gray-700">Profile Photo</label>
              <PhotoUploadBox
                value={photoUrl}
                onUploaded={(url) => setPhotoUrl(url)}
                purpose="parent_profile_photo"
                sizeVariant="w-24"
              />
              <p className="text-[10px] text-gray-400 text-center max-w-xs">
                Upload a headshot if you want a separate badge photo. If empty, your parent photo is used.
              </p>
            </div>

            {/* FULL NAME */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">Full Name *</label>
              <input
                type="text"
                placeholder="Firstname Lastname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                disabled={loading}
                required
              />
            </div>

            {/* EMAIL ADDRESS */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 block">Email Address (Linked to Account)</label>
              <input
                type="email"
                value={email}
                className="w-full h-11 px-4 rounded-2xl border border-gray-100 text-sm bg-gray-100 text-gray-500 focus:outline-none cursor-not-allowed"
                disabled
              />
            </div>

            {/* PHONE */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">Phone Number *</label>
              <input
                type="tel"
                placeholder="+234 803 123 4567"
                value={phone}
                onChange={handlePhoneChange}
                className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                disabled={loading}
                required
              />
            </div>

            {/* WHATSAPP */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700 block">
                  WhatsApp Number <span className="text-[#DC2626]">*</span>
                </label>
                <label className="flex items-center space-x-1.5 text-xs text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isWhatsappSame}
                    onChange={handleWhatsappSameChange}
                    className="rounded text-[#C59B27] focus:ring-[#C59B27] border-gray-300"
                    disabled={loading}
                  />
                  <span>Same as phone</span>
                </label>
              </div>
              {!isWhatsappSame && (
                <InternationalWhatsAppField
                  id="volunteer-request-whatsapp"
                  countryIso={whatsappCountryIso}
                  value={whatsapp}
                  onCountryChange={(iso) => setWhatsappCountryIso(iso)}
                  onChange={(val) => setWhatsapp(val)}
                  disabled={loading}
                  required
                />
              )}

              <div className="pt-1">
                <label
                  htmlFor="volunteer_request_whatsapp_consent"
                  className="flex items-start gap-2.5 cursor-pointer select-none group"
                >
                  <input
                    id="volunteer_request_whatsapp_consent"
                    type="checkbox"
                    className="sr-only"
                    checked={agreedToWhatsApp}
                    onChange={(e) => setAgreedToWhatsApp(e.target.checked)}
                    disabled={loading}
                    required
                  />
                  <div
                    className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center transition-all shrink-0 ${
                      agreedToWhatsApp
                        ? 'bg-[#C59B27] border-[#C59B27] text-white'
                        : 'bg-white border-[#D9D6CE] group-hover:border-[#18181B]'
                    }`}
                  >
                    {agreedToWhatsApp && <Check className="w-3 h-3 stroke-[3] text-white" />}
                  </div>
                  <div className="pt-0.5">
                    <span className="text-xs text-zinc-700 leading-snug block">
                      I agree to receive volunteer updates on WhatsApp. <span className="text-[#DC2626]">*</span>
                    </span>
                    <span className="text-[11px] text-zinc-400 block mt-0.5">
                      WhatsApp is required for volunteer duty updates and important event information.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* KOINONIA WORKER STATUS */}
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Are you a Koinonia Worker?</h3>
                  <p className="text-[11px] text-gray-500">Enable this if you serve in a Koinonia department.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isKoinoniaWorker}
                    onChange={(e) => {
                      setIsKoinoniaWorker(e.target.checked);
                      if (!e.target.checked) setDepartment('');
                    }}
                    className="sr-only peer"
                    disabled={loading}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#C59B27]"></div>
                </label>
              </div>

              {isKoinoniaWorker && (
                <div className="space-y-1 pt-1">
                  <label className="text-xs font-semibold text-gray-700 block">Department Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Protocol, Ushering, Media"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full h-10 px-4 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-white"
                    disabled={loading}
                    required
                  />
                </div>
              )}
            </div>

            {/* PREFERRED TEAM */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">Preferred Service Team *</label>
              <select
                value={preferredTeam}
                onChange={(e) => setPreferredTeam(e.target.value)}
                className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                disabled={loading}
              >
                <option value="Check-in Team">Check-in Team</option>
                <option value="Pickup Team">Pickup Team</option>
                <option value="Children Care Team">Children Care Team</option>
                <option value="Reports Team">Reports Team</option>
                <option value="Support Team">Support Team</option>
              </select>
            </div>

            {/* EXPERIENCE SERVING CHILDREN */}
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-gray-800">Experience serving children?</h3>
                <p className="text-[11px] text-gray-500">Have you served with minors or children before?</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={servingExperience}
                  onChange={(e) => setServingExperience(e.target.checked)}
                  className="sr-only peer"
                  disabled={loading}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#C59B27]"></div>
              </label>
            </div>

            {/* NOTE ON EXPERIENCE / MOTIVATION */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">Experience / Motivation Note (Optional)</label>
              <textarea
                placeholder="Tell us briefly about your motivation or relevant experience."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full p-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50 resize-none"
                disabled={loading}
              />
            </div>

            {/* CONSENT AGREEMENT */}
            <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl space-y-3">
              <div className="flex items-start space-x-3">
                <input
                  id="safety_agreement_checkbox"
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 rounded text-[#C59B27] focus:ring-[#C59B27] border-gray-300"
                  disabled={loading}
                  required
                />
                <label htmlFor="safety_agreement_checkbox" className="text-xs text-gray-600 leading-relaxed select-none cursor-pointer">
                  I agree to follow the <span className="font-semibold text-gray-800">Children Safety Policy</span> and consent to backgrounds eligibility screening checks required for event-day team assignment.
                </label>
              </div>
            </div>

            {/* SUBMIT BUTTON */}
            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={loading}
            >
              Submit Volunteer Request
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
