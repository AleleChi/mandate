import React, { useState, useEffect } from 'react';
import { trainingApi } from '../../services/trainingApi';

interface TrainingObserverModeProps {
  sessionId: string;
  onNavigate: (route: string) => void;
  userId: string;
}

export const TrainingObserverMode: React.FC<TrainingObserverModeProps> = ({
  sessionId,
  onNavigate,
  userId
}) => {
  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('Communication');
  const [note, setNote] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    loadSession();
    const interval = setInterval(() => {
      loadSession();
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

  const handlePostNote = async () => {
    if (!note) return;
    try {
      const res = await trainingApi.addObservation(sessionId, {
        category,
        note
      });
      if (res.success) {
        setSuccessMsg('Timestamped observation saved.');
        setNote('');
        loadSession();
      }
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

  return (
    <div 
      id="training-observer-board-container"
      data-view-version="training-observer-mode-v1-premium"
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans bg-[#FAF9F6]"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-[#18181B] tracking-tight">Observer Board</h1>
          <p className="text-xs text-[#52525B] mt-1">Record feedback, observe checklist progress, and log strengths in real-time.</p>
        </div>
        <button
          onClick={() => onNavigate(`/admin/training/sessions/${sessionId}`)}
          className="bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer"
        >
          Open Participant Screen
        </button>
      </div>

      {successMsg && (
        <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg">
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col: Post Note */}
        <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm h-fit">
          <h3 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider mb-4">Record Observation</h3>
          
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-xs font-medium text-[#52525B] mb-1.5">Feedback Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              >
                <option value="Communication">Communication & Radio Use</option>
                <option value="Registration Speed">Registration Speed</option>
                <option value="Incident Coordination">Incident Coordination</option>
                <option value="Safety Response">Safety & Escalation Response</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#52525B] mb-1.5">Observation Note</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe your observation factual details..."
                rows={4}
                className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-xs text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
              />
            </div>

            <button
              onClick={handlePostNote}
              className="w-full bg-[#C59B27] hover:bg-[#A37F1D] text-white font-semibold py-2 rounded-lg cursor-pointer"
            >
              Post Observation Note
            </button>
          </div>
        </div>

        {/* Center & Right: Objectives and Timeline */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider mb-4">Objective Progress Board</h3>
            <div className="space-y-3 text-xs">
              {session?.objectives?.map((obj: any) => {
                const matchResult = session?.objectiveResults?.find((r: any) => r.objective_id === obj.id);
                const isCompleted = matchResult?.status === 'Completed';

                return (
                  <div key={obj.id} className="flex justify-between items-center bg-[#FAF9F6] border border-[#E4E4E7] p-3 rounded-lg">
                    <div>
                      <h4 className="font-semibold text-[#18181B]">{obj.title}</h4>
                      <p className="text-[#71717A] mt-0.5">{obj.description}</p>
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

        </div>

      </div>
    </div>
  );
};
