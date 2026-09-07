import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { trainingApi } from '../../services/trainingApi';

interface TrainingObserverModeProps {
  sessionId: string;
  onNavigate: (route: string) => void;
  userId?: string;
}

export const TrainingObserverMode: React.FC<TrainingObserverModeProps> = ({
  sessionId,
  onNavigate,
  userId
}) => {
  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('Team communication');
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
    if (!note.trim()) return;
    try {
      const res = await trainingApi.addObservation(sessionId, {
        category,
        note: note.trim()
      });
      if (res.success) {
        setSuccessMsg('Observation note saved.');
        setNote('');
        loadSession();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 min-h-[50vh] font-sans">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#C59B27] border-t-transparent"></div>
        <p className="text-xs text-zinc-500 mt-3 font-sans">Loading observer view...</p>
      </div>
    );
  }

  const session = sessionData;

  return (
    <div
      id="training-observer-board-container"
      data-view-version="training-observer-mode-v2-human"
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-serif text-zinc-900 tracking-tight">
            Observer view
          </h1>
          <p className="text-xs text-zinc-600 mt-1">
            Observe team practice, follow checklist progress, and note helpful feedback.
          </p>
        </div>
        <button
          onClick={() => onNavigate(`/admin/training/sessions/${sessionId}`)}
          className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-xl border border-[#EAE8E1] bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold transition-colors cursor-pointer"
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
        {/* Left Column: Post Note */}
        <div className="bg-white rounded-2xl border border-[#EAE8E1] p-6 shadow-2xs h-fit">
          <h2 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-4">
            Add observation note
          </h2>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                Topic
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
              >
                <option value="Team communication">Team communication</option>
                <option value="Arrivals and check-in">Arrivals and check-in</option>
                <option value="Team coordination">Team coordination</option>
                <option value="Safety response">Safety response</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                Note
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Record helpful feedback or notes on team teamwork..."
                rows={4}
                className="w-full bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
              />
            </div>

            <button
              type="button"
              onClick={handlePostNote}
              className="w-full min-h-[40px] px-5 py-2 rounded-xl bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs text-center"
            >
              Save note
            </button>
          </div>
        </div>

        {/* Right 2 Columns: Objectives Progress */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-[#EAE8E1] p-6 shadow-2xs">
            <h2 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-4">
              Checklist progress
            </h2>

            <div className="space-y-2.5 text-xs">
              {session?.objectives && session.objectives.length > 0 ? (
                session.objectives.map((obj: any) => {
                  const matchResult = session?.objectiveResults?.find((r: any) => r.objective_id === obj.id);
                  const isCompleted = matchResult?.status === 'Completed';

                  return (
                    <div
                      key={obj.id}
                      className="p-3.5 rounded-xl bg-zinc-50/70 border border-[#EAE8E1] flex items-start gap-2.5"
                    >
                      <span className={`text-sm mt-0.5 font-bold ${isCompleted ? 'text-emerald-600' : 'text-zinc-400'}`}>
                        {isCompleted ? '✓' : '○'}
                      </span>
                      <div>
                        <h3 className="font-semibold text-zinc-900">{obj.title}</h3>
                        <p className="text-zinc-500 mt-0.5">{obj.description}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-3.5 rounded-xl bg-zinc-50/70 border border-[#EAE8E1] text-zinc-500">
                  No specific checklist items configured.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
