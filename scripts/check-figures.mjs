#!/usr/bin/env node
/**
 * Fail when a dataset figure is typed into the site's source instead of read
 * from the generated data in public/api/ (summary.json, release_meta.json,
 * countries.json). A typed figure is right on the day it is written and stale
 * after the next data release; read from the JSON, it follows every release.
 *
 *   node scripts/check-figures.mjs
 *       Every build runs this (npm run build, and both workflows). It flags
 *       the CURRENT release's figures written as literals in src/.
 *
 *   node scripts/check-figures.mjs --previous-ref origin/main
 *       At a data update, before merging: also flags every figure of the
 *       release at that git ref which has since changed, wherever it is still
 *       written (a figure that went stale), and a Zenodo record id left
 *       unchanged although the release version changed. The data
 *       repository's verify_release.py runs this mode. A ref that does not
 *       exist, lacks the data files or has no release version is an error
 *       (exit 2), never a pass.
 *
 * An exact count is always a figure; a rounded one ("920K+", "~15,000") is
 * one where what it counts is named nearby, and a percentage is one next to
 * what it measures. Figures that describe a past release (version history,
 * release notes, "rose from 8% in v2.6 to 45% in v2.7") are fenced between two
 * comments containing `frozen-figures:start` and `frozen-figures:end` and are
 * not checked; a fence left open is an error. Comments, followed across lines,
 * are not checked either. Images are not read: the social preview image is
 * drawn from summary.json at build time (src/pages/img/og-preview.png.ts).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const EXTENSIONS = new Set([".astro", ".ts", ".js", ".mjs", ".md", ".mdx", ".svelte"]);
const FROZEN_START = "frozen-figures:start";
const FROZEN_END = "frozen-figures:end";
const DATA_FILES = { summary: "summary.json", release: "release_meta.json", countries: "countries.json" };
// Other names of a country, keyed by its name in countries.json (a test checks
// every key is one): "US", "Korea" (not North Korea), "the Netherlands".
const COUNTRY_NAMES = {
  "United States": ["US", "USA", "U\\.S\\.", "U\\.S\\.A\\."],
  "United Kingdom": ["UK", "U\\.K\\.", "Britain", "Great Britain"],
  "South Korea": ["(?<!North )Korea"],
  "Hong Kong": ["HK"],
  "The Netherlands": ["Netherlands", "Holland"],
  "Türkiye": ["Turkey", "Turkiye"],
  Czechia: ["Czech Republic"],
  "United Arab Emirates": ["UAE", "U\\.A\\.E\\."],
};
// A demonym names a country only before what the figure is about: "Chinese
// editors", "Korean names"; not "German-language", "the Indian Ocean".
const DEMONYMS = {
  "United States": "(?<!(?:Latin|South|North|Central) )Americans?",
  "United Kingdom": "British", China: "Chinese", "South Korea": "(?<!North )Koreans?", Taiwan: "Taiwanese",
  Japan: "Japanese", India: "Indians?", Italy: "Italians?", Germany: "Germans?", France: "French",
  Spain: "Spanish", Portugal: "Portuguese", "The Netherlands": "Dutch", Switzerland: "Swiss",
  Sweden: "Swedish", Poland: "Polish", Brazil: "Brazilians?", Canada: "Canadians?", Australia: "Australians?",
  Russia: "Russians?", Iran: "Iranians?", "Türkiye": "Turkish", Egypt: "Egyptians?", Mexico: "Mexicans?",
  Belgium: "Belgians?", Austria: "Austrians?", Denmark: "Danish", Norway: "Norwegians?", Finland: "Finnish",
  Greece: "Greeks?", Israel: "Israelis?", Pakistan: "Pakistanis?", "Saudi Arabia": "Saudis?", Ireland: "Irish",
  "South Africa": "South Africans?", Malaysia: "Malaysians?", Singapore: "Singaporeans?", Thailand: "Thai",
  Argentina: "Argentin(?:ian|e)s?", Chile: "Chileans?", Romania: "Romanians?", Hungary: "Hungarians?",
  Czechia: "Czech", "New Zealand": "New Zealanders?",
};
// What a demonym must precede to name the country, within two words: the
// people the per-country shares are about. A language or a spelling between
// them breaks the link ("German-language editors" are not Germany's).
const ABOUT_PEOPLE = "editors?|editorial|names?|researchers?|scholars?|scientists?|academics?|authors?"
  + "|members?|boards?|institutions?|universit(?:y|ies)|affiliations?";
const NOT_ABOUT_A_COUNTRY = "languages?|speaking|spelling|english|ocean";
const ROLE_ALIASES = { editor_in_chief: ["EiCs?"] };
// Countries whose rates are worth naming on a page; smaller ones are noise.
const MIN_COUNTRY_EDITORS = 1000;
// Words that turn a round number into a claim about the data: "~920,000", "over 15,000".
const APPROX = "(?<![A-Za-z])(?:~|about|around|approximately|roughly|nearly|almost|over|more than|some)\\s*";
// A percent sign, also written as an HTML entity or after a (no-break, thin) space.
const PERCENT = "(?:\\s|&nbsp;|&#160;|&#x0*a0;|&thinsp;|&#8201;|&#x0*2009;|&#8239;|&#x0*202f;)?"
  + "(?:%|&#37;|&#x0*25;|&percnt;|percent\\b|per cent\\b)";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const en = (n) => n.toLocaleString("en-US");
// Whole words, also next to "." or "-": "U.S.", "Editors-in-Chief", but not "another" for "other".
const words = (alternatives, flags = "") => new RegExp(`(?<![A-Za-z])(?:${alternatives.join("|")})(?![A-Za-z])`, flags);

// A count's exact value is always a figure, and so is a thousands form as
// precise ("922k"). Its rounded forms ("920K+", "~920,000", "0.92 million", a
// bare "920,000") are figures where what it counts is named within three lines,
// by its own nouns, or, for the ORCID and h-index counts, by their context. The
// headline counts' "+" forms ("920K+", "15,000+") and two-decimal millions are
// figures anywhere: they are how the site's own stat cards and titles print them.
const COUNTS = {
  total_records: {
    headline: true,
    needs: words(["records?", "positions?", "rows?", "seats?", "entries", "entry", "listings?", "roles?",
      "memberships?", "appointments?"], "i"),
  },
  unique_editors: {
    headline: true,
    needs: words(["editors?", "people", "persons?", "individuals?", "researchers?", "scholars?", "scientists?",
      "members?", "academics?", "experts?"], "i"),
  },
  unique_journals: {
    headline: true,
    needs: words(["journals?", "titles?", "periodicals?", "venues?", "publications?", "outlets?"], "i"),
  },
  with_orcid: { headline: false, needs: /orcid/i },
  records_with_h_index: { headline: false, needs: /h-index|h index|bibliometric/i },
};
// How far from a rounded count its noun may be: stat cards put the label
// two lines under the number.
const NOUN_WINDOW = 3;
// A comment longer than this is more likely a stray opener than a comment.
const MAX_COMMENT_LINES = 60;

/** Whatever names a country on a page: its name, another name ("US", "Korea"),
 *  or its demonym before what the figure is about ("Chinese editors"). */
