import React, { useState } from 'react';
import { trainingApi } from '../../services/trainingApi';

interface TrainingScenarioBuilderProps {
  onNavigate: (route: string) => void;
}

export const TrainingScenarioBuilder: React.FC<TrainingScenarioBuilderProps> = ({
  onNavigate
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Check-in');
  const [difficulty, setDifficulty] = useState('Introduction');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(20);
  
  // Hardcoded or simple state for Objectives & Injections list
  const [objectives, setObjectives] = useState<Array<{ title: string; description: string; objective_type: string; responsible_role: string }>>([
    { title: 'Confirm Simulated Check-In', description: 'Confirm that the check-in team can scan the correct synthetic pass.', objective_type: 'check_in', responsible_role: 'Check-in Team' }
  ]);
  const [injections, setInjections] = useState<Array<{ title: string; category: string; scheduled_simulated_seconds: number; expected_action: string }>>([
    { title: 'Simulated Child Arrives', category: 'simulated child arrives', scheduled_simulated_seconds: 30, expected_action: 'Perform scan' }
  ]);

  const [saving, setSaving] = useState(false);

  const handleAddObjective = () => {
    setObjectives([...objectives, { title: '', description: '', objective_type: 'check_in', responsible_role: 'Check-in Team' }]);
  };

  const handleAddInjection = () => {
    setInjections([...injections, { title: '', category: 'simulated child arrives', scheduled_simulated_seconds: 60, expected_action: '' }]);
  };

  const handlePublish = async () => {
    if (!title || !description) {
      alert('Please fill out Scenario Title and Description.');
      return;
    }
    setSaving(true);
    try {
      const res = await trainingApi.createScenario({
        title,
        category,
        difficulty,
        description,
        expected_duration_minutes: Number(duration),
        objectives,
        injections
      });
      if (res.success) {
        onNavigate('/admin/training/scenarios');
      }
    } catch (err) {
      console.error('Failed to create scenario:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      id="training-scenario-builder-container"
      data-view-version="training-scenario-builder-v1-premium"
      className="max-w-4xl mx-auto px-4 sm:px-6 py-8 font-sans bg-[#FAF9F6]"
    >
      <div className="flex items-center gap-3 mb-6">
        <button 
          onClick={() => onNavigate('/admin/training/scenarios')}
          className="text-xs font-semibold text-[#C59B27] hover:underline"
        >
          &larr; Back to Library
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#E4E4E7] p-8 shadow-sm mb-8">
        <h1 className="text-xl font-semibold text-[#18181B] tracking-tight">Scenario Builder</h1>
        <p className="text-xs text-[#52525B] mt-1">Configure learning parameters, synthetic children, and scheduled scenario events.</p>

        {/* Section 1: Scenario Overview */}
        <div className="mt-8 border-t border-[#F4F4F5] pt-6">
          <h2 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider mb-4">1. Scenario Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#52525B] mb-1.5">Scenario Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Broken connection check-in drill"
                className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-sm text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#52525B] mb-1.5">Expected Duration (Minutes)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-sm text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#52525B] mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-sm text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              >
                <option value="Check-in">Check-in</option>
                <option value="Pickup and Release">Pickup and Release</option>
                <option value="Missing Child">Missing Child</option>
                <option value="Connectivity Failure">Connectivity Failure</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#52525B] mb-1.5">Difficulty Level</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-sm text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              >
                <option value="Introduction">Introduction</option>
                <option value="Guided practice">Guided practice</option>
                <option value="Standard drill">Standard drill</option>
                <option value="Advanced drill">Advanced drill</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-[#52525B] mb-1.5">Scenario Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the context, goals, and conditions of this drill session."
              rows={3}
              className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-sm text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
            />
          </div>
        </div>

        {/* Section 2: Learning Objectives */}
        <div className="mt-8 border-t border-[#F4F4F5] pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider">2. Learning Objectives</h2>
            <button
              onClick={handleAddObjective}
              className="text-xs font-semibold text-[#C59B27] hover:underline cursor-pointer"
            >
              + Add Objective
            </button>
          </div>
          {objectives.map((obj, index) => (
            <div key={index} className="bg-[#FAF9F6] border border-[#E4E4E7] p-4 rounded-lg mb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  placeholder="Objective Title"
                  value={obj.title}
                  onChange={(e) => {
                    const next = [...objectives];
                    next[index].title = e.target.value;
                    setObjectives(next);
                  }}
                  className="w-full bg-white border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Description"
                  value={obj.description}
                  onChange={(e) => {
                    const next = [...objectives];
                    next[index].description = e.target.value;
                    setObjectives(next);
                  }}
                  className="w-full bg-white border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Section 8: Scheduled Injections */}
        <div className="mt-8 border-t border-[#F4F4F5] pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#18181B] uppercase tracking-wider">3. Scheduled Injections</h2>
            <button
              onClick={handleAddInjection}
              className="text-xs font-semibold text-[#C59B27] hover:underline cursor-pointer"
            >
              + Add Injection
            </button>
          </div>
          {injections.map((inj, index) => (
            <div key={index} className="bg-[#FAF9F6] border border-[#E4E4E7] p-4 rounded-lg mb-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <input
                  type="text"
                  placeholder="Injection Title"
                  value={inj.title}
                  onChange={(e) => {
                    const next = [...injections];
                    next[index].title = e.target.value;
                    setInjections(next);
                  }}
                  className="w-full bg-white border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                />
              </div>
              <div>
                <input
                  type="number"
                  placeholder="Simulated time (seconds)"
                  value={inj.scheduled_simulated_seconds}
                  onChange={(e) => {
                    const next = [...injections];
                    next[index].scheduled_simulated_seconds = Number(e.target.value);
                    setInjections(next);
                  }}
                  className="w-full bg-white border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Expected user action"
                  value={inj.expected_action}
                  onChange={(e) => {
                    const next = [...injections];
                    next[index].expected_action = e.target.value;
                    setInjections(next);
                  }}
                  className="w-full bg-white border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Action button */}
        <div className="border-t border-[#F4F4F5] mt-8 pt-6 flex justify-end">
          <button
            onClick={handlePublish}
            disabled={saving}
            className="bg-[#C59B27] hover:bg-[#A37F1D] disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg text-sm transition-colors cursor-pointer"
          >
            {saving ? 'Publishing...' : 'Review and Publish'}
          </button>
        </div>
      </div>
    </div>
  );
};
