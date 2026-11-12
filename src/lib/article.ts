// The peer-reviewed article that describes the dataset, read by the cite,
// home, download and methodology pages and by the Dataset JSON-LD.
//
// The article describes v3.0.0, not the current release: its figures are
// v3.0.0's and stay as published, so they are fenced for check-figures.mjs.
// The current release's figures come from public/api/, never from here.
//
// Published online on 2026-11-05 with no volume or issue (Crossref,
// 10.1162/qss.a.521). When MIT Press assigns them, fill `volume`, `issue` and
// `pages`; every citation on the site follows.
// frozen-figures:start (the article and the release it describes)
export const ARTICLE = {
  author: "Chretien, Basile",
  authorShort: "Chretien, B.",
  year: 2026,
  title:
    "Open Editors Plus: A Comprehensive Dataset of Editorial Board Composition Across 15,000 Academic Journals",
  // APA 7 puts an article title in sentence case.
  titleSentenceCase:
    "Open Editors Plus: A comprehensive dataset of editorial board composition across 15,000 academic journals",
  journal: "Quantitative Science Studies",
  volume: null as string | null,
  issue: null as string | null,
  pages: null as string | null,
  doi: "10.1162/qss.a.521",
  publishedOnline: "2026-11-05",
  license: "CC BY 4.0",
};

// The release the article describes, and its headline counts as published
// (CHANGELOG 3.0.0 and the article).
export const ARTICLE_RELEASE = {
  version: "3.0.0",
  date: "2026-07-27",
  dataVersion: "2026.2",
  doi: "10.5281/zenodo.21620278",
  positions: 922097,
  uniqueEditors: 745125,
  journals: 15168,
  countries: 189,
};
// frozen-figures:end

export const ARTICLE_URL = `https://doi.org/${ARTICLE.doi}`;
export const ARTICLE_RELEASE_URL = `https://doi.org/${ARTICLE_RELEASE.doi}`;

/** True once MIT Press has placed the article in an issue. */
export const articleInIssue = () => ARTICLE.volume !== null;

// A page range as typed or pasted: "1009-1030", "1009–1030" or "1009—1030".
const pageEnds = (pages: string) => pages.split(/\s*[-–—]+\s*/);

/** Volume, issue and page range (with an en dash) once in an issue; null before. */
export function articleLocatorParts(): { volume: string; issue: string | null; pages: string | null } | null {
  if (!ARTICLE.volume) return null;
  return {
    volume: ARTICLE.volume,
    issue: ARTICLE.issue,
    pages: ARTICLE.pages ? pageEnds(ARTICLE.pages).join("–") : null,
  };
}

/** "7(1), 1009–1030" once in an issue; null while it is an advance publication. */
export function articleLocator(): string | null {
  const parts = articleLocatorParts();
  if (!parts) return null;
  return `${parts.volume}${parts.issue ? `(${parts.issue})` : ""}${parts.pages ? `, ${parts.pages}` : ""}`;
}

// BibTeX styles that set titles in sentence case would lowercase the name.
export const protectName = (title: string) => title.replace("Open Editors Plus", "{Open Editors Plus}");

export function articleBibtex(): string {
  const fields: [string, string][] = [
    ["author", ARTICLE.author],
    ["title", protectName(ARTICLE.title)],
    ["journal", ARTICLE.journal],
    ["year", String(ARTICLE.year)],
  ];
  if (ARTICLE.volume) fields.push(["volume", ARTICLE.volume]);
  if (ARTICLE.issue) fields.push(["number", ARTICLE.issue]);
  if (ARTICLE.pages) fields.push(["pages", pageEnds(ARTICLE.pages).join("--")]);
  fields.push(["doi", ARTICLE.doi]);
  if (!articleInIssue()) fields.push(["note", "Advance online publication"]);
  const width = Math.max(...fields.map(([k]) => k.length));
  const body = fields.map(([k, v]) => `  ${k.padEnd(width)} = {${v}}`).join(",\n");
  return `@article{chretien2026qss,\n${body}\n}`;
}

export function articleRis(): string {
  const lines = [
    "TY  - JOUR",
    `AU  - ${ARTICLE.author}`,
    `TI  - ${ARTICLE.title}`,
    `JO  - ${ARTICLE.journal}`,
    `PY  - ${ARTICLE.year}`,
  ];
  if (ARTICLE.volume) lines.push(`VL  - ${ARTICLE.volume}`);
  if (ARTICLE.issue) lines.push(`IS  - ${ARTICLE.issue}`);
  if (ARTICLE.pages) {
    const [sp, ep] = pageEnds(ARTICLE.pages);
    lines.push(`SP  - ${sp}`);
    if (ep) lines.push(`EP  - ${ep}`);
  }
  lines.push(`DO  - ${ARTICLE.doi}`, `UR  - ${ARTICLE_URL}`, "ER  -");
  return lines.join("\n");
}
