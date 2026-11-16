/** Pure date helpers for the calendar picker. Dates are "YYYY-MM-DD" strings in
 *  factory time, months are "YYYY-MM". Nothing here reads the clock or a time
 *  zone, so results are the same on every phone. */
const pad = (n: number) => String(n).padStart(2, "0");

export function monthOf(date: string) {
  return date.slice(0, 7);
}
/** Move a month ("YYYY-MM") forward or back. */
export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}
function daysIn(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** 0 = Monday ... 6 = Sunday, for the first day of the month. */
function firstColumn(month: string) {
  const [y, m] = month.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
}
/** Weeks (Monday first) of a month. Each cell is a date or null for padding. */
export function monthWeeks(month: string): (string | null)[][] {
  const cells: (string | null)[] = Array(firstColumn(month)).fill(null);
  for (let d = 1; d <= daysIn(month); d += 1) cells.push(`${month}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
/** True when the date is inside the optional inclusive range. */
export function inRange(date: string, min?: string, max?: string) {
  return (!min || date >= min) && (!max || date <= max);
}
/** Keep a date inside the range. */
export function clampDate(date: string, min?: string, max?: string) {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}
const dayShift = (date: string, by: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + by * 86400000)
    .toISOString()
    .slice(0, 10);
export type DayLabelKind =
  "today" | "yesterday" | "tomorrow" | "sameYear" | "otherYear";
/** Which wording a day gets: a name for today and its neighbours, otherwise a
 *  weekday and date, with the year only when it is not the current year. */
export function dayLabelKind(date: string, today: string): DayLabelKind {
  if (date === today) return "today";
  if (date === dayShift(today, -1)) return "yesterday";
  if (date === dayShift(today, 1)) return "tomorrow";
  return date.slice(0, 4) === today.slice(0, 4) ? "sameYear" : "otherYear";
}
