import React, { useEffect, useState, useRef } from 'react';
import { X, Lock, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Button } from '../common/Button';
import { api } from '../../services/api';

export interface AutomationRuleSetting {
  id: string;
  ruleKey?: string;
  name: string;
  description: string;
  triggerSignal: string;
  isEnabled: boolean;
  isMandatory?: boolean;
}

interface EventWatchSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChanged?: () => void;
}

function formatLastChecked(isoString: string | null | undefined): string | null {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return null;
  }
}

export const EventWatchSettingsModal: React.FC<EventWatchSettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsChanged
}) => {
  const [rules, setRules] = useState<AutomationRuleSetting[]>([]);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch settings on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setErrorMessage(null);

    api.admin.getEventAutomationSettings()
      .then((res) => {
        if (isMounted && res.success) {
          setRules(res.rules || []);
          setLastCheckedAt(res.lastCheckedAt || res.health?.lastEvaluationAt || null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage("We couldn't load Event Watch settings. Please try again.");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Keyboard trap & escape listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleToggle = async (rule: AutomationRuleSetting) => {
    if (rule.isMandatory || savingRuleId === rule.id) return;

    const previousEnabled = rule.isEnabled;
    const nextEnabled = !previousEnabled;
    setSavingRuleId(rule.id);
    setErrorMessage(null);

    // Optimistic update
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, isEnabled: nextEnabled } : r))
    );

    try {
      const res = await api.admin.updateEventAutomationSetting(rule.id, nextEnabled);
      if (!res.success) {
        throw new Error(res.error || 'Failed');
      }
      if (onSettingsChanged) {
        onSettingsChanged();
      }
    } catch {
      // Revert optimistic update
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isEnabled: previousEnabled } : r))
      );
      setErrorMessage("We couldn't save these Event Watch settings. Please try again.");
    } finally {
      setSavingRuleId(null);
    }
  };

  if (!isOpen) return null;

  const formattedTime = formatLastChecked(lastCheckedAt);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 text-left"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-watch-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h3 id="event-watch-settings-title" className="font-serif text-lg font-bold text-zinc-900 leading-snug">
              Event watch settings
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              What Event Watch should monitor
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subtle Status Banner */}
        <div className="px-6 py-3 bg-zinc-50/80 border-b border-zinc-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-zinc-600">
            {formattedTime ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-zinc-800">Monitoring active</span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-500">Last checked {formattedTime}</span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-zinc-500">Event Watch has not checked recently. Refresh or try again.</span>
              </>
            )}
          </div>
        </div>

        {/* Error message if update failed */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content Body: Scrollable list of rules */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-xs text-zinc-400">
              Loading settings...
            </div>
          ) : rules.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4 text-center">
              No monitoring rules found for this event.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {rules.map((rule) => {
                const isSaving = savingRuleId === rule.id;

                return (
                  <div
                    key={rule.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                  >
                    <div className="pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm text-zinc-900">
                          {rule.name}
                        </span>
                        {rule.isMandatory && (
                          <span
                            title="Mandatory safety control"
                            className="text-zinc-400 hover:text-zinc-600 inline-flex items-center"
                          >
                            <Lock className="w-3 h-3 ml-0.5" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                        {rule.description}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center">
                      {rule.isMandatory ? (
                        <span className="text-[11px] font-semibold text-zinc-600 bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded-md">
                          Locked On
                        </span>
                      ) : (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={rule.isEnabled}
                          aria-label={`Toggle ${rule.name}`}
                          disabled={isSaving}
                          onClick={() => handleToggle(rule)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                            rule.isEnabled ? 'bg-[#9A7326]' : 'bg-zinc-300'
                          } ${isSaving ? 'opacity-50 cursor-wait' : ''}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              rule.isEnabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
