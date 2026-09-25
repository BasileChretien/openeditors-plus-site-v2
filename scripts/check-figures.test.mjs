// Tests for check-figures.mjs: run with `node --test scripts/check-figures.test.mjs`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ALIAS_KEYS, baselineProblem, checksFor, figures, scanText, zenodoProblem } from "./check-figures.mjs";

const SCRIPT = fileURLToPath(new URL("./check-figures.mjs", import.meta.url));

const release = (over = {}) => ({
  summary: {
    total_records: 922097, unique_editors: 745125, unique_journals: 15168, with_orcid: 400123,
    records_with_h_index: 538550, unique_publishers: 48, unique_countries: 190, n_columns: 77,
    pct_female: 33.0, pct_gender_classified: 82.0, pct_with_orcid: 43.4, pct_records_with_h_index: 58.4,
    mean_h_index: 21.7, role_distribution: { section_editor: 42940, other: 55810 },
    female_share_by_role: {
      editor_in_chief: { editors: 20000, pct_female: 25.2 },
      other: { editors: 5000, pct_female: 35.0 },
      editor: { editors: 5000, pct_female: 31.0 },
    },
    ...over.summary,
  },
  release: { version: "4.0.1", data_version: "2026.4", release_date: "2026-09-25", ...over.release },
  countries: over.countries ?? [
    { country: "Italy", editors: 30000, pct_gender_classified: 96.4, pct_female: 38.1 },
    { country: "United States", editors: 150000, pct_gender_classified: 86.4, pct_female: 35.2 },
    { country: "Tuvalu", editors: 3, pct_gender_classified: 50.0, pct_female: 50.0 },
  ],
});

const flagged = (text, data = release(), previous = null, file = "page.astro") =>
  scanText(file, text, checksFor(data, previous, "origin/main"));

test("a current count is flagged in every usual form", () => {
  for (const line of ["922097 records", "922,097 records", "922k records", "920,000+ records", "920K+ records",
    "920K records", "~920,000 records", "over 15,000 journals", "more than 920,000 positions", "15,000+ journals",
    "0.92 million records", "0.9M records", "across 15,000 academic journals", "920,000 editorial positions",
    "a board of 740,000 editors", "the full 922k-row dataset", "400,000+ editors with an ORCID"]) {
    assert.equal(flagged(line).length, 1, line);
  }
  // The exact count, or a thousands form as precise, needs nothing around it.
  assert.equal(flagged("922,097").length, 1);
  assert.equal(flagged("grab all 922k").length, 1);
});

test("a headline count's '+' form is a figure anywhere, as the stat cards print it", () => {
  // The home page's hero cards put the label two lines under the number.
  for (const card of ["<span>740K+</span>\n</div>\n<div>Unique editors</div>", "<span>15K+</span>", "920,000+",
    "920,000+ editorial roles", "920K+ board memberships", "15,000+ scholarly publications", "740K+ academics",
    "0.92 million"]) {
    assert.equal(flagged(card).length, 1, card);
  }
});

test("a weaker rounded form is a figure where what it counts is named within three lines", () => {
  assert.equal(flagged("<span>920K</span>\n</div>\n<div>positions</div>").length, 1);
  assert.equal(flagged("~15,000\n\n\njournals").length, 1);
  assert.deepEqual(flagged("~15,000\n\n\n\njournals"), []);
});

test("a count computed from the data is not flagged, nor a round number counting something else", () => {
  assert.deepEqual(flagged("{atLeast(summary.total_records)} records"), []);
  assert.deepEqual(flagged("Loading {fmt(roleDist.section_editor)} rows"), []);
  assert.deepEqual(flagged("journals with 10,000+ citations"), []);
  for (const line of ["15,000 page views a month", "15,000 rows", "15,000 people", "some 15,000 downloads",
    "15k downloads", "400,000 members", "400,000+ page views", "400,000 records per file",
    "over 400,000 page views", "a 0.5 m margin", "0.4M euros"]) {
    assert.deepEqual(flagged(line), [], line);
  }
});

test("a percentage is flagged only next to what it measures", () => {
  assert.equal(flagged("33.0% of editors are female").length, 1);
  assert.equal(flagged("33.0 percent are women").length, 1);
  assert.equal(flagged("Italy: 96.4% classified").length, 1);
  assert.equal(flagged("the US at 86.4%").length, 1);
  assert.equal(flagged("the U.S. at 86.4%").length, 1);
  assert.equal(flagged("Editors-in-Chief (25.2% female)").length, 1);
  assert.equal(flagged("the editor in chief role: 25%").length, 1);
  assert.equal(flagged("EiCs are 25.2% women").length, 1);
  assert.deepEqual(flagged("the page loads 33.0% faster"), []);
});

test("a percent sign is recognised in every spelling", () => {
  for (const line of ["33.0&nbsp;% female", "33.0&#160;% female", "33.0&thinsp;% female", "33.0&#37; female",
    "33.0\u202f% female", "33.0 per cent female"]) {
    assert.equal(flagged(line).length, 1, line);
  }
});

