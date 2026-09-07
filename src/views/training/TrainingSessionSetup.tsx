import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, ShieldCheck, UserCheck } from 'lucide-react';
import { trainingApi } from '../../services/trainingApi';
import {
  formatScenarioTitle,
  formatScenarioTopic,
  formatScenarioDescription,
  formatScenarioLevel,
  getScenarioGuidance
} from './trainingFormatters';

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
  const [selectedRole, setSelectedRole] = useState('Check-in team');
  const [groupSize, setGroupSize] = useState('small');
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadScenario();
  }, [scenarioId]);

  const loadScenario = async () => {
    try {
      let targetId = scenarioId;
      if (!targetId) {
        const listRes = await trainingApi.getScenarios();
        if (listRes.success && listRes.scenarios?.length > 0) {
          targetId = listRes.scenarios[0].id;
        }
      }
      if (targetId) {
        const res = await trainingApi.getScenarioDetail(targetId);
        if (res.success && res.scenario) {
          setScenario(res.scenario);
          const guidance = getScenarioGuidance(res.scenario);
          setSelectedRole(guidance.suggestedRole);
          return;
        }
      }
      setErrorMsg('We could not load this practice scenario. Please return to the scenarios list.');
    } catch (err) {
      console.error('Failed to load scenario details:', err);
      setErrorMsg('We could not load this practice scenario. Please return to the scenarios list.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartPractice = async () => {
    setCreating(true);
    setErrorMsg('');
    try {
      const title = formatScenarioTitle(scenario?.title);
      const res = await trainingApi.createSession({
        name: `${title} Practice`,
        scenario_id: scenarioId,
        simulated_event_size: groupSize
      });
      if (res.success && res.sessionId) {
        // Auto join chosen role if supported
        try {
          await trainingApi.joinSession(res.sessionId, selectedRole);
        } catch {
          // Non-blocking if join happens on home screen
        }
        onSessionCreated(res.sessionId);
      } else {
        setErrorMsg('We could not start this practice session. Please try again.');
      }
    } catch (err) {
      console.error('Failed to create training session:', err);
      setErrorMsg('We could not start this practice session. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 min-h-[50vh] font-sans">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#C59B27] border-t-transparent"></div>
        <p className="text-xs text-zinc-500 mt-3 font-sans">Preparing practice situation...</p>
      </div>
    );
  }

  const guidance = getScenarioGuidance(scenario);
  const scenarioTitle = formatScenarioTitle(scenario?.title);
  const topic = formatScenarioTopic(scenario?.category, scenario?.title);
  const description = formatScenarioDescription(scenario?.description, scenario?.title);
  const level = formatScenarioLevel(scenario?.difficulty);

  const availableRoles = [
    { id: 'Check-in team', label: 'Check-in team', desc: 'Scan passes and welcome arrivals' },
    { id: 'Room lead', label: 'Room lead', desc: 'Coordinate children in the assigned room' },
    { id: 'Pickup team', label: 'Pickup team', desc: 'Verify guardians during departure' },
    { id: 'Care lead', label: 'Care lead', desc: 'Handle safety, medical, or care steps' }
  ];

  return (
    <div
      id="training-session-setup-container"
      data-view-version="training-session-setup-v2-human"
      className="max-w-3xl mx-auto px-4 sm:px-6 py-8 font-sans"
    >
      {/* Navigation link */}
      <div className="mb-6">
        <button
          onClick={() => onNavigate('/admin/training/scenarios')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to practice scenarios</span>
        </button>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-[#EAE8E1] p-6 sm:p-8 shadow-2xs">
        {/* Situation Header */}
        <div className="border-b border-[#F4F3ED] pb-6 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold text-[#8C6D1F] uppercase tracking-wider">
              {topic}
            </span>
            <span className="text-zinc-300">•</span>
            <span className="text-[11px] text-zinc-500">
              {level}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-serif text-zinc-900 tracking-tight">
            Practice: {scenarioTitle}
          </h1>

          <p className="text-sm text-zinc-600 mt-2.5 leading-relaxed font-sans">
            {description}
          </p>
        </div>

        {/* Practice Structure */}
        <div className="space-y-6">
          {/* Practice Role Selection */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2.5">
              Practice as
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {availableRoles.map((r) => {
                const isSelected = selectedRole === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRole(r.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-2 ${
                      isSelected
                        ? 'border-[#C59B27] bg-[#FAF8F2] ring-1 ring-[#C59B27]'
                        : 'border-[#EAE8E1] bg-white hover:bg-zinc-50/60'
                    }`}
                  >
                    <div>
                      <p className={`text-xs font-semibold ${isSelected ? 'text-[#8C6D1F]' : 'text-zinc-800'}`}>
                        {r.label}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {r.desc}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="text-[#8C6D1F] text-xs font-bold shrink-0 mt-0.5">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Situation Guidance: What to practise & Success Criteria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#FAF9F5] rounded-xl border border-[#EAE8E1] p-4 sm:p-5">
            <div>
              <h2 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-[#C59B27]" />
                What to practise
              </h2>
              <p className="text-xs text-zinc-600 leading-relaxed">
                {guidance.whatToPractise}
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                What success looks like
              </h2>
              <p className="text-xs text-zinc-600 leading-relaxed">
                {guidance.whatSuccessLooksLike}
              </p>
            </div>
          </div>

          {/* Group size & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">
                Group size
              </label>
              <select
                value={groupSize}
                onChange={(e) => setGroupSize(e.target.value)}
                className="w-full bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
              >
                <option value="small">Small (3 practice check-ins)</option>
                <option value="medium">Standard (5 practice check-ins)</option>
                <option value="large">Full room (8 practice check-ins)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                Estimated time
              </label>
              <div className="h-[38px] flex items-center px-3.5 bg-zinc-50 border border-[#EAE8E1] rounded-xl text-xs text-zinc-700">
                {guidance.estimatedTime}
              </div>
            </div>
          </div>

          {/* Reassuring Isolation Notice */}
          <div className="p-3.5 bg-zinc-50/80 rounded-xl border border-[#EAE8E1] text-[11px] text-zinc-600 flex items-start gap-2.5">
            <span className="text-sm">🛡️</span>
            <div>
              <span className="font-semibold text-zinc-800 block mb-0.5">Isolated practice session</span>
              All actions are for preparation only. No actual attendance is altered, no real emergency alerts are sent, and no parents will receive messages.
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="border-t border-[#F4F3ED] mt-8 pt-6 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/admin/training/scenarios')}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl border border-[#EAE8E1] bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold transition-colors cursor-pointer text-center"
          >
            Back to scenarios
          </button>
          <button
            type="button"
            onClick={handleStartPractice}
            disabled={creating}
            className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-[#C59B27] hover:bg-[#A37F1D] disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs text-center"
          >
            {creating ? 'Starting practice...' : 'Start practice'}
          </button>
        </div>
      </div>
    </div>
  );
};
