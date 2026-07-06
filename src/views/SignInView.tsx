import React, { useState } from 'react';
import { AppRoute } from '../types';
import { MobileShell } from '../components/common/MobileShell';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Mail, Lock } from 'lucide-react';
import { api, extractApiError } from '../services/api';
import { useNotification } from '../context/NotificationContext';

interface SignInViewProps {
  onNavigate: (route: AppRoute) => void;
  onSetParentEmail?: (email: string) => void;
}

export const SignInView: React.FC<SignInViewProps> = ({
  onNavigate,
  onSetParentEmail
}) => {
  const { showSuccess, showError } = useNotification();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your parent email address and password');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.auth.signIn({ email: email.trim(), password });
      if (onSetParentEmail) onSetParentEmail(email.trim());
      showSuccess('Welcome back', 'Your parent account is ready.');

      const isProfileComplete = (p: any) => {
        if (!p) return false;
        const fullName = p.fullName || p.full_name;
        const emailVal = p.email;
        const phone = p.phone || p.phone_number;
        const whatsapp = p.whatsapp || p.whatsapp_number;
        const homeAddress = p.homeAddress || p.home_address;
        const country = p.country;
        const stateRegion = p.stateRegion || p.state_region;
        const city = p.city;
        const preferredContact = p.preferredContact || p.preferred_contact;
        const hasPhoto = p.photoUrl || p.photo_file_id;
        const isWorker = p.isWorker === true || p.is_koinonia_worker === 1 || p.is_koinonia_worker === '1';
        const department = p.department;

        if (!fullName || !fullName.trim()) return false;
        if (!emailVal || !emailVal.trim()) return false;
        if (!phone || !phone.trim()) return false;
        if (!whatsapp || !whatsapp.trim()) return false;
        if (!homeAddress || !homeAddress.trim()) return false;
        if (!country || !country.trim()) return false;
        if (!stateRegion || !stateRegion.trim()) return false;
        if (!city || !city.trim()) return false;
        if (!preferredContact || !preferredContact.trim()) return false;
        if (!hasPhoto || !hasPhoto.trim()) return false;
        if (isWorker && (!department || !department.trim())) return false;
        return true;
      };

      if (isProfileComplete(res.profile)) {
        onNavigate('/parent/home');
      } else {
        onNavigate('/parent/profile-setup');
      }
    } catch (err: any) {
      const { message } = extractApiError(err);
      const displayError = message.includes('Invalid') || message.includes('User not found') || message.includes('Incorrect')
        ? 'Sign in failed. Check your email and password.'
        : message;
      setError(displayError);
      showError('Sign in failed', 'Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobileShell
      title="Parent Access"
      subtitle="Account Sign In"
      showBack
      onBack={() => onNavigate('/')}
    >
      <div className="bg-white rounded-3xl p-6 border border-[#EAE8E1] shadow-sm space-y-6">
        <div>
          <h1 className="text-2xl font-serif-koinonia font-bold text-[#18181B]">
            Sign in
          </h1>
          <p className="text-xs text-[#6B7280] mt-1">
            Continue to your parent account.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email address"
            type="email"
            placeholder="sarah@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            icon={<Mail className="w-4 h-4" />}
          />

          <div className="space-y-1">
            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              icon={<Lock className="w-4 h-4" />}
            />
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => onNavigate('/parent/forgot-password')}
                className="text-xs font-semibold text-[#B89047] hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" variant="primary" fullWidth size="lg" disabled={loading}>
              {loading ? 'Signing in...' : 'Continue'}
            </Button>
          </div>
        </form>

        <div className="pt-4 border-t border-[#EAE8E1] text-center">
          <span className="text-xs text-[#6B7280]">New here? </span>
          <button
            onClick={() => onNavigate('/parent/create-account')}
            className="text-xs font-bold text-[#B89047] hover:underline"
          >
            Create parent account
          </button>
        </div>
      </div>
    </MobileShell>
  );
};
