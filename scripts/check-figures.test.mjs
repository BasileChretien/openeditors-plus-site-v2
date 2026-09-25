// Tests for check-figures.mjs: run with `node --test scripts/`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checksFor, figures, scanText } from "./check-figures.mjs";

const release = (over = {}) => ({
  summary: {
    total_records: 922097, unique_editors: 745125, unique_journals: 15168, with_orcid: 400123,
    records_with_h_index: 538550, unique_publishers: 48, unique_countries: 190, n_columns: 77,
    pct_female: 33.0, pct_gender_classified: 82.0, pct_with_orcid: 43.4, pct_records_with_h_index: 58.4,
    mean_h_index: 21.7, role_distribution: { section_editor: 42940, other: 55810 },
    female_share_by_role: { editor_in_chief: { editors: 20000, pct_female: 25.2 } },
    ...over.summary,
  },
  release: { version: "4.0.1", data_version: "2026.4", release_date: "2026-09-25", ...over.release },
  countries: over.countries ?? [
    { country: "Italy", editors: 30000, pct_gender_classified: 96.4, pct_female: 38.1 },
    { country: "United States", editors: 150000, pct_gender_classified: 86.4, pct_female: 35.2 },
    { country: "Tuvalu", editors: 3, pct_gender_classified: 50.0, pct_female: 50.0 },
  ],
});

const flagged = (line, data = release(), previous = null) =>
  scanText("page.astro", line, checksFor(data, previous, "origin/main"));

test("a current count is flagged in every usual form", () => {
  for (const line of ["922097 records", "922,097 records", "922k records", "920,000+ records", "920K+ records", "15,000+ journals"]) {
    assert.equal(flagged(line).length, 1, line);
  }
});

test("a count computed from the data is not flagged", () => {
  assert.deepEqual(flagged("{atLeast(summary.total_records)} records"), []);
  assert.deepEqual(flagged("Loading {fmt(roleDist.section_editor)} rows"), []);
});

test("a percentage is flagged only next to what it measures", () => {
  assert.equal(flagged("33.0% of editors are female").length, 1);
  assert.equal(flagged("Italy: 96.4% classified").length, 1);
  assert.equal(flagged("the US at 86.4%").length, 1);
  assert.equal(flagged("Editors-in-Chief (25.2% female)").length, 1);
  assert.equal(flagged("the editor in chief role: 25%").length, 1);
  assert.equal(flagged("EiCs are 25.2% women").length, 1);
  assert.deepEqual(flagged("the page loads 33.0% faster"), []);
});

test("small countries are not checked", () => {
  assert.deepEqual(flagged("Tuvalu: 50.0% classified"), []);
});

test("units, version and date are flagged", () => {
  for (const line of ["the 48 publishers", "190 countries", "all 77 columns", "Download v4.0.1", "data 2026.4", "released 2026-09-25"]) {
    assert.equal(flagged(line).length, 1, line);
  }
  assert.deepEqual(flagged("v4.0.10 and 14.0.1"), []);
});

test("frozen history and comment-only lines are skipped", () => {
  const text = [
    "// 922,097 records in the comment",
    "<!-- frozen-figures:start -->",
    "v4.0.1 had 922,097 records",
    "<!-- frozen-figures:end -->",
    "now 922,097 records",
  ].join("\n");
  const problems = flagged(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^page\.astro:5: /);
});

test("with a previous release, its changed figures are flagged as stale", () => {
  const previous = release();
  const next = release({ summary: { total_records: 950321, pct_female: 33.4 }, release: { version: "4.1.0", data_version: "2026.5", release_date: "2027-01-10" } });
  // The old count is no longer the current figure, so only the previous-release check can catch it.
  assert.deepEqual(flagged("922,097 records", next), []);
  const stale = flagged("922,097 records", next, previous);
  assert.equal(stale.length, 1);
  assert.match(stale[0], /previous release's \(origin\/main\) total_records/);
  assert.equal(flagged("33.0% female", next, previous).length, 1);
  assert.equal(flagged("Download v4.0.1", next, previous).length, 1);
});

test("an unchanged figure is checked once, as current", () => {
  const checks = checksFor(release(), release(), "origin/main");
  assert.equal(checks.length, Object.keys(figures(release())).length);
});
