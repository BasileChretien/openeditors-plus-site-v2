// Tests for the journal pages' checks in src/lib/journals.ts (the retired pages,
// the print and electronic ISSNs, the Mir@bel links): run with
// `node --test scripts/journals.test.mjs` (Node strips the TypeScript types).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ISSN_COLUMNS, issnProblem, issnSources, journalPages, listings, MIRABEL_LICENCE, MIRABEL_RECORD, mirabelLinks,
  mirabelProblems, mirabelUrl, RETIRED_JOURNAL_PAGES, releaseNoteVersions, retiredPageProblems, retiredPages,
  staleMirabelLinks, staleMirabelWarning,
} from "../src/lib/journals.ts";
import { slugify } from "../src/lib/slugify.ts";

const site = (over = {}) => ({
  publisherPages: new Set(["sage", "springernature"]),
  releaseNotes: new Set(["5.0.0", "4.0.1", "3.0.0"]),
  version: "5.0.0",
  ...over,
});
const page = (over = {}) => ({
  issn_l: "0143-831X", journal: "Economic and Industrial Democracy", publisher: "SAGE", removed_in: "5.0.0",
  reason: "Its rows were another journal's board.", board_url: "https://journals.sagepub.com/editorial-board/eid",
  ...over,
});
const live = (...issns) => issns.map((issn_l) => ({ issn_l, listings: [] }));
const problems = (over, s = site()) => retiredPageProblems([], s, [page(over)]);

test("a retired page whose links all resolve passes", () => {
  assert.deepEqual(problems({}), []);
  assert.deepEqual(problems({ board_url: "" }), []);
  assert.deepEqual(problems({ removed_in: "3.0.0" }), []);
  const retired = [page()];
  assert.equal(retiredPages(live("1234-5678"), site(), retired), retired);
});

test("the publisher must have a page under its slug", () => {
  assert.deepEqual(problems({ publisher: "Sage " }), []);
  assert.deepEqual(problems({ publisher: "SAGE Publishing" }), [
    `retired journal page 0143-831X: no publisher page /publisher/sage-publishing for "SAGE Publishing"`]);
  assert.equal(problems({ publisher: "" }).length, 1);
});

test("removed_in must be a release, no newer than the site's, with a section in the release notes", () => {
  for (const removed_in of ["v5.0.0", "5.0", "5.0.0-rc.1", "05.0.0", ""]) {
    assert.deepEqual(problems({ removed_in }), [
      `retired journal page 0143-831X: removed_in "${removed_in}" is not a release number (N.N.N)`], removed_in);
  }
  assert.deepEqual(problems({ removed_in: "5.1.0" }, site({ releaseNotes: new Set(["5.1.0"]) })), [
    `retired journal page 0143-831X: removed_in 5.1.0 is newer than the release the site serves (5.0.0)`]);
  assert.deepEqual(problems({ removed_in: "4.0.0" }), [
    `retired journal page 0143-831X: removed_in 4.0.0 has no section in the release notes (/release-notes#v4.0.0)`]);
  // Compared as numbers, not as text.
  assert.deepEqual(problems({ removed_in: "10.0.0" }, site({ version: "9.1.0", releaseNotes: new Set(["10.0.0"]) })), [
    `retired journal page 0143-831X: removed_in 10.0.0 is newer than the release the site serves (9.1.0)`]);
  assert.deepEqual(problems({ removed_in: "9.0.0" }, site({ version: "10.0.0", releaseNotes: new Set(["9.0.0"]) })), []);
});

test("a served version that is not a release number fails the build", () => {
  assert.deepEqual(retiredPageProblems([], site({ version: "5.0" }), []), [
    `the site serves "5.0", not a release number (N.N.N)`]);
});

test("board_url must be empty or a board URL the page can link", () => {
  for (const board_url of ["ftp://example.org/board", "journals.sagepub.com/editorial-board/eid",
    "https://www.sciencedirect.com/journal//about/editorial-board", " https://journals.sagepub.com/x", " "]) {
    assert.deepEqual(problems({ board_url }), [
      `retired journal page 0143-831X: board_url "${board_url}" is neither empty nor a followable board URL`], board_url);
  }
});

