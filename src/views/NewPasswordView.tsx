import React, { useState } from 'react';
import { AppRoute } from '../types';
import { MobileShell } from '../components/common/MobileShell';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Lock, ShieldCheck } from 'lucide-react';

interface NewPasswordViewProps {
  onNavigate: (route: AppRoute) => void;
}

export const NewPasswordView: React.FC<NewPasswordViewProps> = ({ onNavigate }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError(null);
    setSuccess(true);
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
            <Input
              label="New password"
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
            />

            <Input
              label="Confirm password"
              type="password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
            />

            <div className="pt-2">
              <Button type="submit" variant="primary" fullWidth size="lg">
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
