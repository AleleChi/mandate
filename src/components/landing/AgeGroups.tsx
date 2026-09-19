import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

export interface CanonicalAgeGroup {
  id?: string;
  label: string;
  minAge?: number;
  maxAge?: number;
  min_age?: number;
  max_age?: number;
  sortOrder?: number;
}

export interface AgeGroupsProps {
  ageGroups?: CanonicalAgeGroup[];
}

const DEFAULT_CANONICAL_GROUPS: CanonicalAgeGroup[] = [
  { id: 'ag-below-1', label: 'Below 1', minAge: 0, maxAge: 0 },
  { id: 'ag-1-3', label: 'Ages 1 to 3', minAge: 1, maxAge: 3 },
  { id: 'ag-4-6', label: 'Ages 4 to 6', minAge: 4, maxAge: 6 },
  { id: 'ag-7-9', label: 'Ages 7 to 9', minAge: 7, maxAge: 9 },
  { id: 'ag-10-12', label: 'Ages 10 to 12', minAge: 10, maxAge: 12 },
];

function formatAgeGroup(g: CanonicalAgeGroup) {
  const min = g.minAge !== undefined ? g.minAge : (g.min_age !== undefined ? g.min_age : 0);
  const max = g.maxAge !== undefined ? g.maxAge : (g.max_age !== undefined ? g.max_age : 0);
  const label = (g.label || '').trim();

  if ((min === 0 && max <= 0) || label.toLowerCase().includes('below 1') || label.toLowerCase() === 'infants') {
    return {
      key: g.id || 'below-1',
      displayRange: 'Below 1',
      displayLabel: 'Infants',
    };
  }
  if ((min === 1 && max === 3) || label.includes('1-3') || label.includes('1 to 3')) {
    return {
      key: g.id || '1-3',
      displayRange: '1–3',
      displayLabel: '1–3 years',
    };
  }
  if ((min === 4 && max === 6) || label.includes('4-6') || label.includes('4 to 6')) {
    return {
      key: g.id || '4-6',
      displayRange: '4–6',
      displayLabel: '4–6 years',
    };
  }
  if ((min === 7 && max === 9) || label.includes('7-9') || label.includes('7 to 9')) {
    return {
      key: g.id || '7-9',
      displayRange: '7–9',
      displayLabel: '7–9 years',
    };
  }
  if ((min === 10 && max === 12) || label.includes('10-12') || label.includes('10 to 12')) {
    return {
      key: g.id || '10-12',
      displayRange: '10–12',
      displayLabel: '10–12 years',
    };
  }
  // Generic fallback for custom events
  const rangeStr = max > min ? `${min}–${max}` : (min > 0 ? `${min}+` : label);
  return {
    key: g.id || label || rangeStr,
    displayRange: rangeStr,
    displayLabel: label || `${rangeStr} years`,
  };
}

export const AgeGroups: React.FC<AgeGroupsProps> = ({ ageGroups }) => {
  const systemReducedMotion = useReducedMotion();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, []);

  const shouldReduceMotion = Boolean(systemReducedMotion || prefersReducedMotion);

  const resolvedGroups = (ageGroups && ageGroups.length > 0)
    ? ageGroups
    : DEFAULT_CANONICAL_GROUPS;

  const items = resolvedGroups.map(formatAgeGroup);
  const isOddCount = items.length % 2 !== 0;

  return (
    <section
      id="age-groups"
      aria-label="Programme Age Groups"
      className="bg-[#141416] text-white py-16 sm:py-20 my-4 sm:my-6 relative overflow-hidden border-y border-white/10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <motion.div
          className="max-w-2xl text-left mb-10 sm:mb-14 space-y-2.5"
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 16 }}
          whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase font-sans block">
            PROGRAMME AGE GROUPS
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-sans font-bold text-white tracking-tight leading-tight">
            Age groups
          </h2>
          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed font-normal">
            Children are grouped by age for the programme.
          </p>
        </motion.div>

        {/* Compact Editorial Directory (Two Columns Desktop, Single Column Mobile) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 lg:gap-6 text-left">
          {items.map((item, idx) => {
            const sequenceStr = String(idx + 1).padStart(2, '0');
            const isLastOdd = isOddCount && idx === items.length - 1;

            return (
              <motion.div
                key={item.key}
                initial={shouldReduceMotion ? undefined : { opacity: 0, y: 16 }}
                whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{
                  duration: 0.45,
                  delay: shouldReduceMotion ? 0 : 0.08 + idx * 0.06,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className={`group relative bg-[#1A1918]/90 hover:bg-[#22201D] border border-white/[0.08] hover:border-[#C59B27]/40 rounded-2xl p-6 sm:p-7 lg:p-8 transition-all duration-300 cursor-default overflow-hidden ${
                  isLastOdd ? 'md:col-span-2' : 'md:col-span-1'
                }`}
              >
                {/* Subtle decorative left accent rule */}
                <div className="absolute left-0 top-6 bottom-6 w-[3px] bg-[#C59B27]/30 group-hover:bg-[#C59B27] rounded-r-full transition-all duration-300 group-hover:top-4 group-hover:bottom-4" />

                <div className="flex items-start sm:items-center space-x-5 sm:space-x-8 pl-1">
                  {/* Sequence Number */}
                  <span className="font-sans font-bold text-xs sm:text-sm text-[#C59B27] tracking-widest shrink-0 pt-1 sm:pt-0">
                    {sequenceStr}
                  </span>

                  {/* Main Range & Canonical Label */}
                  <div className="space-y-1 sm:space-y-1.5 text-left">
                    <div className="text-4xl sm:text-5xl lg:text-[52px] font-serif-koinonia font-bold text-white tracking-tight leading-none group-hover:translate-x-0.5 transition-transform duration-300">
                      {item.displayRange}
                    </div>
                    <span className="text-[11px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-[0.16em] font-sans block">
                      {item.displayLabel}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
