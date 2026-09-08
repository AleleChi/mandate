import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Fingerprint, Lock, ShieldAlert, X, ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from './Button';
import { api } from '../../services/api';
import { isWebAuthnSupported, base64URLToBuffer, bufferToBase64URL } from '../../utils/passkey';

interface DeviceSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (credentialId?: string) => void;
  actionName: string;
  isRegistration?: boolean; // If registering a new device passkey
  emailForLogin?: string; // If logging in via passkey (optional)
  challengeKey?: string; // For login verify
  loginOptions?: any; // For login verify
}

export const DeviceSecurityModal: React.FC<DeviceSecurityModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actionName,
  isRegistration = false,
  emailForLogin = '',
  challengeKey = '',
  loginOptions = null
}) => {
  const [mode, setMode] = useState<'prompt' | 'simulating' | 'password' | 'success' | 'error'>('prompt');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [deviceName, setDeviceName] = useState(() => {
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent;
      if (ua.includes('iPhone')) return 'iPhone';
      if (ua.includes('iPad')) return 'iPad';
      if (ua.includes('Macintosh')) return 'MacBook';
      if (ua.includes('Windows')) return 'Windows PC';
      if (ua.includes('Android')) return 'Android phone';
      return 'Personal Device';
    }
    return 'This Device';
  });

  // Body scroll locking and restoration
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (!isWebAuthnSupported()) {
        setMode('error');
        setErrorMessage("Secure sign-in isn't available on this browser.");
      } else {
        setMode('prompt');
        setPassword('');
        setPasswordError('');
        setVerifying(false);
        setErrorMessage('');
      }
    }
  }, [isOpen]);

  const handleDeviceVerification = async () => {
    setMode('simulating');
    setVerifying(true);
    setErrorMessage('');

    // Prepare a subtle 500ms smooth transition
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      if (!isWebAuthnSupported()) {
        throw new Error("Secure sign-in isn't available on this browser.");
      }

      if (isRegistration) {
        if (!window.navigator?.credentials?.create) {
          throw new Error("Secure sign-in isn't available on this browser.");
        }

        const optionsRes = await api.auth.passkeys.registerOptions(window.location.hostname);
        if (!optionsRes.success || !optionsRes.options) {
          throw new Error(optionsRes.error || "We couldn't prepare device setup.");
        }

        const opts = optionsRes.options;
        const clientHostname = window.location.hostname;
        const formattedOpts = {
          publicKey: {
            ...opts,
            rp: {
              ...opts.rp,
              id: clientHostname || opts.rp?.id
            },
            challenge: base64URLToBuffer(opts.challenge),
            user: {
              ...opts.user,
              id: new TextEncoder().encode(opts.user.id)
            }
          }
        };

        const credential = await window.navigator.credentials.create(formattedOpts) as any;
        if (!credential) {
          throw new Error("No credential details returned from this device.");
        }

        let pubKey = 'encoded-public-key-placeholder';
        if (credential.response) {
          const resp = credential.response;
          if (typeof resp.getPublicKey === 'function') {
            try {
              const pkBuf = resp.getPublicKey();
              if (pkBuf) {
                pubKey = bufferToBase64URL(pkBuf);
              }
            } catch (pkErr) {
              console.warn('Could not extract public key buffer:', pkErr);
            }
          } else if (credential.rawId) {
            pubKey = bufferToBase64URL(credential.rawId);
          }
        }

        const regRes = await api.auth.passkeys.registerVerify(
          { 
            id: credential.id, 
            response: { publicKey: pubKey } 
          },
          deviceName
        );

        if (regRes.success) {
          localStorage.setItem('koinonia_passkey_registered', 'true');
          setMode('success');
        } else {
          throw new Error(regRes.error || "We couldn't set up secure sign-in on this device.");
        }

      } else if (challengeKey && loginOptions) {
        if (!window.navigator?.credentials?.get) {
          throw new Error("Secure sign-in isn't available on this browser.");
        }

        const formattedOpts: any = {
          publicKey: {
            ...loginOptions,
            challenge: base64URLToBuffer(loginOptions.challenge),
          }
        };

        if (loginOptions.allowCredentials && loginOptions.allowCredentials.length > 0) {
          formattedOpts.publicKey.allowCredentials = loginOptions.allowCredentials.map((c: any) => ({
            type: c.type,
            id: base64URLToBuffer(c.id)
          }));
        } else {
          delete formattedOpts.publicKey.allowCredentials;
        }

        const assertion = await window.navigator.credentials.get(formattedOpts) as any;
        if (!assertion) {
          throw new Error("Device sign-in was not completed.");
        }

        const loginRes = await api.auth.passkeys.loginVerify(
          { id: assertion.id },
          challengeKey
        );

        if (loginRes.success) {
          setMode('success');
          setTimeout(() => {
            onSuccess(assertion.id);
            onClose();
          }, 1200);
        } else {
          throw new Error(loginRes.error || "We couldn't verify this device.");
        }

      } else {
        // Action verification
        if (!window.navigator?.credentials?.get) {
          throw new Error("Secure sign-in isn't available on this browser.");
        }

        const optRes = await api.auth.passkeys.getList();
        if (!optRes.success || !optRes.passkeys || optRes.passkeys.length === 0) {
          throw new Error("No registered device found. Please set up secure sign-in first.");
        }

        const randomChallenge = new Uint8Array(32);
        window.crypto.getRandomValues(randomChallenge);

        const formattedOpts = {
          publicKey: {
            challenge: randomChallenge,
            timeout: 60000,
            rpId: window.location.hostname,
            allowCredentials: optRes.passkeys.map((pk: any) => ({
              type: 'public-key',
              id: base64URLToBuffer(pk.credentialId || pk.id)
            })),
            userVerification: 'required' as UserVerificationRequirement
          }
        };

        const assertion = await window.navigator.credentials.get(formattedOpts) as any;
        if (!assertion) {
          throw new Error("Device verification was not completed.");
        }

        const verifyRes = await api.auth.passkeys.verifyAction({ id: assertion.id }, actionName);
        if (verifyRes.success) {
          setMode('success');
          setTimeout(() => {
            onSuccess(assertion.id);
            onClose();
          }, 1200);
        } else {
          throw new Error(verifyRes.error || "Verification failed on server.");
        }
      }
    } catch (err: any) {
      console.error('Device security failure:', err);
      setMode('error');
      
      const isCancel = err?.name === 'NotAllowedError' || err?.message?.toLowerCase().includes('cancel') || err?.message?.toLowerCase().includes('abort');
      
      if (isCancel) {
        setErrorMessage(isRegistration ? 'Setup was cancelled.' : 'Sign-in was cancelled.');
      } else {
        const isUnsupported = err?.name === 'SecurityError' || err?.message?.toLowerCase().includes('not supported') || !isWebAuthnSupported();
        if (isUnsupported) {
          setErrorMessage("Secure sign-in isn't available on this browser.");
        } else {
          setErrorMessage(isRegistration ? "We couldn't set up secure sign-in on this device." : "We couldn't sign in with this device.");
        }
      }
    } finally {
      setVerifying(false);
    }
  };

  const handlePasswordVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setPasswordError('Please enter your password.');
      return;
    }

    setVerifying(true);
    setPasswordError('');

    try {
      const meRes = await api.auth.getMe().catch(() => null);
      if (meRes && meRes.user?.email) {
        const checkRes = await api.auth.signIn({
          email: meRes.user.email,
          password: password
        });
        if (checkRes.success || checkRes.token) {
          setMode('success');
          setTimeout(() => {
            onSuccess('password_verified');
            onClose();
          }, 1000);
        } else {
          setPasswordError('Incorrect password. Please try again.');
        }
      } else if (emailForLogin) {
        const checkRes = await api.auth.signIn({
          email: emailForLogin,
          password: password
        });
        if (checkRes.success || checkRes.token) {
          setMode('success');
          setTimeout(() => {
            onSuccess('password_verified');
            onClose();
          }, 1000);
        } else {
          setPasswordError('Incorrect password. Please try again.');
        }
      } else {
        setPasswordError('Incorrect password or session expired.');
      }
    } catch (err: any) {
      setPasswordError('Verification failed. Please check your credentials.');
    } finally {
      setVerifying(false);
    }
  };

  if (!isOpen) return null;

  // Render via React Portal to document.body to guarantee current-viewport positioning
  return createPortal(
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans"
        data-component-version="sensitive-action-passkey-confirm-v3"
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="bg-white border border-[#EAE8E1] rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#FAF8F4]">
            <h3 className="text-sm font-semibold text-zinc-900">
              {isRegistration ? 'Set up secure sign-in' : 'Device sign-in'}
            </h3>
            <button 
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-full hover:bg-zinc-100 transition-colors cursor-pointer focus:outline-none"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 flex flex-col items-center text-center font-sans">
            {mode === 'prompt' && (
              <>
                <div className="p-4 bg-amber-500/10 text-[#C59B27] rounded-full mb-4">
                  <Fingerprint className="w-10 h-10 stroke-[1.75]" />
                </div>
                <h4 className="text-base font-semibold text-zinc-900 mb-1.5">
                  {isRegistration ? 'Set up secure sign-in' : 'Sign in with your device'}
                </h4>
                <p className="text-xs text-zinc-500 mb-5 leading-relaxed max-w-xs">
                  {isRegistration 
                    ? 'Use your fingerprint, face, screen lock or device PIN to sign in more quickly on this device.'
                    : 'Use your fingerprint, face, screen lock or device PIN.'}
                </p>

                {isRegistration && (
                  <div className="w-full mb-5 text-left">
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      Device name
                    </label>
                    <input
                      type="text"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      placeholder="e.g. Android phone"
                      className="w-full px-3.5 py-2.5 text-xs bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl focus:border-[#C59B27] focus:outline-none text-zinc-900 font-medium"
                    />
                  </div>
                )}

                <div className="w-full space-y-2.5">
                  <Button
                    type="button"
                    onClick={handleDeviceVerification}
                    className="w-full bg-[#C59B27] hover:bg-[#A37E1C] text-white py-2.5 rounded-xl shadow-xs flex items-center justify-center space-x-2 text-xs font-semibold cursor-pointer"
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>{isRegistration ? 'Set up' : 'Sign in with your device'}</span>
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isRegistration) {
                        onClose();
                      } else {
                        setMode('password');
                      }
                    }}
                    className="w-full py-2 text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors focus:outline-none cursor-pointer"
                  >
                    {isRegistration ? 'Cancel' : 'Use password instead'}
                  </button>
                </div>
              </>
            )}

            {mode === 'simulating' && (
              <>
                <div className="p-4 bg-[#FAF6EB] rounded-full mb-4 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-[#C59B27] animate-spin" />
                </div>
                <h4 className="text-base font-semibold text-zinc-900 mb-1.5">
                  {isRegistration ? 'Setting up secure sign-in…' : 'Signing in with your device…'}
                </h4>
                <p className="text-xs text-zinc-500 leading-relaxed max-w-xs">
                  Follow the prompt on your device to continue.
                </p>
              </>
            )}

            {mode === 'password' && (
              <form onSubmit={handlePasswordVerification} className="w-full text-left">
                <div className="p-3 bg-zinc-100 text-zinc-500 rounded-full mb-4 w-fit mx-auto">
                  <Lock className="w-6 h-6 stroke-[1.5]" />
                </div>
                <h4 className="text-base font-semibold text-zinc-900 mb-1.5 text-center">
                  Account password
                </h4>
                <p className="text-xs text-zinc-500 leading-relaxed text-center mb-5">
                  Enter your password to sign in.
                </p>

                <div className="mb-4">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError('');
                    }}
                    placeholder="Enter account password"
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-[#EAE8E1] rounded-xl focus:border-[#C59B27] focus:outline-none text-zinc-900"
                    disabled={verifying}
                    autoFocus
                  />
                  {passwordError && (
                    <p className="text-[11px] text-red-600 mt-1 flex items-center space-x-1 font-medium">
                      <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{passwordError}</span>
                    </p>
                  )}
                </div>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setMode('prompt')}
                    className="flex-1 py-2.5 border border-[#EAE8E1] text-zinc-600 hover:bg-zinc-50 rounded-xl text-xs font-semibold transition-colors focus:outline-none cursor-pointer text-center"
                    disabled={verifying}
                  >
                    Back
                  </button>
                  <Button
                    type="submit"
                    className="flex-1 bg-[#C59B27] hover:bg-[#A37E1C] text-white py-2.5 rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center space-x-1.5"
                    disabled={verifying}
                  >
                    {verifying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Confirm</span>
                  </Button>
                </div>
              </form>
            )}

            {mode === 'success' && (
              <>
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full mb-4">
                  <ShieldCheck className="w-10 h-10 stroke-[1.75]" />
                </div>
                <h4 className="text-base font-semibold text-zinc-900 mb-1.5">
                  {isRegistration ? 'Secure sign-in is ready' : 'Signed in securely'}
                </h4>
                <p className="text-xs text-zinc-600 leading-relaxed max-w-xs mb-5">
                  {isRegistration 
                    ? 'You can now use this device to sign in without entering your password.' 
                    : 'Your identity has been verified.'}
                </p>
                {isRegistration && (
                  <Button
                    type="button"
                    onClick={() => {
                      onSuccess();
                      onClose();
                    }}
                    className="w-full bg-[#18181B] hover:bg-zinc-800 text-white py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Done
                  </Button>
                )}
              </>
            )}

            {mode === 'error' && (
              <>
                <div className="p-4 bg-red-50 text-red-600 rounded-full mb-4">
                  <ShieldAlert className="w-10 h-10 stroke-[1.75]" />
                </div>
                <h4 className="text-base font-semibold text-zinc-900 mb-1.5">
                  {isRegistration ? "We couldn't set up secure sign-in on this device." : "We couldn't sign in with this device."}
                </h4>
                <p className="text-xs text-zinc-600 mb-5 leading-relaxed max-w-xs">
                  {errorMessage || (isRegistration ? "We couldn't set up secure sign-in on this device." : "We couldn't sign in with this device.")}
                </p>
                <div className="w-full space-y-2">
                  {isWebAuthnSupported() && (
                    <Button
                      type="button"
                      onClick={() => setMode('prompt')}
                      className="w-full bg-[#C59B27] hover:bg-[#A37E1C] text-white py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Try again
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (isRegistration) {
                        onClose();
                      } else {
                        setMode('password');
                      }
                    }}
                    className="w-full py-2 text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors focus:outline-none cursor-pointer"
                  >
                    Use password instead
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
