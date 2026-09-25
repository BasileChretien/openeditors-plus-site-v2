#!/usr/bin/env node
/**
 * Fail when a dataset figure is typed into the site's source instead of read
 * from the generated data in public/api/ (summary.json, release_meta.json,
 * countries.json). A typed figure is right on the day it is written and stale
 * after the next data release; read from the JSON, it follows every release.
 *
 *   node scripts/check-figures.mjs
 *       Every build runs this (npm run build, and the deploy workflow). It
 *       flags the CURRENT release's figures written as literals in src/.
 *
 *   node scripts/check-figures.mjs --previous-ref origin/main
 *       At a data update, before merging: also flags every figure of the
 *       release at that git ref which has since changed, wherever it is still
 *       written (a figure that went stale), and a Zenodo record id left
 *       unchanged although the release version changed. The data
 *       repository's verify_release.py runs this mode.
 *
 * Figures that describe a past release (version history, release notes,
 * "rose from 8% in v2.6 to 45% in v2.7") are fenced between two comments
 * containing `frozen-figures:start` and `frozen-figures:end` and are not
 * checked. Comment-only lines are not checked either.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const EXTENSIONS = new Set([".astro", ".ts", ".js", ".mjs", ".md", ".mdx", ".svelte"]);
const FROZEN_START = "frozen-figures:start";
const FROZEN_END = "frozen-figures:end";
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|<!--|\{\/\*)/;
const DATA_FILES = ["summary.json", "release_meta.json", "countries.json"];
const ALIASES = { "United States": ["United States", "US", "USA", "U.S."], "United Kingdom": ["United Kingdom", "UK", "U.K."] };
const ROLE_ALIASES = { editor_in_chief: ["\\bEiCs?\\b"] };
// Countries whose rates are worth naming on a page; smaller ones are noise.
const MIN_COUNTRY_EDITORS = 1000;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const en = (n) => n.toLocaleString("en-US");

function floorSig(n, digits) {
  const p = 10 ** Math.max(0, String(Math.trunc(n)).length - digits);
  return Math.floor(n / p) * p;
}

/** Every way a count of this size is commonly written: 922097, 922,097, 922k, 920,000+, 920K+. */
function countTokens(n) {
  const tokens = new Set([String(n), en(n)]);
  if (n >= 10000) {
    for (const k of [Math.round(n / 1000), Math.floor(n / 1000)]) tokens.add(`${k}k`);
    for (let d = 1; d <= 3; d++) {
      const f = floorSig(n, d);
      if (f < n) {
        tokens.add(`${en(f)}+`);
        if (f % 1000 === 0) tokens.add(`${f / 1000}k+`);
      }
    }
  }
  return [...tokens].map((t) => new RegExp(`(?<![\\d.,])${esc(t).replace("k", "[kK]")}(?![\\d,]|[a-jl-zA-JL-Z])`));
}

