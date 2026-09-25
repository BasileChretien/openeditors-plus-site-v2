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
 *       exist, or lacks the data files, is an error (exit 2), never a pass.
 *
 * Figures that describe a past release (version history, release notes,
 * "rose from 8% in v2.6 to 45% in v2.7") are fenced between two comments
 * containing `frozen-figures:start` and `frozen-figures:end` and are not
 * checked; a fence left open is an error. Lines that are only a comment are
 * not checked either. Images are not read: the social preview image is drawn
 * from summary.json at build time (src/pages/img/og-preview.png.ts).
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
const ALIASES = { "United States": ["United States", "US", "USA", "U.S."], "United Kingdom": ["United Kingdom", "UK", "U.K."] };
const ROLE_ALIASES = { editor_in_chief: ["EiCs?"] };
// Countries whose rates are worth naming on a page; smaller ones are noise.
const MIN_COUNTRY_EDITORS = 1000;
// Words that turn a round number into a claim about the data: "~920,000", "over 15,000".
const APPROX = "(?<![A-Za-z])(?:~|about|around|approximately|roughly|nearly|almost|over|more than|some)\\s*";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const en = (n) => n.toLocaleString("en-US");
// Whole words, also next to "." or "-": "U.S.", "Editors-in-Chief", but not "another" for "other".
const words = (alternatives, flags = "") => new RegExp(`(?<![A-Za-z])(?:${alternatives.join("|")})(?![A-Za-z])`, flags);

class UsageError extends Error {}

function floorSig(n, digits) {
  const p = 10 ** Math.max(0, String(Math.trunc(n)).length - digits);
  return Math.floor(n / p) * p;
}

/** Every way a count of this size is commonly written: 922097, 922,097, 922k,
 *  920,000+, ~920,000, 920K(+), 0.92 million, 0.9M. */
function countTokens(n) {
  const number = (src) => new RegExp(`(?<![\\d.,])(?:${src})(?![\\d,]|[A-Za-z])`);
  const out = [number(esc(String(n))), number(esc(en(n)))];
  if (n < 10000) return out;
  for (const k of new Set([Math.round(n / 1000), Math.floor(n / 1000)])) out.push(number(`${k}[kK]\\+?`));
  for (const d of [2, 3]) {
    const f = floorSig(n, d);
    if (f >= n) continue;
    out.push(number(`${esc(en(f))}\\+|${f}\\+`));
    out.push(new RegExp(`${APPROX}${esc(en(f))}(?![\\d,])`, "i"));
    if (f % 1000 === 0) out.push(number(`${f / 1000}[kK]\\+?`));
  }
  if (n >= 100000) {
    const millions = new Set([1, 2].flatMap((d) => [(n / 1e6).toFixed(d), (floorSig(n, d) / 1e6).toFixed(d)]));
    for (const m of millions) out.push(new RegExp(`(?<![\\d.,])${esc(m)}\\s?(?:M\\b|million\\b)`, "i"));
  }
  return out;
}

/** "25.2%" is specific enough to match its context on a neighbouring line;
 *  a rounded "25%" is common, so its context must be on the same line. */
function pctTokens(v) {
  const unit = "\\s?(?:%|percent\\b|per cent\\b)";
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
  for (const key of ["total_records", "unique_editors", "unique_journals", "with_orcid", "records_with_h_index"]) {
    if (typeof summary?.[key] === "number" && summary[key] >= 1000) add(key, summary[key], key, countTokens(summary[key]));
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
    const names = words((ALIASES[c.country] ?? [c.country]).map(esc));
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

/** A line that is only a comment. In Markdown a leading "*" is a bullet, not a comment. */
function commentOnly(line, markdown) {
  const t = line.trim();
  const closedAtEnd = (open, close) => {
    const end = t.indexOf(close, open.length);
    return end === -1 || end + close.length === t.length;
  };
  if (t.startsWith("<!--")) return closedAtEnd("<!--", "-->");
  if (markdown) return false;
  if (t.startsWith("//")) return true;
  if (t.startsWith("{/*")) return closedAtEnd("{/*", "*/}");
  if (t.startsWith("/*") || t.startsWith("*")) return closedAtEnd("/*", "*/");
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
  lines.forEach((line, i) => {
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
    if (frozenAt || commentOnly(line, markdown)) return;
    const around = [lines[i - 1] ?? "", line, lines[i + 1] ?? ""].join(" ");
    for (const { label, patterns, context, kind } of checks) {
      const m = patterns
        .filter((re) => !context || context.test(re.sameLine ? line : around))
        .map((re) => line.match(re)).find(Boolean);
      if (m) problems.push(`${file}:${i + 1}: ${kind} ${label} typed as "${m[0].trim()}"`);
    }
  });
  if (frozenAt) problems.push(`${file}:${frozenAt}: ${FROZEN_START} is never closed with ${FROZEN_END}`);
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
  return out;
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
  const baseline = previous ? `, including ${previousRef} at v${previous.release?.version}` : "";
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
