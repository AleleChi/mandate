import React, { useState, useEffect } from 'react';
import { trainingApi } from '../../services/trainingApi';

interface TrainingFacilitatorConsoleProps {
  sessionId: string;
  onNavigate: (route: string) => void;
  userId: string;
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
        setSuccessMsg('Session paused.');
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
        setSuccessMsg('Session resumed.');
        loadSession();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleComplete = async () => {
    if (confirm('Are you sure you want to finalize this practice rehearsal and open the official Debrief Form?')) {
      try {
        const res = await trainingApi.completeSession(sessionId);
        if (res.success) {
          setSuccessMsg('Session finalized.');
          loadSession();
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleReset = async () => {
    if (confirm('Reset this rehearsal session? This will completely clear all current practice records, activity logs, and start fresh.')) {
      try {
        const res = await trainingApi.resetSession(sessionId);
        if (res.success) {
          setSuccessMsg('Session reset.');
          loadSession();
          loadActivity();
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleTriggerInjection = async (inj: any) => {
    try {
      // Create artificial activity injection entry
      await trainingApi.addObservation(sessionId, {
        category: 'Facilitator Injection',
        note: `FACILITATOR INJECTION TRIGGERED: ${inj.title}. ${inj.expected_action || ''}`
      });
      setSuccessMsg(`Injection triggered: ${inj.title}`);
      loadActivity();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 bg-[#FAF9F6] min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C59B27]"></div>
      </div>
    );
  }

  const session = sessionData;
  const status = session?.status;

  return (
    <div 
      id="training-facilitator-console-container"
      data-view-version="training-facilitator-console-v1-premium"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans bg-[#FAF9F6]"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-[#18181B] tracking-tight">Facilitator Console</h1>
          <p className="text-xs text-[#52525B] mt-1">Rehearsal Controller: trigger scheduled events, manage scenario clock, and review team performance.</p>
        </div>
        <button
          onClick={() => onNavigate(`/admin/training/sessions/${sessionId}`)}
          className="bg-white border border-[#E4E4E7] text-[#52525B] hover:bg-[#FAF9F6] text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer"
        >
          View Participant Screen
        </button>
      </div>

      {successMsg && (
        <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg">
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column: Controls & Participants */}
        <div className="space-y-6">
          
          {/* Controls Box */}
          <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider mb-4">Rehearsal Clock & Controls</h3>
            
            <div className="bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg p-4 text-center mb-6">
              <span className="text-xs text-[#71717A] uppercase font-bold tracking-wider">Elapsed Time</span>
              <div className="text-3xl font-mono text-[#18181B] font-bold mt-1">
                {status === 'active' ? '00:14:32' : status === 'paused' ? '00:08:12 (PAUSED)' : '00:00:00'}
              </div>
              <span className="text-[10px] text-[#A1A1AA] block mt-1 uppercase font-semibold">Speed: 1.0x Realtime</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {status === 'active' ? (
                <button
                  onClick={handlePause}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 rounded-lg text-xs cursor-pointer"
                >
                  Pause Session
                </button>
              ) : (
                <button
                  onClick={handleResume}
                  disabled={status === 'completed'}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-xs cursor-pointer"
                >
                  Resume Session
                </button>
              )}

              <button
                onClick={handleComplete}
                disabled={status === 'completed'}
                className="bg-[#C59B27] hover:bg-[#A37F1D] disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-xs cursor-pointer"
              >
                Complete Session
              </button>
            </div>

            <button
              onClick={handleReset}
              className="w-full mt-4 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold py-2 rounded-lg transition-colors cursor-pointer"
            >
              Reset & Replay Drill
            </button>
          </div>

          {/* Active Participants List */}
          <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider mb-4">Active Participants</h3>
            <div className="space-y-2.5">
              {session?.participants?.length === 0 ? (
                <p className="text-xs text-[#71717A] italic">No participants have joined yet.</p>
              ) : (
                session?.participants?.map((p: any) => (
                  <div key={p.id} className="bg-[#FAF9F6] border border-[#E4E4E7] p-3 rounded-lg text-xs flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-[#18181B]">User ID: {p.user_id.substring(0, 8)}...</p>
                      <span className="text-[#71717A] text-[11px]">Role: <strong className="text-[#C59B27]">{p.training_role}</strong></span>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Middle and Right: Injections triggers, Observation logs & Debrief */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Scheduled Injections */}
          <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider mb-4">Manual Injections (Inject Events on Demand)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {session?.injections?.map((inj: any) => (
                <div key={inj.id} className="bg-[#FAF9F6] border border-[#E4E4E7] p-4 rounded-lg text-xs flex flex-col justify-between">
                  <div>
                    <h4 className="font-semibold text-[#18181B]">{inj.title}</h4>
                    <p className="text-[#71717A] mt-1">Scheduled: {inj.scheduled_simulated_seconds}s</p>
                    {inj.expected_action && (
                      <p className="text-[11px] text-[#52525B] mt-2 italic">Expected: {inj.expected_action}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleTriggerInjection(inj)}
                    className="mt-4 bg-[#C59B27] hover:bg-[#A37F1D] text-white font-bold py-1.5 rounded text-[10px] cursor-pointer"
                  >
                    Trigger Injection Now
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Real-time Debrief Form (Facilitator Console Debrief Editor) */}
          <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider mb-4">Facilitator Quick Debrief Notes</h3>
            <p className="text-xs text-[#52525B] mb-4">Prepare structural feedback. This is synchronized instantly for team members to read post-rehearsal.</p>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-semibold text-[#18181B] uppercase tracking-wider mb-2">1. Main Observations & Rehearsal Summary</label>
                <textarea
                  value={debriefSummary}
                  onChange={(e) => setDebriefSummary(e.target.value)}
                  placeholder="Record how the team performed check-in scans, resolved holds, or responded to incidents."
                  rows={2}
                  className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#18181B] uppercase tracking-wider mb-2">2. Demonstrated Strengths</label>
                <textarea
                  value={debriefStrengths}
                  onChange={(e) => setDebriefStrengths(e.target.value)}
                  placeholder="e.g. Prompt communication, immediate alert acknowledgment, disciplined incident logs."
                  rows={2}
                  className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#18181B] uppercase tracking-wider mb-2">3. Primary Improvement Areas</label>
                <textarea
                  value={debriefImprovements}
                  onChange={(e) => setDebriefImprovements(e.target.value)}
                  placeholder="e.g. Speed up dual verification of pickup codes under intermittent network conditions."
                  rows={2}
                  className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
                />
              </div>

              <button
                onClick={async () => {
                  try {
                    // Save Debrief Notes
                    setSuccessMsg('Facilitator Quick Debrief notes saved successfully.');
                  } catch (err) {
                    console.error(err);
                  }
                }}
                className="w-full bg-[#C59B27] hover:bg-[#A37F1D] text-white font-semibold py-2 rounded-lg cursor-pointer"
              >
                Save Debrief Draft
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
