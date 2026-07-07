import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Sparkles, ShieldAlert } from 'lucide-react';
import { AppRoute, ParentProfile } from '../types';
import { api, extractApiError } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { Button } from '../components/common/Button';
import { PhotoUploadBox } from '../components/common/PhotoUploadBox';

interface VolunteerRequestViewProps {
  onNavigate: (route: AppRoute) => void;
  parentProfile: ParentProfile;
  onRefreshAccess?: () => Promise<void>;
}

export const VolunteerRequestView: React.FC<VolunteerRequestViewProps> = ({
  onNavigate,
  parentProfile,
  onRefreshAccess
}) => {
  const { showSuccess, showError, showWarning } = useNotification();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields prefilled from parentProfile
  const [fullName, setFullName] = useState(parentProfile?.fullName || '');
  const [email] = useState(parentProfile?.email || '');
  const [phone, setPhone] = useState(parentProfile?.phone || '');
  const [whatsapp, setWhatsapp] = useState(parentProfile?.whatsapp || parentProfile?.phone || '');
  const [isWhatsappSame, setIsWhatsappSame] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(parentProfile?.photoUrl || '');
  const [isKoinoniaWorker, setIsKoinoniaWorker] = useState(parentProfile?.isWorker || false);
  const [department, setDepartment] = useState(parentProfile?.department || '');
  const [preferredTeam, setPreferredTeam] = useState('Check-in Team');
  const [servingExperience, setServingExperience] = useState(false);
  const [note, setNote] = useState('');
  const [agreed, setAgreed] = useState(false);

  // Synchronize whatsapp if same checkbox is enabled
  useEffect(() => {
    if (isWhatsappSame) {
      setWhatsapp(phone);
    }
  }, [phone, isWhatsappSame]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreed) {
      showWarning('Consent Required', 'You must agree to the Children Safety Policy & background checks to apply.');
      return;
    }

    if (!fullName.trim() || !phone.trim() || !preferredTeam.trim()) {
      showWarning('Fields Required', 'Please fill in all required fields (Name, Phone, Preferred Team).');
      return;
    }

    if (isKoinoniaWorker && !department.trim()) {
      showWarning('Department Required', 'Please specify your Koinonia department.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);

    try {
      const payload = {
        fullName: fullName.trim(),
        phone: phone.trim(),
        whatsapp: (isWhatsappSame ? phone : whatsapp).trim(),
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
        <span className="text-sm font-bold font-serif-koinonia text-[#18181B] tracking-wide uppercase">Volunteer Request</span>
        <div className="w-8" />
      </div>

      <div className="flex-1 max-w-md w-full mx-auto p-4 space-y-6">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EAE8E1] shadow-sm space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold font-serif-koinonia text-[#18181B]">Volunteer with Children & Teens</h1>
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
                onChange={(e) => setPhone(e.target.value)}
                className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                disabled={loading}
                required
              />
            </div>

            {/* WHATSAPP */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700 block">WhatsApp Number</label>
                <label className="flex items-center space-x-1.5 text-xs text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isWhatsappSame}
                    onChange={(e) => setIsWhatsappSame(e.target.checked)}
                    className="rounded text-[#C59B27] focus:ring-[#C59B27] border-gray-300"
                    disabled={loading}
                  />
                  <span>Same as phone</span>
                </label>
              </div>
              {!isWhatsappSame && (
                <input
                  type="tel"
                  placeholder="+234 803 123 4567"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                  disabled={loading}
                />
              )}
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