export function countryNames(country) {
  const names = [esc(country), ...(COUNTRY_NAMES[country] ?? [])];
  const between = `(?:[\\s-]+(?!(?:${NOT_ABOUT_A_COUNTRY})(?![A-Za-z]))[A-Za-z]+){0,2}?`;
  const demonym = DEMONYMS[country]
    ? [`(?:${DEMONYMS[country]})${between}[\\s-]+(?:${ABOUT_PEOPLE})`] : [];
  return words([...names, ...demonym]);
}

/** The keys of COUNTRY_NAMES and DEMONYMS, which must be country names as
 *  countries.json spells them, or their aliases would never be used. */
export const ALIAS_KEYS = [...new Set([...Object.keys(COUNTRY_NAMES), ...Object.keys(DEMONYMS)])];

class UsageError extends Error {}

function floorSig(n, digits) {
  const p = 10 ** Math.max(0, String(Math.trunc(n)).length - digits);
  return Math.floor(n / p) * p;
}

/** Every way a count of this size is commonly written (see COUNTS for when
 *  each form is a figure): 922097, 922,097, 922k, 920,000+, 920K+, ~920,000,
 *  a bare 920,000 or 920K, 0.92 million, 0.9M. */
function countTokens(n, { headline, needs }) {
  const number = (src, near = null) =>
    Object.assign(new RegExp(`(?<![\\d.,])(?:${src})(?![\\d,]|[A-Za-z])`, "i"), near ? { needs: near } : {});
  const always = [esc(String(n)), esc(en(n))];
  const plus = [];
  const weak = [];
  if (n >= 10000) {
    for (const k of new Set([Math.round(n / 1000), Math.floor(n / 1000)])) {
      // "922k" is as specific as the count itself; "15k" is not.
      (k >= 100 ? always : weak).push(`${k}k(?!\\+)`);
      (k >= 100 ? always : plus).push(`${k}k\\+`);
    }
    for (const d of [2, 3]) {
      const f = floorSig(n, d);
      if (f >= n) continue;
      plus.push(`${esc(en(f))}\\+`, `${f}\\+`);
      weak.push(`${esc(en(f))}(?!\\+)`, `${f}(?!\\+)`, `${APPROX}(?:${esc(en(f))}|${f})`);
      if (f % 1000 === 0) plus.push(`${f / 1000}k\\+`), weak.push(`${f / 1000}k(?!\\+)`);
    }
  }
  if (n >= 100000) {
    for (const d of [1, 2]) {
      for (const m of new Set([(n / 1e6).toFixed(d), (floorSig(n, d) / 1e6).toFixed(d)])) {
        (d === 2 ? plus : weak).push(`${esc(m)}\\s?(?:m|million)`);
      }
    }
  }
  return [
    ...always.map((src) => number(src)),
    ...plus.map((src) => number(src, headline ? null : needs)),
    ...weak.map((src) => number(src, needs)),
  ];
}

