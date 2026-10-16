// Tests for the retired journal pages' checks in src/lib/journals.ts: run with
// `node --test scripts/journals.test.mjs` (Node strips the TypeScript types).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { RETIRED_JOURNAL_PAGES, releaseNoteVersions, retiredPageProblems, retiredPages } from "../src/lib/journals.ts";
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
