import React, { useState, useRef, useEffect } from 'react';
import { AppRoute, ParentProfile } from '../types';
import { ArrowLeft, Camera, Info } from 'lucide-react';
import { api } from '../services/api';

interface ProfileSetupViewProps {
  onNavigate: (route: AppRoute) => void;
  initialProfile: ParentProfile;
  onUpdateProfile: (profile: ParentProfile) => void;
  mode?: 'onboarding' | 'edit';
}

export const ProfileSetupView: React.FC<ProfileSetupViewProps> = ({
  onNavigate,
  initialProfile,
  onUpdateProfile,
  mode = 'onboarding'
}) => {
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>(initialProfile.photoUrl || '');
  const [fullName, setFullName] = useState<string>(initialProfile.fullName || '');
  const [email, setEmail] = useState<string>(initialProfile.email || '');
  const [phone, setPhone] = useState<string>(initialProfile.phone || '');
  const [whatsapp, setWhatsapp] = useState<string>(initialProfile.whatsapp || '');
  const [homeAddress, setHomeAddress] = useState<string>(initialProfile.homeAddress || '');
  const [preferredContact, setPreferredContact] = useState<'Email' | 'WhatsApp' | 'Both'>(
    (initialProfile.preferredContact as 'Email' | 'WhatsApp' | 'Both') || 'WhatsApp'
  );
  const [isWorker, setIsWorker] = useState<boolean>(initialProfile.isWorker || false);
  const [department, setDepartment] = useState<string>(initialProfile.department || '');

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPhotoUrl(initialProfile.photoUrl || '');
    setFullName(initialProfile.fullName || '');
    setEmail(initialProfile.email || '');
    setPhone(initialProfile.phone || '');
    setWhatsapp(initialProfile.whatsapp || '');
    setHomeAddress(initialProfile.homeAddress || '');
    setPreferredContact((initialProfile.preferredContact as 'Email' | 'WhatsApp' | 'Both') || 'WhatsApp');
    setIsWorker(initialProfile.isWorker || false);
    setDepartment(initialProfile.department || '');
  }, [initialProfile]);

  // Field check logic
  const validateField = (field: string): string => {
    switch (field) {
      case 'photoUrl':
        if (mode === 'onboarding' && (!photoUrl || !photoUrl.trim())) {
          return 'Add a clear photo of your face.';
        }
        if (mode === 'edit' && (!photoUrl || !photoUrl.trim()) && (!initialProfile.photoUrl || !initialProfile.photoUrl.trim())) {
          return 'Add a clear photo of your face.';
        }
        break;
      case 'fullName':
        if (!fullName || !fullName.trim()) return 'Enter your full name.';
        if (fullName.trim().split(/\s+/).length < 2) return 'Enter your full name.';
        break;
      case 'email':
        if (!email || !email.trim()) return 'Enter a valid email address.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
        break;
      case 'phone':
        if (!phone || !phone.trim()) return 'Enter a valid phone number.';
        if (phone.replace(/\D/g, '').length < 10) return 'Enter a valid phone number.';
        break;
      case 'whatsapp': {
        const effectiveWa = whatsapp.trim() || (phone.replace(/\D/g, '').length >= 10 ? phone : '');
        if (!effectiveWa) return 'Enter a valid WhatsApp number.';
        if (effectiveWa.replace(/\D/g, '').length < 10) return 'Enter a valid WhatsApp number.';
        break;
      }
      case 'homeAddress':
        if (!homeAddress || !homeAddress.trim() || homeAddress.trim().length < 5) {
          return 'Enter your home address.';
        }
        break;
      case 'preferredContact':
        if (!preferredContact) return 'Choose how you prefer to be contacted.';
        break;
      case 'isWorker':
        if (isWorker === undefined || isWorker === null) return 'Choose Yes or No.';
        break;
      case 'department':
        if (isWorker && (!department || !department.trim())) {
          return 'Enter your department.';
        }
        break;
      default:
        return '';
    }
    return '';
  };

  const getError = (field: string): string => {
    if (!touched[field]) return '';
    return validateField(field);
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSameAsPhone = () => {
    if (phone) {
      setWhatsapp(phone);
      setTouched((prev) => ({ ...prev, whatsapp: true }));
    }
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setIsUploadingPhoto(true);
        setErrorMsg(null);
        if (api.getToken()) {
          const res = await api.media.uploadFile(file, 'parent_profile_photo');
          setPhotoUrl(res.secureUrl || res.url);
        } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              setPhotoUrl(event.target.result as string);
            }
          };
          reader.readAsDataURL(file);
        }
        setTouched((prev) => ({ ...prev, photoUrl: true }));
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to upload photo');
      } finally {
        setIsUploadingPhoto(false);
      }
    } else {
      if (!photoUrl) {
        setPhotoUrl('https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80');
        setTouched((prev) => ({ ...prev, photoUrl: true }));
      }
    }
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();

    const fieldsToValidate = [
      'photoUrl',
      'fullName',
      'email',
      'phone',
      'whatsapp',
      'homeAddress',
      'preferredContact',
      'isWorker',
      ...(isWorker ? ['department'] : [])
    ];

    const newTouched: Record<string, boolean> = {};
    let hasError = false;

    fieldsToValidate.forEach((field) => {
      newTouched[field] = true;
      if (validateField(field)) {
        hasError = true;
      }
    });

    setTouched((prev) => ({ ...prev, ...newTouched }));

    if (hasError) {
      return;
    }

    const effectiveWhatsapp = whatsapp.trim() || phone;
    const updatedProfile = {
      ...initialProfile,
      photoUrl,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      whatsapp: effectiveWhatsapp,
      homeAddress: homeAddress.trim(),
      preferredContact,
      isWorker,
      department: isWorker ? department.trim() : ''
    };

    onUpdateProfile(updatedProfile);

    setSaving(true);
    setErrorMsg(null);
    try {
      if (api.getToken()) {
        await api.parent.updateProfile(updatedProfile);
      }
      if (mode === 'edit') {
        onNavigate('/parent/profile');
      } else {
        onNavigate('/parent/home');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndFinishLater = () => {
    onUpdateProfile({
      ...initialProfile,
      photoUrl,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim() || phone.trim(),
      homeAddress: homeAddress.trim(),
      preferredContact,
      isWorker,
      department: isWorker ? department.trim() : ''
    });
    onNavigate('/parent/home');
  };

  const handleCancel = () => {
    onNavigate('/parent/profile');
  };

  return (
    <div className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 px-4.5 pb-10">
      <div className="space-y-5">
        {/* 1. Top bar */}
        <div className="pt-5 pb-1 flex items-center space-x-3.5">
          <button
            type="button"
            onClick={mode === 'edit' ? handleCancel : () => onNavigate('/parent/check-email')}
            className="p-1 -ml-1 text-[#715D3A] hover:text-[#18181B] transition-colors cursor-pointer focus:outline-none"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.25]" />
          </button>
          <span className="text-base sm:text-lg font-serif-koinonia font-bold text-[#715D3A] tracking-tight">
            {mode === 'edit' ? 'Edit details' : 'Parent Profile'}
          </span>
        </div>

        {/* 2. Intro text */}
        {mode !== 'edit' && (
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-serif-koinonia font-bold text-[#715D3A] leading-tight">
              Set up your profile
            </h1>
            <p className="text-xs sm:text-sm text-[#3F3F46] leading-relaxed">
              Add your details so the team can contact you when needed.
            </p>
          </div>
        )}

        <form onSubmit={handleContinue} className="space-y-5" noValidate>
          {/* 3. Photo upload card */}
          <div className="bg-white rounded-2xl p-5 border border-[#EAE8E1] shadow-2xs text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <div
              onClick={handlePhotoClick}
              className="w-28 h-28 mx-auto bg-[#FAF8F4] hover:bg-[#F4F1EA] rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-colors border border-[#EAE8E1] relative overflow-hidden group"
            >
              {photoUrl ? (
                <>
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-semibold">
                    Change photo
                  </div>
                </>
              ) : (
                <>
                  <Camera className="w-6 h-6 text-[#715D3A] stroke-[1.75] mb-1.5" />
                  <span className="text-xs font-bold text-[#715D3A]">Add Photo</span>
                </>
              )}
            </div>

            <span className="text-xs text-[#3F3F46] mt-3 block font-medium">
              Use a clear photo of your face.
            </span>

            {getError('photoUrl') && (
              <p className="text-xs text-[#C53030] mt-2 font-medium">
                {getError('photoUrl')}
              </p>
            )}
          </div>

          {/* 4. Form fields */}
          <div className="space-y-4">
            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="text-xs font-bold text-[#3F3F46] tracking-wide block mb-1.5">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                placeholder="e.g. Jane Doe"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (touched.fullName) setTouched((prev) => ({ ...prev, fullName: true }));
                }}
                onBlur={() => handleBlur('fullName')}
                className={`w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none transition-colors ${
                  getError('fullName')
                    ? 'border-[#C53030] border-b-[#C53030]'
                    : 'border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27]'
                }`}
              />
              {getError('fullName') && (
                <p className="text-xs text-[#C53030] mt-1.5 font-medium">{getError('fullName')}</p>
              )}
            </div>

            {/* Email Address */}
            <div>
              <label htmlFor="email" className="text-xs font-bold text-[#3F3F46] tracking-wide block mb-1.5">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (touched.email) setTouched((prev) => ({ ...prev, email: true }));
                }}
                onBlur={() => handleBlur('email')}
                className={`w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none transition-colors ${
                  getError('email')
                    ? 'border-[#C53030] border-b-[#C53030]'
                    : 'border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27]'
                }`}
              />
              {getError('email') && (
                <p className="text-xs text-[#C53030] mt-1.5 font-medium">{getError('email')}</p>
              )}
            </div>

            {/* Phone Number */}
            <div>
              <label htmlFor="phone" className="text-xs font-bold text-[#3F3F46] tracking-wide block mb-1.5">
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (touched.phone) setTouched((prev) => ({ ...prev, phone: true }));
                }}
                onBlur={() => handleBlur('phone')}
                className={`w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none transition-colors ${
                  getError('phone')
                    ? 'border-[#C53030] border-b-[#C53030]'
                    : 'border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27]'
                }`}
              />
              {getError('phone') && (
                <p className="text-xs text-[#C53030] mt-1.5 font-medium">{getError('phone')}</p>
              )}
            </div>

            {/* WhatsApp Number */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="whatsapp" className="text-xs font-bold text-[#3F3F46] tracking-wide">
                  WhatsApp Number
                </label>
                <button
                  type="button"
                  onClick={handleSameAsPhone}
                  className="text-xs font-semibold text-[#B89047] hover:underline cursor-pointer focus:outline-none"
                >
                  Same as phone
                </button>
              </div>
              <input
                id="whatsapp"
                type="tel"
                placeholder="Same as phone"
                value={whatsapp}
                onChange={(e) => {
                  setWhatsapp(e.target.value);
                  if (touched.whatsapp) setTouched((prev) => ({ ...prev, whatsapp: true }));
                }}
                onBlur={() => handleBlur('whatsapp')}
                className={`w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none transition-colors ${
                  getError('whatsapp')
                    ? 'border-[#C53030] border-b-[#C53030]'
                    : 'border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27]'
                }`}
              />
              {getError('whatsapp') && (
                <p className="text-xs text-[#C53030] mt-1.5 font-medium">{getError('whatsapp')}</p>
              )}
            </div>

            {/* Home Address */}
            <div>
              <label htmlFor="homeAddress" className="text-xs font-bold text-[#3F3F46] tracking-wide block mb-1.5">
                Home Address
              </label>
              <input
                id="homeAddress"
                type="text"
                placeholder="123 Main St, City"
                value={homeAddress}
                onChange={(e) => {
                  setHomeAddress(e.target.value);
                  if (touched.homeAddress) setTouched((prev) => ({ ...prev, homeAddress: true }));
                }}
                onBlur={() => handleBlur('homeAddress')}
                className={`w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none transition-colors ${
                  getError('homeAddress')
                    ? 'border-[#C53030] border-b-[#C53030]'
                    : 'border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27]'
                }`}
              />
              {getError('homeAddress') && (
                <p className="text-xs text-[#C53030] mt-1.5 font-medium">{getError('homeAddress')}</p>
              )}
            </div>
          </div>

          {/* 5. Preferred contact radio group */}
          <div className="pt-2">
            <span className="text-xs font-bold text-[#3F3F46] tracking-wide block mb-2.5" id="preferred-contact-label">
              Preferred Contact
            </span>
            <div className="flex items-center space-x-6" role="radiogroup" aria-labelledby="preferred-contact-label">
              {(['Email', 'WhatsApp', 'Both'] as const).map((option) => {
                const selected = preferredContact === option;
                return (
                  <label
                    key={option}
                    className="flex items-center space-x-2 cursor-pointer select-none"
                    onClick={() => {
                      setPreferredContact(option);
                      if (touched.preferredContact) setTouched((prev) => ({ ...prev, preferredContact: true }));
                    }}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${
                        selected
                          ? 'border-2 border-[#715D3A] bg-white'
                          : 'border-[#D9D6CE] bg-white'
                      }`}
                    >
                      {selected && <span className="w-2 h-2 rounded-full bg-[#715D3A]" />}
                    </span>
                    <span className="text-sm font-medium text-[#18181B]">{option}</span>
                  </label>
                );
              })}
            </div>
            {getError('preferredContact') && (
              <p className="text-xs text-[#C53030] mt-1.5 font-medium">{getError('preferredContact')}</p>
            )}
          </div>

          <div className="border-t border-[#FAF8F4] my-2" />

          {/* 6. Koinonia worker segmented control */}
          <div className="space-y-2.5">
            <span className="text-sm font-semibold text-[#18181B] block" id="worker-label">
              Are you a Koinonia worker?
            </span>
            <div
              className="bg-[#FAF8F4] border border-[#EAE8E1] p-1 rounded-xl grid grid-cols-2 gap-1.5"
              role="group"
              aria-labelledby="worker-label"
            >
              <button
                type="button"
                onClick={() => {
                  setIsWorker(true);
                  if (touched.isWorker) setTouched((prev) => ({ ...prev, isWorker: true }));
                }}
                className={`py-2.5 rounded-lg text-sm font-semibold transition-all focus:outline-none cursor-pointer ${
                  isWorker
                    ? 'bg-white text-[#715D3A] shadow-2xs border border-[#E5D5AE]/60'
                    : 'text-[#3F3F46] hover:text-[#18181B] font-medium'
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsWorker(false);
                  setDepartment('');
                  if (touched.isWorker) setTouched((prev) => ({ ...prev, isWorker: true }));
                }}
                className={`py-2.5 rounded-lg text-sm font-semibold transition-all focus:outline-none cursor-pointer ${
                  !isWorker
                    ? 'bg-white text-[#715D3A] shadow-2xs border border-[#E5D5AE]/60'
                    : 'text-[#3F3F46] hover:text-[#18181B] font-medium'
                }`}
              >
                No
              </button>
            </div>
            {getError('isWorker') && (
              <p className="text-xs text-[#C53030] mt-1 font-medium">{getError('isWorker')}</p>
            )}

            {/* 7. Department field if Yes is selected */}
            {isWorker && (
              <div className="pt-2">
                <label htmlFor="department" className="text-xs font-bold text-[#3F3F46] tracking-wide block mb-1.5">
                  Department
                </label>
                <input
                  id="department"
                  type="text"
                  placeholder="Children Ministry"
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    if (touched.department) setTouched((prev) => ({ ...prev, department: true }));
                  }}
                  onBlur={() => handleBlur('department')}
                  className={`w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none transition-colors ${
                    getError('department')
                      ? 'border-[#C53030] border-b-[#C53030]'
                      : 'border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27]'
                  }`}
                />
                {getError('department') && (
                  <p className="text-xs text-[#C53030] mt-1.5 font-medium">{getError('department')}</p>
                )}
              </div>
            )}
          </div>

          {/* 8. Safety note card */}
          <div className="bg-[#FDF8EE] border border-[#F0DFA8] rounded-xl p-3.5 sm:p-4 flex items-start space-x-3 shadow-2xs text-xs text-[#715D3A] font-medium">
            <Info className="w-4 h-4 shrink-0 mt-0.5 stroke-[2]" />
            <p className="leading-relaxed">
              Your photo and contact details may be checked during pickup to ensure community safety.
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-medium mt-2">
              {errorMsg}
            </div>
          )}

          {/* 9. Primary button */}
          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3.5 px-4 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-sm transition-all shadow-2xs cursor-pointer focus:outline-none disabled:opacity-60"
            >
              {saving ? 'Saving...' : (mode === 'edit' ? 'Save changes' : 'Continue')}
            </button>

            {/* 10. Secondary action */}
            <button
              type="button"
              onClick={mode === 'edit' ? handleCancel : handleSaveAndFinishLater}
              className="w-full py-2 text-xs sm:text-sm font-medium text-[#3F3F46] hover:text-[#18181B] transition-colors cursor-pointer focus:outline-none block text-center"
            >
              {mode === 'edit' ? 'Cancel' : 'Save and finish later'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