/** "25.2%" is specific enough to match its context on a neighbouring line;
 *  a rounded "25%" is common, so its context must be on the same line. */
function pctTokens(v) {
  const unit = PERCENT;
  const token = (t, sameLine) => Object.assign(new RegExp(`(?<![\\d.])${esc(t)}${unit}`, "i"), { sameLine });
  const one = v.toFixed(1);
  const rounded = String(Math.round(v));
  return [token(one, false), token(rounded, true)];
}

/** {id: {value, label, patterns, context?}} for one release's data. */
export function figures({ summary, release, countries }) {
  const f = {};
  const add = (id, value, label, patterns, context) => {
    if (value === null || value === undefined) return;
    f[id] = { value: String(value), label, patterns, context };
  };
  for (const [key, kind] of Object.entries(COUNTS)) {
    if (typeof summary?.[key] === "number" && summary[key] >= 1000) add(key, summary[key], key, countTokens(summary[key], kind));
  }
  for (const [role, n] of Object.entries(summary?.role_distribution ?? {})) {
    if (typeof n === "number" && n >= 1000) {
      add(`role_count:${role}`, n, `${role} positions`, [new RegExp(`(?<![\\d.,])(?:${esc(String(n))}|${esc(en(n))})(?![\\d,])`)]);
    }
  }
  // "48 publishers", "48 academic publishers", "a 77-column table".
  const units = { unique_publishers: "publishers?", unique_countries: "countries|country", n_columns: "columns?" };
  for (const [key, unit] of Object.entries(units)) {
    const n = summary?.[key];
    if (typeof n === "number") {
      add(key, n, key, [new RegExp(`(?<![\\d.,])${n}(?:[\\s-]+[A-Za-z]+){0,2}?[\\s-]+(?:${unit})(?![A-Za-z])`, "i")]);
    }
  }
  const PCT_CONTEXT = /female|women|gender|classif|orcid|bibliometric|h-index|h index|resolved/i;
  for (const key of ["pct_female", "pct_gender_classified", "pct_with_orcid", "pct_records_with_h_index"]) {
    if (typeof summary?.[key] === "number") add(key, summary[key], key, pctTokens(summary[key]), PCT_CONTEXT);
  }
  if (typeof summary?.mean_h_index === "number") {
    add("mean_h_index", summary.mean_h_index, "mean_h_index",
      [new RegExp(`(?<![\\d.])${esc(summary.mean_h_index.toFixed(1))}(?![\\d])`)], /h-index|h index/i);
  }
  for (const [role, r] of Object.entries(summary?.female_share_by_role ?? {})) {
    if (typeof r?.pct_female === "number" && r.editors >= 100) {
      // "editor_in_chief" also as "Editors-in-Chief", "editor in chief" or "EiC".
      const names = [role.split("_").map(esc).join("s?[-_ ]?") + "s?", ...(ROLE_ALIASES[role] ?? [])];
      add(`role:${role}`, r.pct_female, `female share of ${role}`, pctTokens(r.pct_female), words(names, "i"));
    }
  }
  for (const c of countries ?? []) {
    if (!(c.editors >= MIN_COUNTRY_EDITORS)) continue;
    const names = countryNames(c.country);
    for (const key of ["pct_gender_classified", "pct_female"]) {
      if (typeof c[key] === "number") add(`${c.country}:${key}`, c[key], `${c.country} ${key}`, pctTokens(c[key]), names);
    }
  }
  if (release?.version) add("version", release.version, "release version", [new RegExp(`(?<![\\d.])v?${esc(release.version)}(?![\\d])`)]);
  if (release?.data_version) add("data_version", release.data_version, "data_version", [new RegExp(`(?<![\\d.])${esc(String(release.data_version))}(?![\\d])`)]);
  if (release?.release_date) add("release_date", release.release_date, "release date", [new RegExp(esc(release.release_date))]);
  return f;
}

