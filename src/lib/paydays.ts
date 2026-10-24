// Affiliate paydays: the last working day of a month (Monday to Friday, skipping
// UK bank holidays that can fall at the end of a month).

const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

/** Easter Sunday (Gregorian), as a UTC date. */
function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month - 1, day);
}

const lastMonday = (y: number, m: number) => {
  const d = ymd(y, m + 1, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
};

function isBankHoliday(d: Date): boolean {
  const y = d.getUTCFullYear(), key = d.toISOString().slice(0, 10);
  const easter = easterSunday(y);
  const shift = (days: number) => new Date(easter.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return [shift(-2), shift(1), lastMonday(y, 4).toISOString().slice(0, 10), lastMonday(y, 7).toISOString().slice(0, 10)].includes(key);
}

/** The last working day of the month containing `date` (UTC). */
export function lastWorkingDay(date: Date): Date {
  const d = ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || isBankHoliday(d)) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** The next payday on or after `now`. */
export function nextPayday(now = new Date()): Date {
  const thisMonth = lastWorkingDay(now);
  const today = ymd(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return thisMonth >= today ? thisMonth : lastWorkingDay(ymd(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export const formatPayday = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d).replace(",", "");
