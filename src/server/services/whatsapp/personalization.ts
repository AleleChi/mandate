/**
 * Centralized WhatsApp Personalization & First-Name Extraction Engine
 * 
 * Ensures every outgoing WhatsApp message contains validated, non-empty
 * conversational first names matching the exact placeholders defined in
 * approved Zoho CPaaS templates (e.g. {{parent_first_name}}, {{child_first_name}},
 * {{volunteer_first_name}}).
 */

const HONORIFIC_PATTERN = /^(pastor|pst|deacon|dcn|deaconess|bro|brother|sis|sister|dr|mr|mrs|ms|rev|reverend|elder)\.?$/i;

/**
 * Extracts a clean, capitalized conversational first name from a full name string
 * or profile object.
 *
 * Examples:
 * - "Chigozie Alele" -> "Chigozie"
 * - "Grace Adeyemi" -> "Grace"
 * - "Brother John" -> "John"
 * - "Pastor Chigozie" -> "Chigozie"
 * - "dr. emmanuel okonkwo" -> "Emmanuel"
 */
export function extractFirstName(
  input: string | { firstName?: string; first_name?: string; fullName?: string; full_name?: string } | null | undefined
): string {
  if (!input) return '';

  let raw = '';
  if (typeof input === 'object') {
    if (input.firstName && typeof input.firstName === 'string' && input.firstName.trim()) {
      raw = input.firstName.trim();
    } else if (input.first_name && typeof input.first_name === 'string' && input.first_name.trim()) {
      raw = input.first_name.trim();
    } else if (input.fullName && typeof input.fullName === 'string') {
      raw = input.fullName.trim();
    } else if (input.full_name && typeof input.full_name === 'string') {
      raw = input.full_name.trim();
    }
  } else if (typeof input === 'string') {
    raw = input.trim();
  }

  if (!raw) return '';

  // Clean special characters and split by whitespace
  const cleaned = raw.replace(/[,"';:<>]/g, ' ').trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';

  let candidate = tokens[0];
  // If first token is a common church/professional honorific, use the following token if available
  if (tokens.length > 1 && HONORIFIC_PATTERN.test(candidate)) {
    candidate = tokens[1];
  }

  // Remove any leftover punctuation
  candidate = candidate.replace(/[^a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\-']/g, '').trim();
  if (!candidate) return '';

  // Format with title case (e.g. "CHIGOZIE" -> "Chigozie", "chigozie" -> "Chigozie")
  if (candidate.length === 1) {
    return candidate.toUpperCase();
  }

  // Handle hyphenated names gracefully (e.g. "Mary-Anne" -> "Mary-Anne")
  return candidate
    .split('-')
    .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : '')
    .join('-');
}

/**
 * Formats a list of child first names into canonical English list format:
 * - 1: "Daniel"
 * - 2: "Daniel and Sarah"
 * - 3: "Daniel, Sarah and Michael"
 * - 4+: "Daniel, Sarah, Michael and Grace"
 */
export function formatSelectedChildNames(names: string[]): string {
  if (!names || names.length === 0) return '';
  const cleaned = names
    .map(n => typeof n === 'string' ? extractFirstName(n) : '')
    .filter(Boolean);

  // Deduplicate while preserving order
  const uniqueNames = Array.from(new Set(cleaned));
  if (uniqueNames.length === 0) return '';
  if (uniqueNames.length === 1) return uniqueNames[0];
  if (uniqueNames.length === 2) return `${uniqueNames[0]} and ${uniqueNames[1]}`;

  const allButLast = uniqueNames.slice(0, -1).join(', ');
  const last = uniqueNames[uniqueNames.length - 1];
  return `${allButLast} and ${last}`;
}

export interface PersonalizationOptions {
  parentFirstName?: string;
  parentFullName?: string;
  childFirstName?: string;
  childFullName?: string;
  selectedChildNames?: string;
  volunteerFirstName?: string;
  volunteerFullName?: string;
  eventName?: string;
  teamName?: string;
  dutyLocation?: string;
  passUrl?: string;
  statusUrl?: string;
  channelUrl?: string;
  customMergeInfo?: Record<string, string>;
}

/**
 * Builds the canonical merge_info map for Zoho WhatsApp templates.
 * 
 * Sets the exact placeholder variable names expected by approved templates:
 * - parent_first_name
 * - child_first_name
 * - volunteer_first_name
 * 
 * Along with backwards-compatible aliases (first_name, parent_name, child_name, volunteer_name)
 * so that any approved template variable naming variant receives the correct value.
 */
export function buildMergeInfo(options: PersonalizationOptions = {}): Record<string, string> {
  const mergeInfo: Record<string, string> = {};

  const parentFirst = extractFirstName(options.parentFirstName || options.parentFullName);
  const childFirst = extractFirstName(options.childFirstName || options.childFullName);
  const volunteerFirst = extractFirstName(options.volunteerFirstName || options.volunteerFullName);

  if (parentFirst) {
    mergeInfo.parent_first_name = parentFirst;
    mergeInfo.parent_name = parentFirst;
  }

  if (childFirst) {
    mergeInfo.child_first_name = childFirst;
    mergeInfo.child_name = childFirst;
  }

  if (options.selectedChildNames?.trim()) {
    mergeInfo.selected_child_names = options.selectedChildNames.trim();
    mergeInfo.child_names = options.selectedChildNames.trim();
  }

  if (volunteerFirst) {
    mergeInfo.volunteer_first_name = volunteerFirst;
    mergeInfo.volunteer_name = volunteerFirst;
  }

  // Recipient first name default alias for templates that use {{first_name}}
  const primaryFirst = parentFirst || volunteerFirst || childFirst;
  if (primaryFirst) {
    mergeInfo.first_name = primaryFirst;
  }

  if (options.eventName?.trim()) {
    mergeInfo.event_name = options.eventName.trim();
  }

  if (options.teamName?.trim()) {
    mergeInfo.team_name = options.teamName.trim();
  }

  if (options.dutyLocation?.trim()) {
    mergeInfo.duty_location = options.dutyLocation.trim();
  }

  if (options.passUrl?.trim()) {
    mergeInfo.pass_url = options.passUrl.trim();
  }

  if (options.statusUrl?.trim()) {
    mergeInfo.status_url = options.statusUrl.trim();
  }

  // WhatsApp Channel CTA link from configuration or parameter
  const configuredChannelUrl = (
    options.channelUrl ||
    process.env.WHATSAPP_CHANNEL_URL ||
    process.env.PUBLIC_WHATSAPP_CHANNEL_URL ||
    ''
  ).trim();

  if (configuredChannelUrl) {
    mergeInfo.channel_url = configuredChannelUrl;
  }

  if (options.customMergeInfo) {
    for (const [k, v] of Object.entries(options.customMergeInfo)) {
      if (v !== undefined && v !== null && String(v).trim()) {
        mergeInfo[k] = String(v).trim();
      }
    }
  }

  return mergeInfo;
}

/**
 * Validates that all required merge keys are present, non-null, non-undefined,
 * and not just empty whitespace.
 */
export function validateMergeInfo(
  requiredKeys: string[],
  mergeInfo?: Record<string, string> | null
): { valid: boolean; missingKeys: string[]; error?: string } {
  if (!requiredKeys || requiredKeys.length === 0) {
    return { valid: true, missingKeys: [] };
  }

  if (!mergeInfo || typeof mergeInfo !== 'object') {
    return {
      valid: false,
      missingKeys: requiredKeys,
      error: `Missing merge_info object. Required variables: ${requiredKeys.join(', ')}`
    };
  }

  const missingKeys: string[] = [];

  for (const key of requiredKeys) {
    const val = mergeInfo[key];
    if (val === undefined || val === null || typeof val !== 'string' || !val.trim()) {
      // Check if a recognized fallback alias exists with non-blank content
      let aliasSatisfied = false;
      if (key === 'parent_first_name' && (mergeInfo.parent_name?.trim() || mergeInfo.first_name?.trim())) {
        aliasSatisfied = true;
      } else if (key === 'child_first_name' && mergeInfo.child_name?.trim()) {
        aliasSatisfied = true;
      } else if (key === 'volunteer_first_name' && (mergeInfo.volunteer_name?.trim() || mergeInfo.first_name?.trim())) {
        aliasSatisfied = true;
      } else if (key === 'first_name' && (mergeInfo.parent_first_name?.trim() || mergeInfo.volunteer_first_name?.trim())) {
        aliasSatisfied = true;
      } else if (key === 'selected_child_names' && mergeInfo.child_names?.trim()) {
        aliasSatisfied = true;
      }

      if (!aliasSatisfied) {
        missingKeys.push(key);
      }
    }
  }

  if (missingKeys.length > 0) {
    return {
      valid: false,
      missingKeys,
      error: `Required merge variable(s) missing or blank: ${missingKeys.join(', ')}`
    };
  }

  return { valid: true, missingKeys: [] };
}
