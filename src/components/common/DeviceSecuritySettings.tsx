import React, { useState, useEffect } from 'react';
import { Fingerprint, Trash2, ShieldCheck, Loader2, Play, Check, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { DeviceSecurityModal } from './DeviceSecurityModal';
import { isWebAuthnSupported, isPlatformAuthenticatorAvailable, humanizeDeviceName } from '../../utils/passkey';

interface DeviceSecuritySettingsProps {
  isAdmin?: boolean;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}

export const DeviceSecuritySettings: React.FC<DeviceSecuritySettingsProps> = ({
  isAdmin = false,
  showSuccess,
  showError
}) => {
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingPlatform, setCheckingPlatform] = useState(true);
  const [isSupported, setIsSupported] = useState(false);
  const [isPlatformAvailable, setIsPlatformAvailable] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<'register' | 'test'>('register');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeItem, setConfirmRevokeItem] = useState<any | null>(null);

  // Optional pass biometric unlock setting
  const [passUnlockEnabled, setPassUnlockEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('koinonia_pass_biometric_unlock') === 'true';
    }
    return false;
  });

  const fetchPasskeys = async () => {
    setLoading(true);
    try {
      const res = await api.auth.passkeys.getList();
      if (res && res.success) {
        setPasskeys(res.passkeys || []);
      }
    } catch (err) {
      console.warn('Error fetching registered devices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    async function checkCapability() {
      const webAuthn = isWebAuthnSupported();
      if (!webAuthn) {
        if (mounted) {
          setIsSupported(false);
          setIsPlatformAvailable(false);
          setCheckingPlatform(false);
        }
        return;
      }
      setIsSupported(true);
      try {
        const platform = await isPlatformAuthenticatorAvailable();
        if (mounted) {
          setIsPlatformAvailable(platform);
        }
      } catch {
        if (mounted) {
          setIsPlatformAvailable(false);
        }
      } finally {
        if (mounted) {
          setCheckingPlatform(false);
        }
      }
    }

    checkCapability();
    fetchPasskeys();

    return () => {
      mounted = false;
    };
  }, []);

  const handleRegisterSuccess = () => {
    showSuccess('Secure sign-in is ready', 'You can now use this device to sign in without entering your password.');
    fetchPasskeys();
  };

  const handleTestSuccess = () => {
    showSuccess('Verification successful', 'Secure sign-in verification completed successfully.');
  };

  const handleConfirmRevoke = async () => {
    if (!confirmRevokeItem) return;
    const targetId = confirmRevokeItem.id;
    setRevokingId(targetId);
    try {
      const res = await api.auth.passkeys.revoke(targetId);
      if (res && res.success) {
        setConfirmRevokeItem(null);
        showSuccess('Device removed', 'The device was successfully removed.');
        await fetchPasskeys();
      } else {
        showError('Removal failed', res?.error || 'Could not remove device.');
      }
    } catch (err) {
      showError('Error', 'An error occurred while removing device credentials.');
    } finally {
      setRevokingId(null);
    }
  };

  const togglePassUnlock = (checked: boolean) => {
    setPassUnlockEnabled(checked);
    localStorage.setItem('koinonia_pass_biometric_unlock', checked ? 'true' : 'false');
    showSuccess(
      checked ? 'Secure sign-in active' : 'Secure sign-in off',
      checked 
        ? 'Passes will require secure device confirmation prior to viewing.' 
        : 'Passes can now be viewed without device confirmation.'
    );
  };

  const formatAddedDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const isConfigured = passkeys.length > 0;

  return (
    <div className="space-y-4 font-sans text-left" data-component-version="device-security-v3-real">
      <div className="bg-white rounded-2xl border border-[#EAE8E1] p-5 shadow-xs">
        {/* Header */}
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-[#FAF6EB] text-[#9A7326] rounded-xl shrink-0">
            <Fingerprint className="w-5 h-5 stroke-[1.5]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-900">
              Device security
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Use your fingerprint, face, screen lock or device PIN for quick, passwordless access.
            </p>
          </div>
        </div>

        {/* Security Status Box */}
        <div className="mt-4 p-3.5 rounded-xl border border-zinc-100 bg-[#FAF9F6]">
          {checkingPlatform ? (
            <div className="flex items-center gap-2 text-xs text-zinc-400 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9A7326]" />
              <span>Checking device capability...</span>
            </div>
          ) : !isSupported || !isPlatformAvailable ? (
            /* State 2: Unsupported */
            <div>
              <p className="text-xs font-medium text-zinc-700">
                Secure sign-in isn't available on this browser.
              </p>
            </div>
          ) : !isConfigured ? (
            /* State 3: Available but not set up */
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-zinc-900">Secure sign-in is available</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Use your fingerprint, face, screen lock or device PIN.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalAction('register');
                  setModalOpen(true);
                }}
                className="px-3.5 py-2 bg-[#9A7326] hover:bg-[#7D5B18] text-white text-xs font-medium rounded-xl transition-colors shrink-0 cursor-pointer"
              >
                Set up secure sign-in
              </button>
            </div>
          ) : (
            /* State 4: Set up / registered */
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <p className="text-xs font-semibold text-zinc-900">Secure sign-in is on</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalAction('test');
                    setModalOpen(true);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                >
                  Test unlock
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalAction('register');
                    setModalOpen(true);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-[#9A7326] hover:text-[#7D5B18] hover:bg-[#FAF6EB] rounded-lg transition-colors cursor-pointer"
                >
                  Add another device
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Registered Devices List */}
        {isConfigured && (
          <div className="mt-5 pt-4 border-t border-zinc-100 space-y-3">
            <h4 className="text-xs font-medium text-zinc-500">
              Your devices
            </h4>

            {loading ? (
              <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Loading devices...</span>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-100 overflow-hidden bg-white">
                {passkeys.map((pk) => (
                  <div key={pk.id} className="p-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-zinc-900">
                        {humanizeDeviceName(pk.deviceName)}
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Added {formatAddedDate(pk.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmRevokeItem(pk)}
                      className="text-xs text-zinc-400 hover:text-rose-600 px-2 py-1 rounded transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Optional secure unlock for parent passes */}
        {!isAdmin && isConfigured && (
          <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between">
            <div className="space-y-0.5 max-w-[80%]">
              <p className="text-xs font-medium text-zinc-900">
                Require secure confirmation before showing pass
              </p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Confirm your identity using this device before opening passes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => togglePassUnlock(!passUnlockEnabled)}
              className="focus:outline-none cursor-pointer"
              aria-label="Toggle secure unlock for pass"
            >
              <div className={`w-10 h-5.5 rounded-full transition-colors relative ${passUnlockEnabled ? 'bg-[#9A7326]' : 'bg-zinc-200'}`}>
                <div className={`w-4.5 h-4.5 rounded-full bg-white absolute top-0.5 transition-transform shadow-xs ${passUnlockEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Removing Device */}
      {confirmRevokeItem && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl border border-zinc-100 space-y-4 font-sans animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-zinc-900">
                Remove this device?
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                You won't be able to use secure unlock on this device until you set it up again.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRevokeItem(null)}
                disabled={Boolean(revokingId)}
                className="px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={Boolean(revokingId)}
                className="px-3.5 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {revokingId ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>Remove device</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verification / Enrollment Modal */}
      <DeviceSecurityModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={modalAction === 'register' ? handleRegisterSuccess : handleTestSuccess}
        actionName={modalAction === 'register' ? 'Registering secure device' : 'Testing secure unlock'}
        isRegistration={modalAction === 'register'}
      />
    </div>
  );
};
