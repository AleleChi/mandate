import React, { useState, useEffect } from 'react';
import { trainingApi } from '../../services/trainingApi';

interface TrainingSessionSetupProps {
  scenarioId: string;
  onNavigate: (route: string) => void;
  onSessionCreated: (sessionId: string) => void;
}

export const TrainingSessionSetup: React.FC<TrainingSessionSetupProps> = ({
  scenarioId,
  onNavigate,
  onSessionCreated
}) => {
  const [scenario, setScenario] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sessionName, setSessionName] = useState('');
  const [size, setSize] = useState('small');
  const [networkMode, setNetworkMode] = useState('online');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadScenario();
  }, [scenarioId]);

  const loadScenario = async () => {
    try {
      const res = await trainingApi.getScenarioDetail(scenarioId);
      if (res.success) {
        setScenario(res.scenario);
        setSessionName(res.scenario.title + ' Session');
      }
    } catch (err) {
      console.error('Failed to load scenario details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBegin = async () => {
    if (!sessionName) {
      alert('Please enter a practice session name.');
      return;
    }
    setCreating(true);
    try {
      const res = await trainingApi.createSession({
        name: sessionName,
        scenario_id: scenarioId,
        simulated_event_size: size
      });
      if (res.success && res.sessionId) {
        onSessionCreated(res.sessionId);
      }
    } catch (err) {
      console.error('Failed to create training session:', err);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C59B27]"></div>
      </div>
    );
  }

  return (
    <div 
      id="training-session-setup-container"
      data-view-version="training-session-setup-v1-premium"
      className="max-w-3xl mx-auto px-4 sm:px-6 py-8 font-sans bg-[#FAF9F6]"
    >
      <div className="bg-white rounded-xl border border-[#E4E4E7] p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-[#18181B] tracking-tight">Setup Practice Session</h1>
        <p className="text-xs text-[#52525B] mt-1">Configure parameters before inviting team members to join this simulated drill.</p>

        <div className="mt-6 border-t border-[#F4F4F5] pt-6">
          <div className="mb-6">
            <label className="block text-xs font-semibold text-[#18181B] uppercase tracking-wider mb-2">Selected Scenario</label>
            <div className="bg-[#FAF9F6] border border-[#E4E4E7] p-4 rounded-lg">
              <h3 className="text-sm font-semibold text-[#18181B]">{scenario?.title}</h3>
              <p className="text-xs text-[#52525B] mt-1">{scenario?.description}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-[#52525B] mb-1.5">Practice Session Name</label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Saturday Team Rehearsal"
                className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-sm text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#52525B] mb-1.5">Synthetic Event Size</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-sm text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              >
                <option value="small">Small (3 Simulated Children)</option>
                <option value="medium">Medium (5 Simulated Children)</option>
                <option value="large">Large Event Rehearsal (8 Simulated Children)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#52525B] mb-1.5">Simulated Network Mode</label>
              <select
                value={networkMode}
                onChange={(e) => setNetworkMode(e.target.value)}
                className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-sm text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              >
                <option value="online">Simulated Stable Connection</option>
                <option value="weak">Simulated Intermittent Weak Network</option>
                <option value="offline">Simulated Completely Offline</option>
              </select>
            </div>
          </div>
        </div>

        <div className="border-t border-[#F4F4F5] mt-8 pt-6 flex justify-end gap-3">
          <button
            onClick={() => onNavigate('/admin/training/scenarios')}
            className="bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#18181B] font-semibold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleBegin}
            disabled={creating}
            className="bg-[#C59B27] hover:bg-[#A37F1D] disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg text-sm transition-colors cursor-pointer"
          >
            {creating ? 'Creating...' : 'Begin Session'}
          </button>
        </div>
      </div>
    </div>
  );
};
