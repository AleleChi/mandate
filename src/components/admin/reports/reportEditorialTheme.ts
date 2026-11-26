export const REPORT_THEME = {
  colors: {
    ivory: '#FAF9F5',
    ivoryDark: '#F4F3EE',
    charcoal: '#18181B',
    charcoalSoft: '#27272A',
    navy: '#0F172A',
    navyMuted: '#1E293B',
    gold: '#C59B27',
    goldLight: '#D6BC76',
    goldDark: '#8C6D23',
    stoneMuted: '#71717A',
    stoneLight: '#A1A1AA',
    borderLight: '#E4E4E7',
    borderGold: '#D6BC76',
    emerald: '#16835D',
    amber: '#D97706',
    rose: '#E11D48'
  },
  fonts: {
    serif: "'Cormorant Garamond', Georgia, serif",
    sans: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
  },
  chartPalette: [
    '#C59B27', // Koinonia Gold
    '#16835D', // Emerald Green
    '#2563EB', // Restrained Sapphire
    '#3F3F46', // Charcoal
    '#D97706', // Warm Amber
    '#7C3AED', // Violet
    '#0D9488', // Deep Teal
    '#71717A'  // Neutral Slate
  ]
} as const;

export function formatEditorialDate(value?: string | null, includeTime: boolean = false): string {
  if (!value) return 'Date unavailable';
  const raw = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw)
    ? raw.replace(' ', 'T') + 'Z'
    : raw;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return 'Date unavailable';

  const dateStr = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos'
  });

  if (!includeTime) return dateStr;

  const timeStr = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Lagos'
  });

  return `${dateStr} at ${timeStr} WAT`;
}

export function formatEditorialNumber(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  return num.toLocaleString();
}
