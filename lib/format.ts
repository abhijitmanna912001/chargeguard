// Pure display helpers. No imports from Next or Prisma.

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

/** 249900 -> "₹2,499.00". Input is integer paise. */
export function formatPaise(paise: number): string {
  return inr.format(paise / 100);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * Short relative deadline: "2 days left", "Overdue by 3 hours".
 * Uses the largest whole unit (days, then hours, then minutes). `now` is
 * passed in so the function stays pure and testable.
 */
export function formatDeadline(isoString: string, now: Date): string {
  const diff = new Date(isoString).getTime() - now.getTime();
  if (Number.isNaN(diff)) {
    throw new Error(`Invalid deadline: ${isoString}`);
  }
  const overdue = diff < 0;
  const ms = Math.abs(diff);

  let span: string;
  if (ms >= DAY) span = plural(Math.floor(ms / DAY), "day");
  else if (ms >= HOUR) span = plural(Math.floor(ms / HOUR), "hour");
  else if (ms >= MINUTE) span = plural(Math.floor(ms / MINUTE), "minute");
  else return overdue ? "Overdue by less than a minute" : "Less than a minute left";

  return overdue ? `Overdue by ${span}` : `${span} left`;
}
