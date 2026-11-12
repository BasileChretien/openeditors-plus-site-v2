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

/** "7(1), 1-38" once in an issue; null while it is an advance publication. */
export function articleLocator(): string | null {
  if (!articleInIssue()) return null;
  const issue = ARTICLE.issue ? `(${ARTICLE.issue})` : "";
  const pages = ARTICLE.pages ? `, ${ARTICLE.pages}` : "";
  return `${ARTICLE.volume}${issue}${pages}`;
}

export function articleBibtex(): string {
  const fields: [string, string][] = [
    ["author", ARTICLE.author],
    ["title", ARTICLE.title],
    ["journal", ARTICLE.journal],
    ["year", String(ARTICLE.year)],
  ];
  if (ARTICLE.volume) fields.push(["volume", ARTICLE.volume]);
  if (ARTICLE.issue) fields.push(["number", ARTICLE.issue]);
  if (ARTICLE.pages) fields.push(["pages", ARTICLE.pages.replace("-", "--")]);
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
    const [sp, ep] = ARTICLE.pages.split("-");
    lines.push(`SP  - ${sp}`);
    if (ep) lines.push(`EP  - ${ep}`);
  }
  lines.push(`DO  - ${ARTICLE.doi}`, `UR  - ${ARTICLE_URL}`, "ER  -");
  return lines.join("\n");
}
