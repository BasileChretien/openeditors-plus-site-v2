// Data-subject-rights contact for Open Editors Plus.
//
// Published as a durable address on the project's own domain,
// data-rights@openeditors-plus.org, forwarded to the maintainer's mailbox.
// The dataset is a permanent deposit (Zenodo DOI 10.5281/zenodo.19590816),
// so the contact must outlive any single personal or student account — a
// domain address the maintainer controls does that. This module is the
// single source of truth: change these two constants and every page plus
// the obfuscated mailto updates site-wide.
//
// NOTE: the openeditors-plus.org email forward must stay active for the life
// of the deposit, otherwise data-subject requests bounce.
//
// The address is rendered obfuscated in the HTML (see ContactEmail.astro +
// the rewriter in Base.astro) to reduce scraping; do not hard-code it as a
// plain `mailto:` anywhere.
export const CONTACT_USER = "data-rights";
export const CONTACT_DOMAIN = "openeditors-plus.org";
export const CONTACT_ADDRESS = `${CONTACT_USER}@${CONTACT_DOMAIN}`;
