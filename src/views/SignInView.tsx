import React, { useState } from 'react';
import { AppRoute } from '../types';
import { MobileShell } from '../components/common/MobileShell';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Mail, Lock } from 'lucide-react';
import { api } from '../services/api';

interface SignInViewProps {
  onNavigate: (route: AppRoute) => void;
  onSetParentEmail?: (email: string) => void;
}

export const SignInView: React.FC<SignInViewProps> = ({
  onNavigate,
  onSetParentEmail
}) => {
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
      await api.auth.signIn({ email: email.trim(), password });
      if (onSetParentEmail) onSetParentEmail(email.trim());
      onNavigate('/parent/home');
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
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
