// Share of names with an inferred gender below which an entity's female share is
// flagged: a prominent warning band under GENDER_COVERAGE_WARN, a softer note under
// GENDER_COVERAGE_CAUTION. EntityStats.astro draws the bands and the methodology page
// quotes the threshold, so both read it from here.
export const GENDER_COVERAGE_WARN = 60;
export const GENDER_COVERAGE_CAUTION = 80;
