# BSC 70 Linz — Full Website Redesign & Feature Build

## TL;DR

> **Quick Summary**: Complete visual redesign (new fonts, colors, layout) + missing sportclub features (roster, gallery, forms, testimonials) in one push. "Street Energy" design direction: Space Grotesk + electric blue + lime accent. Goal: attract Gen Z, project professionalism, grow the club.
>
> **Deliverables**:
> - New design system (fonts, colors, spacing, animations)
> - Redesigned homepage (hybrid landing + portal)
> - Expanded navigation with "Mitmachen" CTA in header
> - Team roster page, photo gallery, contact form, testimonials section
> - Sponsor showcase redesign, Datenschutz page (DSGVO compliance)
> - Dark mode updated to new color system
> - All existing content preserved (500+ news articles, bilingual DE/EN)
>
> **Estimated Effort**: Large (25+ tasks across 5 waves)
> **Parallel Execution**: YES — 5 waves, up to 7 concurrent tasks
> **Critical Path**: Fonts → Design tokens → Header/Footer → Homepage → New features → Final QA

---

## Context

### Original Request
User wants a full redesign of the BSC 70 Linz badminton club website. Current site is technically solid but visually wrong — uses a literary serif font and warm beige colors when the club identity is blue/white. Lacks essential sportclub features (roster, fixtures, calendar, gallery, forms). Goal is to attract Gen Z members, project professionalism, and grow the club to play more leagues.

### Interview Summary
**Key Discussions**:
- Club colors are blue and white (current red+beige is a total mismatch)
- User chose "Option C: Street Energy" — Space Grotesk headlines, electric blue + lime accent
- Light default with dark mode toggle
- Hybrid homepage: landing energy (hero, CTA, join) → portal hub (news, fixtures, training, teams)
- User has some real action photos available
- Full redesign + features in one push (not phased)
- Wants to see typography options before committing → chose Space Grotesk direction

**Research Findings**:
- 50,000+ prospect study: "friendly culture" (51%) is top motivator for joining
- 56% of club websites lack a visible "Join" CTA in nav (BSC 70 is one of them)
- 68% lack testimonials (BSC 70 is one of them)
- Gen Z prefers condensed bold sans-serif, high-contrast colors, real photography, micro-interactions
- Berlin Braves, Padel Social Club, F45 are design benchmarks for modern sports clubs
- Austrian legal: Impressum with ZVR-Zahl required, Datenschutzerklärung required before forms

