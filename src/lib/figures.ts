// Formatting for figures quoted in page text. Pages read the values from the
// generated data (public/api/*.json) and format them here, never type them:
// scripts/check-figures.mjs fails the build on a typed dataset figure.
//
// Every helper throws on a missing or non-numeric value, so a key dropped
// from the data fails the build instead of printing "undefined%" or "NaN+".

function need(n: unknown, what = "figure"): number {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(`${what} is ${JSON.stringify(n)}, not a number: is it missing from public/api/?`);
  }
  return n;
}

export const fmt = (n: number, what?: string) => need(n, what).toLocaleString("en-US");

function floorTwoDigits(n: number): number {
  const p = 10 ** Math.max(0, String(Math.trunc(n)).length - 2);
  return Math.floor(n / p) * p;
}

/** A lower bound with two significant digits: 922,097 -> "920,000+", 15,168 -> "15,000+". */
export const atLeast = (n: number, what?: string) => `${fmt(floorTwoDigits(need(n, what)))}+`;

/** The same lower bound, short: 922,097 -> "920K+", 15,168 -> "15K+", 1,234,567 -> "1.2M+". */
export const thousandsAtLeast = (n: number, what?: string) => {
  const f = floorTwoDigits(need(n, what));
  return f >= 1_000_000 ? `${fmt(f / 1_000_000)}M+` : `${fmt(f / 1000)}K+`;
};

/** A share of a whole as a rounded percentage: pct(55810, 922097) -> 6. */
export const pct = (part: number, whole: number, digits = 0) =>
  need(whole, "denominator") ? Number((100 * need(part, "numerator") / whole).toFixed(digits)) : 0;

/** A percentage as the data gives it, with its decimal kept: 33 -> "33.0". */
export const oneDecimal = (v: number, what?: string) => need(v, what).toFixed(1);

/** A percentage rounded to a whole number: 58.4 -> "58". */
export const whole = (v: number, what?: string) => String(Math.round(need(v, what)));
