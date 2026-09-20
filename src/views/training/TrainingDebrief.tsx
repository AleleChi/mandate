import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react';
import { trainingApi } from '../../services/trainingApi';
import {
  formatScenarioTitle,
  formatScenarioTopic
} from './trainingFormatters';

interface TrainingDebriefProps {
  sessionId: string;
  onNavigate: (route: string) => void;
  userId?: string;
}

export const TrainingDebrief: React.FC<TrainingDebriefProps> = ({
  sessionId,
  onNavigate,
  userId
}) => {
  const [sessionData, setSessionData] = useState<any>(null);
  const [debriefData, setDebriefData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [personalOutcome, setPersonalOutcome] = useState('');
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    if (!sessionId) return;
    try {
      const [sessRes, debRes] = await Promise.allSettled([
        trainingApi.getSessionDetail(sessionId),
        trainingApi.getSessionDebrief(sessionId)
      ]);

      if (sessRes.status === 'fulfilled' && sessRes.value?.success) {
        setSessionData(sessRes.value.session);
      }
      if (debRes.status === 'fulfilled' && debRes.value?.success && debRes.value.debrief) {
        setDebriefData(debRes.value.debrief);
      }
    } catch (err) {
      console.error('Failed to load debrief details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTakeaway = () => {
    if (!personalOutcome.trim()) return;
    setOutcomes([...outcomes, personalOutcome.trim()]);
    setPersonalOutcome('');
    setSuccessMsg('Personal takeaway recorded.');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleTryAgain = async () => {
    try {
      await trainingApi.resetSession(sessionId);
      await trainingApi.startSession(sessionId);
      onNavigate('/admin/training/active');
    } catch {
      onNavigate('/admin/training/scenarios');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 min-h-[50vh] font-sans">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#C59B27] border-t-transparent"></div>
        <p className="text-xs text-zinc-500 dark:text-[#7A7570] mt-3 font-sans">Loading practice debrief...</p>
      </div>
    );
  }

  const scenarioTitle = formatScenarioTitle(sessionData?.scenario_title);
  const scenarioTopic = formatScenarioTopic(undefined, sessionData?.scenario_title);

  const completedCount = sessionData?.objectiveResults?.filter((r: any) => r.status === 'Completed').length || 0;
  const totalCount = sessionData?.objectives?.length || (completedCount > 0 ? completedCount : 3);

  // Approximate elapsed duration
  const elapsedMinutes = sessionData?.created_at
    ? Math.max(1, Math.min(60, Math.round((Date.now() - new Date(sessionData.created_at).getTime()) / 60000)))
    : 18;

  const strengthsText = debriefData?.strengths ||
    'Careful verification of child arrival records, respectful guardian interactions, and steady teamwork.';
  const improvementsText = debriefData?.improvement_areas ||
    'Continue practising quick team alerts when internet access is unavailable to keep lines moving smoothly.';

  return (
    <div
      id="training-debrief-container"
      data-view-version="training-debrief-v2-human"
      className="max-w-3xl mx-auto px-4 sm:px-6 py-8 font-sans"
    >
      {/* Return navigation */}
      <div className="mb-6">
        <button
          onClick={() => onNavigate('/admin/training/scenarios')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-[#7A7570] hover:text-zinc-800 dark:hover:text-[#F0EBE3] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to practice scenarios</span>
        </button>
      </div>

      {successMsg && (
        <div className="mb-6 p-3.5 bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200/90 dark:border-emerald-900/40 rounded-xl text-xs text-emerald-900 dark:text-emerald-300 font-medium">
          {successMsg}
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white dark:bg-[#1D1D1A] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] p-6 sm:p-8 shadow-2xs">
        {/* Title Header */}
        <div className="border-b border-[#F4F3ED] dark:border-[#302E29] pb-6 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold text-[#8C6D1F] dark:text-amber-400 uppercase tracking-wider">
              {scenarioTopic}
            </span>
            <span className="text-zinc-300 dark:text-[#7A7570]">•</span>
            <span className="text-[11px] text-zinc-500 dark:text-[#7A7570]">
              Practice completed
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-serif text-zinc-900 dark:text-[#F0EBE3] tracking-tight">
            Practice complete
          </h1>

          <p className="text-sm font-medium text-zinc-700 dark:text-[#B8B0A5] mt-1">
            {scenarioTitle}
          </p>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-[#FAF9F5] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-[#7A7570] uppercase tracking-wider block">
              Completed in
            </span>
            <div className="text-xl font-semibold text-zinc-900 dark:text-[#F0EBE3] mt-1 font-sans">
              {elapsedMinutes} minutes
            </div>
          </div>

          <div className="p-4 bg-[#FAF9F5] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-[#7A7570] uppercase tracking-wider block">
              Actions completed
            </span>
            <div className="text-xl font-semibold text-zinc-900 dark:text-[#F0EBE3] mt-1 font-sans">
              {completedCount} of {totalCount}
            </div>
          </div>
        </div>

        {/* Steps Completed Checklist */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-700 dark:text-[#B8B0A5] uppercase tracking-wider mb-3">
            Steps practised
          </h2>
          <div className="space-y-2">
            {sessionData?.objectives && sessionData.objectives.length > 0 ? (
              sessionData.objectives.map((obj: any) => {
                const isDone = sessionData?.objectiveResults?.find((r: any) => r.objective_id === obj.id)?.status === 'Completed';
                return (
                  <div
                    key={obj.id}
                    className="p-3 rounded-xl bg-zinc-50/70 dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] flex items-start gap-2.5 text-xs"
                  >
                    <span className={`text-sm mt-0.5 font-bold ${isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-[#7A7570]'}`}>
                      {isDone ? '✓' : '○'}
                    </span>
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-[#F0EBE3]">
                        {obj.title}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-[#7A7570] mt-0.5">
                        {obj.description}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-3 rounded-xl bg-zinc-50/70 dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] flex items-start gap-2.5 text-xs text-zinc-700 dark:text-[#B8B0A5]">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                <span>Team completed the practice scenario steps.</span>
              </div>
            )}
          </div>
        </div>

        {/* Team Reflection: What went well & Needs another look */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="p-4 rounded-xl border border-[#EAE8E1] dark:border-[#302E29] bg-white dark:bg-[#21211E]">
            <h3 className="text-xs font-semibold text-zinc-700 dark:text-[#B8B0A5] uppercase tracking-wider mb-2">
              What went well
            </h3>
            <p className="text-xs text-zinc-600 dark:text-[#B8B0A5] leading-relaxed">
              {strengthsText}
            </p>
          </div>

          <div className="p-4 rounded-xl border border-[#EAE8E1] dark:border-[#302E29] bg-white dark:bg-[#21211E]">
            <h3 className="text-xs font-semibold text-zinc-700 dark:text-[#B8B0A5] uppercase tracking-wider mb-2">
              Needs another look
            </h3>
            <p className="text-xs text-zinc-600 dark:text-[#B8B0A5] leading-relaxed">
              {improvementsText}
            </p>
          </div>
        </div>

        {/* Personal Takeaway */}
        <div className="border-t border-[#F4F3ED] dark:border-[#302E29] pt-6 mb-8">
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-[#B8B0A5] uppercase tracking-wider mb-2">
            Personal takeaway
          </h3>
          <p className="text-xs text-zinc-500 dark:text-[#7A7570] mb-3">
            Record what you learned or what you want to remember on event day.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={personalOutcome}
              onChange={(e) => setPersonalOutcome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTakeaway();
                }
              }}
              placeholder="e.g. Learned how to manage check-in smoothly without internet."
              className="flex-1 bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-[#F0EBE3] placeholder:text-zinc-400 dark:placeholder:text-[#7A7570] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
            />
            <button
              type="button"
              onClick={handleAddTakeaway}
              className="min-h-[38px] px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-900 dark:bg-[#C59B27] dark:hover:bg-[#A37F1D] text-white text-xs font-medium transition-colors cursor-pointer shrink-0"
            >
              Add note
            </button>
          </div>

          {outcomes.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {outcomes.map((note, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-zinc-50 dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] text-xs text-zinc-700 dark:text-[#B8B0A5] flex items-center gap-2">
                  <span className="text-[#C59B27]">•</span>
                  <span>{note}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-[#F4F3ED] dark:border-[#302E29] pt-6 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTryAgain}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl border border-[#EAE8E1] dark:border-[#302E29] bg-white dark:bg-[#21211E] hover:bg-zinc-50 dark:hover:bg-[#262520] text-zinc-700 dark:text-[#B8B0A5] text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Try again</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('/admin/training/scenarios')}
            className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs text-center"
          >
            Return to practice scenarios
          </button>
        </div>
      </div>
    </div>
  );
};
