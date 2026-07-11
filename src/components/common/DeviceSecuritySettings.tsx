import React, { useState, useEffect } from 'react';
import { Fingerprint, Trash2, ShieldAlert, CheckCircle2, ShieldCheck, Loader2, Play } from 'lucide-react';
import { Button } from './Button';
import { api } from '../../services/api';
import { DeviceSecurityModal } from './DeviceSecurityModal';

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
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<'register' | 'test'>('register');
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Parent Pass optional biometric unlock setting state
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
      if (res.success) {
        setPasskeys(res.passkeys || []);
      }
    } catch (err) {
      console.error('Error fetching registered device keys:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPasskeys();
  }, []);

  const handleRegisterSuccess = () => {
    showSuccess('Device security active', 'Your device key has been registered and is now active.');
    fetchPasskeys();
  };

  const handleTestSuccess = () => {
    showSuccess('Verification successful', 'Device security verification completed successfully. Unlock is fully active.');
  };

  const handleRevoke = async (passkeyId: string) => {
    setRevokingId(passkeyId);
    try {
      const res = await api.auth.passkeys.revoke(passkeyId);
      if (res.success) {
        showSuccess('Device removed', 'The device key was successfully revoked.');
        fetchPasskeys();
      } else {
        showError('Removal failed', 'Could not revoke device key.');
      }
    } catch (err) {
      showError('Error', 'An error occurred while revoking device credentials.');
    } finally {
      setRevokingId(null);
    }
  };

  const togglePassUnlock = (checked: boolean) => {
    setPassUnlockEnabled(checked);
    localStorage.setItem('koinonia_pass_biometric_unlock', checked ? 'true' : 'false');
    showSuccess(
      checked ? 'Secure unlock active' : 'Secure unlock off',
      checked 
        ? 'Passes will require device security verification prior to viewing.' 
        : 'Passes can now be viewed without device verification.'
    );
  };

  return (
    <div 
      className="space-y-6"
      data-component-version="device-security-settings-v1"
    >
      {/* Device security card */}
      <div className="bg-[#FCFAF7] rounded-2xl border border-[#EAE8E1] p-6 shadow-2xs">
        <div className="flex items-start space-x-4">
          <div className="p-3 bg-amber-500/10 text-[#C59B27] rounded-xl flex-shrink-0">
            <Fingerprint className="w-6 h-6 stroke-[1.5]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-serif-koinonia font-bold text-[#18181B]">
              Device security
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Use fingerprint, Face ID, Windows Hello, or a passkey on this device.
            </p>
          </div>
        </div>

        {/* List of registered devices */}
        <div className="mt-6 border-t border-[#FAF8F4] pt-5 space-y-4">
          <h4 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">
            Registered devices
          </h4>

          {loading ? (
            <div className="flex items-center space-x-2 text-xs text-zinc-400 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Checking secure credentials...</span>
            </div>
          ) : passkeys.length === 0 ? (
            <div className="p-4 bg-zinc-50 border border-dashed border-[#EAE8E1] rounded-xl text-center">
              <p className="text-xs text-zinc-400">
                No secure device keys registered. Add this device to enable fast, password-free confirmation.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#FAF8F4] bg-white border border-[#EAE8E1] rounded-xl overflow-hidden">
              {passkeys.map((pk) => (
                <div key={pk.id} className="p-4 flex items-center justify-between text-left">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-zinc-800 flex items-center space-x-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span>{pk.deviceName || 'Authenticated Device'}</span>
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Added {new Date(pk.createdAt).toLocaleDateString()} 
                      {pk.lastUsedAt && ` • Last used ${new Date(pk.lastUsedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevoke(pk.id)}
                    disabled={revokingId === pk.id}
                    className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors focus:outline-none cursor-pointer"
                    title="Remove device"
                  >
                    {revokingId === pk.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <Button
              onClick={() => {
                setModalAction('register');
                setModalOpen(true);
              }}
              className="flex-1 bg-[#C59B27] hover:bg-[#A37E1C] text-white text-xs font-semibold py-2.5 rounded-xl shadow-xs flex items-center justify-center space-x-1.5"
            >
              <Fingerprint className="w-4 h-4" />
              <span>Add this device</span>
            </Button>

            {passkeys.length > 0 && (
              <Button
                onClick={() => {
                  setModalAction('test');
                  setModalOpen(true);
                }}
                className="flex-1 border border-[#EAE8E1] text-zinc-600 hover:bg-zinc-50 text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center space-x-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Test secure unlock</span>
              </Button>
            )}
          </div>
        </div>

        {/* Optional secure unlock for parent passes */}
        {!isAdmin && passkeys.length > 0 && (
          <div 
            className="mt-6 border-t border-[#FAF8F4] pt-5 flex items-center justify-between"
            data-component-version="parent-pass-secure-unlock-v1"
          >
            <div className="space-y-0.5 max-w-[80%]">
              <p className="text-xs font-semibold text-zinc-800">
                Require device unlock before showing child pass
              </p>
              <p className="text-[10px] text-zinc-400 leading-relaxed">
                Requires Fingerprint or Face ID confirmation prior to displaying passes.
              </p>
            </div>
            <button
              onClick={() => togglePassUnlock(!passUnlockEnabled)}
              className="focus:outline-none cursor-pointer"
            >
              <div className={`w-11 h-6 rounded-full transition-colors relative ${passUnlockEnabled ? 'bg-[#C59B27]' : 'bg-zinc-200'}`}>
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm ${passUnlockEnabled ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Future Child Biometric Scanner (Phase 7) */}
      {isAdmin && (
        <div 
          className="bg-[#FCFAF7] rounded-2xl border border-[#EAE8E1] p-6 shadow-2xs"
          data-component-version="future-child-biometric-placeholder-v1"
        >
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-zinc-200 text-zinc-400 rounded-xl flex-shrink-0">
              <Fingerprint className="w-6 h-6 stroke-[1.5]" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-serif-koinonia font-bold text-[#18181B]">
                  Child biometric scanner
                </h3>
                <span className="px-2 py-0.5 text-[9px] font-semibold bg-zinc-100 text-zinc-500 rounded-full">
                  Not connected
                </span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                This requires approved fingerprint scanner hardware and consent setup. Direct physical scanner device SDK integration is required to authorize children pickup releases in future phases. No local fingerprint image storage is ever enabled.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Verification Modal */}
      <DeviceSecurityModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={modalAction === 'register' ? handleRegisterSuccess : handleTestSuccess}
        actionName={modalAction === 'register' ? 'Registering secure device key' : 'Testing secure unlock'}
        isRegistration={modalAction === 'register'}
      />
    </div>
  );
};
