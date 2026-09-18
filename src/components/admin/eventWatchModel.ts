import { AutomationRecordItem } from './AutomationDetailModal';

export type EventWatchCategory = 'Safety' | 'Duty' | 'Event setup' | 'Reports';

export interface GroupedEventWatchItem {
  id: string;
  isGroup: boolean;
  category: EventWatchCategory;
  signalType: string;
  count: number;
  title: string;
  summary: string;
  severity: 'urgent' | 'attention' | 'information';
  actionTargetRoute: string;
  actionTargetLabel: string;
  proposedActionKey?: string;
  items: AutomationRecordItem[];
  priorityRank: number;
}

export interface CategorySummary {
  name: EventWatchCategory;
  count: number;
}

/**
 * Humanizes expected reporting time.
 * If same calendar day: "Expected at 6:02 PM"
 * If different day: "Expected 17 Sept at 6:02 PM"
 */
export function formatHumanExpectedTime(isoString: string | null | undefined): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const now = new Date();
    const isSameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();

    const timeStr = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (isSameDay) {
      return `Expected at ${timeStr}`;
    }

    const dateStr = d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short'
    });
    return `Expected ${dateStr} at ${timeStr}`;
  } catch {
    return isoString;
  }
}

/**
 * Formats a restrained readable date (e.g., "17 Sept" or "17 Sept at 4:20 PM")
 */
export function formatHumanDate(isoString: string | null | undefined, includeTime = false): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    if (!includeTime) {
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short'
      });
    }
    const dateStr = d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short'
    });
    const timeStr = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `${dateStr} at ${timeStr}`;
  } catch {
    return isoString;
  }
}

/**
 * Resolves the appropriate operational category for any signal type
 */
export function resolveCategory(signalType: string): EventWatchCategory {
  switch (signalType) {
    case 'SAFETY_ITEM_OPEN':
      return 'Safety';
    case 'VOLUNTEER_NO_SHOW':
    case 'LOCATION_UNDERSTAFFED':
      return 'Duty';
    case 'REPORT_EXPIRED':
      return 'Reports';
    case 'CONFIGURATION_GAP':
    case 'PASS_NOT_READY':
    case 'REGISTRATION_CLOSING_SOON':
    case 'VOLUNTEER_REGISTRATION_CLOSING_SOON':
    case 'EVENT_STARTING_SOON':
    default:
      return 'Event setup';
  }
}

/**
 * Calculates category-level counts for clean typography summary
 */
export function calculateCategorySummaries(items: AutomationRecordItem[]): CategorySummary[] {
  const counts: Record<EventWatchCategory, number> = {
    Safety: 0,
    Duty: 0,
    'Event setup': 0,
    Reports: 0
  };

  for (const item of items) {
    const cat = resolveCategory(item.signal_type);
    counts[cat]++;
  }

  const order: EventWatchCategory[] = ['Safety', 'Duty', 'Event setup', 'Reports'];
  return order
    .filter(cat => counts[cat] > 0)
    .map(cat => ({ name: cat, count: counts[cat] }));
}

/**
 * Transforms raw automation records into bounded, grouped presentation items
 * according to human operational priorities and grouping thresholds.
 */
