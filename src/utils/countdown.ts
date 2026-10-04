export const CANONICAL_REGISTRATION_DEADLINE = '2026-10-25T23:59:00+01:00';

export interface RegistrationCountdownResult {
  days: number;
  hours: number;
  minutes: number;
  isClosed: boolean;
}

export function calculateRegistrationCountdown(
  deadlineIso: string = CANONICAL_REGISTRATION_DEADLINE,
  currentMs?: number
): RegistrationCountdownResult {
  const targetMs = new Date(deadlineIso).getTime();
  const now = currentMs !== undefined ? currentMs : Date.now();
  const diff = targetMs - now;

  if (isNaN(targetMs) || diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, isClosed: true };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return { days, hours, minutes, isClosed: false };
}
