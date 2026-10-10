export interface AgeBreakdown {
  years: number;
  months: number;
  days: number;
  totalDays: number;
}

export function parseISODate(iso: string): Date | null {
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ageBreakdown(birth: Date, asOf: Date): AgeBreakdown {
  const from = stripTime(birth);
  const to = stripTime(asOf);
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  if (to.getDate() < from.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  // Days are counted from the anniversary that `years`/`months` lands on, clamped to that month's
  // length (31 Jan + 1 month -> 28/29 Feb), so they can never come out negative.
  const anchorMonth = new Date(from.getFullYear() + years, from.getMonth() + months, 1);
  const anchorDay = Math.min(from.getDate(), new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() + 1, 0).getDate());
  const anchor = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth(), anchorDay);
  const days = Math.max(0, daysBetween(anchor, to));

  return { years, months, days, totalDays: daysBetween(from, to) };
}

export function nextBirthday(birth: Date, asOf: Date): { date: Date; daysUntil: number } {
  let next = new Date(asOf.getFullYear(), birth.getMonth(), birth.getDate());
  if (next.getTime() < stripTime(asOf).getTime()) {
    next = new Date(asOf.getFullYear() + 1, birth.getMonth(), birth.getDate());
  }
  const daysUntil = Math.round((next.getTime() - stripTime(asOf).getTime()) / 86400000);
  return { date: next, daysUntil };
}

function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((stripTime(b).getTime() - stripTime(a).getTime()) / 86400000);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