/** The figures to look for: the current release's, plus, given the release at
 *  an earlier ref, each of its figures that has changed since (a stale one). */
export function checksFor(current, previous = null, previousRef = "the previous release") {
  const now = figures(current);
  const checks = Object.values(now).map((f) => ({ ...f, kind: "current figure" }));
  if (previous) {
    for (const [id, f] of Object.entries(figures(previous))) {
      if (!now[id] || now[id].value !== f.value) checks.push({ ...f, kind: `previous release's (${previousRef})` });
    }
  }
  return checks;
}

/** Whether a line is only comment, following comments across lines: `state.close`
 *  holds the end of a comment still open ("*" + "/" or "-->"). A line inside one
 *  is comment up to its end; text after the end, or after a comment closed on
 *  the same line, is checked. Markdown has only HTML comments ("*" is a bullet). */
function commentOnly(line, markdown, state) {
  const t = line.trim();
  const restAfter = (close, from) => {
    const end = t.indexOf(close, from);
    if (end === -1) {
      state.close = close;
      return "";
    }
    state.close = null;
    return t.slice(end + close.length).trim();
  };
  if (state.close) return /^}?$/.test(restAfter(state.close, 0));
  if (!markdown && t.startsWith("//")) return true;
  const opens = markdown ? [["<!--", "-->"]] : [["<!--", "-->"], ["{/*", "*/"], ["/*", "*/"]];
  for (const [open, close] of opens) {
    // "{/* ... */}" closes with "*/}"; the "}" left over is part of the comment.
    if (t.startsWith(open)) return /^}?$/.test(restAfter(close, open.length));
  }
  return false;
}

/** Problems in one file's text: every line quoting a checked figure, outside
 *  frozen history and comment-only lines. A figure's context (what it
 *  measures) may sit on the line before or after it, as prose wraps. */
export function scanText(file, text, checks) {
  const problems = [];
  const lines = text.split(/\r?\n/);
  const markdown = /\.mdx?$/.test(file);
  let frozenAt = 0;
  const comments = { close: null };
  let commentAt = 0;
  lines.forEach((line, i) => {
    // Every line moves the comment state, a fence marker's line included.
    const wasOpen = comments.close;
    const comment = commentOnly(line, markdown, comments);
    if (!comments.close) commentAt = 0;
    else if (!wasOpen) commentAt = i + 1;
    // A stray "/*" or "<!--" (in a string, say) would hide the rest of the file:
    // a comment that runs on and on is reported, and so is one never closed.
    if (commentAt && i + 1 - commentAt === MAX_COMMENT_LINES) {
      problems.push(`${file}:${commentAt}: a comment opened here is still open ${MAX_COMMENT_LINES} lines on; `
        + "if it is not a comment, the check is skipping real text");
    }
    if (line.includes(FROZEN_START)) {
      if (frozenAt) problems.push(`${file}:${i + 1}: ${FROZEN_START} inside the fence opened at line ${frozenAt}`);
      frozenAt = i + 1;
      return;
    }
    if (line.includes(FROZEN_END)) {
      if (!frozenAt) problems.push(`${file}:${i + 1}: ${FROZEN_END} without a ${FROZEN_START} before it`);
      frozenAt = 0;
      return;
    }
    if (frozenAt || comment) return;
    const around = lines.slice(Math.max(0, i - 1), i + 2).join(" ");
    const wide = lines.slice(Math.max(0, i - NOUN_WINDOW), i + NOUN_WINDOW + 1).join(" ");
    for (const { label, patterns, context, kind } of checks) {
      const m = patterns
        .filter((re) => !context || context.test(re.sameLine ? line : around))
        .filter((re) => !re.needs || re.needs.test(wide))
        .map((re) => line.match(re)).find(Boolean);
      if (m) problems.push(`${file}:${i + 1}: ${kind} ${label} typed as "${m[0].trim()}"`);
    }
  });
  if (frozenAt) problems.push(`${file}:${frozenAt}: ${FROZEN_START} is never closed with ${FROZEN_END}`);
  if (commentAt) problems.push(`${file}:${commentAt}: a comment opened here never closes`);
  return problems;
}

