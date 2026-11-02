// Dates for This week (/this-week) and its archive: ISO weeks (Monday to Sunday, UTC, numbered so week 1 holds the
// year's first Thursday), the rolling seven days the live page covers, and the weeks' permanent ids ("2026-45").
// Pure functions on YYYY-MM-DD strings, shared by the site build, the data run that freezes closed weeks
// (pipeline/lib/weeks.ts) and pipeline/pull.ts.

export interface Period { from: string; to: string }

const DAY = 864e5;
const ms = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** A day plus (or minus) some days. */
export const addDays = (d: string, n: number) => iso(ms(d) + n * DAY);

/** The ISO week of a day: its year (which can differ from the calendar year at the ends) and number. */
export function isoWeek(d: string): { year: number; week: number } {
  const t = ms(d);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  const thursday = t + (3 - dow) * DAY;
  const year = new Date(thursday).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  return { year, week: Math.floor((thursday - jan1) / DAY / 7) + 1 };
}

/** "2026-45": the week's permanent id and the last part of its address. */
export const weekId = (d: string) => {
  const { year, week } = isoWeek(d);
  return `${year}-${String(week).padStart(2, '0')}`;
};

export const isWeekId = (id: string) => /^\d{4}-(0[1-9]|[1-4]\d|5[0-3])$/.test(id) && weekId(weekRange(id).from) === id;

/** The Monday and Sunday of a week id. */
export function weekRange(id: string): Period {
  const [y, w] = id.split('-').map(Number);
  const jan4 = Date.UTC(y, 0, 4);
  const monday1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  const from = iso(monday1 + (w - 1) * 7 * DAY);
  return { from, to: addDays(from, 6) };
}

export const weekNumber = (id: string) => Number(id.split('-')[1]);
export const prevWeek = (id: string) => weekId(addDays(weekRange(id).from, -7));

/** The last week that has closed by a moment: the week before the one it falls in. */
export const lastClosedWeek = (now: string) => weekId(addDays(now.slice(0, 10), -7));

/** The live page's period: the seven days to the day of the data, that day included. */
export const rollingWeek = (to: string): Period => ({ from: addDays(to, -6), to: to.slice(0, 10) });

/** Whether a day (or a moment) falls in a period, both ends included. */
export const inPeriod = (d: string, p: Period) => d.slice(0, 10) >= p.from && d.slice(0, 10) <= p.to;
