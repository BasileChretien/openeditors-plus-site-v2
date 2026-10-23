// One page per ISSN-L, at /journal/<ISSN-L>, built from public/api/journal_pages.json
// (written by the data repository's scripts/site/aggregate_data.py): the
// columns of journals.json computed per (publisher, journal), as the dataset
// keys journals, plus the fields only the pages show. The URL is the stable
// link a catalogue builds from an ISSN-L, so it must not change between
// releases.
//
// Imports name their .ts file, so `node --test scripts/journals.test.mjs` can
// load this module without a bundler.
import { slugify } from "./slugify.ts";

/** An ISSN-L as the dataset writes it: hyphenated, with an upper-case check digit. */
export const ISSN_L = /^\d{4}-\d{3}[\dX]$/;

/**
 * Below this many editors with an inferred gender the page does not show the
 * share of women: aggregate_data.py writes it as null in journal_pages.json
 * (its JOURNAL_PAGE_MIN_GENDER). journals.json, and so the /journals table,
 * still carry it for every journal.
 */
export const MIN_GENDER_RESOLVED = 5;

export interface JournalTable {
  cols: string[];
  rows: unknown[][];
}

export interface Listing {
  journal: string;
  publisher: string;
  board_size: number;
  country_count: number;
  /** null when fewer than MIN_GENDER_RESOLVED editors have an inferred gender. */
  pct_female: number | null;
  mean_h_index: number;
  field: string;
  is_oa: boolean;
  indexed_scopus: boolean;
  indexed_wos: boolean;
  indexed_pubmed: boolean;
  npi_level: string;
  impact_quartile: string;
  issn_l: string;
  roles: Record<string, number>;
  source_url: string;
  collected: string;
  positions: number;
  gender_resolved: number | null;
  /** The print ISSN and the E-ISSN, "" where the release has none (see ISSN_COLUMNS). */
  issn_print: string;
  issn_electronic: string;
  /** Which open sources typed them (ISSN_SOURCES, two joined by "+"), "" when both are empty. */
  issn_type_source: string;
}

/**
 * The print and electronic ISSN of each journal, which aggregate_data.py
 * copies from the table the release build adds them from (journal_issns.csv,
 * NLM Catalog first, then DOAJ, then Crossref). The pages show them when
 * journal_pages.json has them and nothing otherwise: a file without the three
 * columns gives every listing empty ISSNs and the pages show the ISSN-L only.
 * A file with only some of the three fails the build.
 */
export const ISSN_COLUMNS = ["issn_print", "issn_electronic", "issn_type_source"] as const;

/** The sources issn_type_source names, in the order the data writes two of them. */
export const ISSN_SOURCES: Record<string, string> = {
  nlm: "the NLM Catalog",
  doaj: "DOAJ",
  crossref: "Crossref",
};

const SOURCE_KEYS = Object.keys(ISSN_SOURCES);
const PROVENANCE = new Set([...SOURCE_KEYS, ...SOURCE_KEYS.flatMap((a, i) => SOURCE_KEYS.slice(i + 1).map((b) => `${a}+${b}`))]);

export interface JournalPage {
  issn_l: string;
  /** Largest board first. Nearly always one; a journal listed by two publishers has two. */
  listings: Listing[];
}

// Role columns, in the order the page lists them.
export const ROLE_LABELS: Record<string, string> = {
  n_eic: "Editors-in-chief",
  n_deputy: "Deputy editors",
  n_senior: "Senior editors",
  n_associate: "Associate editors",
  n_section: "Section editors",
  n_reviewing: "Reviewing editors",
  n_editor: "Editors (generic title)",
  n_board: "Editorial board members",
  n_guest: "Guest editors",
  n_other: "Other roles",
};

const TEXT = ["journal", "publisher", "field", "npi_level", "impact_quartile", "issn_l", "source_url", "collected"] as const;
const NUMBER = ["board_size", "country_count", "mean_h_index", "positions"] as const;
const NULLABLE = ["pct_female", "gender_resolved"] as const;
const FLAG = ["is_oa", "indexed_scopus", "indexed_wos", "indexed_pubmed"] as const;

function column(table: JournalTable, name: string): number {
  const i = table.cols.indexOf(name);
  if (i < 0) throw new Error(`journal_pages.json has no "${name}" column: regenerate public/api/`);
  return i;
}

/** The ISSN columns' indexes: none for a file without them; all three, or the build fails. */
function issnColumns(table: JournalTable): (readonly [string, number])[] {
  if (!ISSN_COLUMNS.some((n) => table.cols.includes(n))) return [];
  return ISSN_COLUMNS.map((n) => [n, column(table, n)] as const);
}

