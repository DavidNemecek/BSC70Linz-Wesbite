# Draft: Homepage Redesign V2 — User Feedback

## User's Vision (verbatim)
- "The 70" section needs different design — top big, different card design
- Smooth scrolling animation throughout
- Remove quick links from homepage
- Remove news from homepage — news gets its own separate page (already exists at /news/)
- Add team info ON the main page with nice animation
- Gallery on main page with moving/scrolling pictures (not a separate gallery page)
- "Join/Mitmachen" page is a mess — clean it up as a proper "Join Us" landing page with:
  - Training information
  - Costs/membership fees
  - Contact/application form
- News stays as separate page only

## What This Changes

### Homepage Structure (NEW vision):
```
1. HERO — bold, full-width, dark (keep current)
2. "THE 70" — REDESIGNED: large, prominent, different card/stat layout
3. TEAMS — bring onto homepage with animation (currently separate mannschaften page)
4. GALLERY — inline on homepage with auto-scrolling/moving photos
5. TESTIMONIALS — keep (planned in current wave)
6. CTA "JOIN" — prominent "Komm vorbei" section
7. FOOTER

REMOVED from homepage:
- Quick links section (was a button grid)
- News section (stays at /de/news/ only)
```

### Join/Mitmachen Page (NEW vision):
```
Clean landing page:
1. Hero/intro — "Werde Teil des BSC 70 Linz"
2. Training schedule — days, times, locations
3. Membership costs — transparent pricing table
4. Contact form — name, email, message (Formspree)
5. FAQ or simple info section
```

### What stays the same:
- Design system (Space Grotesk, blue/white/lime palette)
- Header/nav with CTA
- Footer with sponsors
- News page (separate, already redesigned)
- Datenschutz, Impressum pages
- Dark/light theme toggle

## Completed Work (keep):
- Wave 1: Fonts, Datenschutz, OG tags, Vorstand consolidation, design tokens ✅
- Wave 2: Design system tokens, dark theme, scroll-reveal, buttons ✅
- Wave 3: Header/nav, footer, hero, news cards/detail ✅
- T16: Team roster page (mannschaften.md) ✅ — but now team goes ON homepage too
- T17: Photo gallery with lightbox ✅ — but gallery style changes to homepage inline

## Work that needs to change:
- T19 (testimonials): Keep but homepage structure changes
- T21 (event calendar): May merge into Join page instead of homepage
- T23 (homepage news): CANCEL — news removed from homepage
- T18 (contact form): Move to Join/Mitmachen page instead of Kontakt
- T20 (sponsors): Keep as-is
- T22 (content template): Keep as-is
- NEW: Redesign "The 70" section
- NEW: Inline gallery with auto-scroll on homepage
- NEW: Redesign Mitmachen page as clean Join landing page

## Decisions Made
- **The 70**: Timeline style — milestones: 1970 (Gründung) → 1992 (Europacup) → 7× Staatsmeister → Jetzt (2 Teams, Landesliga)
- **Gallery**: Infinite marquee — continuous horizontal CSS animation (film strip, never stops)
- **Pricing**: Show exact prices — full transparency (€X Erwachsene, €Y Jugend, etc.)
- **Training on Join page**: Cards with day/time/location (reuse fixture-card pattern)
- **Hero stats bar**: REMOVE — let timeline tell the story, hero stays clean (title + CTAs only)
- **Form backend**: Formspree with placeholder action URL — user sets up account later
- **Event calendar**: CANCELLED — not on homepage, training info goes on Join page instead

## Final Homepage Section Order
1. HERO (title + CTAs, NO stats bar)
2. MANIFESTO (keep — editorial pull-quote)
3. "THE 70" TIMELINE (1970 → 1992 → 7× SM → Now)
4. TEAMS (BSC 70 I + II, animated, on homepage)
5. MARQUEE GALLERY (infinite scroll photo strip)
6. TESTIMONIALS (3 member quotes)
7. CTA "KOMM VORBEI" (blue bg, join button)
8. FOOTER

REMOVED: Training section, Venues section, Quick links, News section
→ Training + Venues info moves to Join/Mitmachen page
