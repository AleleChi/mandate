import React, { useState } from 'react';
import { AppRoute } from '../types';
import { MobileShell } from '../components/common/MobileShell';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Lock, ShieldCheck } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

const generateStrongPassword = (): string => {
  const lowercase = 'abcdefghijkmnopqrstuvwxyz'; // avoided confusing 'l'
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // avoided confusing 'I', 'O'
  const numbers = '23456789'; // avoided confusing '0', '1'
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

interface NewPasswordViewProps {
  onNavigate: (route: AppRoute) => void;
}

export const NewPasswordView: React.FC<NewPasswordViewProps> = ({ onNavigate }) => {
  const { showSuccess } = useNotification();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [showPasswordNotice, setShowPasswordNotice] = useState(false);
  const [passwordType, setPasswordType] = useState<'password' | 'text'>('password');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const validatePass = (val: string) => {
    if (!val) {
      return 'Use at least 8 characters with a letter and a number.';
    }
    if (val.length < 8) {
      return 'Use at least 8 characters with a letter and a number.';
    }
    const hasLetter = /[a-zA-Z]/.test(val);
    const hasNumber = /[0-9]/.test(val);
    if (!hasLetter || !hasNumber) {
      return 'Use at least 8 characters with a letter and a number.';
    }
    return null;
  };

  const validateConfirmPass = (confirmVal: string, passVal: string) => {
    if (!confirmVal) {
      return 'Passwords do not match.';
    }
    if (confirmVal !== passVal) {
      return 'Passwords do not match.';
    }
    return null;
  };

  const handleSuggestPassword = () => {
    const strongPassword = generateStrongPassword();
    setNewPassword(strongPassword);
    setConfirmPassword(strongPassword);
    setPasswordError(null);
    setConfirmPasswordError(null);
    setTouched(true);
    setPasswordType('text');
    setShowPasswordNotice(true);
    
    // Auto-mask after 5 seconds
    setTimeout(() => {
      setPasswordType('password');
    }, 5000);
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(newPassword);
    showSuccess('Copied', 'Password copied to clipboard.');
  };

  const handlePasswordChange = (val: string) => {
    setNewPassword(val);
    setShowPasswordNotice(false);
    if (touched) {
      setPasswordError(validatePass(val));
      setConfirmPasswordError(validateConfirmPass(confirmPassword, val));
    }
  };

  const handleConfirmPasswordChange = (val: string) => {
    setConfirmPassword(val);
    if (touched) {
      setConfirmPasswordError(validateConfirmPass(val, newPassword));
    }
  };

  const handleBlur = () => {
    setTouched(true);
    setPasswordError(validatePass(newPassword));
    setConfirmPasswordError(validateConfirmPass(confirmPassword, newPassword));
  };

  const isFormValid = validatePass(newPassword) === null && validateConfirmPass(confirmPassword, newPassword) === null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const passErr = validatePass(newPassword);
    const confirmErr = validateConfirmPass(confirmPassword, newPassword);
    setPasswordError(passErr);
    setConfirmPasswordError(confirmErr);

    if (passErr || confirmErr) {
      return;
    }

    setError(null);
    setSuccess(true);
    showSuccess('Password changed', 'Your new password is ready.');
    setTimeout(() => {
      onNavigate('/parent/sign-in');
    }, 1500);
  };

  return (
    <MobileShell
      title="Security"
      subtitle="Create new password"
      showBack
      onBack={() => onNavigate('/parent/forgot-password')}
    >
      <div className="bg-white rounded-3xl p-6 border border-[#EAE8E1] shadow-sm space-y-6">
        <div>
          <h1 className="text-2xl font-serif-koinonia font-bold text-[#18181B]">
            Create new password
          </h1>
          <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">
            Choose a new secure password for your parent access account.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-medium">
            {error}
          </div>
        )}

        {success ? (
          <div className="bg-[#ECFDF5] border border-[#A7F3D0] p-5 rounded-2xl text-center space-y-2">
            <ShieldCheck className="w-8 h-8 text-[#059669] mx-auto" />
            <h3 className="text-sm font-bold text-[#065F46]">Password updated successfully</h3>
            <p className="text-xs text-[#065F46]/80">Redirecting to sign in...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1 relative">
              <div className="flex justify-between items-center -mb-7 relative z-10">
                <span className="text-sm font-semibold text-[#262626]"></span>
                <button
                  type="button"
                  onClick={handleSuggestPassword}
                  className="text-xs font-semibold text-[#B89047] hover:underline focus:outline-none cursor-pointer"
                >
                  Suggest strong password
                </button>
              </div>
              <Input
                label="New password"
                type={passwordType}
                autoComplete="new-password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => handlePasswordChange(e.target.value)}
                onBlur={handleBlur}
                error={passwordError || undefined}
                helperText="Use at least 8 characters with a letter and a number."
                icon={<Lock className="w-4 h-4" />}
              />
            </div>

            {showPasswordNotice && (
              <div className="bg-[#FAF6EC] border border-[#EBE3D3] text-[#9A7326] p-3 rounded-xl text-xs font-medium flex items-center justify-between shadow-sm">
                <span>Strong password added. Please keep it somewhere safe.</span>
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="ml-2 bg-[#B89047] hover:bg-[#A37E3A] text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition-colors cursor-pointer shrink-0"
                >
                  Copy
                </button>
              </div>
            )}

            <Input
              label="Confirm password"
              type={passwordType}
              autoComplete="new-password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => handleConfirmPasswordChange(e.target.value)}
              onBlur={handleBlur}
              error={confirmPasswordError || undefined}
              icon={<Lock className="w-4 h-4" />}
            />

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                disabled={!isFormValid}
                fullWidth
                size="lg"
              >
                Continue
              </Button>
            </div>
          </form>
        )}

        <div className="pt-4 border-t border-[#EAE8E1] text-center">
          <button
            onClick={() => onNavigate('/parent/sign-in')}
            className="text-xs font-semibold text-[#6B7280] hover:text-[#262626]"
          >
            Back to sign in
          </button>
        </div>
      </div>
    </MobileShell>
  );
};