export function groupAutomationsForOverview(
  items: AutomationRecordItem[],
  maxOverviewItems = 5
): {
  overviewItems: GroupedEventWatchItem[];
  totalActiveCount: number;
  categorySummaries: CategorySummary[];
  hasMore: boolean;
  remainingCount: number;
} {
  const totalActiveCount = items.length;
  const categorySummaries = calculateCategorySummaries(items);

  if (items.length === 0) {
    return {
      overviewItems: [],
      totalActiveCount: 0,
      categorySummaries: [],
      hasMore: false,
      remainingCount: 0
    };
  }

  // Partition items by signal type
  const partitions: Record<string, AutomationRecordItem[]> = {};
  for (const item of items) {
    if (!partitions[item.signal_type]) {
      partitions[item.signal_type] = [];
    }
    partitions[item.signal_type].push(item);
  }

  const groupedPool: GroupedEventWatchItem[] = [];

  // 1. SAFETY_ITEM_OPEN (Always top priority)
  if (partitions['SAFETY_ITEM_OPEN']?.length) {
    const safetyItems = partitions['SAFETY_ITEM_OPEN'];
    const count = safetyItems.length;
    const isUrgent = safetyItems.some(i => i.severity === 'urgent');

    groupedPool.push({
      id: safetyItems[0].id,
      isGroup: count > 1,
      category: 'Safety',
      signalType: 'SAFETY_ITEM_OPEN',
      count,
      title: count === 1 ? '1 safety item needs attention' : `${count} safety items need attention`,
      summary: safetyItems[0].summary || 'Unresolved safety notices require review.',
      severity: isUrgent ? 'urgent' : 'attention',
      actionTargetRoute: 'incidents',
      actionTargetLabel: 'Review safety →',
      items: safetyItems,
      priorityRank: 1
    });
  }

  // 2. VOLUNTEER_NO_SHOW (Priority 2)
  if (partitions['VOLUNTEER_NO_SHOW']?.length) {
    const noShows = partitions['VOLUNTEER_NO_SHOW'];
    if (noShows.length <= 3) {
      // 1 to 3 items: show individually so each person is actionable
      for (const item of noShows) {
        let payload: any = {};
        try {
          payload = JSON.parse(item.payload_json || '{}');
        } catch {}

        const volunteerName = payload.volunteerName || 'Volunteer';
        const locationName = payload.locationName || 'Assigned post';
        const expectedTimeStr = payload.scheduledStart
          ? formatHumanExpectedTime(payload.scheduledStart)
          : 'Expected start passed';

        groupedPool.push({
          id: item.id,
          isGroup: false,
          category: 'Duty',
          signalType: 'VOLUNTEER_NO_SHOW',
          count: 1,
          title: `${volunteerName} has not reported for duty`,
          summary: `${locationName} · ${expectedTimeStr}`,
          severity: item.severity,
          actionTargetRoute: 'duty',
          actionTargetLabel: 'Review reminder →',
          proposedActionKey: item.proposed_action_key || 'SEND_DUTY_REMINDERS',
          items: [item],
          priorityRank: 2
        });
      }
    } else {
      // 4+ items: group into category summary
      const uniqueLocations = new Set(
        noShows.map(item => {
          try {
            return JSON.parse(item.payload_json || '{}').locationName;
          } catch {
            return null;
          }
        }).filter(Boolean)
      );
      const locText = uniqueLocations.size > 1 ? `across ${uniqueLocations.size} locations` : 'at assigned location';

      groupedPool.push({
        id: 'group_volunteer_no_show',
        isGroup: true,
        category: 'Duty',
        signalType: 'VOLUNTEER_NO_SHOW',
        count: noShows.length,
        title: `${noShows.length} volunteers have not reported for duty`,
        summary: `Assigned volunteers not yet checked in ${locText}.`,
        severity: 'attention',
        actionTargetRoute: 'duty',
        actionTargetLabel: 'Review reminders →',
        proposedActionKey: 'SEND_DUTY_REMINDERS',
        items: noShows,
        priorityRank: 2
      });
    }
  }

  // 3. LOCATION_UNDERSTAFFED (Priority 2.5)
  if (partitions['LOCATION_UNDERSTAFFED']?.length) {
    const understaffed = partitions['LOCATION_UNDERSTAFFED'];
    if (understaffed.length <= 3) {
      for (const item of understaffed) {
        groupedPool.push({
          id: item.id,
          isGroup: false,
          category: 'Duty',
          signalType: 'LOCATION_UNDERSTAFFED',
          count: 1,
          title: item.title,
          summary: item.summary,
          severity: item.severity,
          actionTargetRoute: 'duty',
          actionTargetLabel: 'Event Duty →',
          proposedActionKey: item.proposed_action_key || undefined,
          items: [item],
          priorityRank: 2.5
        });
      }
    } else {
      groupedPool.push({
        id: 'group_location_understaffed',
        isGroup: true,
        category: 'Duty',
        signalType: 'LOCATION_UNDERSTAFFED',
        count: understaffed.length,
        title: `${understaffed.length} duty locations need more volunteers`,
        summary: 'Multiple duty posts are currently below required volunteer coverage.',
        severity: 'attention',
        actionTargetRoute: 'duty',
        actionTargetLabel: 'Open Event Duty →',
        items: understaffed,
        priorityRank: 2.5
      });
    }
  }

  // 4. EVENT_STARTING_SOON (Priority 3)
  if (partitions['EVENT_STARTING_SOON']?.length) {
    for (const item of partitions['EVENT_STARTING_SOON']) {
      groupedPool.push({
        id: item.id,
        isGroup: false,
        category: 'Event setup',
        signalType: 'EVENT_STARTING_SOON',
        count: 1,
        title: item.title,
        summary: item.summary,
        severity: item.severity,
        actionTargetRoute: 'events',
        actionTargetLabel: 'View event →',
        items: [item],
        priorityRank: 3
      });
    }
  }

  // 5. REGISTRATION_CLOSING_SOON (Priority 4)
  if (partitions['REGISTRATION_CLOSING_SOON']?.length) {
    for (const item of partitions['REGISTRATION_CLOSING_SOON']) {
      groupedPool.push({
        id: item.id,
        isGroup: false,
        category: 'Event setup',
        signalType: 'REGISTRATION_CLOSING_SOON',
        count: 1,
        title: item.title,
        summary: item.summary,
        severity: item.severity,
        actionTargetRoute: 'events',
        actionTargetLabel: 'Edit event →',
        items: [item],
        priorityRank: 4
      });
    }
  }

  // 6. VOLUNTEER_REGISTRATION_CLOSING_SOON (Priority 4)
  if (partitions['VOLUNTEER_REGISTRATION_CLOSING_SOON']?.length) {
    for (const item of partitions['VOLUNTEER_REGISTRATION_CLOSING_SOON']) {
      groupedPool.push({
        id: item.id,
        isGroup: false,
        category: 'Event setup',
        signalType: 'VOLUNTEER_REGISTRATION_CLOSING_SOON',
        count: 1,
        title: item.title,
        summary: item.summary,
        severity: item.severity,
        actionTargetRoute: 'events',
        actionTargetLabel: 'Edit event →',
        items: [item],
        priorityRank: 4
      });
    }
  }

  // 7. CONFIGURATION_GAP (Priority 4.5)
  if (partitions['CONFIGURATION_GAP']?.length) {
    const gaps = partitions['CONFIGURATION_GAP'];
    if (gaps.length <= 3) {
      for (const item of gaps) {
        // Humanize title if it still has old string
        let title = item.title;
        let summary = item.summary;
        if (title.toLowerCase().includes('no volunteer registration deadline')) {
          title = 'Volunteer registration needs a closing date';
          summary = 'Set when volunteer registration should close.';
        }
        groupedPool.push({
          id: item.id,
          isGroup: false,
          category: 'Event setup',
          signalType: 'CONFIGURATION_GAP',
          count: 1,
          title,
          summary,
          severity: item.severity,
          actionTargetRoute: 'events',
          actionTargetLabel: 'Edit event →',
          items: [item],
          priorityRank: 4.5
        });
      }
    } else {
      groupedPool.push({
        id: 'group_configuration_gap',
        isGroup: true,
        category: 'Event setup',
        signalType: 'CONFIGURATION_GAP',
        count: gaps.length,
        title: `${gaps.length} event setup items need attention`,
        summary: 'Configuration parameters (capacities, deadlines, or locations) need completion.',
        severity: 'attention',
        actionTargetRoute: 'events',
        actionTargetLabel: 'Edit event →',
        items: gaps,
        priorityRank: 4.5
      });
    }
  }

  // 8. PASS_NOT_READY (Priority 5)
  if (partitions['PASS_NOT_READY']?.length) {
    for (const item of partitions['PASS_NOT_READY']) {
      groupedPool.push({
        id: item.id,
        isGroup: false,
        category: 'Event setup',
        signalType: 'PASS_NOT_READY',
        count: 1,
        title: item.title,
        summary: item.summary,
        severity: item.severity,
        actionTargetRoute: 'children',
        actionTargetLabel: 'Children Registry →',
        items: [item],
        priorityRank: 5
      });
    }
  }

  // 9. REPORT_EXPIRED (Priority 6 - ALWAYS GROUPED)
  if (partitions['REPORT_EXPIRED']?.length) {
    const reports = partitions['REPORT_EXPIRED'];
    // Find most recent expired report
    const sortedReports = [...reports].sort((a, b) => {
      const timeA = new Date(a.last_detected_at || a.first_detected_at).getTime();
      const timeB = new Date(b.last_detected_at || b.first_detected_at).getTime();
      return timeB - timeA;
    });

    const mostRecentDate = formatHumanDate(sortedReports[0].last_detected_at || sortedReports[0].first_detected_at);
    const count = reports.length;

    groupedPool.push({
      id: 'group_report_expired',
      isGroup: count > 1,
      category: 'Reports',
      signalType: 'REPORT_EXPIRED',
      count,
      title: count === 1 ? 'A report download is no longer available' : `${count} report downloads are no longer available`,
      summary: count === 1
        ? `Expired ${mostRecentDate} · Downloadable copy expired`
        : `Most recent: ${mostRecentDate} · Downloadable copies expired`,
      severity: 'information',
      actionTargetRoute: 'reports',
      actionTargetLabel: 'Open Reports →',
      proposedActionKey: 'REGENERATE_REPORT',
      items: sortedReports,
      priorityRank: 6
    });
  }

  // Sort pool deterministically by priority rank, then severity, then most recent
  groupedPool.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) {
      return a.priorityRank - b.priorityRank;
    }
    const sevWeight = { urgent: 1, attention: 2, information: 3 };
    if (sevWeight[a.severity] !== sevWeight[b.severity]) {
      return sevWeight[a.severity] - sevWeight[b.severity];
    }
    return b.count - a.count;
  });

  const overviewItems = groupedPool.slice(0, maxOverviewItems);
  const hasMore = totalActiveCount > overviewItems.length || groupedPool.length > maxOverviewItems;
  const remainingCount = totalActiveCount - overviewItems.reduce((acc, g) => acc + g.count, 0);

  return {
    overviewItems,
    totalActiveCount,
    categorySummaries,
    hasMore,
    remainingCount: Math.max(0, remainingCount)
  };
}