test("the ISSN-L must be well formed, listed once and not back in the data", () => {
  assert.deepEqual(problems({ issn_l: "0143-831x" }), [
    `retired journal page "Economic and Industrial Democracy": "0143-831x" is not NNNN-NNNC`]);
  assert.deepEqual(retiredPageProblems([], site(), [page(), page()]), ["retired journal page 0143-831X is listed twice"]);
  assert.deepEqual(retiredPageProblems(live("0143-831X"), site(), [page()]), [
    "0143-831X (Economic and Industrial Democracy) is back in the data: take it off RETIRED_JOURNAL_PAGES"]);
});

test("the build fails with every problem in one message", () => {
  const bad = [page({ publisher: "Nobody", removed_in: "9.0.0", board_url: "nowhere" })];
  assert.throws(() => retiredPages([], site(), bad), (err) => {
    assert.match(err.message, /^RETIRED_JOURNAL_PAGES in src\/lib\/journals\.ts: 3 problems\n/);
    assert.match(err.message, /\/publisher\/nobody/);
    assert.match(err.message, /removed_in 9\.0\.0 is newer/);
    assert.match(err.message, /board_url "nowhere"/);
    return true;
  });
});

test("the release notes' sections are read from their ids", () => {
  const notes = `<h2 id="v5.0.0">What changed</h2>\n<div class="x" id="v4.0.1">\n<section id={c.id}>\n<a href="#v3.0.0">`;
  assert.deepEqual(releaseNoteVersions(notes), new Set(["5.0.0", "4.0.1"]));
  assert.deepEqual(releaseNoteVersions(`<h2 id='v5.0.0'> <h2 id={"v4.0.1"}> <h2 id={\`v4.0.0\`}>`),
    new Set(["5.0.0", "4.0.1", "4.0.0"]));
  // Only anchors the page renders: none in an HTML comment or in the frontmatter.
  const page = `---\nconst old = '<h2 id="v2.0.0">';\n---\n<!-- <h2 id="v3.0.0"> -->\n<h2 id="v5.0.0">`;
  assert.deepEqual(releaseNoteVersions(page), new Set(["5.0.0"]));
  // On the real page, the release the site serves has a section.
  const source = readFileSync(new URL("../src/pages/release-notes/index.astro", import.meta.url), "utf-8");
  const meta = JSON.parse(readFileSync(new URL("../public/api/release_meta.json", import.meta.url), "utf-8"));
  assert.ok(releaseNoteVersions(source).has(meta.version), meta.version);
});

test("the shipped retired pages pass against the served data", () => {
  const read = (name) => JSON.parse(readFileSync(new URL(`../public/api/${name}`, import.meta.url), "utf-8"));
  const source = readFileSync(new URL("../src/pages/release-notes/index.astro", import.meta.url), "utf-8");
  const served = {
    publisherPages: new Set(read("publishers.json").map((p) => slugify(p.publisher))),
    releaseNotes: releaseNoteVersions(source),
    version: read("release_meta.json").version,
  };
  assert.deepEqual(retiredPageProblems([], served, RETIRED_JOURNAL_PAGES), []);
});

// A journal_pages.json table: the columns the served file has, one row, and the
// ISSN columns when `issns` is given (aggregate_data.py appends them last).
const servedCols = JSON.parse(readFileSync(new URL("../public/api/journal_pages.json", import.meta.url), "utf-8")).cols
  .filter((c) => !ISSN_COLUMNS.includes(c));
const pagesTable = (issns, over = {}) => {
  const values = { journal: "Notices", publisher: "AMS", issn_l: "0002-9920", board_size: 3, ...over };
  const cols = issns ? [...servedCols, ...ISSN_COLUMNS] : servedCols;
  const row = cols.map((c) => (c in values ? values[c] : c in (issns ?? {}) ? issns[c] : 0));
  return { cols, rows: [row] };
};
const both = { issn_print: "0002-9920", issn_electronic: "1088-9477", issn_type_source: "nlm" };

test("the ISSN columns are read when journal_pages.json has them", () => {
  const [l] = listings(pagesTable(both));
  assert.deepEqual([l.issn_print, l.issn_electronic, l.issn_type_source], ["0002-9920", "1088-9477", "nlm"]);
  const [page] = journalPages(pagesTable(both));
  assert.equal(page.listings[0].issn_electronic, "1088-9477");
});

