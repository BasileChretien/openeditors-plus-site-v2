// One page per ISSN-L, at /journal/<ISSN-L>, built from public/api/journal_pages.json
// (written by the data repository's scripts/site/aggregate_data.py): the
// columns of journals.json computed per (publisher, journal), as the dataset
// keys journals, plus the fields only the pages show. The URL is the stable
// link a catalogue builds from an ISSN-L, so it must not change between
// releases.

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
}

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

export function listings(table: JournalTable): Listing[] {
  const at = (names: readonly string[]) => names.map((n) => [n, column(table, n)] as const);
  const text = at(TEXT), number = at(NUMBER), nullable = at(NULLABLE), flag = at(FLAG);
  const roles = at(Object.keys(ROLE_LABELS));
  return table.rows.map((r) => ({
    ...Object.fromEntries(text.map(([n, i]) => [n, String(r[i] ?? "")])),
    ...Object.fromEntries(number.map(([n, i]) => [n, Number(r[i]) || 0])),
    ...Object.fromEntries(nullable.map(([n, i]) => [n, r[i] === null || r[i] === undefined ? null : Number(r[i])])),
    ...Object.fromEntries(flag.map(([n, i]) => [n, r[i] === true])),
    roles: Object.fromEntries(roles.map(([n, i]) => [n, Number(r[i]) || 0])),
  }) as Listing);
}

/** Every listing grouped by ISSN-L. An ISSN-L in any other form fails the build. */
export function journalPages(table: JournalTable): JournalPage[] {
  const byIssn = new Map<string, Listing[]>();
  for (const listing of listings(table)) {
    if (!ISSN_L.test(listing.issn_l)) {
      throw new Error(`"${listing.journal}" (${listing.publisher}) has the ISSN-L "${listing.issn_l}", not NNNN-NNNC`);
    }
    byIssn.set(listing.issn_l, [...(byIssn.get(listing.issn_l) ?? []), listing]);
  }
  return [...byIssn].map(([issn_l, group]) => ({
    issn_l,
    listings: [...group].sort((a, b) => b.board_size - a.board_size),
  }));
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
