// Zenodo record of the current release (the version public/api/release_meta.json names).
// The download buttons (pages/download), the dataset citations (pages/cite, the home
// page) and the Dataset JSON-LD (layouts/Base.astro) read it, and it must be the record
// whose files public/api/release_meta.json describes (sizes, SHA-256). Bump it together
// with release_meta.json whenever a new version is deposited, or the page shows one
// version's hashes for another's files.
export const ZENODO_RECORD_ID = "24071256";

// The current release's version DOI: Zenodo mints 10.5281/zenodo.<record id>.
export const ZENODO_VERSION_DOI = `10.5281/zenodo.${ZENODO_RECORD_ID}`;
