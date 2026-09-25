# openeditors-plus-site

Source for the [openeditors-plus.org](https://openeditors-plus.org) website — a static
[Astro](https://astro.build) site presenting the Open Editors Plus dataset.

The site is a **presentation layer only**. It ships the pre-aggregated JSON in
`public/api/` and the Parquet extract in `public/data/`, which the in-browser
explorer queries with DuckDB-WASM. Nothing is generated at request time.

## Develop

```bash
npm ci
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
npm run preview  # serve dist/ locally
```

Node 22+ (see `engines` in `package.json`).

## Layout

```
public/api/     pre-aggregated JSON consumed by the pages
public/data/    editors.parquet — powers the /explore DuckDB-WASM view
public/geo/     country geometry for the map
src/pages/      one directory per route
src/layouts/    Base.astro — shell, nav, footer, email rewriter
src/components/ shared components
```

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which runs the figure
check below, builds with `npx astro build` and publishes `dist/` to GitHub
Pages. Pull requests run the same check and build (`check.yml`) without
publishing. The custom domain is
set by `public/CNAME`.

## Figures come from the data, never from the source

Every figure the pages quote about the current release (record, editor and
journal counts, the female share and gender coverage overall, by role and by
country, h-index coverage, the version and its date) is read at build time
from the generated JSON in `public/api/`, which the data repository writes at
each release (`aggregate_data.py`, `build_release.py`). `src/lib/figures.ts`
holds the helpers that round them for prose ("920,000+", "920K+"); they throw
on a missing value, so a key dropped from the data fails the build instead of
printing "undefined%". The social preview image is drawn at build time too
(`src/pages/img/og-preview.png.ts`, with sharp, a direct dependency), since a
PNG in `public/` would keep the figures of the day it was made.

`scripts/check-figures.mjs` fails the build when one of those figures is typed
into `src/` instead. It runs first in `npm run build` and in both workflows
(`check.yml` on pull requests, `deploy.yml` before publishing), so a typed
figure never reaches the site. An exact count ("922,097", "922k") is always a
figure, and so are the headline counts' "+" forms ("920K+", "15,000+"), as the
stat cards print them. Other rounded forms ("~15,000", a bare "920,000", "0.9M")
are figures where what they count is named within three lines ("positions",
"journals"), so "15,000 page views" passes. A percentage is one next to what it
measures: "female", a role, or a country by its name, another name ("Korea",
"the Netherlands") or its demonym before its people ("Chinese editors").
Comments are followed across lines and not checked; one that never closes or
runs past 60 lines is an error, as it may be a stray opener hiding the rest of
the file. With `--previous-ref
origin/main` it also flags every figure of the release at that ref which has
since changed, and a Zenodo record id left unchanged although the version
changed; a ref that does not exist, lacks the data files or has no release
version is an error (exit 2), never a pass. The data
repository's release verification (`verify_release.py`) runs that mode on a
data update. Its tests: `node --test scripts/check-figures.test.mjs`.

Figures that describe a past release (the version history on `/download`, the
release notes, "China rose from 8% in v2.6 to 45% in v2.7") are history and are
fenced between comments containing `frozen-figures:start` and
`frozen-figures:end`, which the check skips (a fence left open fails). The
newest release note, the newest download entry and the codebook texts must
name the release in `public/api/release_meta.json`, or the build fails, so a
data update cannot ship without them.

The column descriptions on the codebook page (`src/pages/codebook/index.astro`)
are read from `public/api/codebook.json`, the descriptions of the deposited
codebook, which `build_release.py` writes with any figure a description quotes
filled in from the release data. Change a description in the data repository's
`scripts/release_columns.json`, never here. The data repository's
`scripts/site/check_codebook_sync.py` checks that this file equals the
deposited codebook (`--write` copies it), and `verify_release.py` fails a
release on any difference.

## Data and corrections

The dataset itself is released separately under CC0 on Zenodo
([10.5281/zenodo.19468382](https://doi.org/10.5281/zenodo.19468382)).

CC0 waives copyright and database rights only — it does not waive the
data-protection rights of the individuals described. Anyone listed in the data
may correct or remove their record; see
[openeditors-plus.org/corrections](https://openeditors-plus.org/corrections) for
the contact and the process.

## License

Site code: CC0 1.0 Universal (public domain).
