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

export const DEFAULT_CANONICAL_GROUPS: CanonicalAgeGroup[] = [
  { id: 'ag-2-3', label: 'EARLY YEARS', minAge: 2, maxAge: 3 },
  { id: 'ag-4-6', label: '4–6 YEARS', minAge: 4, maxAge: 6 },
  { id: 'ag-7-9', label: '7–9 YEARS', minAge: 7, maxAge: 9 },
  { id: 'ag-10-12', label: '10–12 YEARS', minAge: 10, maxAge: 12 },
  { id: 'ag-13-14', label: '13–14 YEARS', minAge: 13, maxAge: 14 },
];

function formatAgeGroup(g: CanonicalAgeGroup) {
  const min = g.minAge !== undefined ? g.minAge : (g.min_age !== undefined ? g.min_age : 0);
  const max = g.maxAge !== undefined ? g.maxAge : (g.max_age !== undefined ? g.max_age : 0);
  const label = (g.label || '').trim();

  if ((min === 2 && max === 3) || label.includes('2-3') || label.includes('2 to 3') || label.toLowerCase().includes('early years')) {
    return {
      key: g.id || '2-3',
      displayRange: '2–3',
      displayLabel: 'EARLY YEARS',
    };
  }
  if ((min === 4 && max === 6) || label.includes('4-6') || label.includes('4 to 6')) {
    return {
      key: g.id || '4-6',
      displayRange: '4–6',
      displayLabel: '4–6 YEARS',
    };
  }
  if ((min === 7 && max === 9) || label.includes('7-9') || label.includes('7 to 9')) {
    return {
      key: g.id || '7-9',
      displayRange: '7–9',
      displayLabel: '7–9 YEARS',
    };
  }
  if ((min === 10 && max === 12) || label.includes('10-12') || label.includes('10 to 12')) {
    return {
      key: g.id || '10-12',
      displayRange: '10–12',
      displayLabel: '10–12 YEARS',
    };
  }
  if ((min === 13 && max === 14) || label.includes('13-14') || label.includes('13 to 14')) {
    return {
      key: g.id || '13-14',
      displayRange: '13–14',
      displayLabel: '13–14 YEARS',
    };
  }
  // Fallback for custom ranges
  const rangeStr = max > min ? `${min}–${max}` : (min > 0 ? `${min}+` : label);
  return {
    key: g.id || label || rangeStr,
    displayRange: rangeStr,
    displayLabel: label || `${rangeStr} YEARS`,
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

  // Filter out any obsolete 'below 1' or '1-3' groups
  const filteredGroups = (ageGroups && ageGroups.length > 0)
    ? ageGroups.filter(g => {
        const min = g.minAge !== undefined ? g.minAge : (g.min_age !== undefined ? g.min_age : 0);
        const max = g.maxAge !== undefined ? g.maxAge : (g.max_age !== undefined ? g.max_age : 0);
        const label = (g.label || '').toLowerCase();
        if (min < 2 && max < 2) return false;
        if (label.includes('below 1') || label.includes('infant')) return false;
        if ((min === 1 && max === 3) || label.includes('1-3') || label.includes('1 to 3')) return false;
        return true;
      })
    : DEFAULT_CANONICAL_GROUPS;

  const resolvedGroups = filteredGroups.length >= 5 ? filteredGroups : DEFAULT_CANONICAL_GROUPS;
  const items = resolvedGroups.map(formatAgeGroup);

  return (
    <section
      id="age-groups"
      aria-label="Programme Age Groups"
      className="py-14 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full border-t border-[#EAE8E1] dark:border-[#2A2926] scroll-mt-24"
    >
      <div className="w-full">
        {/* Section Header */}
        <motion.div
          className="max-w-2xl text-left mb-10 sm:mb-14 space-y-2"
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 16 }}
          whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="text-[11px] font-bold tracking-widest text-[#9A7326] dark:text-[#D4AF37] uppercase font-sans block">
            PROGRAMME AGE GROUPS
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-sans font-bold text-[#18181B] dark:text-[#F7F4ED] tracking-tight leading-tight">
            Age groups
          </h2>
          <p className="text-sm sm:text-base text-[#52525B] dark:text-[#C8C2B6] leading-relaxed font-normal">
            Children ages 2–14 are grouped by age for the programme.
          </p>
        </motion.div>

        {/* Clean Five-Item Editorial Row / Grid (5 Columns Desktop, 2 Columns Tablet, Stacked/2-Col Mobile) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-6 lg:gap-6 text-left">
          {items.map((item, idx) => {
            const sequenceStr = String(idx + 1).padStart(2, '0');

            return (
              <motion.div
                key={item.key}
                initial={shouldReduceMotion ? undefined : { opacity: 0, y: 16 }}
                whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{
                  duration: 0.45,
                  delay: shouldReduceMotion ? 0 : 0.06 * idx,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="group border-t border-[#EAE8E1] dark:border-[#2A2926] pt-5 sm:pt-6 space-y-2 sm:space-y-3 cursor-default"
              >
                {/* Sequence Number */}
                <span className="text-[11px] font-bold tracking-widest text-[#9A7326] dark:text-[#D4AF37] uppercase font-sans block">
                  {sequenceStr}
                </span>

                {/* Large Serif Age-Range Numerals */}
                <div className="text-4xl sm:text-5xl lg:text-[54px] font-serif-koinonia font-bold text-[#18181B] dark:text-[#F7F4ED] tracking-tight leading-none group-hover:text-[#9A7326] dark:group-hover:text-[#D4AF37] transition-colors">
                  {item.displayRange}
                </div>

                {/* Canonical Display Label */}
                <span className="text-xs sm:text-[13px] font-semibold text-[#52525B] dark:text-[#C8C2B6] uppercase tracking-[0.14em] font-sans block pt-0.5">
                  {item.displayLabel}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