test("a country is named also by another name, or by its demonym before what it is about", () => {
  const data = release({ countries: [
    { country: "China", editors: 50000, pct_gender_classified: 44.2, pct_female: 30.1 },
    { country: "South Korea", editors: 9000, pct_gender_classified: 39.6, pct_female: 22.5 },
    { country: "United Kingdom", editors: 40000, pct_gender_classified: 89.6, pct_female: 36.0 },
    { country: "The Netherlands", editors: 9000, pct_gender_classified: 91.3, pct_female: 34.4 },
    { country: "T\u00fcrkiye", editors: 5000, pct_gender_classified: 71.8, pct_female: 41.2 },
    { country: "India", editors: 15000, pct_gender_classified: 80.4, pct_female: 23.5 },
    { country: "Germany", editors: 30000, pct_gender_classified: 92.3, pct_female: 25.0 },
    { country: "United States", editors: 150000, pct_gender_classified: 86.4, pct_female: 37.0 },
  ] });
  for (const line of ["Chinese editors: 44.2% classified", "Korea at 39.6%", "Korean names, 39.6%",
    "British editors 89.6%", "the Netherlands, 91.3%", "Dutch editorial boards: 91.3%", "Turkey at 71.8%",
    "Turkish editors, 71.8%", "Indian institutions 80.4%", "US editors 37.0%"]) {
    assert.equal(flagged(line, data).length, 1, line);
  }
  for (const line of ["us at 44.2%", "North Korea: 39.6%", "the Indian Ocean 23.5%", "German-language 25%",
    "German-language journals are 25% of the sample", "German-language editors: 25%", "Chinese journals: 44.2%",
    "Latin American 37%", "Chinese: 44.2%"]) {
    assert.deepEqual(flagged(line, data), [], line);
  }
});

test("every alias is keyed by a country name as countries.json spells it", () => {
  const names = new Set(JSON.parse(readFileSync(new URL("../public/api/countries.json", import.meta.url), "utf-8"))
    .map((c) => c.country));
  assert.deepEqual(ALIAS_KEYS.filter((k) => !names.has(k)), []);
});

test("role and country names match whole words only", () => {
  assert.deepEqual(flagged("another 35% of the budget"), []);
  assert.deepEqual(flagged("editorial boards grew 31% in size"), []);
  assert.deepEqual(flagged("a USB stick holds 86.4% of it"), []);
});

test("a specific figure's context may sit on the next line; a rounded one's may not", () => {
  assert.equal(flagged("Coverage for Italy is\n96.4% of names").length, 1);
  assert.deepEqual(flagged("the top 25% most cited\nEIC / Associate columns"), []);
});

test("small countries are not checked", () => {
  assert.deepEqual(flagged("Tuvalu: 50.0% classified"), []);
});

test("units, version and date are flagged", () => {
  for (const line of ["the 48 publishers", "from 48 academic publishers", "190 countries", "all 77 columns",
    "a 77-column table", "Download v4.0.1", "data 2026.4", "released 2026-09-25"]) {
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

test("text after a closed comment on the same line is checked", () => {
  assert.equal(flagged("<!-- note --> 922,097 records").length, 1);
  assert.equal(flagged("{/* note */} 922,097 records").length, 1);
});

test("a Markdown bullet is not a comment", () => {
  assert.equal(flagged("* 922,097 records", release(), null, "notes.md").length, 1);
});

test("comments are followed across lines", () => {
  // Inside a block comment: skipped, whatever the line starts with.
  assert.deepEqual(flagged("/* note\n  922,097 records\n*/"), []);
  assert.deepEqual(flagged("{/* note\n  922,097 records\n*/}"), []);
  assert.deepEqual(flagged("<!-- note\n  922,097 records\n-->"), []);
  // Text after the comment closes, on the closing line, is checked.
  assert.match(flagged("/* note\n*/ 922,097 records")[0], /^page\.astro:2: /);
  // Outside a comment, a line starting with "*" is code (a continued expression).
  assert.equal(flagged("const x = a\n  * 922097 records").length, 1);
});

test("a comment that never closes, or runs on, is an error rather than a hiding place", () => {
  const never = flagged("<p>ok</p>\n<!-- stray\n922,097 records");
  assert.equal(never.length, 1);
  assert.match(never[0], /^page\.astro:2: a comment opened here never closes/);
  const long = flagged(["/* stray", ...Array(70).fill("text"), "*/"].join("\n"));
  assert.equal(long.length, 1);
  assert.match(long[0], /still open 60 lines on/);
});

test("a fence left open, or closed without opening, is an error", () => {
  const open = flagged("<!-- frozen-figures:start -->\n922,097 records");
  assert.equal(open.length, 1);
  assert.match(open[0], /never closed/);
  assert.match(flagged("<!-- frozen-figures:end -->")[0], /without a frozen-figures:start/);
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

test("a new version with the old Zenodo record id is a problem", () => {
  assert.match(zenodoProblem("4.0.1", "4.1.0", "22950163", "22950163"), /still 22950163/);
  assert.equal(zenodoProblem("4.0.1", "4.1.0", "22950163", "23000000"), null);
  assert.equal(zenodoProblem("4.0.1", "4.0.1", "22950163", "22950163"), null);
});

test("a baseline that cannot be read fails, it never passes vacuously", () => {
  for (const args of [["--previous-ref", "origin/no-such-branch"], ["--previous-ref"], ["--previous-ref="], ["--bogus"]]) {
    const run = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf-8" });
    assert.equal(run.status, 2, `${args.join(" ")}: ${run.stdout}${run.stderr}`);
  }
});

test("a baseline without a release version or a record count is not a release", () => {
  assert.equal(baselineProblem(release()), null);
  // The site's first commit had data files but no version: it must not pass as a baseline.
  assert.match(baselineProblem(release({ release: { version: undefined } })), /no version/);
  assert.match(baselineProblem({ ...release(), release: {} }), /no version/);
  assert.match(baselineProblem({ ...release(), summary: {} }), /no total_records/);
});
