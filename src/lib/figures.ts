// Formatting for figures quoted in page text. Pages read the values from the
// generated data (public/api/*.json) and format them here, never type them:
// scripts/check-figures.mjs fails the build on a typed dataset figure.

export const fmt = (n: number) => n.toLocaleString("en-US");

function floorTwoDigits(n: number): number {
  const p = 10 ** Math.max(0, String(Math.trunc(n)).length - 2);
  return Math.floor(n / p) * p;
}

/** A lower bound with two significant digits: 922,097 -> "920,000+", 15,168 -> "15,000+". */
export const atLeast = (n: number) => `${fmt(floorTwoDigits(n))}+`;

/** The same lower bound in thousands: 922,097 -> "920K+". */
export const thousandsAtLeast = (n: number) => `${fmt(floorTwoDigits(n) / 1000)}K+`;

/** A percentage as the data gives it, with its decimal kept: 33 -> "33.0". */
export const oneDecimal = (v: number) => v.toFixed(1);

/** A share of a whole as a rounded percentage: pct(55810, 922097) -> 6. */
export const pct = (part: number, whole: number, digits = 0) =>
  whole ? Number((100 * part / whole).toFixed(digits)) : 0;