### Metis Review
**Identified Gaps** (addressed):
- News parity is 503 DE / 100 EN (not 500+ bilingual) → keep existing fallback behavior
- No Datenschutz page exists → must create before any contact form
- build.mjs is 954-line monolith → only ONE task modifies it at a time
- Lime green (#84CC16) fails WCAG AA for body text → accent/decorative only, never text
- Fixtures/standings: link to external Turniersoftware.com, not embed → bounded scope
- Legacy redirects (519 URLs) must be preserved
- Duplicate pages (vorstand + vereinsvorstand) → consolidate
- Empty states needed for every new feature

---

## Work Objectives

### Core Objective
Transform BSC 70 Linz from a literary-magazine-styled website into a modern, energetic sportclub brand that attracts Gen Z members, projects professionalism, and includes all essential sportclub features — while preserving all existing content and technical infrastructure.

### Concrete Deliverables
- New design system in `base.css` (Space Grotesk + Inter fonts, blue/white/lime palette, new spacing)
- Updated `dark.css` theme for new color system
- Redesigned `layout.html`, `header.html`, `footer.html` templates
- Redesigned homepage (`content/pages/de/index.md` + `en/index.md`)
- New team roster page (`content/pages/de/mannschaften.md` + `en/mannschaften.md`)
- New Datenschutz page (`content/pages/de/datenschutz.md` + `en/datenschutz.md`)
- Contact form with Formspree integration
- Testimonials section on homepage
- Photo gallery with lightbox (vanilla JS)
- Sponsor showcase redesign
- Scroll-reveal animations (Intersection Observer)
- Expanded navigation with "Mitmachen" CTA button in header
- Open Graph meta tags for social sharing
- Self-hosted WOFF2 font files

### Definition of Done
- [ ] `npm run build` completes without errors in ≤ 10s
- [ ] `npm run check` exits 0 (all links, frontmatter, parity valid)
- [ ] Lighthouse Performance ≥ 90 on mobile (homepage)
- [ ] Lighthouse Accessibility ≥ 90 on all page types
- [ ] LCP ≤ 2.5s on throttled 4G
- [ ] CLS ≤ 0.1 (no layout shifts from font swap or images)
- [ ] All pages render correctly at 360px, 768px, 1280px viewports
- [ ] Dark mode renders correctly for all new components
- [ ] Legacy redirects still work (5 sample URLs verified)
- [ ] Site deploys successfully to GitHub Pages

### Must Have
- Blue + white club identity throughout (not red + beige)
- Visible "Mitmachen" / "Join" CTA in header navigation
- Member testimonials on homepage
- Contact form that actually submits
- Datenschutz page (DSGVO compliance)
- Real action photos (not stock)
- Scroll-reveal animations on section entry
- Mobile-first responsive design
- Accessibility: WCAG 2.1 AA compliance

### Must NOT Have (Guardrails)
- ❌ No lime green (#84CC16) for body text — accent/decorative elements ONLY
- ❌ No modifications to news pagination logic, category system, or frontmatter format
- ❌ No changes to i18n URL structure or language detection behavior
- ❌ No API integration or data scraping for fixtures/standings — external links only
- ❌ No more than 5 micro-interactions (scroll-reveal, nav hover, CTA press, theme toggle, card hover)
- ❌ No new template engine — use existing `{{var}}` mustache-style system
- ❌ No analytics/tracking without also adding cookie consent banner
- ❌ No Google Fonts CDN dependency — self-host all font files as WOFF2
- ❌ No framework migration (React, Vue, etc.) — vanilla HTML/CSS/JS only
- ❌ No modification of build.mjs by more than one task simultaneously

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (no test framework)
- **Automated tests**: NO (static site)
- **Framework**: None — verification via build checks, Lighthouse, Playwright, curl

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Playwright — navigate, screenshot at 360px/768px/1280px, check contrast
- **Build**: `npm run build && npm run check` — zero errors
- **A11y**: Lighthouse accessibility audit ≥ 90
- **Performance**: Lighthouse performance ≥ 90 (mobile)
- **Links**: curl to verify legacy redirects and external links

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — no visual change, zero risk):
├── Task 1: Self-host fonts (Space Grotesk + Inter WOFF2) [quick]
├── Task 2: Create Datenschutz page DE+EN [quick]
├── Task 3: Add Open Graph meta tags to layout template [quick]
├── Task 4: Consolidate duplicate pages (vorstand/vereinsvorstand) [quick]
└── Task 5: Define new color palette + design token mapping document [quick]

Wave 2 (Design System — visual change, no structural change):
├── Task 6: Replace design tokens in base.css (colors, fonts, spacing, radius) [visual-engineering]
├── Task 7: Update dark.css theme tokens for new color system [visual-engineering]
├── Task 8: Add scroll-reveal animation system (Intersection Observer + CSS) [visual-engineering]
└── Task 9: Redesign button system (.btn, .btn--ghost, .btn--cta) [visual-engineering]

Wave 3 (Layout & Templates — structural, high impact):
├── Task 10: Redesign header + navigation (new groups, CTA button, mobile menu) [visual-engineering]
├── Task 11: Redesign footer (new layout, social links, sponsor strip) [visual-engineering]
├── Task 12: Redesign homepage hero section [visual-engineering]
├── Task 13: Redesign homepage content sections (training, venues, stats, teams, CTA) [visual-engineering]
├── Task 14: Redesign news list card + pagination template [visual-engineering]
└── Task 15: Redesign news detail page template [visual-engineering]

Wave 4 (New Features — each independent, max parallel):
├── Task 16: Add team roster page with player cards (DE+EN) [unspecified-high]
├── Task 17: Add photo gallery with lightbox (vanilla JS) [visual-engineering]
├── Task 18: Add contact form with Formspree integration [unspecified-high]
├── Task 19: Add testimonials section on homepage [visual-engineering]
├── Task 20: Redesign sponsor showcase (grid → visual showcase) [visual-engineering]
├── Task 21: Add event calendar section to homepage [quick]
├── Task 22: Redesign content page template (used by all non-home pages) [visual-engineering]
└── Task 23: Update homepage news section with new card design [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T6 → T10 → T12 → T13 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 8 (Wave 4)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 (Fonts) | — | 6, 7 | 1 |
| 2 (Datenschutz) | — | 18 | 1 |
| 3 (OG Tags) | — | — | 1 |
| 4 (Consolidate pages) | — | 10 | 1 |
| 5 (Color mapping) | — | 6, 7 | 1 |
| 6 (Design tokens) | 1, 5 | 8-23 | 2 |
| 7 (Dark theme) | 1, 5 | — | 2 |
| 8 (Scroll animations) | 6 | — | 2 |
| 9 (Button system) | 6 | — | 2 |
| 10 (Header/Nav) | 4, 6 | 12, 13 | 3 |
| 11 (Footer) | 6 | — | 3 |
| 12 (Hero) | 6, 10 | — | 3 |
| 13 (Homepage sections) | 6, 10 | 19, 21, 23 | 3 |
| 14 (News cards) | 6 | 23 | 3 |
| 15 (News detail) | 6 | — | 3 |
| 16 (Roster) | 6 | — | 4 |
| 17 (Gallery) | 6 | — | 4 |
| 18 (Contact form) | 2, 6 | — | 4 |
| 19 (Testimonials) | 13 | — | 4 |
| 20 (Sponsors) | 6 | — | 4 |
| 21 (Calendar) | 13 | — | 4 |
| 22 (Content template) | 6 | — | 4 |
| 23 (News on homepage) | 13, 14 | — | 4 |

### Agent Dispatch Summary

- **Wave 1**: **5 tasks** — T1-T5 → `quick`
- **Wave 2**: **4 tasks** — T6-T9 → `visual-engineering`
- **Wave 3**: **6 tasks** — T10-T15 → `visual-engineering`
- **Wave 4**: **8 tasks** — T16 → `unspecified-high`, T17 → `visual-engineering`, T18 → `unspecified-high`, T19-T20 → `visual-engineering`, T21 → `quick`, T22 → `visual-engineering`, T23 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Self-Host Fonts (Space Grotesk + Inter WOFF2)

  **What to do**:
  - Download Space Grotesk (weights: 400, 500, 600, 700) and Inter (weights: 400, 500, 600, 700) as WOFF2 files
  - Place in `assets/fonts/` directory
  - Create `@font-face` declarations in a new `src/styles/fonts.css` file
  - Update `src/templates/layout.html` to load `fonts.css` instead of Google Fonts CDN link
  - Use `font-display: swap` for all declarations
  - Remove the Google Fonts `<link>` tags (preconnect + stylesheet) from layout.html

  **Must NOT do**:
  - Do NOT change any existing CSS rules yet (just add font files + declarations)
  - Do NOT remove Inter — it stays as body font
  - Do NOT remove Fraunces declarations yet (that happens in Task 6)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: None

  **References**:
  - `src/templates/layout.html:14-16` — Current Google Fonts loading (Fraunces, Inter, JetBrains Mono)
  - `src/styles/base.css:10-12` — Current font-family declarations to understand what's needed

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Fonts load without external CDN
    Tool: Bash (npm run build + curl)
    Steps:
      1. Run `npm run build`
      2. Verify `docs/assets/fonts/` directory contains WOFF2 files
      3. Verify `docs/assets/css/fonts.css` exists with @font-face declarations
      4. Verify NO reference to `fonts.googleapis.com` in any HTML file: `grep -r "fonts.googleapis" docs/`
    Expected Result: WOFF2 files present, fonts.css exists, zero Google Fonts references
    Evidence: .sisyphus/evidence/task-1-font-files.txt

  Scenario: Site still renders after font change
    Tool: Bash (npm run build && npm run check)
    Steps:
      1. Run `npm run build && npm run check`
      2. Both must exit 0
    Expected Result: Build succeeds, check passes
    Evidence: .sisyphus/evidence/task-1-build-check.txt
  ```

  **Commit**: YES
  - Message: `feat: self-host Space Grotesk + Inter WOFF2 fonts`
  - Files: `assets/fonts/`, `src/styles/fonts.css`, `src/templates/layout.html`
  - Pre-commit: `npm run build && npm run check`

- [x] 2. Create Datenschutz (Privacy Policy) Page

  **What to do**:
  - Create `content/pages/de/datenschutz.md` with DSGVO-compliant privacy policy text
  - Create `content/pages/en/datenschutz.md` with English translation
  - Include: what data is collected, how it's used, storage duration, user rights, contact info
  - Set frontmatter: `navGroup: Kontakt`, `navOrder: 30`, `navHidden: false`
  - Add link to Datenschutz in footer (next to Impressum)

  **Must NOT do**:
  - Do NOT add cookie consent banner (no analytics/tracking yet)
  - Do NOT invent legal text — use standard Austrian Sportverein DSGVO template patterns

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Task 18 (contact form requires this)
  - **Blocked By**: None

  **References**:
  - `content/pages/de/impressum-vereinsdaten.md` — Existing legal page pattern to follow
  - `src/templates/partials/footer.html:251` — Where to add Datenschutz link in footer

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Datenschutz page renders in both languages
    Tool: Bash (npm run build + curl)
    Steps:
      1. Run `npm run build`
      2. Verify `docs/de/datenschutz/index.html` exists
      3. Verify `docs/en/datenschutz/index.html` exists
      4. Verify footer HTML contains link to `/de/datenschutz/`
    Expected Result: Both pages exist, footer links present
    Evidence: .sisyphus/evidence/task-2-datenschutz.txt

  Scenario: Build passes with new page
    Tool: Bash (npm run build && npm run check)
    Steps:
      1. Run `npm run build && npm run check`
    Expected Result: Exit 0, no parity errors
    Evidence: .sisyphus/evidence/task-2-build-check.txt
  ```

  **Commit**: YES
  - Message: `feat: add Datenschutz page (DE+EN) DSGVO compliance`
  - Files: `content/pages/de/datenschutz.md`, `content/pages/en/datenschutz.md`, `src/templates/partials/footer.html`
  - Pre-commit: `npm run build && npm run check`

- [x] 3. Add Open Graph Meta Tags

  **What to do**:
  - Add `<meta property="og:*">` tags to `src/templates/layout.html`
  - Include: og:title, og:description, og:image, og:url, og:type, og:locale
  - Add Twitter card meta tags (twitter:card, twitter:title, twitter:description, twitter:image)
  - Use template variables for dynamic values: `{{ogTitle}}`, `{{ogDescription}}`, `{{ogImage}}`
  - Update `scripts/build.mjs` to pass OG values when rendering pages
  - Default og:image to team photo (`/assets/uploads/team-bsc70-48b7b09aaf.jpg`)

  **Must NOT do**:
  - Do NOT add Facebook SDK or any tracking JavaScript
  - Do NOT modify page content or layout

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/templates/layout.html:1-21` — Current head section where OG tags should go
  - `scripts/build.mjs` — Template rendering function that passes variables
  - `scripts/lib/template.mjs` — Template engine using `{{var}}` substitution

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: OG tags present in built HTML
    Tool: Bash (grep)
    Steps:
      1. Run `npm run build`
      2. Check `docs/de/index.html` contains `og:title`, `og:description`, `og:image`
      3. Check `docs/de/news/neuer-vereinsvorstand-ab-juni-2024/index.html` contains article-specific OG tags
    Expected Result: OG tags present with correct values on homepage and news pages
    Evidence: .sisyphus/evidence/task-3-og-tags.txt

  Scenario: Build passes
    Tool: Bash (npm run build && npm run check)
    Steps: Run build + check
    Expected Result: Exit 0
    Evidence: .sisyphus/evidence/task-3-build-check.txt
  ```

  **Commit**: YES
  - Message: `feat: add Open Graph meta tags to layout template`
  - Files: `src/templates/layout.html`, `scripts/build.mjs`
  - Pre-commit: `npm run build && npm run check`

- [x] 4. Consolidate Duplicate Vorstand Pages

  **What to do**:
  - Check `content/pages/de/vorstand.md` and `content/pages/de/vereinsvorstand.md` — identify which has content
  - Keep the one with real content, redirect/merge the other
  - Set the unused page's `navHidden: true` or remove it
  - Do the same for EN versions
  - Ensure only one Vorstand page appears in navigation

  **Must NOT do**:
  - Do NOT delete any content — merge into the surviving page
  - Do NOT change URL slugs if they're linked from external sources

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 10 (cleaner nav)
  - **Blocked By**: None

  **References**:
  - `content/pages/de/vorstand.md` — One of the duplicate pages
  - `content/pages/de/vereinsvorstand.md` — The other duplicate
  - `scripts/build.mjs` — Navigation generation logic

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Only one Vorstand page in navigation
    Tool: Bash (grep)
    Steps:
      1. Run `npm run build`
      2. Count occurrences of "Vorstand" or "vorstand" in navigation HTML
    Expected Result: Exactly ONE Vorstand link in nav
    Evidence: .sisyphus/evidence/task-4-nav-check.txt
  ```

  **Commit**: YES
  - Message: `fix: consolidate duplicate Vorstand pages`
  - Files: `content/pages/de/vorstand.md`, `content/pages/de/vereinsvorstand.md` (and EN equivalents)
  - Pre-commit: `npm run build && npm run check`

- [x] 5. Define Color Palette + Design Token Mapping

  **What to do**:
  - Create `.sisyphus/design-tokens.md` documenting the complete new token system
  - Map every existing CSS variable to its new value
  - Color palette: electric blue (#3B82F6), hot lime (#84CC16 — accent only), deep black (#09090B), white (#FFFFFF), off-white (#F8FAFC), cool gray (#6B7280), light gray (#E5E7EB)
  - Typography scale: Space Grotesk Bold for headlines, Inter for body
  - Spacing: tighter section gaps, sharper radius (0px for cards, 8px for buttons)
  - Validate ALL color combinations against WCAG 2.1 AA (4.5:1 text, 3:1 large)
  - Document which combinations pass/fail with exact ratios

  **Must NOT do**:
  - Do NOT modify any CSS files yet — this is a reference document only
  - Do NOT use lime green for any text color combination (document WHY)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: None

  **References**:
  - `src/styles/base.css:9-39` — Current CSS variables to map from
  - `src/styles/themes/light.css` — Current light theme values
  - `src/styles/themes/dark.css` — Current dark theme values

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Token mapping is complete and contrast-validated
    Tool: Bash (read file)
    Steps:
      1. Verify `.sisyphus/design-tokens.md` exists
      2. Verify it contains mappings for ALL existing CSS variables
      3. Verify WCAG contrast ratios are documented for every text+bg combo
      4. Verify lime green is documented as "accent only, never text"
    Expected Result: Complete mapping document with contrast validation
    Evidence: .sisyphus/evidence/task-5-tokens.txt
  ```

  **Commit**: YES
  - Message: `docs: define color/token mapping for redesign`
  - Files: `.sisyphus/design-tokens.md`

- [x] 6. Replace Design Tokens in base.css

  **What to do**:
  - Replace ALL CSS custom properties in `:root` with new values from `.sisyphus/design-tokens.md`
  - Switch `--font-display` from Fraunces to Space Grotesk
  - Switch `--color-bg` from beige (#F4F1EA) to off-white (#F8FAFC)
  - Switch `--color-primary` from red (#E63322) to electric blue (#3B82F6)
  - Switch `--color-accent` to lime (#84CC16) — used ONLY for borders/decorative, never text
  - Update `--radius` from 2px to 0px for cards, 8px for buttons
  - Update heading styles to use `text-transform: uppercase; letter-spacing: 0.05em` for Space Grotesk
  - Update link hover color from blue to match new primary
  - Ensure `fonts.css` is loaded before `base.css` in layout.html
  - Add `prefers-reduced-motion: reduce` media query to disable all animations

  **Must NOT do**:
  - Do NOT restructure CSS component sections (just change values)
  - Do NOT change layout/grid structures
  - Do NOT modify news card, header, or footer layout (those are separate tasks)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (first in sequence)
  - **Blocks**: Tasks 7, 8, 9, 10-23 (everything visual depends on this)
  - **Blocked By**: Tasks 1 (fonts), 5 (token mapping)

  **References**:
  - `src/styles/base.css:9-39` — Current `:root` variables to replace
  - `.sisyphus/design-tokens.md` — New values from Task 5
  - `assets/fonts/` — Font files from Task 1

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: New design tokens are applied
    Tool: Bash (grep + build)
    Steps:
      1. Run `npm run build`
      2. Verify `docs/assets/css/base.css` contains "#3B82F6" (new primary)
      3. Verify NO reference to "#E63322" (old red) or "#F4F1EA" (old beige) in base.css
      4. Verify Space Grotesk is referenced in font-display declaration
    Expected Result: All old tokens replaced with new ones
    Evidence: .sisyphus/evidence/task-6-tokens-applied.txt

  Scenario: Reduced motion preference respected
    Tool: Bash (grep)
    Steps:
      1. Verify base.css contains `prefers-reduced-motion: reduce` media query
    Expected Result: Motion reduction declared
    Evidence: .sisyphus/evidence/task-6-reduced-motion.txt

  Scenario: Build passes
    Tool: Bash
    Steps: npm run build && npm run check
    Expected Result: Exit 0
    Evidence: .sisyphus/evidence/task-6-build.txt
  ```

  **Commit**: YES
  - Message: `feat: replace design tokens — colors, fonts, spacing, radius`
  - Files: `src/styles/base.css`, `src/templates/layout.html`
  - Pre-commit: `npm run build && npm run check`

- [x] 7. Update Dark Theme Tokens

  **What to do**:
  - Update `src/styles/themes/dark.css` with new dark palette based on `.sisyphus/design-tokens.md`
  - Background: deep black (#09090B), surface: dark gray (#18181B), text: white (#F8FAFC)
  - Primary in dark: brighter blue (#60A5FA), accent: brighter lime (#A3E635)
  - Validate ALL dark mode color combos against WCAG 2.1 AA
  - Update `src/styles/themes/light.css` to match new light palette

  **Must NOT do**: Do NOT use lime for text in dark mode (contrast FAILS)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 5

  **References**:
  - `src/styles/themes/dark.css` — Current dark theme (16 lines)
  - `src/styles/themes/light.css` — Current light theme (16 lines)
  - `.sisyphus/design-tokens.md` — Contrast validation from Task 5

  **Acceptance Criteria**:
  ```
  Scenario: Dark mode renders with new colors
    Tool: Bash (grep + build)
    Steps:
      1. npm run build
      2. Verify dark.css contains new dark palette values
      3. Verify NO lime green used as text color in dark.css
    Expected Result: Dark theme updated, no contrast violations
    Evidence: .sisyphus/evidence/task-7-dark-theme.txt
  ```

  **Commit**: YES — `feat: update dark theme tokens for new color system`

- [x] 8. Add Scroll-Reveal Animation System

  **What to do**:
  - Create CSS keyframes for reveal animations (fade-up, fade-in, slide-left, slide-right)
  - Add `.reveal` CSS class with initial hidden state (opacity: 0, transform: translateY(30px))
  - Add `.reveal--visible` class with final state (opacity: 1, transform: none)
  - Create lightweight Intersection Observer in `src/scripts/site.js` to toggle `.reveal--visible`
  - Threshold: 0.15 (reveal when 15% visible), trigger once only
  - Respect `prefers-reduced-motion: reduce` — skip animations entirely
  - Apply `.reveal` class to all `.section` elements in templates

  **Must NOT do**:
  - Do NOT use CSS scroll-timeline (browser support too limited)
  - Do NOT add more than 4 animation variants (fade-up, fade-in, slide-left, slide-right)
  - Do NOT animate individual elements (only section-level reveals)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 9)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 6

  **References**:
  - `src/scripts/site.js` — Where to add Intersection Observer code
  - `src/styles/base.css` — Where to add animation CSS

  **Acceptance Criteria**:
  ```
  Scenario: Sections animate on scroll
    Tool: Bash (grep)
    Steps:
      1. Verify base.css contains `.reveal` and `.reveal--visible` classes
      2. Verify site.js contains IntersectionObserver setup
      3. Verify `prefers-reduced-motion` check exists in JS
    Expected Result: Animation system present with motion preference respect
    Evidence: .sisyphus/evidence/task-8-animations.txt
  ```

  **Commit**: YES — `feat: add scroll-reveal animation system`

- [x] 9. Redesign Button System

  **What to do**:
  - Redesign `.btn` base: sharper (border-radius: 8px), bolder (font-weight: 700), uppercase Space Grotesk
  - `.btn` (primary): electric blue bg, white text, hover darkens
  - `.btn--ghost`: transparent bg, blue border, blue text, hover fills
  - `.btn--cta`: lime green bg, dark text, hover brightens — used ONLY for main CTA ("Mitmachen")
  - Add subtle press animation (scale: 0.97 on :active)
  - Ensure minimum 44px touch target on mobile

  **Must NOT do**: Do NOT use lime as text color on buttons (use dark text on lime bg instead)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 6

  **References**:
  - `src/styles/base.css:115-160` — Current button styles

  **Acceptance Criteria**:
  ```
  Scenario: Button variants render correctly
    Tool: Bash (grep)
    Steps:
      1. Verify base.css contains `.btn`, `.btn--ghost`, `.btn--cta` rules
      2. Verify 44px minimum height on .btn
      3. Verify lime bg uses dark text (not white)
    Expected Result: All button variants defined with correct contrast
    Evidence: .sisyphus/evidence/task-9-buttons.txt
  ```

  **Commit**: YES — `feat: redesign button system`

- [x] 10. Redesign Header + Navigation

  **What to do**:
  - Expand navigation groups: Verein (Club, Geschichte, Vorstand, Erfolge), Mannschaften (new), Mitmachen (Training, Schnuppertraining, Nachwuchs, Hallen, Mitgliedschaft), News, Kontakt (Kontakt, Sponsoren, Impressum, Datenschutz)
  - Add `Mitmachen` CTA button (`.btn--cta` lime green) in header — visible on both desktop and mobile
  - Update header background to match new design system (clean white or dark, not glassmorphism)
  - Update brand mark to use new typography (Space Grotesk Bold)
  - Mobile menu: ensure scrollability for expanded nav groups, smooth open/close animation
  - Update `navGroup` assignments in build.mjs to match new groups
  - Update `src/templates/partials/header.html` template

  **Must NOT do**:
  - Do NOT change the nav toggle mechanism (keep details/summary pattern)
  - Do NOT break language switcher or theme toggle

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 11)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 12, 13
  - **Blocked By**: Tasks 4, 6

  **References**:
  - `src/templates/partials/header.html` — Current header template
  - `src/styles/base.css:100-280` — Current header + nav CSS
  - `scripts/build.mjs` — `NAV_GROUPS` constant and nav rendering logic
  - `src/scripts/site.js:100-250` — Nav interaction JS (hover, toggle, keyboard)

  **Acceptance Criteria**:
  ```
  Scenario: Expanded nav renders without overflow on mobile
    Tool: Bash (npm run build) + visual check
    Steps:
      1. npm run build
      2. Verify header HTML contains "Mitmachen" CTA button
      3. Verify nav has 5+ groups
      4. Verify mobile toggle still works (aria-expanded present)
    Expected Result: CTA in header, expanded nav, mobile toggle functional
    Evidence: .sisyphus/evidence/task-10-header.txt
  ```

  **Commit**: YES — `feat: redesign header navigation with CTA button`
  - Files: `src/templates/partials/header.html`, `src/styles/base.css`, `scripts/build.mjs`, `src/scripts/site.js`

- [x] 11. Redesign Footer

  **What to do**:
  - Update footer design: new typography, colors, spacing from design system
  - Add sponsor logo strip (small logos in a row) at top of footer
  - Add newsletter signup placeholder (email input + submit, non-functional for now)
  - Update social links styling (icons or text badges with hover effects)
  - Add Datenschutz link (from Task 2)
  - Ensure footer renders correctly in both themes

  **Must NOT do**: Do NOT implement newsletter backend — just the UI placeholder

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**: YES (with Task 10) | Wave 3 | Blocked By: Task 6

  **References**:
  - `src/templates/partials/footer.html` — Current footer template
  - `src/styles/base.css:1500-1600` — Current footer CSS

  **Acceptance Criteria**:
  ```
  Scenario: Footer renders with new design
    Tool: Bash (build + grep)
    Steps:
      1. npm run build
      2. Verify footer contains Datenschutz link
      3. Verify footer contains sponsor logos section
    Expected Result: Updated footer with all required elements
    Evidence: .sisyphus/evidence/task-11-footer.txt
  ```

  **Commit**: YES — `feat: redesign footer layout`

- [x] 12. Redesign Homepage Hero Section

  **What to do**:
  - Bold, full-width hero with action photo background (use existing team photo or user-provided photo)
  - Large Space Grotesk uppercase headline: club name + tagline
  - Two CTAs: "Mitmachen" (lime CTA button) + "Über uns" (ghost button)
  - Stats bar below hero: "EST. 1970 · 7× Staatsmeister · Europacupsieger 1992"
  - Remove glassmorphism card (too soft for athletic brand)
  - Ensure dark overlay on hero image for text readability
  - Mobile: stack vertically, reduce headline size

  **Must NOT do**: Do NOT use stock photos — use real BSC 70 Linz photo

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**: YES (with Tasks 13-15) | Wave 3 | Blocked By: Tasks 6, 10

  **References**:
  - `content/pages/de/index.md` — Current homepage content (hero section HTML)
  - `src/styles/base.css:300-500` — Current hero CSS
  - `assets/uploads/team-bsc70-48b7b09aaf.jpg` — Existing team photo

  **Acceptance Criteria**:
  ```
  Scenario: Hero renders with new design
    Tool: Bash (build + grep)
    Steps:
      1. npm run build
      2. Verify hero contains Mitmachen CTA and Über uns button
      3. Verify stats bar is present
      4. Verify dark overlay exists (for text readability)
    Expected Result: Bold hero with CTAs and stats
    Evidence: .sisyphus/evidence/task-12-hero.txt
  ```

  **Commit**: YES (groups with T13)

- [x] 13. Redesign Homepage Content Sections

  **What to do**:
  - Training section: cards with day/time/location, blue accents, lime "Mehr erfahren" links
  - Venues section ("Wo wir spielen"): cards with address, field count
  - Stats section ("Die 70"): large numbers with animated count-up on scroll, horizontal layout
  - Teams section: cards for BSC 70 I (1. Landesliga) and BSC 70 II (2. Klasse Nord) with links to tournamentsoftware.com
  - CTA section ("Komm vorbei"): bold headline, two buttons, blue background
  - Quick links section: redesigned button grid
  - Alternating section backgrounds (white → light gray → white) for visual rhythm
  - Apply scroll-reveal animation to each section

  **Must NOT do**:
  - Do NOT embed tournamentsoftware data — external links only
  - Do NOT change the content text (just the HTML structure and styling)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**: YES (with Tasks 12, 14, 15) | Wave 3 | Blocked By: Tasks 6, 10

  **References**:
  - `content/pages/de/index.md:70-161` — Current section HTML
  - `src/styles/base.css:500-900` — Current section CSS

  **Acceptance Criteria**:
  ```
  Scenario: Homepage sections render with alternating backgrounds
    Tool: Bash (build + grep)
    Steps:
      1. npm run build
      2. Verify homepage contains training, venues, stats, teams, CTA sections
      3. Verify scroll-reveal classes applied to sections
    Expected Result: All sections present with visual rhythm
    Evidence: .sisyphus/evidence/task-13-sections.txt
  ```

  **Commit**: YES — `feat: redesign homepage hero + content sections` (grouped with T12)

- [x] 14. Redesign News List Card + Pagination

  **What to do**:
  - Redesign `.news-card`: add hero image placeholder (club logo as fallback when no heroImage), category badge with color coding, hover lift effect with shadow, truncated teaser
  - Update pagination: previous/next buttons styled as new button system, page indicator
  - Mobile: cards stack vertically, full-width images

  **Must NOT do**: Do NOT change pagination logic or items-per-page in build.mjs

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**: YES (with Tasks 12, 13, 15) | Wave 3 | Blocked By: Task 6

  **References**:
  - `src/styles/base.css:900-1050` — Current news card CSS
  - `scripts/build.mjs` — `buildNewsCard` function that generates card HTML

  **Acceptance Criteria**:
  ```
  Scenario: News cards have image fallback
    Tool: Bash (build + grep)
    Steps:
      1. npm run build
      2. Check a news card HTML for image element (with fallback)
      3. Verify hover styles exist for news cards
    Expected Result: Cards have images (or fallback), hover effects present
    Evidence: .sisyphus/evidence/task-14-news-cards.txt
  ```

  **Commit**: YES — `feat: redesign news list and detail templates` (grouped with T15)

- [x] 15. Redesign News Detail Page

  **What to do**:
  - Update news detail template: larger hero image (if available), bold title, date + category badge, clean prose styling
  - Add "Back to News" breadcrumb at top
  - Add prev/next article navigation at bottom
  - Social share links (copy URL, share on Facebook/Twitter)
  - Apply new typography and colors

  **Must NOT do**: Do NOT change markdown rendering or frontmatter parsing

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**: YES (with Tasks 12-14) | Wave 3 | Blocked By: Task 6

  **References**:
  - `scripts/build.mjs` — News detail page rendering
  - `src/styles/base.css:1050-1200` — Current prose/content CSS

  **Acceptance Criteria**:
  ```
  Scenario: News detail page has share links
    Tool: Bash (build + grep)
    Steps:
      1. npm run build
      2. Verify a news detail page contains share link elements
      3. Verify breadcrumb nav present
    Expected Result: Detail page with share + breadcrumb
    Evidence: .sisyphus/evidence/task-15-news-detail.txt
  ```

  **Commit**: YES (grouped with T14)

- [ ] 16. Add Team Roster Page

  **What to do**:
  - Create `content/pages/de/mannschaften.md` + `content/pages/en/mannschaften.md`
  - Structure: BSC 70 Linz I (1. Landesliga) section + BSC 70 Linz II (2. Klasse Nord) section
  - Player card component: photo (placeholder if none), name, position/role
  - Link to tournamentsoftware.com for each team
  - Add "Mannschaften" to navigation (navGroup: Verein or standalone)
  - Design empty state: "Kaderinformationen werden aktualisiert" with CTA to contact

  **Must NOT do**: Do NOT scrape player data from external sources — manual markdown entries only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**: YES (all Wave 4 tasks parallel) | Blocked By: Task 6

  **References**:
  - `content/pages/de/index.md` — Page content pattern
  - `src/styles/base.css` — Card component patterns (`.fixture-card`)

  **Acceptance Criteria**:
  ```
  Scenario: Roster page renders in both languages
    Tool: Bash (build + check)
    Steps:
      1. npm run build && npm run check
      2. Verify docs/de/mannschaften/index.html exists
      3. Verify docs/en/mannschaften/index.html exists
    Expected Result: Both pages exist, build passes
    Evidence: .sisyphus/evidence/task-16-roster.txt
  ```

  **Commit**: YES — `feat: add team roster page with player cards`

- [ ] 17. Add Photo Gallery with Lightbox

  **What to do**:
  - Redesign existing gallery page (`content/pages/de/galerie.md`)
  - Create responsive image grid (CSS Grid, masonry-like)
  - Build vanilla JS lightbox: click to enlarge, arrow nav, Escape to close, swipe on mobile
  - Support `loading="lazy"` for performance
  - Use existing photos from `assets/uploads/`
  - Design empty state for albums with no photos

  **Must NOT do**: Do NOT add external lightbox library — vanilla JS only

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**: YES (Wave 4) | Blocked By: Task 6

  **References**:
  - `content/pages/de/galerie.md` — Existing (empty) gallery page
  - `assets/uploads/` — Available images

  **Acceptance Criteria**:
  ```
  Scenario: Gallery renders with lightbox
    Tool: Bash (build + grep)
    Steps:
      1. npm run build
      2. Verify gallery page contains image grid
      3. Verify lightbox JS is present in site.js or separate script
    Expected Result: Gallery with clickable images and lightbox code
    Evidence: .sisyphus/evidence/task-17-gallery.txt
  ```

  **Commit**: YES — `feat: add photo gallery with lightbox`

- [ ] 18. Add Contact Form with Formspree

  **What to do**:
  - Replace current "kontakt telefonisch" message with a working contact form
  - Fields: Name, Email, Message (simple, 3 fields only)
  - Integrate with Formspree (free tier: 50 submissions/month)
  - Show success message on submit (no page reload — use fetch API)
  - Add honeypot field for spam prevention
  - Add form validation (required fields, email format)
  - Link Datenschutz page in form footer ("Mit dem Absenden stimmst du unserer Datenschutzerklärung zu")

  **Must NOT do**:
  - Do NOT use Google Forms or iframe embeds
  - Do NOT add file upload functionality
  - Do NOT implement server-side form handling

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**: YES (Wave 4) | Blocked By: Tasks 2 (Datenschutz must exist), 6

  **References**:
  - `content/pages/de/kontakt.md` — Current contact page content
  - `src/scripts/site.js` — Where form JS can be added

  **Acceptance Criteria**:
  ```
  Scenario: Form renders and validates
    Tool: Bash (build + grep)
    Steps:
      1. npm run build
      2. Verify contact page contains <form> element with action pointing to Formspree
      3. Verify honeypot field exists (hidden input)
      4. Verify Datenschutz link present in form
    Expected Result: Working form with validation and privacy link
    Evidence: .sisyphus/evidence/task-18-form.txt
  ```

  **Commit**: YES — `feat: add contact form with Formspree integration`

- [ ] 19. Add Testimonials Section on Homepage

  **What to do**:
  - Add testimonials section between CTA and News on homepage
  - 3 testimonial cards: photo (placeholder circle if no photo), name, role/years, quote
  - Use real-sounding placeholder quotes for now (user can replace with actual testimonials later)
  - Responsive: 3 columns desktop → 1 column mobile
  - Subtle card styling with quote marks

  **Must NOT do**: Do NOT invent specific names or facts — use generic placeholders like "Mitglied seit 2020"

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**: YES (Wave 4) | Blocked By: Task 13

  **References**:
  - `content/pages/de/index.md` — Homepage content where section is added

  **Acceptance Criteria**:
  ```
  Scenario: Testimonials render on homepage
    Tool: Bash (build + grep)
    Steps:
      1. npm run build
      2. Verify homepage contains testimonial section
      3. Verify 3 testimonial cards present
    Expected Result: Testimonials section with 3 cards
    Evidence: .sisyphus/evidence/task-19-testimonials.txt
  ```

  **Commit**: YES (groups with T20, T21)

- [ ] 20. Redesign Sponsor Showcase

  **What to do**:
  - Redesign sponsor page: organized by tier (Hauptsponsoren, Partner, Unterstützer)
  - Add sponsor logo strip to footer (small, auto-scrolling optional)
  - Sponsor cards: logo (object-fit: contain), name, link
  - Handle varying aspect ratios with consistent cell sizing
  - Add "Sponsor werden" CTA at bottom

  **Must NOT do**: Do NOT re-architecture sponsor data model — keep existing markdown structure

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**: YES (Wave 4) | Blocked By: Task 6

  **References**:
  - `content/pages/de/sponsoren-partner.md` — Current sponsor data (20+ sponsors, 4 categories)
  - `assets/sponsors/` — Existing sponsor logos

  **Acceptance Criteria**:
  ```
  Scenario: Sponsors display with consistent sizing
    Tool: Bash (build + grep)
    Steps:
      1. npm run build
      2. Verify sponsor page has tiered layout
      3. Verify footer sponsor strip exists
    Expected Result: Tiered sponsor display + footer strip
    Evidence: .sisyphus/evidence/task-20-sponsors.txt
  ```

  **Commit**: YES (groups with T19, T21)

- [ ] 21. Add Event Calendar Section to Homepage

  **What to do**:
  - Add "Termine" section to homepage showing next 3-4 events
  - Events stored as inline HTML in homepage markdown (no new content type)
  - Each event card: date (bold, styled), title, location, type badge (Training/Match/Turnier)
  - "Alle Termine" link to training schedule page
  - Design empty state: "Keine aktuellen Termine" with link to training times

  **Must NOT do**:
  - Do NOT build a calendar widget or iCal integration
  - Do NOT create a new content type or build.mjs changes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: YES (Wave 4) | Blocked By: Task 13

  **References**:
  - `content/pages/de/index.md` — Homepage where section is added
  - `content/pages/de/trainingszeiten.md` — Training schedule page (link target)

  **Acceptance Criteria**:
  ```
  Scenario: Calendar section renders
    Tool: Bash (build + grep)
    Steps:
      1. npm run build
      2. Verify homepage contains event/calendar section
    Expected Result: Event section with placeholder events
    Evidence: .sisyphus/evidence/task-21-calendar.txt
  ```

  **Commit**: YES (groups with T19, T20)

- [ ] 22. Redesign Content Page Template

  **What to do**:
  - Update `.prose` styles for new typography system (Space Grotesk headings, Inter body)
  - Update table styles (for Vorstand table, membership fees, etc.)
  - Update blockquote, list, and code block styles
  - Ensure images in content have responsive sizing + border-radius
  - Apply new section spacing and visual rhythm
  - Test with: Verein page (long content), Trainingszeiten (structured info), Impressum (legal text)

  **Must NOT do**: Do NOT change page content — only CSS styling

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**: YES (Wave 4) | Blocked By: Task 6

  **References**:
  - `src/styles/base.css:1200-1500` — Current `.prose` styles

  **Acceptance Criteria**:
  ```
  Scenario: Content pages render with new typography
    Tool: Bash (build)
    Steps:
      1. npm run build
      2. Verify Verein page renders with updated styles
    Expected Result: Content pages use new design system
    Evidence: .sisyphus/evidence/task-22-content.txt
  ```

  **Commit**: YES — `feat: redesign content page template`

- [ ] 23. Update Homepage News Section

  **What to do**:
  - Apply new news card design (from Task 14) to homepage news grid
  - Show 6 latest articles with images (fallback for articles without heroImage)
  - Ensure cards use new color system and hover effects
  - "Alle News" button styled as new button system

  **Must NOT do**: Do NOT change news rendering logic in build.mjs

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: YES (Wave 4) | Blocked By: Tasks 13, 14

  **References**:
  - `scripts/build.mjs` — `buildNewsCard` function
  - `content/pages/de/index.md` — Homepage news section

  **Acceptance Criteria**:
  ```
  Scenario: Homepage shows 6 news cards with new design
    Tool: Bash (build + grep)
    Steps:
      1. npm run build
      2. Verify homepage news section has 6 article cards
      3. Verify cards contain image elements
    Expected Result: 6 styled news cards on homepage
    Evidence: .sisyphus/evidence/task-23-news-homepage.txt
  ```

  **Commit**: YES — `feat: update homepage news with redesigned cards`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run build && npm run check`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify CSS contrast ratios for ALL color combinations in both themes.
  Output: `Build [PASS/FAIL] | Check [PASS/FAIL] | Files [N clean/N issues] | Contrast [PASS/FAIL] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean build. Navigate all pages at 360px, 768px, 1280px. Test: nav toggle, theme switch, language switch, form submission, gallery lightbox, scroll animations, news pagination, all links. Save screenshots to `.sisyphus/evidence/final-qa/`.
  Output: `Pages [N/N pass] | Viewports [3/3] | Interactions [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual changes. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Verify legacy redirects still work. Verify news system unchanged. Verify URL structure preserved.
  Output: `Tasks [N/N compliant] | Legacy [PASS/FAIL] | Scope [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1**: One commit per task (each is independent, low risk)
  - `feat: self-host Space Grotesk + Inter WOFF2 fonts`
  - `feat: add Datenschutz page (DE+EN) DSGVO compliance`
  - `feat: add Open Graph meta tags to layout template`
  - `fix: consolidate duplicate Vorstand pages`
  - `docs: define color/token mapping for redesign`

- **Wave 2**: One commit per task
  - `feat: replace design tokens — colors, fonts, spacing, radius`
  - `feat: update dark theme tokens for new color system`
  - `feat: add scroll-reveal animation system`
  - `feat: redesign button system`

- **Wave 3**: Grouped commits (header+footer together, homepage sections together)
  - `feat: redesign header navigation with CTA button`
  - `feat: redesign footer layout`
  - `feat: redesign homepage hero + content sections`
  - `feat: redesign news list and detail templates`

- **Wave 4**: One commit per feature
  - `feat: add team roster page with player cards`
  - `feat: add photo gallery with lightbox`
  - `feat: add contact form with Formspree integration`
  - `feat: add testimonials + calendar + sponsor showcase`
  - `feat: redesign content page template`

---

## Success Criteria

### Verification Commands
```bash
npm run build          # Expected: exits 0, no errors, ≤ 10s
npm run check          # Expected: exits 0, zero violations
npx lighthouse https://bsc70linz.neyda.at/de/ --output=json  # Expected: perf ≥ 90, a11y ≥ 90
```

### Final Checklist
- [ ] All "Must Have" items present and verified
- [ ] All "Must NOT Have" items absent (searched codebase)
- [ ] `npm run build` passes
- [ ] `npm run check` passes
- [ ] Lighthouse Performance ≥ 90 (mobile)
- [ ] Lighthouse Accessibility ≥ 90
- [ ] Dark mode renders correctly for all components
- [ ] Legacy redirects work (5 sample URLs verified)
- [ ] Site deploys successfully to GitHub Pages
- [ ] All pages render at 360px, 768px, 1280px without overflow/breakage