/** A new release needs its own Zenodo record: the old id would link the new
 *  data to the previous version's files. */
export function zenodoProblem(previousVersion, currentVersion, oldId, newId) {
  if (!previousVersion || previousVersion === currentVersion || !oldId || oldId !== newId) return null;
  return `src/lib/zenodo.ts: ZENODO_RECORD_ID is still ${newId} (the ${previousVersion} record) but the data is ${currentVersion}`;
}

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (EXTENSIONS.has(extname(name))) out.push(path);
  }
  return out;
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf-8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
}

/** The data files at a git ref; a missing ref or file is an error, never an empty baseline. */
function dataAt(ref) {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  } catch {
    throw new UsageError(`--previous-ref ${ref}: no such commit here (run git fetch first?)`);
  }
  const out = {};
  for (const [key, file] of Object.entries(DATA_FILES)) {
    try {
      out[key] = JSON.parse(git(["show", `${ref}:public/api/${file}`]));
    } catch (err) {
      throw new UsageError(`--previous-ref ${ref}: cannot read public/api/${file} there (${String(err.message).split("\n")[0]})`);
    }
  }
  const problem = baselineProblem(out);
  if (problem) throw new UsageError(`--previous-ref ${ref}: ${problem}; compare against a released commit`);
  return out;
}

/** Why a baseline's data is not a release's, or null. Without a version or a
 *  record count, comparing against it would skip the Zenodo check and most figures. */
export function baselineProblem({ summary, release }) {
  if (typeof release?.version !== "string" || !release.version) return "its release_meta.json has no version";
  if (typeof summary?.total_records !== "number") return "its summary.json has no total_records";
  return null;
}

function zenodoRecordId(text) {
  return text?.match(/ZENODO_RECORD_ID\s*=\s*"(\d+)"/)?.[1] ?? null;
}

function parseArgs(args) {
  let previousRef = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--previous-ref" || a.startsWith("--previous-ref=")) {
      previousRef = a === "--previous-ref" ? args[++i] : a.slice("--previous-ref=".length);
      if (!previousRef || previousRef.startsWith("-")) throw new UsageError("--previous-ref needs a git ref, e.g. origin/main");
    } else {
      throw new UsageError(`unknown argument: ${a}`);
    }
  }
  return { previousRef };
}

function main(args) {
  let previousRef, previous;
  try {
    ({ previousRef } = parseArgs(args));
    previous = previousRef ? dataAt(previousRef) : null;
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`check-figures: ${err.message}`);
    return 2;
  }
  const current = Object.fromEntries(Object.entries(DATA_FILES).map(
    ([key, file]) => [key, JSON.parse(readFileSync(join(ROOT, "public", "api", file), "utf-8"))]));
  const checks = checksFor(current, previous, previousRef);
  const problems = sourceFiles(SRC).flatMap((path) => scanText(relative(ROOT, path), readFileSync(path, "utf-8"), checks));

  if (previous) {
    let oldId = null;
    try {
      oldId = zenodoRecordId(git(["show", `${previousRef}:src/lib/zenodo.ts`]));
    } catch { /* no zenodo.ts at that ref */ }
    const newId = zenodoRecordId(readFileSync(join(SRC, "lib", "zenodo.ts"), "utf-8"));
    const zenodo = zenodoProblem(previous.release?.version, current.release.version, oldId, newId);
    if (zenodo) problems.push(zenodo);
  }

  if (problems.length) {
    console.error(`${problems.length} dataset figure problem(s) in src/ (figures must be read from public/api/):`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(`Read them from summary.json / release_meta.json / countries.json, or fence past-release history with ${FROZEN_START} / ${FROZEN_END}.`);
    return 1;
  }
  const baseline = previous
    ? `, including ${previousRef} at v${previous.release.version}` : "";
  console.log(`check-figures: no typed dataset figures (${checks.length} checked${baseline}).`);
  return 0;
}

// Run when invoked directly, also through a junction or symlinked path.
const invoked = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (invoked) process.exit(main(process.argv.slice(2)));
