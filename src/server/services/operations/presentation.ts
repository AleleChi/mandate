/**
 * Human-Facing Presentation Layer for Operations Assistant
 *
 * Ensures all user-facing responses, section headers, provenance, and numbers
 * sound like a competent human operations coordinator rather than internal software
 * architecture, databases, or APIs.
 */

export function formatNumber(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '0';
  const n = typeof val === 'number' ? val : Number(val);
  if (isNaN(n)) return '0';
  return n.toLocaleString('en-US');
}

export function formatPlural(
  count: number,
  singular: string,
  plural: string,
  zeroLabel?: string
): string {
  if (count === 0) {
    return zeroLabel || `No ${plural}`;
  }
  if (count === 1) {
    return `1 ${singular}`;
  }
  return `${formatNumber(count)} ${plural}`;
}

export function formatHumanProvenance(
  domain: string | null | undefined,
  eventTitle: string,
  updatedAt: string
): { source: string; updatedAt: string } {
  const cleanTitle = (eventTitle || 'Current Event').trim();
  if (!domain || domain.trim() === '') {
    return {
      source: cleanTitle,
      updatedAt
    };
  }
  return {
    source: `${domain} · ${cleanTitle}`,
    updatedAt
  };
}

export function formatSafetySummarySentence(
  openNotices: number,
  activeEscalations: number,
  isAuthorized: boolean
): string {
  if (!isAuthorized) {
    return 'Safety details restricted.';
  }

  let safetyPart = '';
  if (openNotices === 0) {
    safetyPart = 'There are no open safety notices';
  } else if (openNotices === 1) {
    safetyPart = 'There is 1 open safety notice';
  } else {
    safetyPart = `There are ${formatNumber(openNotices)} open safety notices`;
  }

  let escalationPart = '';
  if (activeEscalations === 0) {
    escalationPart = 'no active escalations';
  } else if (activeEscalations === 1) {
    escalationPart = 'one escalation still needs attention';
  } else {
    escalationPart = `${formatNumber(activeEscalations)} escalations still need attention`;
  }

  return `${safetyPart}, and ${escalationPart}.`;
}

export interface EventSummaryPresentationInput {
  eventTitle: string;
  regTotal: number;
  regSelected: number;
  checkedIn: number;
  arrivals: number;
  passesReady: number;
  volunteersAssigned: number;
  volunteersOnDuty: number;
  locationsCount: number;
  openSafetyNotices: number;
  activeEscalations: number;
  safetyAuthorized: boolean;
  updatedAt: string;
}

export function buildHumanEventSummary(input: EventSummaryPresentationInput) {
  const {
    eventTitle,
    regTotal,
    regSelected,
    checkedIn,
    arrivals,
    passesReady,
    volunteersAssigned,
    volunteersOnDuty,
    locationsCount,
    openSafetyNotices,
    activeEscalations,
    safetyAuthorized,
    updatedAt
  } = input;

  const safetySentence = formatSafetySummarySentence(
    openSafetyNotices,
    activeEscalations,
    safetyAuthorized
  );

  const locPart = locationsCount > 0
    ? ` across ${formatNumber(locationsCount)} location${locationsCount === 1 ? '' : 's'}`
    : '';

  const answer = `Registration is open for "${eventTitle}". All ${formatNumber(regSelected)} children are selected (out of ${formatNumber(regTotal)} registered), and ${formatNumber(checkedIn)} children are checked in right now (${formatNumber(arrivals)} total arrivals). ${formatNumber(passesReady)} passes are ready. ${formatNumber(volunteersAssigned)} volunteers are assigned, with ${formatNumber(volunteersOnDuty)} currently on duty${locPart}. ${safetySentence}`;

  const breakdownItems = [
    {
      label: 'Registrations',
      primary: formatNumber(regTotal),
      secondary: `${formatNumber(regSelected)} selected`
    },
    {
      label: 'Checked in',
      primary: formatNumber(checkedIn),
      secondary: `${formatNumber(arrivals)} total arrivals`
    },
    {
      label: 'Passes ready',
      primary: formatNumber(passesReady)
    },
    {
      label: 'Volunteers on duty',
      primary: `${formatNumber(volunteersOnDuty)} of ${formatNumber(volunteersAssigned)}`
    }
  ];

  if (safetyAuthorized) {
    breakdownItems.push({
      label: 'Safety notices',
      primary: formatNumber(openSafetyNotices)
    });
    breakdownItems.push({
      label: 'Escalations',
      primary: formatNumber(activeEscalations)
    });
  }

  return {
    answer,
    breakdown: {
      title: 'Event overview',
      items: breakdownItems
    },
    provenance: formatHumanProvenance(null, eventTitle, updatedAt)
  };
}