test("a file without them gives empty ISSNs, and the pages still build", () => {
  const [l] = listings(pagesTable(null));
  assert.deepEqual([l.issn_print, l.issn_electronic, l.issn_type_source], ["", "", ""]);
  const [page] = journalPages(pagesTable(null));
  assert.equal(page.listings[0].issn_print, "");
});

test("a file with only some of the ISSN columns fails the build", () => {
  const table = pagesTable(both);
  const at = table.cols.indexOf("issn_type_source");
  const partial = { cols: table.cols.filter((_, i) => i !== at), rows: table.rows.map((r) => r.filter((_, i) => i !== at)) };
  assert.throws(() => listings(partial), /no "issn_type_source" column/);
});

test("ISSN columns the page cannot show fail the build", () => {
  const listing = (over) => ({ journal: "Notices", publisher: "AMS", ...both, ...over });
  assert.equal(issnProblem(listing({})), "");
  assert.equal(issnProblem(listing({ issn_print: "", issn_type_source: "crossref" })), "");
  assert.equal(issnProblem(listing({ issn_type_source: "nlm+crossref" })), "");
  assert.equal(issnProblem(listing({ issn_print: "", issn_electronic: "", issn_type_source: "" })), "");
  for (const source of ["nlm+doaj", "nlm+crossref", "doaj+crossref", "doaj"]) {
    assert.equal(issnProblem(listing({ issn_type_source: source })), "", source);
  }
  assert.equal(issnProblem(listing({ issn_print: "0002-992x" })), `"Notices" (AMS) has the print ISSN "0002-992x", not NNNN-NNNC`);
  assert.equal(issnProblem(listing({ issn_electronic: "10889477" })), `"Notices" (AMS) has the E-ISSN "10889477", not NNNN-NNNC`);
  assert.equal(issnProblem(listing({ issn_electronic: "0002-9920" })), `"Notices" (AMS) has the same print ISSN and E-ISSN`);
  assert.match(issnProblem(listing({ issn_type_source: "crossref+nlm" })), /ISSN source "crossref\+nlm", not one of nlm, doaj, crossref, nlm\+doaj/);
  assert.match(issnProblem(listing({ issn_type_source: "" })), /ISSN source "", not one of/);
  assert.equal(issnProblem(listing({ issn_print: "", issn_electronic: "" })), `"Notices" (AMS) has an ISSN source but no ISSN`);
  assert.equal(issnProblem(listing({ issn_print: "", issn_type_source: "nlm+crossref" })),
    `"Notices" (AMS) has two ISSN sources ("nlm+crossref") but one ISSN`);
  assert.throws(() => journalPages(pagesTable({ ...both, issn_type_source: "issn" })),
    /journal_pages\.json: "Notices" \(AMS\) has the ISSN source "issn"/);
});

test("the source note names the sources that typed the ISSNs", () => {
  assert.equal(issnSources("nlm"), "the NLM Catalog");
  assert.equal(issnSources("nlm+crossref"), "the NLM Catalog and Crossref");
  assert.equal(issnSources("doaj+crossref"), "DOAJ and Crossref");
  assert.equal(issnSources(""), "");
});

test("the served journal pages pass the ISSN checks", () => {
  const read = (name) => JSON.parse(readFileSync(new URL(`../public/api/${name}`, import.meta.url), "utf-8"));
  assert.ok(journalPages(read("journal_pages.json")).length > 0);
});

// mirabel_links.json as fetch_mirabel_links.py writes it.
const mirabel = (over = {}) => ({
  source: "Mir@bel, https://reseau-mirabel.info/api (/titres)",
  licence: "Licence Ouverte / Open Licence (Etalab)",
  record_url: "https://reseau-mirabel.info/revue/{revueid}",
  retrieved: "2026-11-25",
  revueid: { "0028-0836": 12852, "0036-8075": 7848 },
  ...over,
});

test("a page links its Mir@bel record only when its ISSN-L is in the file", () => {
  const links = mirabelLinks(mirabel());
  assert.equal(mirabelUrl(links, "0028-0836"), "https://reseau-mirabel.info/revue/12852");
  assert.equal(mirabelUrl(links, "0036-8075"), `${MIRABEL_RECORD}7848`);
  assert.equal(mirabelUrl(links, "1476-4687"), "");
  // Only the file's own keys: nothing inherited from Object.prototype.
  assert.equal(mirabelUrl(links, "constructor"), "");
  assert.equal(mirabelUrl(mirabelLinks(mirabel({ revueid: {} })), "0028-0836"), "");
});

