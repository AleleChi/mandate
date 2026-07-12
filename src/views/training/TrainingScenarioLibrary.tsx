import React, { useState, useEffect } from 'react';
import { trainingApi } from '../../services/trainingApi';

interface TrainingScenarioLibraryProps {
  onNavigate: (route: string) => void;
  onStartSessionSetup: (scenarioId: string) => void;
}

export const TrainingScenarioLibrary: React.FC<TrainingScenarioLibraryProps> = ({
  onNavigate,
  onStartSessionSetup
}) => {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    try {
      const res = await trainingApi.getScenarios();
      if (res.success) {
        setScenarios(res.scenarios);
      }
    } catch (err) {
      console.error('Failed to load scenarios:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredScenarios = scenarios.filter((s) => {
    const matchesCategory = categoryFilter === 'all' || s.category === categoryFilter;
    const matchesDifficulty = difficultyFilter === 'all' || s.difficulty === difficultyFilter;
    const matchesSearch = s.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesDifficulty && matchesSearch;
  });

  return (
    <div 
      id="training-scenario-library-container"
      data-view-version="training-scenario-library-v1-premium"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans bg-[#FAF9F6]"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#18181B] tracking-tight">Scenario Library</h1>
          <p className="text-sm text-[#52525B] mt-1">Select or configure scenarios for realistic children event drill rehearsals.</p>
        </div>
        <button
          onClick={() => onNavigate('/admin/training/scenarios/new')}
          className="bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs sm:text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          Create Scenario
        </button>
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-xl border border-[#E4E4E7] p-4 shadow-sm mb-6 flex flex-col md:flex-row items-center gap-4">
        <div className="w-full md:w-1/3">
          <input
            type="text"
            placeholder="Search scenarios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-sm text-[#18181B] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
          />
        </div>
        <div className="w-full md:w-1/4">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-sm text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
          >
            <option value="all">All Categories</option>
            <option value="Check-in">Check-in</option>
            <option value="Pickup and Release">Pickup and Release</option>
            <option value="Missing Child">Missing Child</option>
            <option value="Connectivity Failure">Connectivity Failure</option>
          </select>
        </div>
        <div className="w-full md:w-1/4">
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="w-full bg-[#FAF9F6] border border-[#E4E4E7] rounded-lg px-3 py-2 text-sm text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
          >
            <option value="all">All Difficulties</option>
            <option value="Introduction">Introduction</option>
            <option value="Guided practice">Guided practice</option>
            <option value="Standard drill">Standard drill</option>
            <option value="Advanced drill">Advanced drill</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C59B27]"></div>
        </div>
      ) : filteredScenarios.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E4E4E7] p-12 text-center shadow-sm">
          <p className="text-sm text-[#52525B]">No scenarios found matching filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredScenarios.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-xl border border-[#E4E4E7] p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="bg-[#FAF9F6] text-[#C59B27] border border-[#C59B27]/20 text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded">
                    {s.category}
                  </span>
                  <span className="text-xs text-[#71717A] font-medium">
                    {s.difficulty}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-[#18181B] tracking-tight">{s.title}</h3>
                <p className="text-xs text-[#52525B] mt-2 line-clamp-3 leading-relaxed">{s.description}</p>
              </div>

              <div className="border-t border-[#F4F4F5] mt-6 pt-4 flex items-center justify-between">
                <span className="text-xs text-[#71717A] font-medium">
                  Duration: {s.expected_duration_minutes} min
                </span>
                <button
                  onClick={() => onStartSessionSetup(s.id)}
                  className="bg-[#C59B27] hover:bg-[#A37F1D] text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors cursor-pointer"
                >
                  Start Session
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
