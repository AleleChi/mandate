// Shared presentation formatters for Koinonia Practice Module
// Preserves stored identifiers and API contracts while presenting calm, human church terminology

export const formatScenarioTitle = (title?: string): string => {
  if (!title) return 'Practice scenario';
  const t = title.toLowerCase();
  if (t.includes('duplicate') || t.includes('standard check-in') || t.includes('check-in & duplicate')) {
    return 'Everyday check-in';
  }
  if (t.includes('missing child') || t.includes('cannot be located') || t.includes('cannot be found')) {
    return 'When a child cannot be found';
  }
  if (t.includes('offline') || t.includes('connectivity') || t.includes('network drops') || t.includes('without internet')) {
    return 'Check-in without internet';
  }
  return title;
};

export const formatScenarioTopic = (category?: string, title?: string): string => {
  const c = (category || '').toLowerCase();
  const t = (title || '').toLowerCase();
  if (c.includes('missing') || t.includes('missing') || c.includes('safety') || t.includes('safety')) {
    return 'Child safety';
  }
  if (c.includes('pickup') || t.includes('pickup') || c.includes('release')) {
    return 'Pickup';
  }
  if (c.includes('connectivity') || t.includes('offline') || c.includes('check-in') || t.includes('check-in') || t.includes('internet')) {
    return 'Check-in';
  }
  return category || 'Event duty';
};

export const formatScenarioDescription = (desc?: string, title?: string): string => {
  const t = (title || '').toLowerCase();
  if (t.includes('duplicate') || t.includes('standard check-in') || t.includes('everyday check-in')) {
    return 'Practise normal check-in and what to do when the same pass is presented twice or a pass is no longer valid.';
  }
  if (t.includes('missing child') || t.includes('cannot be found') || t.includes('cannot be located')) {
    return 'Practise the steps to take when a child is not at their assigned area, including informing the right team and recording what happened.';
  }
  if (t.includes('offline') || t.includes('connectivity') || t.includes('without internet')) {
    return 'Practise checking children in safely when internet access is unavailable, then confirm the information once service returns.';
  }
  return desc || 'Practise operational steps calmly with your team.';
};

export const formatScenarioLevel = (difficulty?: string): 'Starter' | 'Standard' | 'Advanced' => {
  const d = (difficulty || '').toLowerCase();
  if (d.includes('intro') || d.includes('guided') || d.includes('starter') || d.includes('beginner')) {
    return 'Starter';
  }
  if (d.includes('advanced') || d.includes('expert') || d.includes('drill 3')) {
    return 'Advanced';
  }
  return 'Standard';
};

export const formatScenarioTime = (minutes?: number | string): string => {
  const m = Number(minutes) || 20;
  return `${m} minutes`;
};

export const formatPracticeRole = (role?: string): string => {
  if (!role) return 'Check-in team';
  const r = role.toLowerCase();
  if (r.includes('check-in')) return 'Check-in team';
  if (r.includes('pickup')) return 'Pickup team';
  if (r.includes('room')) return 'Room lead';
  if (r.includes('responder') || r.includes('response') || r.includes('safety') || r.includes('care')) return 'Care lead';
  return role;
};

export interface ScenarioGuidance {
  whatToPractise: string;
  whatSuccessLooksLike: string;
  estimatedTime: string;
  suggestedRole: string;
}

export const getScenarioGuidance = (scenario?: any): ScenarioGuidance => {
  const title = (scenario?.title || '').toLowerCase();
  const desc = scenario?.description || '';

  if (title.includes('offline') || title.includes('connectivity') || title.includes('without internet')) {
    return {
      whatToPractise: 'Keep check-in moving safely while internet access is unavailable.',
      whatSuccessLooksLike: 'Children are checked in correctly and all entries are accounted for when service returns.',
      estimatedTime: '20 minutes',
      suggestedRole: 'Check-in team'
    };
  }

  if (title.includes('missing') || title.includes('cannot be found')) {
    return {
      whatToPractise: 'Inform the care lead, confirm the child’s details, and begin agreed safety steps without delay.',
      whatSuccessLooksLike: 'The team is notified calmly, the room lead is updated, and a clear factual record is made.',
      estimatedTime: '20 minutes',
      suggestedRole: 'Care lead'
    };
  }

  if (title.includes('duplicate') || title.includes('standard check-in') || title.includes('everyday')) {
    return {
      whatToPractise: 'Practise normal entry check-in and handling duplicate or expired pass presentations with grace.',
      whatSuccessLooksLike: 'Every child is checked in accurately, duplicate scans are resolved politely, and room limits remain safe.',
      estimatedTime: '15 minutes',
      suggestedRole: 'Check-in team'
    };
  }

  return {
    whatToPractise: desc || 'Follow agreed team steps calmly and communicate clearly with fellow volunteers.',
    whatSuccessLooksLike: 'All steps are completed safely and team records are confirmed.',
    estimatedTime: `${scenario?.expected_duration_minutes || 20} minutes`,
    suggestedRole: 'Check-in team'
  };
};
