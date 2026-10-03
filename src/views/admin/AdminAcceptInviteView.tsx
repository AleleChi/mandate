import React, { useState, useEffect } from 'react';
import { AppRoute } from '../../types';
import { ShieldCheck, Lock, Eye, EyeOff, CheckCircle2, AlertTriangle, Clock, RefreshCw, MailX } from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';

interface AdminAcceptInviteViewProps {
  onNavigate: (route: AppRoute) => void;
}

type InviteStatus = 'verifying' | 'valid' | 'expired' | 'used' | 'revoked' | 'invalid';

export const AdminAcceptInviteView: React.FC<AdminAcceptInviteViewProps> = ({ onNavigate }) => {
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
  const [assignedRole, setAssignedRole] = useState('');

  useEffect(() => {
    const hash = window.location.hash;
    const queryIdx = hash.indexOf('?');
    if (queryIdx !== -1) {
      const searchParams = new URLSearchParams(hash.substring(queryIdx));
      const t = searchParams.get('token');
      if (t) {
        setToken(t);
        verifyInvitationToken(t);
      } else {
        setInviteStatus('invalid');
        setStatusMessage('No invitation token found in link.');
      }
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
        setAssignedRole(res.role || '');
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
      setStatusMessage(msg || 'This invitation link has expired. For your security, invitation links are available for a limited time.');
    } else if (code === 'INVITATION_USED') {
      setInviteStatus('used');
      setStatusMessage(msg || 'This invitation has already been used.');
    } else if (code === 'INVITATION_REVOKED') {
      setInviteStatus('revoked');
      setStatusMessage(msg || 'A newer invitation has been issued. Please use the link from your most recent email.');
    } else {
      setInviteStatus('invalid');
      setStatusMessage(msg || 'This invitation link is invalid or incomplete.');
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
        showSuccess('Account Activated', 'Your administrator profile is now active.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Activation Failed', parsed.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] flex items-center justify-center px-4 font-sans antialiased selection:bg-[#C59B27]/30">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#EAE8E1] p-8 shadow-sm space-y-6">
        
        {/* Loading / Verifying State */}
        {inviteStatus === 'verifying' && (
          <div className="py-12 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 text-[#C59B27] animate-spin">
              <RefreshCw className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-zinc-600">Verifying invitation security...</p>
          </div>
        )}

        {/* Branded Error State: EXPIRED */}
        {inviteStatus === 'expired' && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 text-amber-700">
              <Clock className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-bold text-[#18181B]">
                This invitation has expired
              </h2>
              <p className="text-sm text-zinc-600 leading-relaxed">
                For your security, invitation links are available for a limited time.
              </p>
            </div>
            <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-100 text-xs text-amber-900 text-left space-y-1">
              <span className="font-semibold block">Need a new invitation?</span>
              <p className="text-amber-800">
                Contact your administrator to request a fresh invitation link.
              </p>
            </div>
            <Button
              onClick={() => onNavigate('/admin/sign-in')}
              variant="primary"
              fullWidth
            >
              Contact an administrator
            </Button>
          </div>
        )}

        {/* Branded Error State: USED */}
        {inviteStatus === 'used' && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-bold text-[#18181B]">
                This invitation has already been used
              </h2>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Your account credentials have already been created. You can sign in directly below.
              </p>
            </div>
            <Button
              onClick={() => onNavigate('/admin/sign-in')}
              variant="primary"
              fullWidth
            >
              Sign In to Admin Area
            </Button>
          </div>
        )}

        {/* Branded Error State: REVOKED / REPLACED */}
        {inviteStatus === 'revoked' && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-zinc-100 text-zinc-700">
              <MailX className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-bold text-[#18181B]">
                This invitation is no longer available
              </h2>
              <p className="text-sm text-zinc-600 leading-relaxed">
                A newer invitation has been issued. Please check your email inbox and use the link from your most recent email.
              </p>
            </div>
            <Button
              onClick={() => onNavigate('/admin/sign-in')}
              variant="secondary"
              fullWidth
            >
              Contact an administrator
            </Button>
          </div>
        )}

        {/* Branded Error State: INVALID */}
        {inviteStatus === 'invalid' && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-bold text-[#18181B]">
                Invalid Invitation Link
              </h2>
              <p className="text-sm text-zinc-600 leading-relaxed">
                {statusMessage || 'The invitation link you opened is invalid or incomplete.'}
              </p>
            </div>
            <Button
              onClick={() => onNavigate('/admin/sign-in')}
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
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 text-[#C59B27] mb-2">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-[#18181B] tracking-tight">
                Set Up Your Password
              </h2>
              {recipientName ? (
                <p className="text-sm text-zinc-600">
                  Welcome, <strong className="text-zinc-900 font-semibold">{recipientName}</strong> ({recipientEmail})
                </p>
              ) : (
                <p className="text-sm text-zinc-600">
                  Set up your password for <strong className="text-zinc-900 font-semibold">{recipientEmail}</strong>
                </p>
              )}
            </div>

            {success ? (
              <div className="space-y-6 text-center animate-fade-in">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start space-x-3 text-sm text-emerald-900 text-left">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-semibold block">Activation Successful!</span>
                    <span className="block text-xs text-emerald-800">Your account credentials have been set. You can now log into your access dashboard.</span>
                  </div>
                </div>
                <Button
                  onClick={() => onNavigate('/admin/sign-in')}
                  variant="primary"
                  fullWidth
                >
                  Sign In to Admin Area
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">
                    New Password
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
                      className="w-full pl-10 pr-10 py-3 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all disabled:opacity-55"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">
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
                      className="w-full pl-10 pr-10 py-3 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all disabled:opacity-55"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
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
                  Set Password & Activate Profile
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};

