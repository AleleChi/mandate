import React, { useState, useRef, useEffect } from 'react';
import { AppRoute, ParentProfile } from '../types';
import { ArrowLeft, Info } from 'lucide-react';
import { api, extractApiError } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { PhotoUploadBox } from '../components/common/PhotoUploadBox';
import { validateName, validateEmailSyntax, validatePhone } from '../utils/validation';
import { Button } from '../components/common/Button';
import { AuthScreenShell } from '../components/common/AuthScreenShell';

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
  const { showSuccess, showError } = useNotification();
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>(initialProfile.photoUrl || '');
  const [fullName, setFullName] = useState<string>(initialProfile.fullName || '');
  const [email, setEmail] = useState<string>(initialProfile.email || '');
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>(initialProfile.phone || '');
  const [whatsapp, setWhatsapp] = useState<string>(initialProfile.whatsapp || '');
  const [homeAddress, setHomeAddress] = useState<string>(initialProfile.homeAddress || '');

  const commonCountries = [
    'Nigeria',
    'United Kingdom',
    'United States',
    'Canada',
    'Ghana',
    'South Africa',
    'Kenya',
    'Cameroon'
  ];

  const [country, setCountry] = useState<string>(() => {
    const val = initialProfile.country || '';
    if (!val) return '';
    return commonCountries.includes(val) ? val : 'Other';
  });
  const [customCountry, setCustomCountry] = useState<string>(() => {
    const val = initialProfile.country || '';
    if (!val) return '';
    return commonCountries.includes(val) ? '' : val;
  });
  const [stateRegion, setStateRegion] = useState<string>(initialProfile.stateRegion || '');
  const [city, setCity] = useState<string>(initialProfile.city || '');

  const [preferredContact, setPreferredContact] = useState<'Email' | 'WhatsApp' | 'Both'>(
    (initialProfile.preferredContact as 'Email' | 'WhatsApp' | 'Both') || 'WhatsApp'
  );
  const [isWorker, setIsWorker] = useState<boolean>(initialProfile.isWorker || false);
  const [department, setDepartment] = useState<string>(initialProfile.department || '');

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setPhotoUrl(initialProfile.photoUrl || '');
    setFullName(initialProfile.fullName || '');
    setEmail(initialProfile.email || '');
    setPhone(initialProfile.phone || '');
    setWhatsapp(initialProfile.whatsapp || '');
    setHomeAddress(initialProfile.homeAddress || '');
    
    const val = initialProfile.country || '';
    if (val) {
      if (commonCountries.includes(val)) {
        setCountry(val);
        setCustomCountry('');
      } else {
        setCountry('Other');
        setCustomCountry(val);
      }
    } else {
      setCountry('');
      setCustomCountry('');
    }

    setStateRegion(initialProfile.stateRegion || '');
    setCity(initialProfile.city || '');
    setPreferredContact((initialProfile.preferredContact as 'Email' | 'WhatsApp' | 'Both') || 'WhatsApp');
    setIsWorker(initialProfile.isWorker || false);
    setDepartment(initialProfile.department || '');
  }, [initialProfile]);

  // Field check logic
  const validateField = (field: string): string => {
    switch (field) {
      case 'photoUrl':
        if (!photoUrl || !photoUrl.trim()) {
          return 'Add your photo.';
        }
        break;
      case 'fullName': {
        const err = validateName(fullName);
        if (err) return err;
        break;
      }
      case 'email': {
        const res = validateEmailSyntax(email);
        if (!res.valid) {
          return res.message || 'Enter a valid email address.';
        }
        break;
      }
      case 'phone': {
        const err = validatePhone(phone, 'NG');
        if (err) return err;
        break;
      }
      case 'whatsapp': {
        const effectiveWa = whatsapp.trim() || phone.trim();
        const err = validatePhone(effectiveWa, 'NG');
        if (err) return 'Enter a valid WhatsApp number.';
        break;
      }
      case 'homeAddress':
        if (!homeAddress || !homeAddress.trim()) {
          return 'Add your home address.';
        }
        break;
      case 'country':
        if (!country || !country.trim()) {
          return 'Choose your country.';
        }
        if (country === 'Other' && (!customCountry || !customCountry.trim())) {
          return 'Enter country name.';
        }
        break;
      case 'stateRegion':
        if (!stateRegion || !stateRegion.trim()) {
          return 'Enter your state or region.';
        }
        break;
      case 'city':
        if (!city || !city.trim()) {
          return 'Enter your city.';
        }
        break;
      case 'preferredContact':
        if (!preferredContact) return 'Choose how we should contact you.';
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
    if (serverErrors[field]) return serverErrors[field];
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

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();

    const fieldsToValidate = [
      'photoUrl',
      'fullName',
      'email',
      'phone',
      'whatsapp',
      'homeAddress',
      'country',
      'stateRegion',
      'city',
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
    setServerErrors({});

    if (hasError) {
      return;
    }

    const finalCountry = country === 'Other' ? customCountry.trim() : country.trim();
    const effectiveWhatsapp = whatsapp.trim() || phone;
    const updatedProfile = {
      ...initialProfile,
      photoUrl,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      whatsapp: effectiveWhatsapp,
      homeAddress: homeAddress.trim(),
      country: finalCountry,
      stateRegion: stateRegion.trim(),
      city: city.trim(),
      preferredContact,
      isWorker,
      department: isWorker ? department.trim() : ''
    };

    setSaving(true);
    setErrorMsg(null);
    try {
      if (api.getToken()) {
        const res = await api.parent.updateProfile(updatedProfile);
        onUpdateProfile(res);
      } else {
        onUpdateProfile(updatedProfile);
      }
      if (mode === 'edit') {
        showSuccess('Profile updated', 'Your details have been saved.');
        onNavigate('/parent/profile');
      } else {
        showSuccess('Profile completed', 'You can now add each child’s details.');
        onNavigate('/parent/home');
      }
    } catch (err: any) {
      if (err.data && err.data.errorsMap) {
        const newServerErrs: Record<string, string> = {};
        Object.keys(err.data.errorsMap).forEach((field) => {
          newServerErrs[field] = err.data.errorsMap[field].message;
        });
        setServerErrors(newServerErrs);
        const firstErrMsg = err.data.error || 'Please check the highlighted fields.';
        setErrorMsg(firstErrMsg);
        showError('Validation failed', firstErrMsg);
      } else {
        const { message } = extractApiError(err);
        setErrorMsg(message);
        showError('We could not save your profile', 'Please check your connection and try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndFinishLater = () => {
    const finalCountry = country === 'Other' ? customCountry.trim() : country.trim();
    onUpdateProfile({
      ...initialProfile,
      photoUrl,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim() || phone.trim(),
      homeAddress: homeAddress.trim(),
      country: finalCountry,
      stateRegion: stateRegion.trim(),
      city: city.trim(),
      preferredContact,
      isWorker,
      department: isWorker ? department.trim() : ''
    });
    onNavigate('/parent/home');
  };

  const handleCancel = () => {
    onNavigate('/parent/profile');
  };

  const isProfileFormValid = 
    photoUrl.trim() !== '' &&
    validateField('fullName') === '' &&
    validateField('email') === '' &&
    validateField('phone') === '' &&
    validateField('whatsapp') === '' &&
    validateField('homeAddress') === '' &&
    validateField('country') === '' &&
    validateField('stateRegion') === '' &&
    validateField('city') === '' &&
    preferredContact !== undefined &&
    isWorker !== null &&
    (!isWorker || validateField('department') === '');

  return (
    <AuthScreenShell
      dataViewVersion="parent-profile-setup-soft-surface-v1"
      showBack
      onBack={mode === 'edit' ? handleCancel : () => onNavigate('/parent/check-email')}
      maxWidth="md"
    >
      <div className="space-y-5">
        {/* Intro text */}
        <div className="text-center space-y-1.5 mb-2">
          <h1 className="text-2xl font-serif-koinonia font-bold text-[#18181B] leading-tight">
            {mode === 'edit' ? 'Edit details' : 'Set up your profile'}
          </h1>
          {mode !== 'edit' && (
            <p className="text-xs sm:text-sm text-[#3F3F46] leading-relaxed max-w-sm mx-auto">
              Add your details so the team can contact you when needed.
            </p>
          )}
        </div>

        <form onSubmit={handleContinue} className="space-y-5" noValidate>
          {/* 3. Photo upload card */}
          <div className="bg-white rounded-2xl p-5 border border-[#EAE8E1] shadow-2xs text-center">
            <PhotoUploadBox
              value={photoUrl}
              onUploaded={(url) => {
                setPhotoUrl(url);
                setTouched((prev) => ({ ...prev, photoUrl: true }));
              }}
              label="Add Photo"
              helperText="Use a clear photo of your face."
              purpose="parent_profile_photo"
              error={getError('photoUrl')}
              onUploadingStateChange={(uploading) => {
                setIsUploadingPhoto(uploading);
              }}
            />
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
                  const val = e.target.value;
                  setEmail(val);
                  if (touched.email) setTouched((prev) => ({ ...prev, email: true }));
                  const res = validateEmailSyntax(val);
                  if (!res.valid && res.suggestion) {
                    const [local] = val.trim().split('@');
                    setEmailSuggestion(`${local}@${res.suggestion}`);
                  } else {
                    setEmailSuggestion(null);
                  }
                }}
                onBlur={() => {
                  handleBlur('email');
                  const res = validateEmailSyntax(email);
                  if (!res.valid && res.suggestion) {
                    const [local] = email.trim().split('@');
                    setEmailSuggestion(`${local}@${res.suggestion}`);
                  } else {
                    setEmailSuggestion(null);
                  }
                }}
                className={`w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none transition-colors ${
                  getError('email')
                    ? 'border-[#C53030] border-b-[#C53030]'
                    : 'border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27]'
                }`}
              />
              {getError('email') && (
                <p className="text-xs text-[#C53030] mt-1.5 font-medium">{getError('email')}</p>
              )}
              {emailSuggestion && (
                <div className="mt-1.5 text-xs text-[#B89047] font-semibold bg-[#FAF6EC] border border-[#EBE3D3] p-2 px-3 rounded-xl flex items-center justify-between">
                  <span>Did you mean <strong>{emailSuggestion}</strong>?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(emailSuggestion);
                      setEmailSuggestion(null);
                    }}
                    className="ml-2 bg-[#B89047] hover:bg-[#A37E3A] text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition-colors cursor-pointer focus:outline-none shrink-0"
                  >
                    Apply
                  </button>
                </div>
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

            {/* Country */}
            <div>
              <label htmlFor="country" className="text-xs font-bold text-[#3F3F46] tracking-wide block mb-1.5">
                Country
              </label>
              <div className="relative">
                <select
                  id="country"
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    if (touched.country) setTouched((prev) => ({ ...prev, country: true }));
                  }}
                  onBlur={() => handleBlur('country')}
                  className={`w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-sm text-[#18181B] focus:outline-none transition-colors appearance-none cursor-pointer ${
                    getError('country')
                      ? 'border-[#C53030] border-b-[#C53030]'
                      : 'border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27]'
                  }`}
                >
                  <option value="" disabled className="text-[#D9D6CE]">Select country</option>
                  <option value="Nigeria">Nigeria</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="United States">United States</option>
                  <option value="Canada">Canada</option>
                  <option value="Ghana">Ghana</option>
                  <option value="South Africa">South Africa</option>
                  <option value="Kenya">Kenya</option>
                  <option value="Cameroon">Cameroon</option>
                  <option value="Other">Other</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#715D3A]">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
              {getError('country') && (
                <p className="text-xs text-[#C53030] mt-1.5 font-medium">{getError('country')}</p>
              )}
            </div>

            {/* Custom Country Name */}
            {country === 'Other' && (
              <div>
                <label htmlFor="customCountry" className="text-xs font-bold text-[#3F3F46] tracking-wide block mb-1.5">
                  Country Name
                </label>
                <input
                  id="customCountry"
                  type="text"
                  placeholder="Enter country name"
                  value={customCountry}
                  onChange={(e) => {
                    setCustomCountry(e.target.value);
                    if (touched.country) setTouched((prev) => ({ ...prev, country: true }));
                  }}
                  className={`w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none transition-colors ${
                    getError('country') && !customCountry.trim()
                      ? 'border-[#C53030] border-b-[#C53030]'
                      : 'border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27]'
                  }`}
                />
              </div>
            )}

            {/* State / Region */}
            <div>
              <label htmlFor="stateRegion" className="text-xs font-bold text-[#3F3F46] tracking-wide block mb-1.5">
                State / Region
              </label>
              <input
                id="stateRegion"
                type="text"
                placeholder="Enter state or region"
                value={stateRegion}
                onChange={(e) => {
                  setStateRegion(e.target.value);
                  if (touched.stateRegion) setTouched((prev) => ({ ...prev, stateRegion: true }));
                }}
                onBlur={() => handleBlur('stateRegion')}
                className={`w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none transition-colors ${
                  getError('stateRegion')
                    ? 'border-[#C53030] border-b-[#C53030]'
                    : 'border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27]'
                }`}
              />
              {getError('stateRegion') && (
                <p className="text-xs text-[#C53030] mt-1.5 font-medium">{getError('stateRegion')}</p>
              )}
            </div>

            {/* City */}
            <div>
              <label htmlFor="city" className="text-xs font-bold text-[#3F3F46] tracking-wide block mb-1.5">
                City
              </label>
              <input
                id="city"
                type="text"
                placeholder="Enter city"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  if (touched.city) setTouched((prev) => ({ ...prev, city: true }));
                }}
                onBlur={() => handleBlur('city')}
                className={`w-full bg-white border border-b-2 rounded-lg px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-[#D9D6CE] focus:outline-none transition-colors ${
                  getError('city')
                    ? 'border-[#C53030] border-b-[#C53030]'
                    : 'border-[#EAE8E1] border-b-[#D9D6CE] focus:border-b-[#C59B27]'
                }`}
              />
              {getError('city') && (
                <p className="text-xs text-[#C53030] mt-1.5 font-medium">{getError('city')}</p>
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
            <Button
              type="submit"
              disabled={saving || isUploadingPhoto || !isProfileFormValid}
              fullWidth
              size="lg"
            >
              {saving ? 'Saving...' : (isUploadingPhoto ? 'Uploading photo...' : (mode === 'edit' ? 'Save changes' : 'Continue'))}
            </Button>

            {/* 10. Secondary action */}
            <button
              type="button"
              disabled={saving || isUploadingPhoto}
              onClick={mode === 'edit' ? handleCancel : handleSaveAndFinishLater}
              className="w-full py-2 text-xs sm:text-sm font-medium text-[#3F3F46] hover:text-[#18181B] transition-colors cursor-pointer focus:outline-none block text-center disabled:opacity-55"
            >
              {mode === 'edit' ? 'Cancel' : 'Save and finish later'}
            </button>
          </div>
        </form>
      </div>
    </AuthScreenShell>
  );
};
