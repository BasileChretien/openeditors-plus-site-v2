import release from "../../public/api/release_meta.json";
import { ZENODO_VERSION_DOI } from "./zenodo";

// The dataset's registered title, as deposited on Zenodo and cited. It is a
// name, not a live count: its "15,000+" stays as registered whatever the
// journal count of a later release, so it is fenced for check-figures.mjs.
// frozen-figures:start
export const DATASET_TITLE =
  "Open Editors Plus 2026: Editorial Board Composition of 15,000+ Academic Journals";
// frozen-figures:end

// Citation of the current release: its version and version DOI, so a reader
// can tell which data a figure came from. The concept DOI (release.concept_doi)
// always resolves to the newest release and names no version.
export const DATASET_VERSION = release.version;
export const DATASET_YEAR = release.release_date.slice(0, 4);
export const DATASET_DOI = ZENODO_VERSION_DOI;
export const DATASET_DOI_URL = `https://doi.org/${ZENODO_VERSION_DOI}`;

export const datasetBibtex = () =>
  [
    "@dataset{chretien2026openeditors,",
    "  author    = {Chretien, Basile},",
    `  title     = {${DATASET_TITLE}},`,
    `  year      = {${DATASET_YEAR}},`,
    `  version   = {${DATASET_VERSION}},`,
    "  publisher = {Zenodo},",
    `  doi       = {${DATASET_DOI}},`,
    "  url       = {https://openeditors-plus.org}",
    "}",
  ].join("\n");

export const datasetRis = () =>
  [
    "TY  - DATA",
    "AU  - Chretien, Basile",
    `TI  - ${DATASET_TITLE}`,
    `PY  - ${DATASET_YEAR}`,
    `ET  - ${DATASET_VERSION}`,
    "PB  - Zenodo",
    `DO  - ${DATASET_DOI}`,
    "UR  - https://openeditors-plus.org",
    "ER  -",
  ].join("\n");