function pctTokens(v) {
  const one = v.toFixed(1);
  const out = [new RegExp(`(?<![\\d.])${esc(one)}\\s?%`)];
  out.push(new RegExp(`(?<![\\d.])${Math.round(v)}\\s?%`));
  return out;
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
  const units = { unique_publishers: "publishers", unique_countries: "countries", n_columns: "columns" };
  for (const [key, unit] of Object.entries(units)) {
    const n = summary?.[key];
    if (typeof n === "number") add(key, n, key, [new RegExp(`(?<![\\d.,])${n}\\s+${unit}\\b`, "i")]);
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
      const words = [role.split("_").map(esc).join("s?[-_ ]?") + "s?", ...(ROLE_ALIASES[role] ?? [])];
      add(`role:${role}`, r.pct_female, `female share of ${role}`, pctTokens(r.pct_female), new RegExp(words.join("|"), "i"));
    }
  }
  for (const c of countries ?? []) {
    if (!(c.editors >= MIN_COUNTRY_EDITORS)) continue;
    const names = new RegExp(`\\b(?:${(ALIASES[c.country] ?? [c.country]).map(esc).join("|")})\\b`);
    for (const key of ["pct_gender_classified", "pct_female"]) {
      if (typeof c[key] === "number") add(`${c.country}:${key}`, c[key], `${c.country} ${key}`, pctTokens(c[key]), names);
    }
  }
  if (release?.version) add("version", release.version, "release version", [new RegExp(`(?<![\\d.])v?${esc(release.version)}(?![\\d])`)]);
  if (release?.data_version) add("data_version", release.data_version, "data_version", [new RegExp(`(?<![\\d.])${esc(release.data_version)}(?![\\d])`)]);
  if (release?.release_date) add("release_date", release.release_date, "release date", [new RegExp(esc(release.release_date))]);
  return f;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function dataAt(ref) {
  const out = {};
  for (const file of DATA_FILES) {
    try {
      const text = execFileSync("git", ["show", `${ref}:public/api/${file}`], { cwd: ROOT, encoding: "utf-8", maxBuffer: 1 << 26 });
      out[file.replace(".json", "").replace("release_meta", "release")] = JSON.parse(text);
    } catch {
      out[file.replace(".json", "").replace("release_meta", "release")] = null;
    }
  }
  return out;
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

/** Problems in one file's text: every line quoting a checked figure, outside
 *  frozen history and comment-only lines. */
export function scanText(file, text, checks) {
  const problems = [];
  let frozen = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes(FROZEN_START)) { frozen = true; return; }
    if (line.includes(FROZEN_END)) { frozen = false; return; }
    if (frozen || COMMENT_LINE.test(line)) return;
    for (const { label, patterns, context, kind } of checks) {
      if (context && !context.test(line)) continue;
      const m = patterns.map((re) => line.match(re)).find(Boolean);
      if (m) problems.push(`${file}:${i + 1}: ${kind} ${label} typed as "${m[0].trim()}"`);
    }
  });
  return problems;
}

function scan(checks) {
  return sourceFiles(SRC).flatMap((path) => scanText(relative(ROOT, path), readFileSync(path, "utf-8"), checks));
}

function zenodoRecordId(text) {
  return text?.match(/ZENODO_RECORD_ID\s*=\s*"(\d+)"/)?.[1] ?? null;
}

function main(args) {
  const refAt = args.indexOf("--previous-ref");
  const previousRef = refAt >= 0 ? args[refAt + 1] : null;
  const current = {
    summary: readJson(join(ROOT, "public", "api", "summary.json")),
    release: readJson(join(ROOT, "public", "api", "release_meta.json")),
    countries: readJson(join(ROOT, "public", "api", "countries.json")),
  };
  const previous = previousRef ? dataAt(previousRef) : null;
  const checks = checksFor(current, previous, previousRef);
  const problems = scan(checks);

  // A new release needs its own Zenodo record: the old id would link the new
  // data to the previous version's files.
  if (previous?.release?.version && previous.release.version !== current.release.version) {
    let oldId = null;
    try {
      oldId = zenodoRecordId(execFileSync("git", ["show", `${previousRef}:src/lib/zenodo.ts`], { cwd: ROOT, encoding: "utf-8" }));
    } catch { /* no zenodo.ts at that ref */ }
    const newId = zenodoRecordId(readFileSync(join(SRC, "lib", "zenodo.ts"), "utf-8"));
    if (oldId && oldId === newId) {
      problems.push(`src/lib/zenodo.ts: ZENODO_RECORD_ID is still ${newId} (the ${previous.release.version} record) but the data is ${current.release.version}`);
    }
  }

  if (problems.length) {
    console.error(`${problems.length} dataset figure(s) typed into src/ instead of read from public/api/:`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(`Read them from summary.json / release_meta.json / countries.json, or fence past-release history with ${FROZEN_START} / ${FROZEN_END}.`);
    return 1;
  }
  console.log(`check-figures: no typed dataset figures (${checks.length} checked${previousRef ? `, including ${previousRef}` : ""}).`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
