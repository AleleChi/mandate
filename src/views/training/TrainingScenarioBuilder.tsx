import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { trainingApi } from '../../services/trainingApi';

interface TrainingScenarioBuilderProps {
  onNavigate: (route: string) => void;
}

export const TrainingScenarioBuilder: React.FC<TrainingScenarioBuilderProps> = ({
  onNavigate
}) => {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('Check-in');
  const [level, setLevel] = useState('Standard');
  const [duration, setDuration] = useState('20');
  const [description, setDescription] = useState('');
  const [learningFocus, setLearningFocus] = useState('');
  const [practiceRole, setPracticeRole] = useState('Check-in team');
  const [expectedOutcome, setExpectedOutcome] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const mapTopicToBackend = (t: string) => {
    switch (t) {
      case 'Child safety':
        return 'Missing Child';
      case 'Pickup':
        return 'Pickup and Release';
      case 'Check-in':
        return 'Check-in';
      default:
        return 'General';
    }
  };

  const mapLevelToBackend = (l: string) => {
    switch (l) {
      case 'Starter':
        return 'Introduction';
      case 'Advanced':
        return 'Advanced drill';
      default:
        return 'Standard drill';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Please enter a scenario name.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Please describe what should happen in this situation.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const res = await trainingApi.createScenario({
        title: title.trim(),
        category: mapTopicToBackend(topic),
        difficulty: mapLevelToBackend(level),
        description: description.trim(),
        expected_duration_minutes: Number(duration) || 20,
        objectives: [
          {
            title: `Practise ${title.trim()}`,
            description: learningFocus.trim() || 'Follow team safeguarding procedures calmly.',
            objective_type: topic === 'Child safety' ? 'safety_alert' : topic === 'Pickup' ? 'pickup_release' : 'check_in',
            responsible_role: practiceRole
          }
        ],
        injections: [
          {
            title: `Practice activity for ${practiceRole}`,
            category: topic === 'Child safety' ? 'safety_alert' : 'check_in',
            scheduled_simulated_seconds: 30,
            expected_action: expectedOutcome.trim() || 'Follow agreed procedure.'
          }
        ]
      });

      if (res.success) {
        onNavigate('/admin/training/scenarios');
      } else {
        setErrorMsg("We couldn't save your changes. Please try again.");
      }
    } catch (err) {
      console.error('Failed to create scenario:', err);
      setErrorMsg("We couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="training-scenario-builder-container"
      data-view-version="training-scenario-builder-v2-human"
      className="max-w-3xl mx-auto px-4 sm:px-6 py-8 font-sans"
    >
      {/* Navigation */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => onNavigate('/admin/training/scenarios')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-[#7A7570] hover:text-zinc-800 dark:hover:text-[#F0EBE3] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to practice scenarios</span>
        </button>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 rounded-xl text-xs text-amber-900 dark:text-amber-200 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-[#1D1D1A] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] p-6 sm:p-8 shadow-2xs">
        {/* Header */}
        <div className="border-b border-[#F4F3ED] dark:border-[#302E29] pb-6 mb-6">
          <h1 className="text-2xl sm:text-3xl font-serif text-zinc-900 dark:text-[#F0EBE3] tracking-tight">
            Add practice scenario
          </h1>
          <p className="text-xs text-zinc-600 dark:text-[#7A7570] mt-1.5 font-sans">
            Create a situation your team can practise before the event.
          </p>
        </div>

        <div className="space-y-6">
          {/* Basics Group */}
          <div>
            <h2 className="text-xs font-semibold text-zinc-700 dark:text-[#B8B0A5] uppercase tracking-wider mb-4">
              Basics
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-[#B8B0A5] mb-1.5">
                  Scenario name
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Check-in during heavy arrival rush"
                  className="w-full bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-[#F0EBE3] placeholder:text-zinc-400 dark:placeholder:text-[#7A7570] focus:outline-none focus:ring-1 focus:ring-[#C59B27] dark:focus:ring-amber-500/40"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-[#B8B0A5] mb-1.5">
                    Topic
                  </label>
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] dark:focus:ring-amber-500/40 cursor-pointer"
                  >
                    <option value="Check-in" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Check-in</option>
                    <option value="Child safety" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Child safety</option>
                    <option value="Pickup" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Pickup</option>
                    <option value="Event duty" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Event duty</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-[#B8B0A5] mb-1.5">
                    Level
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] dark:focus:ring-amber-500/40 cursor-pointer"
                  >
                    <option value="Starter" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Starter</option>
                    <option value="Standard" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Standard</option>
                    <option value="Advanced" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Advanced</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-[#B8B0A5] mb-1.5">
                    Approximate time
                  </label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] dark:focus:ring-amber-500/40 cursor-pointer"
                  >
                    <option value="15" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">15 minutes</option>
                    <option value="20" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">20 minutes</option>
                    <option value="30" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">30 minutes</option>
                    <option value="45" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">45 minutes</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Details Group */}
          <div className="border-t border-[#F4F3ED] dark:border-[#302E29] pt-6">
            <h2 className="text-xs font-semibold text-zinc-700 dark:text-[#B8B0A5] uppercase tracking-wider mb-4">
              Situation details
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-[#B8B0A5] mb-1.5">
                  What should happen?
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the circumstance that occurs, such as a child missing a pass code or a room reaching capacity."
                  rows={3}
                  className="w-full bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-[#F0EBE3] placeholder:text-zinc-400 dark:placeholder:text-[#7A7570] focus:outline-none focus:ring-1 focus:ring-[#C59B27] dark:focus:ring-amber-500/40 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-[#B8B0A5] mb-1.5">
                  What should the team practise?
                </label>
                <textarea
                  value={learningFocus}
                  onChange={(e) => setLearningFocus(e.target.value)}
                  placeholder="e.g. Keeping families informed while calmly checking records with the room lead."
                  rows={2}
                  className="w-full bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-[#F0EBE3] placeholder:text-zinc-400 dark:placeholder:text-[#7A7570] focus:outline-none focus:ring-1 focus:ring-[#C59B27] dark:focus:ring-amber-500/40 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-[#B8B0A5] mb-1.5">
                    Practice role
                  </label>
                  <select
                    value={practiceRole}
                    onChange={(e) => setPracticeRole(e.target.value)}
                    className="w-full bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] dark:focus:ring-amber-500/40 cursor-pointer"
                  >
                    <option value="Check-in team" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Check-in team</option>
                    <option value="Room lead" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Room lead</option>
                    <option value="Pickup team" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Pickup team</option>
                    <option value="Care lead" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Care lead</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-[#B8B0A5] mb-1.5">
                    Expected outcome
                  </label>
                  <input
                    type="text"
                    value={expectedOutcome}
                    onChange={(e) => setExpectedOutcome(e.target.value)}
                    placeholder="e.g. Children safely checked in and recorded"
                    className="w-full bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-[#F0EBE3] placeholder:text-zinc-400 dark:placeholder:text-[#7A7570] focus:outline-none focus:ring-1 focus:ring-[#C59B27] dark:focus:ring-amber-500/40"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="border-t border-[#F4F3ED] dark:border-[#302E29] mt-8 pt-6 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/admin/training/scenarios')}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl border border-[#EAE8E1] dark:border-[#302E29] bg-white dark:bg-[#21211E] hover:bg-zinc-50 dark:hover:bg-[#262520] text-zinc-700 dark:text-[#B8B0A5] text-xs font-semibold transition-colors cursor-pointer text-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-[#C59B27] hover:bg-[#A37F1D] disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs text-center"
          >
            {saving ? 'Adding scenario...' : 'Add scenario'}
          </button>
        </div>
      </form>
    </div>
  );
};
