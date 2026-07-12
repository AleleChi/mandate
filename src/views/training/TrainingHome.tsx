import React, { useState, useEffect } from 'react';
import { trainingApi } from '../../services/trainingApi';

interface TrainingHomeProps {
  sessionId: string;
  onNavigate: (route: string) => void;
  onExit: () => void;
  userId: string;
}

export const TrainingHome: React.FC<TrainingHomeProps> = ({
  sessionId,
  onNavigate,
  onExit,
  userId
}) => {
  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('');
  const [passInput, setPassInput] = useState('');
  const [scanResult, setScanResult] = useState<any>(null);
  const [alertCategory, setAlertCategory] = useState('Missing Child');
  const [alertMessage, setAlertMessage] = useState('');
  const [incidentCategory, setIncidentCategory] = useState('Medical Incident');
  const [incidentSummary, setIncidentSummary] = useState('');
  const [incidentDetails, setIncidentDetails] = useState('');
  const [activity, setActivity] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // SSE/Polling
  useEffect(() => {
    if (!sessionId) return;
    loadSession();
    const interval = setInterval(() => {
      loadSession();
      loadActivity();
    }, 3000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const loadSession = async () => {
    if (!sessionId) return;
    try {
      const res = await trainingApi.getSessionDetail(sessionId);
      if (res && res.success && res.session) {
        setSessionData(res.session);
        // Find if this user already has a participant role assigned
        const match = res.session.participants?.find((p: any) => p.user_id === userId);
        if (match) {
          setRole(match.training_role);
        }
      }
    } catch (err) {
      console.error('Failed to load session detail:', err);
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

  const handleJoinRole = async (selectedRole: string) => {
    try {
      const res = await trainingApi.joinSession(sessionId, selectedRole);
      if (res.success) {
        setRole(selectedRole);
        showSuccess(`Joined successfully as simulated ${selectedRole}.`);
        loadSession();
      }
    } catch (err: any) {
      showError('Failed to join role.');
    }
  };

  const handleStartSession = async () => {
    try {
      const res = await trainingApi.startSession(sessionId);
      if (res.success) {
        showSuccess('Session started.');
        loadSession();
      }
    } catch (err) {
      showError('Failed to start.');
    }
  };

  const handleCheckInSubmit = async () => {
    if (!passInput) return;
    try {
      const res = await trainingApi.checkInChild(sessionId, { passCode: passInput.trim() });
      if (res.success) {
        showSuccess(res.message);
        setPassInput('');
        loadSession();
        loadActivity();
      }
    } catch (err: any) {
      showError('Simulated pass reference not found or duplicate detected.');
    }
  };

  const handleRaiseAlert = async () => {
    if (!alertMessage) return;
    try {
      const res = await trainingApi.raiseAlert(sessionId, {
        category: alertCategory,
        severity: 'Urgent',
        message: alertMessage,
        locationLabel: 'Simulated Main Hall'
      });
      if (res.success) {
        showSuccess('Simulated safety request raised! Alerts broadcast to all training views.');
        setAlertMessage('');
        loadSession();
        loadActivity();
      }
    } catch (err) {
      showError('Failed to raise alert.');
    }
  };

  const handleCreateIncident = async () => {
    if (!incidentSummary) return;
    try {
      const res = await trainingApi.createIncident(sessionId, {
        category: incidentCategory,
        summary: incidentSummary,
        details: incidentDetails
      });
      if (res.success) {
        showSuccess('Simulated incident documented in training records.');
        setIncidentSummary('');
        setIncidentDetails('');
        loadSession();
        loadActivity();
      }
    } catch (err) {
      showError('Failed to document incident.');
    }
  };

  const handleRealConcern = async () => {
    if (confirm('CRITICAL: Are you sure you want to STOP the practice drill immediately due to a real safety concern?')) {
      try {
        const res = await trainingApi.triggerRealConcern(sessionId);
        if (res.success) {
          showError('DRILL STOPPED: A real safety concern has been flagged. Proceed with real-world procedures immediately.');
          loadSession();
        }
      } catch (err) {
        showError('Stoppage signal failed.');
      }
    }
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 5000);
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 bg-[#FAF9F6] min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C59B27]"></div>
      </div>
    );
  }

  const isFacilitator = sessionData?.facilitator_user_id === userId;
  const isSessionActive = sessionData?.status === 'active';

  return (
    <div 
      id="training-home-container"
      data-view-version="training-home-v1-premium"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans bg-[#FAF9F6]"
    >
      {/* Alert Banner / Messages */}
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm rounded-lg shadow-sm font-medium">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm rounded-lg shadow-sm font-medium">
          {successMsg}
        </div>
      )}

      {/* STOP DRILL / Real concern trigger */}
      <div className="bg-red-50 rounded-xl border border-red-200 p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <h3 className="text-sm font-semibold text-red-900">Drill Safety Stoppage Protocol</h3>
            <p className="text-xs text-red-700">If a real-world child security, medical, or safety hazard occurs during training, click this button immediately.</p>
          </div>
        </div>
        <button
          onClick={handleRealConcern}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg text-xs tracking-wider uppercase transition-colors cursor-pointer"
        >
          Stop Drill Immediately
        </button>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column: Session Overview, Role selection */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider mb-3">Session Details</h2>
            <div className="space-y-2 text-xs text-[#52525B]">
              <p>Scenario: <strong className="text-[#18181B]">{sessionData?.scenario_title}</strong></p>
              <p>Difficulty: <strong className="text-[#18181B]">{sessionData?.scenario_difficulty}</strong></p>
              <p>Status: <span className="capitalize font-bold text-[#C59B27]">{sessionData?.status}</span></p>
            </div>

            {/* Start session if draft */}
            {sessionData?.status === 'draft' && isFacilitator && (
              <button
                onClick={handleStartSession}
                className="w-full mt-4 bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold py-2 rounded-lg transition-colors cursor-pointer"
              >
                Start Practice Session
              </button>
            )}

            {isFacilitator && (
              <button
                onClick={() => onNavigate(`/admin/training/sessions/${sessionId}/facilitator`)}
                className="w-full mt-3 bg-white hover:bg-[#FAF9F6] text-[#C59B27] border border-[#C59B27] text-xs font-semibold py-2 rounded-lg transition-colors cursor-pointer"
              >
                Open Facilitator Console
              </button>
            )}
            <button
              onClick={() => onNavigate(`/admin/training/sessions/${sessionId}/observer`)}
              className="w-full mt-2 bg-white hover:bg-[#FAF9F6] text-[#52525B] border border-[#E4E4E7] text-xs font-medium py-2 rounded-lg transition-colors cursor-pointer"
            >
              Open Observer Board
            </button>
          </div>

          <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider mb-4">Select Practice Role</h2>
            <div className="grid grid-cols-1 gap-2.5">
              {['Check-in Team', 'Room Lead', 'Pickup Team', 'Responder'].map((r) => (
                <button
                  key={r}
                  onClick={() => handleJoinRole(r)}
                  className={`w-full py-2.5 px-4 rounded-lg text-xs font-medium border text-left transition-all cursor-pointer ${
                    role === r 
                      ? 'bg-[#C59B27] text-white border-[#C59B27]' 
                      : 'bg-[#FAF9F6] text-[#18181B] border-[#E4E4E7] hover:bg-[#F4F4F5]'
                  }`}
                >
                  {r} {role === r ? '✓' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center & Right column: Action Playground & Objectives status */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active Sandbox Area based on practice role */}
          {role ? (
            <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm">
              <h2 className="text-base font-semibold text-[#18181B] tracking-tight mb-4">
                Simulated {role} Work Area
              </h2>

              {!isSessionActive ? (
                <p className="text-xs text-[#71717A] italic">Please wait until the facilitator starts the practice session.</p>
              ) : (
                <div className="space-y-6">
                  {/* Check-in team interface */}
                  {role === 'Check-in Team' && (
                    <div className="space-y-4">
                      <div className="bg-[#FAF9F6] border border-[#E4E4E7] p-4 rounded-lg">
                        <h4 className="text-xs font-semibold text-[#18181B] mb-2">Arrivals In Queue (Simulated Child Personas)</h4>
                        <div className="space-y-2">
                          {sessionData?.personas?.map((p: any) => (
                            <div key={p.id} className="flex justify-between items-center bg-white p-2.5 rounded border border-[#E4E4E7] text-xs">
                              <div>
                                <span className="font-semibold text-[#18181B]">{p.display_name}</span>
                                <span className="text-[#71717A] ml-2">({p.safe_profile.calculatedAge} yrs, {p.safe_profile.ageGroup})</span>
                              </div>
                              <span className="font-mono bg-[#FAF9F6] text-[#C59B27] px-2 py-0.5 rounded border border-[#C59B27]/10 font-bold">
                                {p.safe_profile.passCode}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#52525B] mb-1.5">Scan / Enter Pass Code</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={passInput}
                            onChange={(e) => setPassInput(e.target.value)}
                            placeholder="e.g. TPASS-LIAM-819"
                            className="flex-1 bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                          />
                          <button
                            onClick={handleCheckInSubmit}
                            className="bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
                          >
                            Practice Check-In
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Room Lead / Responder alert trigger interface */}
                  {(role === 'Room Lead' || role === 'Responder') && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-[#52525B] mb-1.5">Alert Reason</label>
                          <select
                            value={alertCategory}
                            onChange={(e) => setAlertCategory(e.target.value)}
                            className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                          >
                            <option value="Missing Child">Missing Child</option>
                            <option value="Safeguarding Hold">Safeguarding Hold</option>
                            <option value="Medical Emergency">Medical Emergency</option>
                            <option value="Unauthorised Person">Unauthorised Person</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#52525B] mb-1.5">Situation Summary / Message</label>
                          <input
                            type="text"
                            value={alertMessage}
                            onChange={(e) => setAlertMessage(e.target.value)}
                            placeholder="e.g. Liam Smith missing from room A"
                            className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleRaiseAlert}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2 rounded-lg transition-colors cursor-pointer"
                      >
                        Raise Practice Safety Request
                      </button>
                    </div>
                  )}

                  {/* Responder incident report interface */}
                  {role === 'Responder' && (
                    <div className="space-y-4 border-t border-[#F4F4F5] pt-4">
                      <h4 className="text-xs font-semibold text-[#18181B]">Simulate Incident Logging</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-[#52525B] mb-1.5">Incident Category</label>
                          <select
                            value={incidentCategory}
                            onChange={(e) => setIncidentCategory(e.target.value)}
                            className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                          >
                            <option value="Medical Incident">Medical Incident</option>
                            <option value="Unregistered Collector Hold">Unregistered Collector Hold</option>
                            <option value="Property Damage">Property Damage</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#52525B] mb-1.5">Incident Short Summary</label>
                          <input
                            type="text"
                            value={incidentSummary}
                            onChange={(e) => setIncidentSummary(e.target.value)}
                            placeholder="e.g. Resolved duplicate entry attempt"
                            className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#52525B] mb-1.5">Incident Action Details</label>
                        <textarea
                          value={incidentDetails}
                          onChange={(e) => setIncidentDetails(e.target.value)}
                          placeholder="Factual step-by-step actions taken."
                          rows={2}
                          className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
                        />
                      </div>
                      <button
                        onClick={handleCreateIncident}
                        className="w-full bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold py-2 rounded-lg transition-colors cursor-pointer"
                      >
                        File Practice Incident Report
                      </button>
                    </div>
                  )}

                  {role === 'Pickup Team' && (
                    <div className="space-y-4">
                      <div className="bg-[#FAF9F6] border border-[#E4E4E7] p-4 rounded-lg">
                        <h4 className="text-xs font-semibold text-[#18181B] mb-2">Simulated Active Children in Event</h4>
                        <div className="space-y-2">
                          {sessionData?.personas?.map((p: any) => (
                            <div key={p.id} className="bg-white p-3 rounded border border-[#E4E4E7] text-xs space-y-1.5">
                              <div className="flex justify-between font-semibold text-[#18181B]">
                                <span>{p.display_name}</span>
                                <span className="text-[#C59B27]">Active in Hall</span>
                              </div>
                              <p className="text-[11px] text-[#71717A]">
                                Guardian: <strong className="text-[#18181B]">{p.safe_profile.guardianName}</strong> ({p.safe_profile.guardianPhone})
                              </p>
                              <div className="pt-2 flex gap-2">
                                <button
                                  onClick={async () => {
                                    if (confirm(`Simulate pickup release of ${p.display_name}?`)) {
                                      try {
                                        const res = await trainingApi.pickupChild(sessionId, { childId: p.id, collectorName: p.safe_profile.guardianName });
                                        if (res.success) {
                                          showSuccess(res.message);
                                          loadSession();
                                        }
                                      } catch (err) {
                                        showError('Failed to perform pickup release.');
                                      }
                                    }
                                  }}
                                  className="bg-[#C59B27] hover:bg-[#A37F1D] text-white px-3 py-1 rounded text-[10px] font-bold cursor-pointer"
                                >
                                  Release to Guardian
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#E4E4E7] p-8 text-center shadow-sm">
              <span className="text-2xl">☝️</span>
              <h3 className="text-sm font-semibold text-[#18181B] mt-2">No Active Practice Role Assigned</h3>
              <p className="text-xs text-[#52525B] mt-1">Please select an assigned practice role from the side panel to start practicing drill operations.</p>
            </div>
          )}

          {/* Real-time Objectives Status Checklist */}
          <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider mb-4">Objective Progress Board</h2>
            <div className="space-y-3">
              {sessionData?.objectives?.map((obj: any) => {
                const matchResult = sessionData?.objectiveResults?.find((r: any) => r.objective_id === obj.id);
                const isCompleted = matchResult?.status === 'Completed';

                return (
                  <div key={obj.id} className="flex justify-between items-start bg-[#FAF9F6] p-3.5 rounded-lg border border-[#E4E4E7] text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
                        <h4 className="font-semibold text-[#18181B]">{obj.title}</h4>
                      </div>
                      <p className="text-[#52525B] mt-1 ml-4 leading-relaxed">{obj.description}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {isCompleted ? 'COMPLETED' : 'PENDING'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity Logs (Real-time Feed) */}
          <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider mb-4">Live Session Activity Logs</h2>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {activity.length === 0 ? (
                <p className="text-xs text-[#71717A] italic">No simulation logs recorded yet.</p>
              ) : (
                activity.map((act) => (
                  <div key={act.id} className="text-xs p-2.5 bg-[#FAF9F6] rounded border border-[#F4F4F5] flex justify-between gap-4">
                    <span className="text-[#52525B] leading-relaxed">{act.safe_summary}</span>
                    <span className="text-[10px] text-[#A1A1AA] font-mono whitespace-nowrap">
                      {new Date(act.real_created_at).toLocaleTimeString()}
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