export function listings(table: JournalTable): Listing[] {
  const at = (names: readonly string[]) => names.map((n) => [n, column(table, n)] as const);
  const text = at(TEXT), number = at(NUMBER), nullable = at(NULLABLE), flag = at(FLAG);
  const roles = at(Object.keys(ROLE_LABELS));
  const issns = issnColumns(table);
  return table.rows.map((r) => ({
    ...Object.fromEntries(text.map(([n, i]) => [n, String(r[i] ?? "")])),
    ...Object.fromEntries(number.map(([n, i]) => [n, Number(r[i]) || 0])),
    ...Object.fromEntries(nullable.map(([n, i]) => [n, r[i] === null || r[i] === undefined ? null : Number(r[i])])),
    ...Object.fromEntries(flag.map(([n, i]) => [n, r[i] === true])),
    ...Object.fromEntries(ISSN_COLUMNS.map((n) => [n, ""])),
    ...Object.fromEntries(issns.map(([n, i]) => [n, String(r[i] ?? "")])),
    roles: Object.fromEntries(roles.map(([n, i]) => [n, Number(r[i]) || 0])),
  }) as Listing);
}

/** What is wrong with a listing's ISSN columns, or "" when they can be shown. */
export function issnProblem(l: Listing): string {
  const where = `"${l.journal}" (${l.publisher})`;
  for (const [label, value] of [["print ISSN", l.issn_print], ["E-ISSN", l.issn_electronic]]) {
    if (value && !ISSN_L.test(value)) return `${where} has the ${label} "${value}", not NNNN-NNNC`;
  }
  if (l.issn_print && l.issn_print === l.issn_electronic) return `${where} has the same print ISSN and E-ISSN`;
  const typed = Boolean(l.issn_print || l.issn_electronic);
  if (typed && !PROVENANCE.has(l.issn_type_source)) {
    return `${where} has the ISSN source "${l.issn_type_source}", not one of ${[...PROVENANCE].join(", ")}`;
  }
  if (!typed && l.issn_type_source) return `${where} has an ISSN source but no ISSN`;
  // Two sources each gave one column: a label naming two cannot sit beside an empty column.
  if (l.issn_type_source.includes("+") && !(l.issn_print && l.issn_electronic)) {
    return `${where} has two ISSN sources ("${l.issn_type_source}") but one ISSN`;
  }
  return "";
}

/** Who typed a listing's ISSNs as print or electronic, for the page: "the NLM Catalog and Crossref". */
export function issnSources(source: string): string {
  return source ? source.split("+").map((s) => ISSN_SOURCES[s] ?? s).join(" and ") : "";
}

/**
 * Every listing grouped by ISSN-L. An ISSN-L in any other form, or ISSN
 * columns that issnProblem rejects, fail the build.
 */
export function journalPages(table: JournalTable): JournalPage[] {
  const byIssn = new Map<string, Listing[]>();
  for (const listing of listings(table)) {
    if (!ISSN_L.test(listing.issn_l)) {
      throw new Error(`"${listing.journal}" (${listing.publisher}) has the ISSN-L "${listing.issn_l}", not NNNN-NNNC`);
    }
    const problem = issnProblem(listing);
    if (problem) throw new Error(`journal_pages.json: ${problem}`);
    byIssn.set(listing.issn_l, [...(byIssn.get(listing.issn_l) ?? []), listing]);
  }
  return [...byIssn].map(([issn_l, group]) => ({
    issn_l,
    listings: [...group].sort((a, b) => b.board_size - a.board_size),
  }));
}

/**
 * A journal page whose ISSN-L has left the dataset. Its URL keeps answering,
 * saying why the journal is not in the current release and where its board
 * is, because catalogues link to it by ISSN-L. An ISSN-L that comes back
 * must be taken off the list: the build fails while it is on both. The page
 * links its publisher's page, the release notes of the release that removed
 * it and its board, so the build also fails on an entry whose publisher has
 * no page, whose release has no notes or whose board URL cannot be followed.
 */
export interface RetiredJournalPage {
  issn_l: string;
  journal: string;
  publisher: string;
  /** The release that removed it. */
  removed_in: string;
  /** Why, for the page. */
  reason: string;
  /** The journal's board on the publisher's site, or "". */
  board_url: string;
}

// frozen-figures:start (each entry describes the release that removed it)
export const RETIRED_JOURNAL_PAGES: RetiredJournalPage[] = [
  {
    issn_l: "0143-831X",
    journal: "Economic and Industrial Democracy",
    publisher: "SAGE",
    removed_in: "5.0.0",
    reason: "Until v4.0.1 this page showed the editorial board of Ergonomics in Design, which SAGE's journal listing served at this journal's address when the boards were collected on 31 March 2026. None of the people listed was on this journal's board, so v5.0.0 removed the rows. The journal will return when its own board is collected.",
    board_url: "https://journals.sagepub.com/editorial-board/eid",
  },
];
// frozen-figures:end

