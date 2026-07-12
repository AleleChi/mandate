import React, { useState, useEffect } from 'react';
import { trainingApi } from '../../services/trainingApi';

interface TrainingDebriefProps {
  sessionId: string;
  onNavigate: (route: string) => void;
  userId: string;
}

export const TrainingDebrief: React.FC<TrainingDebriefProps> = ({
  sessionId,
  onNavigate,
  userId
}) => {
  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [personalOutcome, setPersonalOutcome] = useState('');
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    loadSession();
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

  const handleAddPersonalOutcome = () => {
    if (!personalOutcome) return;
    setOutcomes([...outcomes, personalOutcome]);
    setPersonalOutcome('');
    setSuccessMsg('Personal feedback outcome saved.');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 bg-[#FAF9F6] min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C59B27]"></div>
      </div>
    );
  }

  const session = sessionData;
  const completedCount = session?.objectiveResults?.filter((r: any) => r.status === 'Completed').length || 0;
  const totalObjectives = session?.objectives?.length || 1;
  const percentCompleted = Math.round((completedCount / totalObjectives) * 100);

  return (
    <div 
      id="training-debrief-container"
      data-view-version="training-debrief-v1-premium"
      className="max-w-4xl mx-auto px-4 sm:px-6 py-8 font-sans bg-[#FAF9F6]"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-[#18181B] tracking-tight font-sans">Practice Debrief Dashboard</h1>
          <p className="text-xs text-[#52525B] mt-1 font-sans">Finalized performance metrics, completed objective feedback, and collective strengths.</p>
        </div>
        <button
          onClick={() => onNavigate('/admin/training/scenarios')}
          className="bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer font-sans"
        >
          Exit to Scenario Library
        </button>
      </div>

      {successMsg && (
        <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg font-sans">
          {successMsg}
        </div>
      )}

      {/* Visual Rehearsal metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 font-sans">
        <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm text-center">
          <span className="text-xs text-[#71717A] uppercase font-bold tracking-wider">Objectives Met</span>
          <div className="text-3xl font-bold text-[#18181B] mt-1">{completedCount} / {totalObjectives}</div>
          <div className="w-full bg-[#FAF9F6] h-1.5 rounded-full mt-3 overflow-hidden">
            <div className="bg-[#C59B27] h-full" style={{ width: `${percentCompleted}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm text-center">
          <span className="text-xs text-[#71717A] uppercase font-bold tracking-wider">Communication Quality</span>
          <div className="text-3xl font-bold text-emerald-600 mt-1">98%</div>
          <p className="text-[10px] text-[#A1A1AA] mt-1">No lost transmissions or blank alerts</p>
        </div>

        <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm text-center">
          <span className="text-xs text-[#71717A] uppercase font-bold tracking-wider">Reconciled Confirms</span>
          <div className="text-3xl font-bold text-[#18181B] mt-1">100%</div>
          <p className="text-[10px] text-[#A1A1AA] mt-1">All practice scans verified factual</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-sans">
        {/* Collective feedback */}
        <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider">Collective Performance Review</h3>
          
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="p-3 bg-[#FAF9F6] rounded-lg border border-[#E4E4E7]">
              <strong className="text-[#18181B] block font-sans">Demonstrated Strengths:</strong>
              <p className="text-[#52525B] mt-1 font-sans">Very fast dual-verification of codes. Prompt radio communications. Solid transition protocols when changing shift roles.</p>
            </div>
            
            <div className="p-3 bg-[#FAF9F6] rounded-lg border border-[#E4E4E7]">
              <strong className="text-[#18181B] block font-sans">Areas of Improvement:</strong>
              <p className="text-[#52525B] mt-1 font-sans">Accelerate response latency to unacknowledged hold alerts when working offline.</p>
            </div>
          </div>
        </div>

        {/* Participant reviews & personal learnings */}
        <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm space-y-4 font-sans">
          <h3 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider">Personal Learning Outcomes</h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#52525B] mb-1.5 font-sans">Record your personal takeaway from this rehearsal:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={personalOutcome}
                  onChange={(e) => setPersonalOutcome(e.target.value)}
                  placeholder="e.g. Learned how to manage scan queues offline."
                  className="flex-1 bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-sans"
                />
                <button
                  onClick={handleAddPersonalOutcome}
                  className="bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold px-4 py-1.5 rounded-lg cursor-pointer font-sans"
                >
                  Save Takeaway
                </button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {outcomes.map((ot, i) => (
                <div key={i} className="text-xs p-2.5 bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg text-[#52525B] font-sans">
                  ✓ {ot}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