test("a Mir@bel file the pages cannot link fails the build", () => {
  assert.deepEqual(mirabelProblems(mirabel()), []);
  for (const file of [null, [], "text", 3]) {
    assert.deepEqual(mirabelProblems(file), ["mirabel_links.json is not an object"]);
  }
  assert.deepEqual(mirabelProblems(mirabel({ source: "" })), ["mirabel_links.json has no source"]);
  // The page credits the Licence Ouverte: a file under another licence (or none) fails the build.
  for (const licence of ["CC BY 4.0", "", undefined]) {
    assert.deepEqual(mirabelProblems(mirabel({ licence })), [
      `mirabel_links.json: licence ${JSON.stringify(licence)} is not "${MIRABEL_LICENCE}", which the page credits`], String(licence));
  }
  assert.deepEqual(mirabelProblems(mirabel({ record_url: "https://example.org/revue/{revueid}" })), [
    `mirabel_links.json: record_url "https://example.org/revue/{revueid}" is not "https://reseau-mirabel.info/revue/{revueid}"`]);
  for (const retrieved of ["2026-02-30", "25/11/2026", "", undefined, "2026-11-25T10:00:00Z"]) {
    assert.deepEqual(mirabelProblems(mirabel({ retrieved })), [
      `mirabel_links.json: retrieved ${JSON.stringify(retrieved)} is not a date (YYYY-MM-DD)`], String(retrieved));
  }
  assert.deepEqual(mirabelProblems(mirabel({ revueid: [12852] })), ["mirabel_links.json has no revueid object"]);
  assert.deepEqual(mirabelProblems(mirabel({ revueid: { "0028-083x": 1, "0036-8075": "7848", "1476-4687": 0, "1095-9203": 1.5 } })), [
    `mirabel_links.json: "0028-083x" is not an ISSN-L (NNNN-NNNC)`,
    `mirabel_links.json: 0036-8075 has the Mir@bel id "7848", not a positive integer`,
    "mirabel_links.json: 1476-4687 has the Mir@bel id 0, not a positive integer",
    "mirabel_links.json: 1095-9203 has the Mir@bel id 1.5, not a positive integer",
  ]);
  assert.throws(() => mirabelLinks(mirabel({ source: "", retrieved: "" })),
    /^Error: public\/api\/mirabel_links\.json:\n- mirabel_links\.json has no source\n- mirabel_links\.json: retrieved/);
});

// An ISSN-L of the file that is no journal page does not fail the build: it shows
// nowhere, and a data release that changes an ISSN-L must not fail the site's build
// before the links are fetched again. The build names them in a warning instead.
test("the file's ISSN-Ls that are no journal page are named, not refused", () => {
  const links = mirabelLinks(mirabel({ revueid: { "0036-8075": 7848, "0028-0836": 12852, "1234-5678": 1 } }));
  assert.deepEqual(staleMirabelLinks(links, live("0028-0836")), ["0036-8075", "1234-5678"]);
  assert.deepEqual(staleMirabelLinks(links, live("0028-0836", "0036-8075", "1234-5678", "9999-9999")), []);
  assert.match(staleMirabelWarning(["0036-8075", "1234-5678"]),
    /^mirabel_links\.json: 2 ISSN-Ls are no journal page \(0036-8075, 1234-5678\), so their pages have lost the link: run the data repository's scripts\/site\/fetch_mirabel_links\.py again$/);
  assert.match(staleMirabelWarning(["0036-8075"]), /^mirabel_links\.json: 1 ISSN-L is no journal page \(0036-8075\)/);
  const many = Array.from({ length: 12 }, (_, i) => `0000-00${String(i).padStart(2, "0")}`);
  assert.match(staleMirabelWarning(many), /\(0000-0000, .*, 0000-0009, …\)/);
  assert.equal(staleMirabelWarning([]), "");
});

test("the served Mir@bel file passes", () => {
  const file = JSON.parse(readFileSync(new URL("../public/api/mirabel_links.json", import.meta.url), "utf-8"));
  assert.ok(Object.keys(mirabelLinks(file).revueid).length > 0);
});
