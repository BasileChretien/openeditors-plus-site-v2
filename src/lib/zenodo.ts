// Zenodo record of the current release: v3.0.0, version DOI 10.5281/zenodo.21620278.
// The download buttons (pages/download) and the Dataset JSON-LD (layouts/Base.astro)
// both read it, and it must be the record whose files public/api/release_meta.json
// describes (sizes, SHA-256). Bump it together with release_meta.json whenever a new
// version is deposited, or the page shows one version's hashes for another's files.
export const ZENODO_RECORD_ID = "21620278";
