// File sizes in decimal megabytes (10^6 bytes), the unit Zenodo shows on its
// record pages. Shared by /download and /faq so the two cannot drift apart.
export const fmtMB = (bytes: number, digits = 1): string => (bytes / 1_000_000).toFixed(digits);
