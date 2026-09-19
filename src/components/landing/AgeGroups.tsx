import React from 'react';

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
  const resolvedGroups = (ageGroups && ageGroups.length > 0)
    ? ageGroups
    : DEFAULT_CANONICAL_GROUPS;

  const items = resolvedGroups.map(formatAgeGroup);

  return (
    <section
      id="age-groups"
      aria-label="Programme Age Groups"
      className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full border-t border-[#EAE8E1]"
    >
      {/* Section Header */}
      <div className="max-w-2xl text-left mb-12 sm:mb-16 space-y-2">
        <span className="text-[11px] font-bold tracking-widest text-[#9A7326] uppercase font-sans block">
          PROGRAMME AGE GROUPS
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif-koinonia font-bold text-[#18181B] tracking-tight leading-tight">
          Age groups
        </h2>
        <p className="text-sm sm:text-base text-[#52525B] leading-relaxed font-normal">
          Children are grouped by age for the programme.
        </p>
      </div>

      {/* Editorial Bands with Oversized Typography */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 sm:gap-12 text-left">
        {items.map((item) => (
          <div
            key={item.key}
            className="border-t-2 border-[#18181B] pt-8 space-y-3"
          >
            {/* Oversized Typography: numbers are the design */}
            <div className="text-5xl sm:text-6xl font-serif-koinonia font-bold text-[#18181B] tracking-tight leading-none whitespace-nowrap">
              {item.displayRange}
            </div>

            <span className="text-xs font-semibold text-[#9A7326] uppercase tracking-wider font-sans block pt-1">
              {item.displayLabel}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};
