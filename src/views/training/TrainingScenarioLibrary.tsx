import React, { useState, useEffect } from 'react';
import { Search, Plus, Clock } from 'lucide-react';
import { trainingApi } from '../../services/trainingApi';

interface TrainingScenarioLibraryProps {
  onNavigate: (route: string) => void;
  onStartSessionSetup: (scenarioId: string) => void;
}

import {
  formatScenarioTitle,
  formatScenarioTopic,
  formatScenarioDescription,
  formatScenarioLevel,
  formatScenarioTime
} from './trainingFormatters';

export {
  formatScenarioTitle,
  formatScenarioTopic,
  formatScenarioDescription,
  formatScenarioLevel,
  formatScenarioTime
};

export const TrainingScenarioLibrary: React.FC<TrainingScenarioLibraryProps> = ({
  onNavigate,
  onStartSessionSetup
}) => {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [topicFilter, setTopicFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    try {
      const res = await trainingApi.getScenarios();
      if (res && res.success && res.scenarios) {
        setScenarios(res.scenarios);
      }
    } catch (err) {
      console.error('Failed to load scenarios:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredScenarios = scenarios.filter((s) => {
    const displayTitle = formatScenarioTitle(s.title);
    const displayTopic = formatScenarioTopic(s.category, s.title);
    const displayLevel = formatScenarioLevel(s.difficulty);
    const displayDesc = formatScenarioDescription(s.description, s.title);

    const matchesTopic = topicFilter === 'all' || 
      displayTopic.toLowerCase() === topicFilter.toLowerCase() ||
      (s.category && s.category.toLowerCase() === topicFilter.toLowerCase());

    const matchesLevel = levelFilter === 'all' || 
      displayLevel.toLowerCase() === levelFilter.toLowerCase() ||
      (s.difficulty && s.difficulty.toLowerCase() === levelFilter.toLowerCase());

    const term = searchTerm.trim().toLowerCase();
    const matchesSearch = !term ||
      displayTitle.toLowerCase().includes(term) ||
      displayDesc.toLowerCase().includes(term) ||
      displayTopic.toLowerCase().includes(term) ||
      s.title.toLowerCase().includes(term) ||
      s.description.toLowerCase().includes(term);

    return matchesTopic && matchesLevel && matchesSearch;
  });

  return (
    <main 
      id="practice-scenarios-container"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans bg-[#FAF9F5] dark:bg-[#19191A] min-h-[calc(100vh-50px)]"
    >
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-medium text-[#18181B] dark:text-[#F0EBE3] tracking-tight">
            Practice scenarios
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-[#7A7570] mt-1">
            Choose a situation for your team to practise.
          </p>
        </div>
        <button
          onClick={() => onNavigate('/admin/training/scenarios/new')}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 bg-[#C59B27] hover:bg-[#A8821B] text-white text-xs sm:text-sm font-medium px-4 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add practice scenario</span>
        </button>
      </div>

      {/* Toolbar: Search & Filters */}
      <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 dark:text-[#7A7570] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search practice scenarios"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full min-h-[44px] bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl pl-10 pr-3 text-xs sm:text-sm text-[#18181B] dark:text-[#F0EBE3] placeholder-zinc-400 dark:placeholder-[#7A7570] focus:outline-none focus:ring-1 focus:ring-[#C59B27] dark:focus:ring-amber-500/40 focus:border-[#C59B27] dark:focus:border-amber-500/40 transition-colors"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="min-h-[44px] px-3.5 py-2 bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs sm:text-sm text-[#18181B] dark:text-[#F0EBE3] font-medium focus:outline-none focus:ring-1 focus:ring-[#C59B27] dark:focus:ring-amber-500/40 cursor-pointer"
            aria-label="Filter by topic"
          >
            <option value="all" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">All topics</option>
            <option value="Check-in" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Check-in</option>
            <option value="Child safety" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Child safety</option>
            <option value="Pickup" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Pickup</option>
          </select>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="min-h-[44px] px-3.5 py-2 bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs sm:text-sm text-[#18181B] dark:text-[#F0EBE3] font-medium focus:outline-none focus:ring-1 focus:ring-[#C59B27] dark:focus:ring-amber-500/40 cursor-pointer"
            aria-label="Filter by level"
          >
            <option value="all" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">All levels</option>
            <option value="Starter" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Starter</option>
            <option value="Standard" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Standard</option>
            <option value="Advanced" className="dark:bg-[#21211E] dark:text-[#F0EBE3]">Advanced</option>
          </select>
        </div>
      </div>

      {/* Content list / Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-200 dark:border-[#302E29] border-t-[#C59B27] dark:border-t-amber-400"></div>
        </div>
      ) : scenarios.length === 0 ? (
        <div className="bg-white dark:bg-[#1D1D1A] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] p-12 text-center shadow-xs">
          <h3 className="text-base font-semibold text-[#18181B] dark:text-[#F0EBE3]">No practice scenarios yet</h3>
          <p className="text-xs text-zinc-500 dark:text-[#7A7570] mt-1 max-w-sm mx-auto">
            Add a scenario when you are ready to prepare your team.
          </p>
          <button
            onClick={() => onNavigate('/admin/training/scenarios/new')}
            className="mt-4 min-h-[44px] inline-flex items-center justify-center gap-1.5 bg-[#C59B27] hover:bg-[#A8821B] text-white text-xs font-medium px-4 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add practice scenario</span>
          </button>
        </div>
      ) : filteredScenarios.length === 0 ? (
        <div className="bg-white dark:bg-[#1D1D1A] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] p-12 text-center shadow-xs">
          <h3 className="text-base font-semibold text-[#18181B] dark:text-[#F0EBE3]">No matching scenarios</h3>
          <p className="text-xs text-zinc-500 dark:text-[#7A7570] mt-1">
            Try another search or change the filters.
          </p>
          <button
            onClick={() => {
              setSearchTerm('');
              setTopicFilter('all');
              setLevelFilter('all');
            }}
            className="mt-4 text-xs font-medium text-[#C59B27] dark:text-amber-400 hover:underline cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredScenarios.map((s) => {
            const displayTitle = formatScenarioTitle(s.title);
            const displayTopic = formatScenarioTopic(s.category, s.title);
            const displayDesc = formatScenarioDescription(s.description, s.title);
            const displayLevel = formatScenarioLevel(s.difficulty);
            const durationMinutes = s.expected_duration_minutes || 20;

            return (
              <article
                key={s.id}
                className="bg-white dark:bg-[#1D1D1A] rounded-2xl border border-[#EAE8E1] dark:border-[#302E29] p-6 shadow-xs hover:border-[#C59B27]/40 dark:hover:border-amber-500/40 hover:shadow-sm transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="text-[11px] font-semibold text-[#967215] dark:text-amber-400 uppercase tracking-wider">
                    {displayTopic}
                  </div>
                  <h2 className="text-base font-semibold text-[#18181B] dark:text-[#F0EBE3] mt-1.5 tracking-tight">
                    {displayTitle}
                  </h2>
                  <p className="text-xs text-zinc-600 dark:text-[#B8B0A5] mt-2.5 leading-relaxed line-clamp-3">
                    {displayDesc}
                  </p>
                </div>

                <div className="border-t border-[#EAE8E1] dark:border-[#302E29] mt-6 pt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-[#7A7570]">
                    <span className="flex items-center gap-1 font-medium">
                      <Clock className="w-3.5 h-3.5 text-zinc-400 dark:text-[#7A7570]" />
                      <span>{durationMinutes} minutes</span>
                    </span>
                    <span className="text-zinc-300 dark:text-[#3A3835]">•</span>
                    <span className="px-2 py-0.5 rounded-md bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] text-[11px] text-zinc-600 dark:text-[#B8B0A5] font-medium">
                      {displayLevel}
                    </span>
                  </div>

                  <button
                    onClick={() => onStartSessionSetup(s.id)}
                    className="min-h-[38px] px-3.5 py-1.5 bg-[#C59B27] hover:bg-[#A8821B] text-white text-xs font-medium rounded-xl transition-colors cursor-pointer shrink-0 shadow-2xs"
                  >
                    Start practice
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
};
