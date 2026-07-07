import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Eye, EyeOff } from 'lucide-react';
import { AppRoute } from '../types';
import { api, extractApiError } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { validateEmailSyntax } from '../utils/validation';
import { Button } from '../components/common/Button';
import { PhotoUploadBox } from '../components/common/PhotoUploadBox';
import { authValidation } from '../utils/authValidation';

const generateStrongPassword = (): string => {
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const allChars = lowercase + uppercase + numbers + symbols;

  let password = '';
  const getRandomChar = (charSet: string): string => {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return charSet[arr[0] % charSet.length];
  };

  password += getRandomChar(lowercase);
  password += getRandomChar(uppercase);
  password += getRandomChar(numbers);
  password += getRandomChar(symbols);

  for (let i = 4; i < 14; i++) {
    password += getRandomChar(allChars);
  }

  const passwordArr = password.split('');
  for (let i = passwordArr.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    const temp = passwordArr[i];
    passwordArr[i] = passwordArr[j];
    passwordArr[j] = temp;
  }

  return passwordArr.join('');
};

interface VolunteerCreateAccountViewProps {
  onNavigate: (route: AppRoute) => void;
  onSignInSuccess?: (user: any, profile: any) => void;
}

export const VolunteerCreateAccountView: React.FC<VolunteerCreateAccountViewProps> = ({
  onNavigate,
  onSignInSuccess
}) => {
  const { showSuccess, showWarning, showError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [isWhatsappSame, setIsWhatsappSame] = useState(false);
  const [photoRef, setPhotoRef] = useState('');
  const [isKoinoniaWorker, setIsKoinoniaWorker] = useState(false);
  const [department, setDepartment] = useState('');
  const [preferredTeam, setPreferredTeam] = useState('Check-in & Welcome');
  const [servingExperience, setServingExperience] = useState(false);
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Draft Saving and Restoring Flow (500ms debounce, 7-day expiry)
  useEffect(() => {
    try {
      const savedStr = localStorage.getItem('koinonia_volunteer_signup_draft');
      if (savedStr) {
        const draft = JSON.parse(savedStr);
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        if (draft.timestamp && Date.now() - draft.timestamp < sevenDaysMs) {
          if (draft.fullName) setFullName(draft.fullName);
          if (draft.email) setEmail(draft.email);
          if (draft.phone) setPhone(draft.phone);
          if (draft.whatsapp) setWhatsapp(draft.whatsapp);
          if (draft.isWhatsappSame !== undefined) setIsWhatsappSame(draft.isWhatsappSame);
          if (draft.isKoinoniaWorker !== undefined) setIsKoinoniaWorker(draft.isKoinoniaWorker);
          if (draft.department) setDepartment(draft.department);
          if (draft.preferredTeam) setPreferredTeam(draft.preferredTeam);
          if (draft.servingExperience !== undefined) setServingExperience(draft.servingExperience);
          if (draft.note) setNote(draft.note);
        } else {
          localStorage.removeItem('koinonia_volunteer_signup_draft');
        }
      }
    } catch (e) {
      console.warn('Failed to load signup draft:', e);
    }
  }, []);

  useEffect(() => {
    // Only save draft if anything has been input
    if (
      !fullName &&
      !email &&
      !phone &&
      !whatsapp &&
      !isKoinoniaWorker &&
      !department &&
      preferredTeam === 'Check-in & Welcome' &&
      !servingExperience &&
      !note
    ) {
      return;
    }

    const timer = setTimeout(() => {
      try {
        const draft = {
          fullName,
          email,
          phone,
          whatsapp,
          isWhatsappSame,
          isKoinoniaWorker,
          department,
          preferredTeam,
          servingExperience,
          note,
          timestamp: Date.now()
        };
        localStorage.setItem('koinonia_volunteer_signup_draft', JSON.stringify(draft));
      } catch (e) {
        console.warn('Failed to save signup draft:', e);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [
    fullName,
    email,
    phone,
    whatsapp,
    isWhatsappSame,
    isKoinoniaWorker,
    department,
    preferredTeam,
    servingExperience,
    note
  ]);

  // Password visibility
  const [passwordType, setPasswordType] = useState<'password' | 'text'>('password');
  const [showPasswordNotice, setShowPasswordNotice] = useState(false);

  // Validation feedback triggers
  const [touched, setTouched] = useState({
    fullName: false,
    email: false,
    phone: false,
    whatsapp: false,
    password: false,
    confirmPassword: false
  });

  const handleBlur = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const emailSyntaxError = validateEmailSyntax(email);
  const emailSuggestion = !emailSyntaxError.valid && emailSyntaxError.suggestion
    ? `${email.trim().split('@')[0]}@${emailSyntaxError.suggestion}`
    : null;

  const errors = {
    fullName: authValidation.fullName(fullName),
    email: authValidation.email(email),
    phone: authValidation.phone(phone),
    whatsapp: authValidation.whatsapp(isWhatsappSame ? phone : whatsapp),
    password: authValidation.password(password),
    confirmPassword: authValidation.confirmPassword(confirmPassword, password)
  };

  const cleanWhatsapp = isWhatsappSame ? phone : whatsapp;

  const requiredFieldsPresent =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    phone.trim().length > 0 &&
    cleanWhatsapp.trim().length > 0 &&
    password.length > 0 &&
    confirmPassword.length > 0 &&
    !!selectedPhotoFile &&
    (!isKoinoniaWorker || department.trim().length > 0);

  const formHasErrors =
    !!errors.fullName ||
    !!errors.email ||
    !!errors.phone ||
    (!isWhatsappSame && !!errors.whatsapp) ||
    !!errors.password ||
    !!errors.confirmPassword;

  const canSubmit =
    requiredFieldsPresent &&
    !formHasErrors &&
    !loading;

  const handleWhatsappSameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setIsWhatsappSame(checked);
    if (checked) {
      setWhatsapp(phone);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPhone(val);
    if (isWhatsappSame) {
      setWhatsapp(val);
    }
  };

  const handleSuggestPassword = () => {
    const strongPassword = generateStrongPassword();
    setPassword(strongPassword);
    setConfirmPassword(strongPassword);
    setTouched((prev) => ({
      ...prev,
      password: true,
      confirmPassword: true
    }));
    setPasswordType('text');
    setShowPasswordNotice(true);
    
    setTimeout(() => {
      setPasswordType('password');
    }, 5000);
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(password);
    showSuccess('Copied', 'Password copied to clipboard.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Mark all as touched to trigger UI messages
    setTouched({
      fullName: true,
      email: true,
      phone: true,
      whatsapp: true,
      password: true,
      confirmPassword: true
    });

    if (!selectedPhotoFile) {
      setErrorMsg('Please add a clear profile photo to continue.');
      showWarning('Photo Required', 'Please add a clear profile photo to continue.');
      return;
    }

    if (formHasErrors || !requiredFieldsPresent) {
      setErrorMsg('Please resolve all validation errors before proceeding.');
      showWarning('Form Incomplete', 'Please check the form for missing or incorrect fields.');
      return;
    }

    if (isKoinoniaWorker && !department.trim()) {
      setErrorMsg('Please specify your Koinonia department.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('fullName', fullName.trim());
      formData.append('email', email.trim().toLowerCase());
      formData.append('phone', phone.trim());
      formData.append('whatsapp', (isWhatsappSame ? phone : whatsapp).trim());
      formData.append('isKoinoniaWorker', isKoinoniaWorker ? 'true' : 'false');
      formData.append('department', isKoinoniaWorker ? department.trim() : '');
      formData.append('preferredTeam', preferredTeam);
      formData.append('servingExperience', servingExperience ? 'true' : 'false');
      formData.append('note', note.trim() || '');
      formData.append('password', password);
      
      if (selectedPhotoFile) {
        formData.append('photo', selectedPhotoFile);
      }

      const res = await api.volunteer.createAccountWithPhoto(formData);

      // Clear local draft on successful submission
      try {
        localStorage.removeItem('koinonia_volunteer_signup_draft');
      } catch (e) {
        console.warn('Failed to clear draft:', e);
      }

      if (onSignInSuccess) {
        onSignInSuccess(res.user, res.profile);
      }

      if (res.emailSent === false) {
        showWarning('Email notice', res.emailMessage || 'Account created, but we could not send the confirmation email automatically. Please use the resend button.');
      } else {
        showSuccess('Account created!', 'Check your inbox for the email confirmation link.');
      }
      onNavigate(`/volunteer/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (err: any) {
      const parsed = extractApiError(err);
      setErrorMsg(parsed.message);
      showError(parsed.message, parsed.description);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] font-sans flex flex-col pb-12">
      {/* Header Bar */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-[#EAE8E1] bg-white sticky top-0 z-10">
        <button
          onClick={() => onNavigate('/volunteer/sign-in')}
          className="p-2 -ml-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-xs font-mono font-medium text-gray-400 tracking-wider">BECOME A VOLUNTEER</span>
        <div className="w-8" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 pt-8">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EAE8E1] shadow-sm max-w-lg w-full space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold font-serif-koinonia text-[#18181B]">Volunteer Signup</h1>
            <p className="text-sm text-gray-500">Sign up to serve. All fields are verified securely.</p>
          </div>

          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-600 font-medium">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* PHOTO UPLOAD */}
            <div className="flex flex-col items-center justify-center space-y-2 pb-2">
              <label className="text-xs font-semibold text-gray-700">Profile Photo (Required)</label>
              <PhotoUploadBox
                value={photoRef}
                onUploaded={(savedRef) => setPhotoRef(savedRef)}
                onFileSelected={(file) => setSelectedPhotoFile(file)}
                purpose="volunteer_profile_photo"
                previewOnly={true}
                sizeVariant="w-28"
              />
              <p className="text-[11px] text-gray-400 text-center max-w-xs">
                Please upload a clear headshot. Only JPG, PNG, and WebP are allowed.
              </p>
            </div>

            {/* FULL NAME */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">Full Name</label>
              <input
                type="text"
                placeholder="Firstname Lastname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => handleBlur('fullName')}
                className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                disabled={loading}
              />
              {touched.fullName && errors.fullName && (
                <p className="text-xs text-red-600 font-medium ml-1">{errors.fullName}</p>
              )}
            </div>

            {/* EMAIL */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">Email Address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => handleBlur('email')}
                className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                disabled={loading}
              />
              {touched.email && errors.email && (
                <p className="text-xs text-red-600 font-medium ml-1">{errors.email}</p>
              )}
              {emailSuggestion && (
                <button
                  type="button"
                  onClick={() => {
                    setEmail(emailSuggestion);
                    setTouched((prev) => ({ ...prev, email: true }));
                  }}
                  className="text-xs text-[#C59B27] hover:underline block ml-1 text-left cursor-pointer"
                >
                  Did you mean <span className="font-semibold">{emailSuggestion}</span>?
                </button>
              )}
            </div>

            {/* PHONE */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">Phone Number (with Country Code)</label>
              <input
                type="tel"
                placeholder="+234 803 123 4567"
                value={phone}
                onChange={handlePhoneChange}
                onBlur={() => handleBlur('phone')}
                className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                disabled={loading}
              />
              {touched.phone && errors.phone && (
                <p className="text-xs text-red-600 font-medium ml-1">{errors.phone}</p>
              )}
            </div>

            {/* WHATSAPP */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700 block">WhatsApp Number</label>
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
                <input
                  type="tel"
                  placeholder="+234 803 123 4567"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  onBlur={() => handleBlur('whatsapp')}
                  className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                  disabled={loading}
                />
              )}
              {touched.whatsapp && !isWhatsappSame && errors.whatsapp && (
                <p className="text-xs text-red-600 font-medium ml-1">{errors.whatsapp}</p>
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
                  <label className="text-xs font-semibold text-gray-700 block">Department Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Protocol, Ushering, Media"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full h-10 px-4 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-white"
                    disabled={loading}
                  />
                </div>
              )}
            </div>

            {/* PREFERRED TEAM */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">Preferred Service Team</label>
              <select
                value={preferredTeam}
                onChange={(e) => setPreferredTeam(e.target.value)}
                className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                disabled={loading}
              >
                <option value="Check-in & Welcome">Check-in & Welcome</option>
                <option value="Classroom Assistant">Classroom Assistant</option>
                <option value="Media & Tech">Media & Tech</option>
                <option value="First Aid">First Aid</option>
                <option value="Security & Crowds">Security & Crowds</option>
              </select>
            </div>

            {/* EXPERIENCE SERVING CHILDREN */}
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-gray-800">Experience serving children?</h3>
                <p className="text-[11px] text-gray-500">Do you have prior experience working with minors?</p>
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
              <label className="text-xs font-semibold text-gray-700 block">Experience / Serving Note (Optional)</label>
              <textarea
                placeholder="Tell us briefly about yourself or any details you think we should know."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full p-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50 resize-none"
                disabled={loading}
              />
            </div>

            {/* PASSWORD */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700 block">Password</label>
                <button
                  type="button"
                  onClick={handleSuggestPassword}
                  className="text-xs font-semibold text-[#C59B27] hover:underline cursor-pointer"
                  disabled={loading}
                >
                  Generate Strong Password
                </button>
              </div>
              <div className="relative">
                <input
                  type={passwordType}
                  placeholder="Minimum 8 characters with letter & number"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => handleBlur('password')}
                  className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                  disabled={loading}
                />
              </div>
              {showPasswordNotice && (
                <div className="mt-1.5 p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-1.5">
                  <p className="text-[11px] text-amber-800 font-medium">
                    This password is safe and meets all complexity standards. Copy and save it safely:
                  </p>
                  <div className="flex items-center space-x-2">
                    <code className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border border-amber-200 flex-1 break-all select-all">
                      {password}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className="px-2.5 py-1 text-[11px] font-bold text-amber-900 bg-amber-200/50 hover:bg-amber-200 rounded cursor-pointer"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
              {touched.password && errors.password && (
                <p className="text-xs text-red-600 font-medium ml-1">{errors.password}</p>
              )}
            </div>

            {/* CONFIRM PASSWORD */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">Confirm Password</label>
              <input
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => handleBlur('confirmPassword')}
                className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                disabled={loading}
              />
              {touched.confirmPassword && errors.confirmPassword && (
                <p className="text-xs text-red-600 font-medium ml-1">{errors.confirmPassword}</p>
              )}
            </div>

             <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={loading}
              disabled={!canSubmit}
            >
              Submit for Review
            </Button>
            {!canSubmit && (
              <p className="text-xs text-gray-500 text-center mt-2 font-medium">
                {!selectedPhotoFile 
                  ? "Add a clear profile photo to continue."
                  : !requiredFieldsPresent
                    ? "Complete all required details to continue."
                    : "Please correct the highlighted details to continue."
                }
              </p>
            )}
          </form>

          <div className="text-center pt-2">
            <p className="text-xs text-gray-500">
              Already have an account?{' '}
              <button
                onClick={() => onNavigate('/volunteer/sign-in')}
                className="text-[#C59B27] font-semibold hover:underline cursor-pointer"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
