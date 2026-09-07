import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  Users,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { trainingApi } from '../../services/trainingApi';
import {
  formatScenarioTitle,
  formatScenarioTopic,
  formatPracticeRole
} from './trainingFormatters';

interface TrainingHomeProps {
  sessionId: string;
  onNavigate: (route: string) => void;
  onExit: () => void;
  userId?: string;
}

export const TrainingHome: React.FC<TrainingHomeProps> = ({
  sessionId,
  onNavigate,
  onExit,
  userId
}) => {
  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('Check-in team');
  const [passInput, setPassInput] = useState('');
  const [alertCategory, setAlertCategory] = useState('Child not at assigned area');
  const [alertMessage, setAlertMessage] = useState('');
  const [incidentCategory, setIncidentCategory] = useState('Medical assistance');
  const [incidentSummary, setIncidentSummary] = useState('');
  const [incidentDetails, setIncidentDetails] = useState('');
  const [activity, setActivity] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Poll for updates
  useEffect(() => {
    if (!sessionId) return;
    loadSession();
    loadActivity();
    const interval = setInterval(() => {
      loadSession();
      loadActivity();
    }, 3000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Elapsed time tracker
  useEffect(() => {
    if (!sessionData?.created_at) return;
    const startTime = new Date(sessionData.created_at).getTime();
    const updateElapsed = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - startTime) / 1000));
      setElapsedSeconds(diff);
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [sessionData?.created_at]);

  const loadSession = async () => {
    if (!sessionId) return;
    try {
      const res = await trainingApi.getSessionDetail(sessionId);
      if (res && res.success && res.session) {
        setSessionData(res.session);
        const match = res.session.participants?.find((p: any) => p.user_id === userId);
        if (match?.training_role) {
          setRole(match.training_role);
        }
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

  const handleSelectRole = async (selectedRole: string) => {
    try {
      const res = await trainingApi.joinSession(sessionId, selectedRole);
      if (res.success) {
        setRole(selectedRole);
        showSuccess(`You are now practising as: ${selectedRole}.`);
        loadSession();
      }
    } catch {
      setRole(selectedRole);
    }
  };

  const handleCheckInSubmit = async (codeToSubmit?: string) => {
    const code = (codeToSubmit || passInput).trim();
    if (!code) return;
    try {
      const res = await trainingApi.checkInChild(sessionId, { passCode: code });
      if (res.success) {
        showSuccess(res.message || 'Child details confirmed and checked in.');
        setPassInput('');
        loadSession();
        loadActivity();
      }
    } catch {
      showError('This pass code was not recognised or this pass was already presented. Please verify details with the guardian.');
    }
  };

  const handleRaiseAlert = async () => {
    if (!alertMessage.trim()) {
      showError('Please enter a brief description of the situation.');
      return;
    }
    try {
      const res = await trainingApi.raiseAlert(sessionId, {
        category: alertCategory,
        severity: 'Urgent',
        message: alertMessage.trim(),
        locationLabel: 'Practice Hall'
      });
      if (res.success) {
        showSuccess('Practice alert recorded. Team notified within this practice session.');
        setAlertMessage('');
        loadSession();
        loadActivity();
      }
    } catch {
      showError('Unable to send practice alert.');
    }
  };

  const handleCreateIncident = async () => {
    if (!incidentSummary.trim()) {
      showError('Please enter an incident summary.');
      return;
    }
    try {
      const res = await trainingApi.createIncident(sessionId, {
        category: incidentCategory,
        summary: incidentSummary.trim(),
        details: incidentDetails.trim()
      });
      if (res.success) {
        showSuccess('Practice record saved to session debrief notes.');
        setIncidentSummary('');
        setIncidentDetails('');
        loadSession();
        loadActivity();
      }
    } catch {
      showError('Unable to save incident record.');
    }
  };

  const handlePickupChild = async (childId: string, guardianName: string, childName: string) => {
    try {
      const res = await trainingApi.pickupChild(sessionId, { childId, collectorName: guardianName });
      if (res.success) {
        showSuccess(`Confirmed departure of ${childName} to guardian ${guardianName}.`);
        loadSession();
        loadActivity();
      }
    } catch {
      showError('Unable to record pickup.');
    }
  };

  const handleRealConcern = async () => {
    const confirmed = window.confirm(
      'SAFETY NOTICE: If an actual emergency has occurred in the church, click OK to stop this practice session immediately and return to real procedures.'
    );
    if (confirmed) {
      try {
        await trainingApi.triggerRealConcern(sessionId);
      } catch {
        // Non-blocking
      }
      showError('PRACTICE STOPPED: Please follow standard church emergency procedures immediately.');
      setTimeout(() => {
        onExit();
      }, 2000);
    }
  };

  const handleEndPractice = async () => {
    try {
      await trainingApi.completeSession(sessionId);
    } catch (err) {
      console.error('Failed to complete session:', err);
    }
    onNavigate(`/admin/training/sessions/${sessionId}/debrief`);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 5000);
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 min-h-[50vh] font-sans">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#C59B27] border-t-transparent"></div>
        <p className="text-xs text-zinc-500 mt-3 font-sans">Loading practice session...</p>
      </div>
    );
  }

  const scenarioTitle = formatScenarioTitle(sessionData?.scenario_title);
  const scenarioTopic = formatScenarioTopic(undefined, sessionData?.scenario_title);
  const currentRole = formatPracticeRole(role);

  return (
    <div
      id="training-home-container"
      data-view-version="training-home-v2-human"
      className="max-w-6xl mx-auto px-4 sm:px-6 py-6 font-sans"
    >
      {/* Messages */}
      {errorMsg && (
        <div className="mb-4 p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-xl text-xs text-amber-900 font-medium">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 p-3.5 bg-emerald-50/80 border border-emerald-200/90 rounded-xl text-xs text-emerald-900 font-medium">
          {successMsg}
        </div>
      )}

      {/* In-Practice Context Header */}
      <div className="bg-white rounded-2xl border border-[#EAE8E1] p-4 sm:p-5 mb-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-[#C59B27]/10 text-[#8C6D1F] border border-[#C59B27]/20 font-semibold px-2 py-0.5 rounded text-[11px]">
                Practice mode
              </span>
              <span className="text-zinc-300">•</span>
              <span className="text-xs text-zinc-500">
                {scenarioTopic}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-serif text-zinc-900 tracking-tight">
              {scenarioTitle}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-xs text-zinc-600">
              <span>Practising as: <strong className="text-zinc-900">{currentRole}</strong></span>
              <span className="text-zinc-300">•</span>
              <span className="inline-flex items-center gap-1 text-zinc-500">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                {formatElapsed(elapsedSeconds)} elapsed
              </span>
              <span className="text-zinc-300 hidden md:inline">•</span>
              <span className="text-zinc-500 hidden md:inline">No live event changes</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleEndPractice}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs text-center"
            >
              End practice & view debrief
            </button>
          </div>
        </div>
      </div>

      {/* Safety stoppage notification - calm, reassuring */}
      <div className="bg-[#FFFDF7] rounded-xl border border-amber-200/60 p-3.5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-amber-950">
          <span className="text-base">⚠️</span>
          <span>
            <strong>Safety notice:</strong> If an actual emergency occurs during practice, stop practice immediately and follow standard church procedures.
          </span>
        </div>
        <button
          type="button"
          onClick={handleRealConcern}
          className="shrink-0 px-3 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 text-[11px] font-semibold transition-colors cursor-pointer"
        >
          Stop practice for real emergency
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Role selector & session links */}
        <div className="space-y-6">
          {/* Switch Role */}
          <div className="bg-white rounded-2xl border border-[#EAE8E1] p-5 shadow-2xs">
            <h2 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-3">
              Practice as
            </h2>
            <div className="space-y-1.5">
              {[
                { id: 'Check-in team', label: 'Check-in team' },
                { id: 'Room lead', label: 'Room lead' },
                { id: 'Pickup team', label: 'Pickup team' },
                { id: 'Care lead', label: 'Care lead' }
              ].map((r) => {
                const isCurrent = role.toLowerCase().includes(r.id.toLowerCase().split(' ')[0]);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectRole(r.id)}
                    className={`w-full py-2 px-3 rounded-xl border text-xs text-left transition-all cursor-pointer flex items-center justify-between ${
                      isCurrent
                        ? 'border-[#C59B27] bg-[#FAF8F2] text-[#8C6D1F] font-semibold ring-1 ring-[#C59B27]'
                        : 'border-[#EAE8E1] bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <span>{r.label}</span>
                    {isCurrent && <span>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Practice Checklist */}
          <div className="bg-white rounded-2xl border border-[#EAE8E1] p-5 shadow-2xs">
            <h2 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-3">
              Checklist for this practice
            </h2>
            <div className="space-y-2.5 text-xs">
              {sessionData?.objectives && sessionData.objectives.length > 0 ? (
                sessionData.objectives.map((obj: any) => {
                  const matchResult = sessionData?.objectiveResults?.find((r: any) => r.objective_id === obj.id);
                  const isDone = matchResult?.status === 'Completed';
                  return (
                    <div
                      key={obj.id}
                      className="p-3 rounded-xl bg-zinc-50/80 border border-[#EAE8E1] flex items-start gap-2.5"
                    >
                      <span className={`text-sm mt-0.5 ${isDone ? 'text-emerald-600' : 'text-zinc-400'}`}>
                        {isDone ? '✓' : '○'}
                      </span>
                      <div>
                        <p className={`font-medium ${isDone ? 'text-zinc-900 line-through' : 'text-zinc-800'}`}>
                          {obj.title}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {obj.description}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-3 rounded-xl bg-zinc-50/80 border border-[#EAE8E1] text-zinc-500 text-xs">
                  Practise the agreed workflow calmly with your team.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right 2 Columns: Role Action Playground */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main practice workspace */}
          <div className="bg-white rounded-2xl border border-[#EAE8E1] p-6 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#F4F3ED] pb-4 mb-5">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  {currentRole} workspace
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Practise the real steps used on event day. All records remain practice-only.
                </p>
              </div>
              <span className="text-xs text-zinc-500 font-medium">
                Simulated attendance
              </span>
            </div>

            {/* Check-in Team UI */}
            {role.toLowerCase().includes('check-in') && (
              <div className="space-y-5">
                {/* Manual or Scanned code input */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2">
                    Enter or scan pass code
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={passInput}
                      onChange={(e) => setPassInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCheckInSubmit();
                        }
                      }}
                      placeholder="e.g. TPASS-LIAM-819"
                      className="flex-1 bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                    />
                    <button
                      type="button"
                      onClick={() => handleCheckInSubmit()}
                      className="min-h-[42px] px-5 py-2.5 rounded-xl bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold transition-colors cursor-pointer shrink-0 shadow-2xs"
                    >
                      Check in child
                    </button>
                  </div>
                </div>

                {/* Queue of practice children */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                      Children arriving at check-in
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Click to practise scanning
                    </span>
                  </div>

                  <div className="space-y-2">
                    {sessionData?.personas?.map((p: any) => (
                      <div
                        key={p.id}
                        className="p-3 bg-zinc-50/60 rounded-xl border border-[#EAE8E1] flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-900">{p.display_name}</span>
                            <span className="text-[11px] text-zinc-500">
                              ({p.safe_profile?.calculatedAge || 7} yrs, {p.safe_profile?.ageGroup || 'Primary'})
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">
                            Guardian: {p.safe_profile?.guardianName || 'Parent'}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <code className="text-[11px] bg-white border border-[#EAE8E1] px-2 py-1 rounded text-[#8C6D1F] font-mono">
                            {p.safe_profile?.passCode || 'PASS-001'}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCheckInSubmit(p.safe_profile?.passCode)}
                            className="px-3 py-1.5 rounded-lg border border-[#EAE8E1] bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-medium cursor-pointer transition-colors"
                          >
                            Check in
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Room Lead / Care Lead Safety Alert */}
            {(role.toLowerCase().includes('room') || role.toLowerCase().includes('care') || role.toLowerCase().includes('responder')) && (
              <div className="space-y-5">
                <div className="p-4 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs">
                  <h3 className="font-semibold text-zinc-900 mb-1">
                    Practise team safety alert
                  </h3>
                  <p className="text-zinc-600">
                    Practise the steps to inform the team when an urgent matter arises. This alert is kept within practice mode and does not send actual SMS, WhatsApp, or emergency alarms.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">
                      Situation type
                    </label>
                    <select
                      value={alertCategory}
                      onChange={(e) => setAlertCategory(e.target.value)}
                      className="w-full bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
                    >
                      <option value="Child not at assigned area">Child not at assigned area</option>
                      <option value="Medical assistance">Medical assistance</option>
                      <option value="Safeguarding hold">Safeguarding hold</option>
                      <option value="Unauthorised collector">Unauthorised collector</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">
                      Factual note
                    </label>
                    <input
                      type="text"
                      value={alertMessage}
                      onChange={(e) => setAlertMessage(e.target.value)}
                      placeholder="e.g. Liam Smith not at primary room"
                      className="w-full bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRaiseAlert}
                  className="min-h-[42px] px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                >
                  Send practice alert
                </button>

                {/* Incident record section for care lead */}
                <div className="border-t border-[#F4F3ED] pt-5 mt-5">
                  <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-3">
                    Record practice incident note
                  </h3>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Category
                        </label>
                        <select
                          value={incidentCategory}
                          onChange={(e) => setIncidentCategory(e.target.value)}
                          className="w-full bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                        >
                          <option value="Medical assistance">Medical assistance</option>
                          <option value="Unregistered collector check">Unregistered collector check</option>
                          <option value="Duplicate pass check">Duplicate pass check</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Summary
                        </label>
                        <input
                          type="text"
                          value={incidentSummary}
                          onChange={(e) => setIncidentSummary(e.target.value)}
                          placeholder="e.g. Liam was with lead teacher"
                          className="w-full bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">
                        Action taken
                      </label>
                      <textarea
                        value={incidentDetails}
                        onChange={(e) => setIncidentDetails(e.target.value)}
                        placeholder="Factual summary of steps taken by the team."
                        rows={2}
                        className="w-full bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateIncident}
                      className="min-h-[40px] px-5 py-2 rounded-xl bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                    >
                      Save practice incident record
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Pickup Team UI */}
            {role.toLowerCase().includes('pickup') && (
              <div className="space-y-4">
                <p className="text-xs text-zinc-600">
                  Practise checking guardians and releasing children at the end of the session.
                </p>

                <div className="space-y-2.5">
                  {sessionData?.personas?.map((p: any) => (
                    <div
                      key={p.id}
                      className="p-3.5 bg-zinc-50/70 rounded-xl border border-[#EAE8E1] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-zinc-900">{p.display_name}</span>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          Registered collector: <strong className="text-zinc-700">{p.safe_profile?.guardianName || 'Parent'}</strong> ({p.safe_profile?.guardianPhone || '07000 000000'})
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePickupChild(p.id, p.safe_profile?.guardianName || 'Guardian', p.display_name)}
                        className="px-4 py-2 rounded-xl bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs shrink-0 text-center"
                      >
                        Confirm pickup
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="bg-white rounded-2xl border border-[#EAE8E1] p-6 shadow-2xs">
            <h2 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-3">
              Practice activity
            </h2>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {activity.length === 0 ? (
                <p className="text-xs text-zinc-500 italic py-2">
                  No actions taken in this practice session yet.
                </p>
              ) : (
                activity.map((act) => (
                  <div
                    key={act.id}
                    className="p-2.5 bg-zinc-50/80 rounded-xl border border-[#F4F3ED] flex items-center justify-between gap-4 text-xs"
                  >
                    <span className="text-zinc-700 leading-relaxed">
                      {act.safe_summary}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono shrink-0">
                      {new Date(act.real_created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
