import React, { useState, useEffect } from 'react';
import { AppRoute } from '../../types';
import { Heart, Lock, Eye, EyeOff, CheckCircle2, AlertTriangle, Clock, RefreshCw, MailX } from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';

interface VolunteerAcceptInviteViewProps {
  onNavigate: (route: AppRoute) => void;
}

type InviteStatus = 'verifying' | 'valid' | 'expired' | 'used' | 'revoked' | 'invalid';

export const VolunteerAcceptInviteView: React.FC<VolunteerAcceptInviteViewProps> = ({ onNavigate }) => {
  const { showSuccess, showError } = useNotification();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [inviteStatus, setInviteStatus] = useState<InviteStatus>('verifying');
  const [statusMessage, setStatusMessage] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');

  useEffect(() => {
    let t: string | null = null;
    if (typeof window !== 'undefined') {
      // 1. Check window.location.search (standard HTML5 pathname URLs: /volunteer/accept-invite?token=...)
      if (window.location.search) {
        const searchParams = new URLSearchParams(window.location.search);
        t = searchParams.get('token');
      }
      // 2. Fall back to hash query string (legacy hash routing: /#/volunteer/accept-invite?token=...)
      if (!t && window.location.hash && window.location.hash.includes('?')) {
        const hashQuery = window.location.hash.substring(window.location.hash.indexOf('?'));
        const hashParams = new URLSearchParams(hashQuery);
        t = hashParams.get('token');
      }
    }

    if (t && t.trim()) {
      const cleanToken = t.trim();
      setToken(cleanToken);
      verifyInvitationToken(cleanToken);
    } else {
      setInviteStatus('invalid');
      setStatusMessage('No invitation token found in link.');
    }
  }, []);

  const verifyInvitationToken = async (tokenToVerify: string) => {
    setInviteStatus('verifying');
    try {
      const res = await api.admin.verifyInvite(tokenToVerify);
      if (res.valid) {
        setInviteStatus('valid');
        setRecipientEmail(res.email || '');
        setRecipientName(res.recipientName || '');
      } else {
        mapErrorToStatus(res.code, res.message);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      mapErrorToStatus(parsed.code, parsed.message);
    }
  };

  const mapErrorToStatus = (code?: string, msg?: string) => {
    if (code === 'INVITATION_EXPIRED') {
      setInviteStatus('expired');
      setStatusMessage(msg || 'This invitation has expired. Ask an administrator to resend it.');
    } else if (code === 'INVITATION_USED') {
      setInviteStatus('used');
      setStatusMessage(msg || 'This invitation has already been used. Sign in to your Volunteer account.');
    } else if (code === 'INVITATION_REVOKED') {
      setInviteStatus('revoked');
      setStatusMessage(msg || 'A newer invitation has been issued. Please use the link from your most recent email.');
    } else {
      setInviteStatus('invalid');
      setStatusMessage(msg || 'Invitation record not found or link is broken.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      showError('Activation Failed', 'No invitation token found in link.');
      return;
    }

    if (!password) {
      showError('Password Required', 'Please enter a password.');
      return;
    }

    if (password !== confirmPassword) {
      showError('Mismatch', 'Passwords do not match.');
      return;
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (password.length < 8 || !hasLetter || !hasNumber) {
      showError('Weak Password', 'Password must be at least 8 characters and contain both letters and numbers.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.admin.acceptInvite({ token, password });
      if (res.success) {
        setSuccess(true);
        showSuccess('Account Activated', 'Your Volunteer account is ready.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Activation Failed', parsed.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] dark:bg-[#121212] flex items-center justify-center px-4 font-sans antialiased selection:bg-[#C59B27]/30">
      <div className="w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-3xl border border-[#EAE8E1] dark:border-[#302E29] p-8 shadow-sm space-y-6">
        
        {/* Loading / Verifying State */}
        {inviteStatus === 'verifying' && (
          <div className="py-12 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 text-[#C59B27] animate-spin">
              <RefreshCw className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-zinc-600 dark:text-[#A0988E]">Verifying invitation security...</p>
          </div>
        )}

        {/* Error State: EXPIRED */}
        {inviteStatus === 'expired' && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
              <Clock className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-bold text-[#18181B] dark:text-[#F0EBE3]">
                This invitation has expired
              </h2>
              <p className="text-sm text-zinc-600 dark:text-[#A0988E] leading-relaxed">
                For security, volunteer invitation links expire after a limited period.
              </p>
            </div>
            <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-300 text-left space-y-1">
              <span className="font-semibold block">Need a new invitation?</span>
              <p className="text-amber-800 dark:text-amber-400">
                Please contact the event administrator to have a fresh invitation link sent to your email.
              </p>
            </div>
            <Button
              onClick={() => onNavigate('/volunteer/sign-in')}
              variant="primary"
              fullWidth
            >
              Go to Volunteer Sign In
            </Button>
          </div>
        )}

        {/* Error State: USED */}
        {inviteStatus === 'used' && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-bold text-[#18181B] dark:text-[#F0EBE3]">
                This invitation has already been used
              </h2>
              <p className="text-sm text-zinc-600 dark:text-[#A0988E] leading-relaxed">
                Your volunteer account credentials have already been created. You can sign in directly below.
              </p>
            </div>
            <Button
              onClick={() => onNavigate('/volunteer/sign-in')}
              variant="primary"
              fullWidth
            >
              Sign In to Volunteer Portal
            </Button>
          </div>
        )}

        {/* Error State: REVOKED / REPLACED */}
        {inviteStatus === 'revoked' && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              <MailX className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-bold text-[#18181B] dark:text-[#F0EBE3]">
                This invitation is no longer available
              </h2>
              <p className="text-sm text-zinc-600 dark:text-[#A0988E] leading-relaxed">
                A newer invitation has been issued. Please check your inbox and use the link from your most recent email.
              </p>
            </div>
            <Button
              onClick={() => onNavigate('/volunteer/sign-in')}
              variant="secondary"
              fullWidth
            >
              Return to Sign In
            </Button>
          </div>
        )}

        {/* Error State: INVALID */}
        {inviteStatus === 'invalid' && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-bold text-[#18181B] dark:text-[#F0EBE3]">
                Invalid Invitation Link
              </h2>
              <p className="text-sm text-zinc-600 dark:text-[#A0988E] leading-relaxed">
                {statusMessage || 'The invitation link you opened is invalid or broken.'}
              </p>
            </div>
            <Button
              onClick={() => onNavigate('/volunteer/sign-in')}
              variant="secondary"
              fullWidth
            >
              Return to Sign In
            </Button>
          </div>
        )}

        {/* Valid State - Password Setup Form */}
        {inviteStatus === 'valid' && (
          <>
            {/* Header Block */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 text-[#C59B27] mb-2">
                <Heart className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-[#18181B] dark:text-[#F0EBE3] tracking-tight">
                Set up your Volunteer account
              </h2>
              {recipientName ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-zinc-800 dark:text-[#E0DACF]">
                    Welcome, <strong className="font-semibold text-[#18181B] dark:text-white">{recipientName}</strong>
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-[#8A857E]">({recipientEmail})</p>
                </div>
              ) : (
                <p className="text-sm text-zinc-600 dark:text-[#A0988E]">
                  Set up your password for <strong className="font-semibold text-zinc-900 dark:text-white">{recipientEmail}</strong>
                </p>
              )}
              <p className="text-xs text-zinc-500 dark:text-[#8A857E] pt-1">
                Create a password to access your Volunteer portal.
              </p>
            </div>

            {success ? (
              <div className="space-y-6 text-center animate-fade-in">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 flex items-start space-x-3 text-sm text-emerald-900 dark:text-emerald-200 text-left">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-semibold block">Account activated</span>
                    <span className="block text-xs text-emerald-800 dark:text-emerald-300">
                      Your Volunteer account is ready. You can now log into your volunteer portal.
                    </span>
                  </div>
                </div>
                <Button
                  onClick={() => onNavigate('/volunteer/sign-in')}
                  variant="primary"
                  fullWidth
                >
                  Sign in to Volunteer Portal
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 dark:text-[#A0988E] uppercase tracking-wider block">
                    Password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      disabled={loading}
                      className="w-full pl-10 pr-10 py-3 text-sm rounded-xl border border-[#EAE8E1] dark:border-[#302E29] bg-zinc-50 dark:bg-[#262520] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all disabled:opacity-55"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 focus:outline-none cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 dark:text-[#A0988E] uppercase tracking-wider block">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your password"
                      disabled={loading}
                      className="w-full pl-10 pr-10 py-3 text-sm rounded-xl border border-[#EAE8E1] dark:border-[#302E29] bg-zinc-50 dark:bg-[#262520] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all disabled:opacity-55"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 dark:text-[#7A7570] mt-1">
                    Must contain at least 8 characters, with at least one letter and one number.
                  </p>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={loading}
                  disabled={loading}
                >
                  Set Password & Activate Account
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};
