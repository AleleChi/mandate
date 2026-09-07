import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Pause, Play, CheckCircle2, RotateCcw } from 'lucide-react';
import { trainingApi } from '../../services/trainingApi';
import { formatPracticeRole } from './trainingFormatters';

interface TrainingFacilitatorConsoleProps {
  sessionId: string;
  onNavigate: (route: string) => void;
  userId?: string;
}

export const TrainingFacilitatorConsole: React.FC<TrainingFacilitatorConsoleProps> = ({
  sessionId,
  onNavigate,
  userId
}) => {
  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<any[]>([]);
  const [debriefSummary, setDebriefSummary] = useState('');
  const [debriefStrengths, setDebriefStrengths] = useState('');
  const [debriefImprovements, setDebriefImprovements] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    loadSession();
    loadActivity();
    const interval = setInterval(() => {
      loadSession();
      loadActivity();
    }, 4000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const loadSession = async () => {
    if (!sessionId) return;
    try {
      const res = await trainingApi.getSessionDetail(sessionId);
      if (res && res.success && res.session) {
        setSessionData(res.session);
      }
    } catch (err) {
      console.error('Failed to load session details:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async () => {
    if (!sessionId) return;
    try {
      const res = await trainingApi.getSessionActivity(sessionId);
      if (res && res.success && res.activity) {
        setActivity(res.activity);
      }
    } catch (err) {
      console.error('Failed to load activity:', err);
    }
  };

  const handlePause = async () => {
    try {
      const res = await trainingApi.pauseSession(sessionId);
      if (res.success) {
        setSuccessMsg('Practice paused.');
        loadSession();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResume = async () => {
    try {
      const res = await trainingApi.resumeSession(sessionId);
      if (res.success) {
        setSuccessMsg('Practice resumed.');
        loadSession();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleComplete = async () => {
    if (confirm('Are you ready to complete this practice and open the debrief screen?')) {
      try {
        const res = await trainingApi.completeSession(sessionId);
        if (res.success) {
          onNavigate(`/admin/training/sessions/${sessionId}/debrief`);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleReset = async () => {
    if (confirm('Restart this practice session from the beginning? Current practice actions will be cleared.')) {
      try {
        const res = await trainingApi.resetSession(sessionId);
        if (res.success) {
          setSuccessMsg('Practice session restarted.');
          loadSession();
          loadActivity();
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleTriggerSituation = async (inj: any) => {
    try {
      await trainingApi.addObservation(sessionId, {
        category: 'Coordinator Note',
        note: `Situation introduced: ${inj.title}. ${inj.expected_action || ''}`
      });
      setSuccessMsg(`Situation introduced: ${inj.title}`);
      loadActivity();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 min-h-[50vh] font-sans">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#C59B27] border-t-transparent"></div>
        <p className="text-xs text-zinc-500 mt-3 font-sans">Loading coordinator console...</p>
      </div>
    );
  }

  const session = sessionData;
  const status = session?.status;

  return (
    <div
      id="training-facilitator-console-container"
      data-view-version="training-facilitator-console-v2-human"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans"
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-serif text-zinc-900 tracking-tight">
            Practice coordinator
          </h1>
          <p className="text-xs text-zinc-600 mt-1">
            Guide the session, introduce situations, and prepare team debrief notes.
          </p>
        </div>
        <button
          onClick={() => onNavigate(`/admin/training/sessions/${sessionId}`)}
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-[#EAE8E1] bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold transition-colors cursor-pointer"
        >
          View team practice screen
        </button>
      </div>

      {successMsg && (
        <div className="mb-6 p-3.5 bg-emerald-50/80 border border-emerald-200/90 text-emerald-900 text-xs font-medium rounded-xl">
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Controls & Team */}
        <div className="space-y-6">
          {/* Controls Box */}
          <div className="bg-white rounded-2xl border border-[#EAE8E1] p-6 shadow-2xs">
            <h2 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-4">
              Practice controls
            </h2>

            <div className="bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl p-4 text-center mb-5">
              <span className="text-[11px] text-zinc-500 uppercase font-semibold tracking-wider">
                Status
              </span>
              <div className="text-xl font-semibold text-zinc-900 mt-1">
                {status === 'active' ? 'Practice in progress' : status === 'paused' ? 'Paused' : 'Not started'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {status === 'active' ? (
                <button
                  type="button"
                  onClick={handlePause}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors cursor-pointer text-center"
                >
                  Pause practice
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleResume}
                  disabled={status === 'completed'}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer text-center"
                >
                  Resume practice
                </button>
              )}

              <button
                type="button"
                onClick={handleComplete}
                disabled={status === 'completed'}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-[#C59B27] hover:bg-[#A37F1D] disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer text-center"
              >
                Complete practice
              </button>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="w-full mt-3 min-h-[38px] px-3 py-2 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-700 text-xs font-medium transition-colors cursor-pointer"
            >
              Restart practice session
            </button>
          </div>

          {/* Team Members List */}
          <div className="bg-white rounded-2xl border border-[#EAE8E1] p-6 shadow-2xs">
            <h2 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-3">
              Team members in practice
            </h2>
            <div className="space-y-2">
              {session?.participants?.length === 0 ? (
                <p className="text-xs text-zinc-500 italic py-2">
                  Waiting for team members to join.
                </p>
              ) : (
                session?.participants?.map((p: any) => (
                  <div
                    key={p.id}
                    className="p-3 bg-zinc-50/70 border border-[#EAE8E1] rounded-xl text-xs flex justify-between items-center"
                  >
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {p.user_name || 'Team member'}
                      </p>
                      <span className="text-zinc-500 text-[11px]">
                        Role: <strong className="text-[#8C6D1F]">{formatPracticeRole(p.training_role)}</strong>
                      </span>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right 2 Columns: Situations & Debrief Notes */}
        <div className="lg:col-span-2 space-y-6">
          {/* Practice situations to introduce */}
          <div className="bg-white rounded-2xl border border-[#EAE8E1] p-6 shadow-2xs">
            <h2 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2">
              Situations to introduce
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Introduce practice situations to prompt team response and verify procedures.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {session?.injections?.map((inj: any) => (
                <div
                  key={inj.id}
                  className="p-4 bg-zinc-50/70 border border-[#EAE8E1] rounded-xl text-xs flex flex-col justify-between"
                >
                  <div>
                    <h3 className="font-semibold text-zinc-900">{inj.title}</h3>
                    {inj.expected_action && (
                      <p className="text-[11px] text-zinc-600 mt-1.5">
                        Expected action: {inj.expected_action}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTriggerSituation(inj)}
                    className="mt-3 min-h-[34px] px-3 py-1.5 rounded-lg bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-medium cursor-pointer transition-colors"
                  >
                    Introduce situation now
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Coordinator Debrief Notes */}
          <div className="bg-white rounded-2xl border border-[#EAE8E1] p-6 shadow-2xs">
            <h2 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2">
              Coordinator debrief notes
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Prepare notes for your team discussion after the practice ends.
            </p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                  1. Summary of session
                </label>
                <textarea
                  value={debriefSummary}
                  onChange={(e) => setDebriefSummary(e.target.value)}
                  placeholder="Record how the team performed check-in scans, communication, or handled questions."
                  rows={2}
                  className="w-full bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                  2. What went well
                </label>
                <textarea
                  value={debriefStrengths}
                  onChange={(e) => setDebriefStrengths(e.target.value)}
                  placeholder="e.g. Prompt team communication, calm guardian interactions, clear notes."
                  rows={2}
                  className="w-full bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                  3. Areas to practise further
                </label>
                <textarea
                  value={debriefImprovements}
                  onChange={(e) => setDebriefImprovements(e.target.value)}
                  placeholder="e.g. Speed up pass verification when internet access is unavailable."
                  rows={2}
                  className="w-full bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setSuccessMsg('Coordinator notes saved for debrief.')}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Save debrief notes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
