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

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds with
`npx astro build` and publishes `dist/` to GitHub Pages. The custom domain is
set by `public/CNAME`.

## Data and corrections

The dataset itself is released separately under CC0 on Zenodo
([10.5281/zenodo.19590816](https://doi.org/10.5281/zenodo.19590816)).

CC0 waives copyright and database rights only — it does not waive the
data-protection rights of the individuals described. Anyone listed in the data
may correct or remove their record; see
[openeditors-plus.org/corrections](https://openeditors-plus.org/corrections) for
the contact and the process.

## License

Site code: CC0 1.0 Universal (public domain).
