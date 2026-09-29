/**
 * Convert a Date to a local calendar day string in YYYY-MM-DD format.
 * Uses local calendar components (getFullYear, getMonth, getDate),
 * not UTC, to avoid timezone shifts at month/year boundaries.
 */
export function toLocalDay(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Month-to-date range as YYYY-MM-DD strings: the 1st of the current month through today.
 * Uses local calendar, not UTC, to respect the user's timezone.
 */
export function monthToDateRange(now: Date = new Date()): { startDate: string; endDate: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: toLocalDay(start),
    endDate: toLocalDay(now),
  };
}

export type DatePreset = 'today' | '24h' | '7d' | '30d';

/**
 * Build a date range from a preset name. Returns an object with
 * Date objects and pre-formatted YYYY-MM-DD strings for API calls.
 */
export function localDateRange(
  preset: DatePreset,
  now: Date = new Date(),
): { start: Date; end: Date; startDate: string; endDate: string } {
  const end = new Date(now);
  const start = new Date(now);

  if (preset === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (preset === '24h') {
    start.setHours(start.getHours() - 24);
  } else if (preset === '7d') {
    start.setDate(start.getDate() - 7);
  } else if (preset === '30d') {
    start.setDate(start.getDate() - 30);
  }

  return {
    start,
    end,
    startDate: toLocalDay(start),
    endDate: toLocalDay(end),
  };
}
