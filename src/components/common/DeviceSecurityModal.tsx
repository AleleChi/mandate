import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Fingerprint, Lock, ShieldAlert, X, ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from './Button';
import { api, ParentApiError } from '../../services/api';
import { isWebAuthnSupported, base64URLToBuffer, bufferToBase64URL } from '../../utils/passkey';

interface DeviceSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (credentialId?: string) => void;
  actionName: string;
  isRegistration?: boolean; // If registering a new device passkey
  emailForLogin?: string; // If logging in via passkey
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
      if (ua.includes('Android')) return 'Android Device';
      return 'Personal Device';
    }
    return 'This Device';
  });

  useEffect(() => {
    if (isOpen) {
      if (!isWebAuthnSupported()) {
        setMode('error');
        setErrorMessage('Secure device unlock is not supported on this browser.');
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

    // Prepare a subtle 800ms animation for premium experience
    await new Promise((resolve) => setTimeout(resolve, 800));

    try {
      if (!isWebAuthnSupported()) {
        throw new Error('Secure device unlock is not supported on this browser.');
      }

      if (isRegistration) {
        if (!window.navigator?.credentials?.create) {
          throw new Error('Secure device unlock registration is not supported on this browser.');
        }

        const optionsRes = await api.auth.passkeys.registerOptions(window.location.hostname);
        if (!optionsRes.success || !optionsRes.options) {
          throw new Error(optionsRes.error || 'Failed to prepare device registration.');
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
          throw new Error('No credential details returned from the device.');
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
          // Set a marker in local storage so other components know a passkey is registered
          localStorage.setItem('koinonia_passkey_registered', 'true');
          setMode('success');
          setTimeout(() => {
            onSuccess(credential.id);
            onClose();
          }, 1500);
        } else {
          throw new Error(regRes.error || 'Registration failed on server');
        }

      } else if (emailForLogin && challengeKey) {
        if (!window.navigator?.credentials?.get || !loginOptions) {
          throw new Error('Secure device authentication is not supported or configuration is missing.');
        }

        const formattedOpts = {
          publicKey: {
            ...loginOptions,
            challenge: base64URLToBuffer(loginOptions.challenge),
            allowCredentials: (loginOptions.allowCredentials || []).map((c: any) => ({
              type: c.type,
              id: base64URLToBuffer(c.id)
            }))
          }
        };

        const assertion = await window.navigator.credentials.get(formattedOpts) as any;
        if (!assertion) {
          throw new Error('Device verification was not completed.');
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
          }, 1500);
        } else {
          throw new Error(loginRes.error || 'Device verification failed on server');
        }

      } else {
        // Action verification
        if (!window.navigator?.credentials?.get) {
          throw new Error('Device verification is not supported on this browser.');
        }

        const optRes = await api.auth.passkeys.getList();
        if (!optRes.success || !optRes.passkeys || optRes.passkeys.length === 0) {
          throw new Error('No registered device keys found on this account. Please register your device first.');
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
          throw new Error('Device verification was not completed.');
        }

        const verifyRes = await api.auth.passkeys.verifyAction({ id: assertion.id }, actionName);
        if (verifyRes.success) {
          setMode('success');
          setTimeout(() => {
            onSuccess(assertion.id);
            onClose();
          }, 1500);
        } else {
          throw new Error(verifyRes.error || 'Action verification failed on server');
        }
      }
    } catch (err: any) {
      console.error('Device security failure:', err);
      setMode('error');
      
      const isCancel = err?.name === 'NotAllowedError' || err?.message?.toLowerCase().includes('cancel') || err?.message?.toLowerCase().includes('abort');
      
      if (isCancel) {
        setErrorMessage(isRegistration ? 'Setup was cancelled.' : 'Verification was cancelled.');
      } else {
        const isUnsupported = err?.name === 'SecurityError' || err?.message?.toLowerCase().includes('not supported') || !isWebAuthnSupported();
        if (isUnsupported) {
          setErrorMessage("Secure unlock isn't available on this browser.");
        } else {
          setErrorMessage(err?.message || 'Device verification could not be completed.');
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
      // Sign-in again to verify password
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
      } else {
        // Fallback for login scenario
        if (emailForLogin) {
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
      }
    } catch (err: any) {
      setPasswordError('Verification failed. Please check your credentials.');
    } finally {
      setVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans"
        data-component-version="sensitive-action-passkey-confirm-v2"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="bg-[#FCFAF7] border border-[#EAE8E1] rounded-3xl max-w-sm w-full overflow-hidden shadow-xl font-sans"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[#FAF8F4]">
            <h3 className="text-sm font-semibold text-zinc-800">
              {isRegistration ? 'Set up secure unlock' : 'Device security'}
            </h3>
            <button 
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100 transition-colors cursor-pointer focus:outline-none"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 flex flex-col items-center text-center font-sans">
            {mode === 'prompt' && (
              <>
                <div className="p-4 bg-amber-500/5 text-[#C59B27] rounded-full mb-4 animate-pulse">
                  <Fingerprint className="w-12 h-12 stroke-[1.5]" />
                </div>
                <h4 className="text-base font-sans font-semibold text-zinc-900 mb-1.5">
                  {isRegistration ? 'Set up on this device' : 'Verification required'}
                </h4>
                <p className="text-xs text-zinc-500 mb-6 leading-relaxed max-w-xs">
                  {isRegistration 
                    ? 'Protect your account using your device’s screen lock, fingerprint, or face recognition.'
                    : `Confirm your identity to proceed with: "${actionName}".`}
                </p>

                {isRegistration && (
                  <div className="w-full mb-4">
                    <label className="block text-[10px] uppercase tracking-wider font-semibold text-zinc-400 text-left mb-1">
                      Device label
                    </label>
                    <input
                      type="text"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      placeholder="My Phone"
                      className="w-full px-3.5 py-2.5 text-xs bg-white border border-[#EAE8E1] rounded-xl focus:border-[#C59B27] focus:outline-none text-zinc-700"
                    />
                  </div>
                )}

                <div className="w-full space-y-2.5">
                  <Button
                    onClick={handleDeviceVerification}
                    className="w-full bg-[#C59B27] hover:bg-[#A37E1C] text-white py-2.5 rounded-xl shadow-xs flex items-center justify-center space-x-2 text-xs font-semibold"
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>{isRegistration ? 'Set up secure unlock' : 'Verify on this device'}</span>
                  </Button>

                  <button
                    onClick={() => setMode('password')}
                    className="w-full py-2 text-xs font-medium text-[#C59B27] hover:text-[#A37E1C] transition-colors focus:outline-none cursor-pointer"
                  >
                    Use account password instead
                  </button>
                </div>
              </>
            )}

            {mode === 'simulating' && (
              <>
                <div className="p-4 bg-zinc-100 rounded-full mb-4 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-[#C59B27] animate-spin" />
                </div>
                <h4 className="text-base font-sans font-semibold text-zinc-900 mb-1.5">
                  {isRegistration ? 'Setting up secure unlock...' : 'Verifying on this device...'}
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
                <h4 className="text-base font-sans font-semibold text-zinc-900 mb-1.5 text-center">
                  Account verification
                </h4>
                <p className="text-xs text-zinc-500 leading-relaxed text-center mb-5">
                  Please confirm with your account password to authorize: "{actionName}".
                </p>

                <div className="mb-4">
                  <label className="block text-[10px] uppercase tracking-wider font-semibold text-zinc-400 mb-1">
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
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-[#EAE8E1] rounded-xl focus:border-[#C59B27] focus:outline-none text-zinc-700"
                    disabled={verifying}
                    autoFocus
                  />
                  {passwordError && (
                    <p className="text-[10px] text-red-500 mt-1 flex items-center space-x-1 font-medium">
                      <ShieldAlert className="w-3 h-3 flex-shrink-0" />
                      <span>{passwordError}</span>
                    </p>
                  )}
                </div>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setMode('prompt')}
                    className="flex-1 py-2.5 border border-[#EAE8E1] text-zinc-500 hover:bg-zinc-50 rounded-xl text-xs font-semibold transition-colors focus:outline-none cursor-pointer text-center"
                    disabled={verifying}
                  >
                    Back
                  </button>
                  <Button
                    type="submit"
                    className="flex-1 bg-[#C59B27] hover:bg-[#A37E1C] text-white py-2.5 rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center space-x-1.5"
                    disabled={verifying}
                  >
                    {verifying && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>Confirm</span>
                  </Button>
                </div>
              </form>
            )}

            {mode === 'success' && (
              <>
                <div className="p-4 bg-emerald-500/5 text-emerald-600 rounded-full mb-4">
                  <ShieldCheck className="w-12 h-12 stroke-[1.5]" />
                </div>
                <h4 className="text-base font-sans font-semibold text-zinc-900 mb-1.5">
                  {isRegistration ? 'Secure unlock active' : 'Verification successful'}
                </h4>
                <p className="text-xs text-emerald-600/90 leading-relaxed max-w-xs">
                  {isRegistration 
                    ? 'Your device is now set up for secure unlock.' 
                    : 'Device verification confirmed.'}
                </p>
              </>
            )}

            {mode === 'error' && (
              <>
                <div className="p-4 bg-red-500/5 text-red-500 rounded-full mb-4">
                  <ShieldAlert className="w-12 h-12 stroke-[1.5]" />
                </div>
                <h4 className="text-base font-sans font-semibold text-zinc-900 mb-1.5">
                  {isRegistration ? 'Setup not completed' : 'Verification failed'}
                </h4>
                <p className="text-xs text-red-500 mb-5 leading-relaxed max-w-xs">
                  {errorMessage}
                </p>
                <div className="w-full space-y-2">
                  {isWebAuthnSupported() && (
                    <Button
                      onClick={() => setMode('prompt')}
                      className="w-full bg-zinc-200 hover:bg-zinc-300 text-zinc-800 py-2.5 rounded-xl text-xs font-semibold shadow-xs"
                    >
                      {isRegistration ? 'Try setup again' : 'Try again'}
                    </Button>
                  )}
                  <button
                    onClick={() => setMode('password')}
                    className="w-full py-2 text-xs font-medium text-[#C59B27] hover:text-[#A37E1C] transition-colors focus:outline-none cursor-pointer"
                  >
                    Use password instead
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