/** What the rest of the site offers a retired page to link to. */
export interface RetiredPageLinks {
  /** The slug of every publisher page (slugify of each name in publishers.json). */
  publisherPages: ReadonlySet<string>;
  /** The releases with a section in the release notes (releaseNoteVersions). */
  releaseNotes: ReadonlySet<string>;
  /** The release the site serves (release_meta.json). */
  version: string;
}

/** A release number as release_meta.json writes it: N.N.N, no leading zeros. */
const RELEASE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function newerRelease(a: string, b: string): boolean {
  const [x, y] = [a, b].map((v) => (RELEASE.exec(v) ?? []).slice(1).map(Number));
  const i = x.findIndex((n, k) => n !== y[k]);
  return i >= 0 && x[i] > y[i];
}

/**
 * The releases whose section the release notes page renders with the anchor
 * id="v<release>", the id quoted or a string in braces. Read from the page's
 * source: its template after the frontmatter, less its HTML comments. An id
 * computed from data is not seen, so it fails the build rather than passing.
 */
export function releaseNoteVersions(source: string): Set<string> {
  const template = source.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").replace(/<!--[\s\S]*?-->/g, "");
  return new Set([...template.matchAll(/\sid=\{?(["'`])v(\d+\.\d+\.\d+)\1\}?/g)].map((m) => m[2]));
}

/**
 * Why `retired` cannot be published, or [] when it can: each ISSN-L well
 * formed, listed once and not a live page, and each link of the page valid.
 */
export function retiredPageProblems(live: JournalPage[], links: RetiredPageLinks,
  retired: RetiredJournalPage[] = RETIRED_JOURNAL_PAGES): string[] {
  const liveIssns = new Set(live.map((p) => p.issn_l));
  const seen = new Set<string>();
  const problems: string[] = [];
  if (!RELEASE.test(links.version)) problems.push(`the site serves "${links.version}", not a release number (N.N.N)`);
  for (const r of retired) {
    const page = `retired journal page ${r.issn_l}`;
    if (!ISSN_L.test(r.issn_l)) problems.push(`retired journal page "${r.journal}": "${r.issn_l}" is not NNNN-NNNC`);
    if (seen.has(r.issn_l)) problems.push(`${page} is listed twice`);
    if (liveIssns.has(r.issn_l)) problems.push(`${r.issn_l} (${r.journal}) is back in the data: take it off RETIRED_JOURNAL_PAGES`);
    seen.add(r.issn_l);
    const publisher = slugify(r.publisher);
    if (!links.publisherPages.has(publisher)) {
      problems.push(`${page}: no publisher page /publisher/${publisher} for "${r.publisher}"`);
    }
    if (!RELEASE.test(r.removed_in)) {
      problems.push(`${page}: removed_in "${r.removed_in}" is not a release number (N.N.N)`);
    } else if (newerRelease(r.removed_in, links.version)) {
      problems.push(`${page}: removed_in ${r.removed_in} is newer than the release the site serves (${links.version})`);
    } else if (!links.releaseNotes.has(r.removed_in)) {
      problems.push(`${page}: removed_in ${r.removed_in} has no section in the release notes (/release-notes#v${r.removed_in})`);
    }
    if (boardUrl(r.board_url) !== r.board_url) {
      problems.push(`${page}: board_url "${r.board_url}" is neither empty nor a followable board URL`);
    }
  }
  return problems;
}

/** The retired pages to build. The build fails, naming every problem, unless each passes retiredPageProblems. */
export function retiredPages(live: JournalPage[], links: RetiredPageLinks,
  retired: RetiredJournalPage[] = RETIRED_JOURNAL_PAGES): RetiredJournalPage[] {
  const problems = retiredPageProblems(live, links, retired);
  if (problems.length) {
    throw new Error(`RETIRED_JOURNAL_PAGES in src/lib/journals.ts: ${problems.length} problem${problems.length > 1 ? "s" : ""}\n`
      + problems.map((p) => `- ${p}`).join("\n"));
  }
  return retired;
}

/**
 * The board page URL, or "" when it cannot be followed: only http(s), and
 * not the ScienceDirect addresses the scraper wrote with an empty journal
 * slug ("sciencedirect.com/journal//about/editorial-board").
 */
export function boardUrl(url: string): string {
  const m = /^https?:\/\/[^/?#\s]+([^?#\s]*)(?:[?#]\S*)?$/.exec(url.trim());
  return m && !m[1].includes("//") ? url.trim() : "";
}

/**
 * A journal name for display. The scraper wrote "&" as a colon and two
 * spaces ("Social Science:  Medicine"); the dataset keeps the name as
 * scraped, the page shows the journal's own. It also wrote "," as ": ", which
 * cannot be told from a real colon here, so "Chaos: Solitons & Fractals"
 * stays until the data is corrected.
 */
export function displayTitle(name: string): string {
  return name.replace(/:\s{2,}/g, " & ").replace(/\s+/g, " ").trim();
}
