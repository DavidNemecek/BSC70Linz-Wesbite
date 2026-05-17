## 2026-05-17
- Base CSS still contains the old editorial palette, so the redesign token map needs to cover both shared base variables and theme overrides.
- `#3B82F6` does not meet AA for normal text on `#F8FAFC`; use the deeper blue token for light-theme text links.
- Lime green can pass contrast on dark backgrounds, but the design rule still has to forbid text usage.
- `assets/` is copied wholesale into `docs/assets/` by `scripts/build.mjs`, so adding `assets/fonts/*.woff2` is enough for the build to publish self-hosted fonts.
- Loading `src/styles/fonts.css` before `base.css` lets fonts be self-hosted without changing existing CSS rules.
- Open Graph/Twitter meta tags can live in `src/templates/layout.html`, but `scripts/build.mjs` must still provide per-page values (`ogTitle`, `ogDescription`, `ogImage`, `ogType`, `ogLocale`).
- Verifying generated output matters: a grep on `docs/de/index.html` confirmed the new OG tags landed in the build.
