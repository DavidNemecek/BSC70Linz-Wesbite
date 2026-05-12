# Plan v2 (kritisch verbessert): Relaunch BSC 70 Linz Website (Vanilla Runtime, GitHub Pages, DE+EN)

> NOTE (WICHTIG): `plan.md` muss als **UTF‑8** gespeichert werden. Aktuell sind Mojibake-Artefakte sichtbar (`â€“`, `Ã¼`, `â†’` etc.). Vor Weiterarbeit einmalig Encoding fixen, damit Copy/Paste/Automatisierung nicht kaputtgeht.

## Summary
Ziel: Die Homepage von **BSC 70 Linz** wird neu aufgebaut – **einfach**, **modern**, **mobilfreundlich**, aber **erweiterbar** (News, Galerie). Inhalte (Texte/Bilder/Downloads) werden von `https://www.bsc70linz.at/cms/` übernommen.  
Runtime-Constraint: **Output (Deploy) enthält nur HTML/CSS/JS**. Node.js ist **nur** für Import/Build erlaubt.

## Fixe Entscheidungen (locked)
- Hosting: **GitHub Pages**
- Domains/Umgebungen:  
  - **Staging**: `bsc70linz.neyda.at`  
  - **Prod später**: `bsc70linz.at`  
  - Deploy-Modell: **GitHub Pages + CNAME Switch** (Workflow setzt `docs/CNAME` je Umgebung)
- Sprachen: **DE + EN** (vollständig; inkl. News-Historie)
- Seitenumfang: **alle Menüpunkte** der aktuellen Seite
- News: **Markdown im Repo**
- Layout: **neu**, Inhalte übernommen (keine 1:1 Optik-Kopie)
- Sidebar-Tabellen: **weglassen**
- Fotos: **einfache Galerie-Seite**
- Import: **Fetch-Script** (nicht manuell, nicht HTTrack)
- Übersetzung: **Subagent/AI Seite-für-Seite** + QA-Gates (keine erfundenen Fakten)

---

## Architektur (decision-complete)

### Ziel-Ordnerstruktur
- `src/` – Templates/Styles/JS-Quellen (nicht deployt)
  - `src/templates/layout.html`
  - `src/templates/partials/{header,footer}.html`
  - `src/styles/main.css`
  - `src/scripts/{main.js,news.js,gallery.js,redirect-404.js}`
- `content/` – Source-Content
  - `content/pages/de/*.md`, `content/pages/en/*.md`
  - `content/news/de/*.md`, `content/news/en/*.md`
  - `content/photos/albums.json`
  - `content/legacy-redirects.json`
  - `content/glossary.json` (DE→EN Begriffsmapping)
- `assets/` – Assets im Repo (Bilder, PDFs)
  - `assets/img/` (Logo, Icons)
  - `assets/uploads/` (PDFs, Downloads)
  - `assets/photos/` (Galerie)
- `scripts/` – Dev-Tools
  - `scripts/fetch-legacy.mjs`
  - `scripts/build.mjs`
  - `scripts/check.mjs` (Linkcheck + minimal HTML sanity)
- `docs/` – Deploy-Output für GitHub Pages (generiert)
- `legacy/` – Raw HTML Dumps (optional, **gitignored**)

### Runtime-Pfadregel (wichtig)
- Weil wir Custom Domains nutzen (`bsc70linz.neyda.at`, später `bsc70linz.at`), sind **root-relative** Pfade (`/assets/...`) technisch ok.
- Trotzdem wird als Standard festgelegt: **Content speichert Asset-Pfade ohne führenden Slash** (`assets/...`).  
  Der Build entscheidet final, ob er `assets/...` oder `/assets/...` schreibt. Dadurch bleibt ein späterer Wechsel (z.B. doch Project Pages) möglich.

### Commands (package.json)
- `npm run fetch` → importiert Joomla-Inhalte (HTML→Content + Assets)
- `npm run build` → generiert `docs/`
- `npm run serve` → lokaler Server auf `docs/`
- `npm run check` → Linkcheck + Basis-Checks (keine Auto-Fixes)

---

## Content-Modell (decision-complete)

### Pages Frontmatter (mit Nav-Hierarchie)
```yaml
---
title: "Trainingszeiten"
slug: "trainingszeiten"
navOrder: 50
navGroup: "verein"      # news | nachwuchs | verein | kontakt | etc.
navLabel: "Training"    # optional
translationStatus: "reviewed"  # draft|reviewed
translatedFrom: "content/pages/de/trainingszeiten.md" # nur in EN
---
Body...
```

### News Frontmatter (DE & EN, symmetrische Slugs)
```yaml
---
title: "Sensationsmeldung aus der heimischen Badminton Szene!"
slug: "sensationsmeldung-aus-der-heimischen-badminton-szene"
date: "2024-05-01"
category: "news"         # news | bundesliga | ooe-meisterschaft | turniere | nachwuchs | mitglieder
teaser: "Kurztext..."
heroImage: "assets/uploads/..."
sourceUrl: "https://www.bsc70linz.at/cms/index.php/..."
translationStatus: "draft"
translatedFrom: "content/news/de/sensationsmeldung-aus-der-heimischen-badminton-szene.md"
---
Body...
```

### Markdown-Rendering (locked)
- Markdown-Subset **minimal** (Überschriften, Absätze, Listen, Links, Bilder).
- HTML-Passthrough: vorhandene HTML-Blöcke im Content werden durchgereicht.
- Keine großen Runtime-Libs für Markdown.

---

## Legacy URL Migration (Joomla → neue Site) [P0]
Ziel: alte Bookmarks/Google so gut wie möglich abfangen.

- `content/legacy-redirects.json` enthält Mapping:
  - Key: Joomla-Pfad (inkl. ggf. Query) oder normalisierte Artikel-ID
  - Value: neuer Pfad (DE default; optional EN)
- `docs/404.html`:
  - zeigt eine freundliche 404 Seite
  - lädt `legacy-redirects.json`
  - wenn Match: client-side Redirect auf neue URL

---

## Subagent-Rollen (Write-Scopes klar)
- **Manager (Integrator)**: Task-Plan, Review, Merge, DoD, konsistente Navigation/Design.
- **Content-Importer (Write: `scripts/fetch-legacy.mjs`, `assets/`, `content/**/de/`, `content/legacy-redirects.json`)**
- **Translator (Write: `content/**/en/`, `content/glossary.json`)**
- **Builder (Write: `src/`, `scripts/build.mjs`, `scripts/check.mjs`, Output `docs/`)**
- **QA (Read-only + Reports)**: A11y/SEO/Performance/Links; blockiert „fertig“ bei P0.

---

# Master-Checklist (granular, handoff-fähig)

## 0) Repo Setup
- [ ] `package.json` anlegen
- [ ] `package-lock.json` erzeugen (oder bewusst weglassen – Entscheidung: **Lockfile verwenden**)
- [ ] Node Engine in `package.json` festlegen (`>=18`)
- [ ] `.gitignore` anlegen/ergänzen:
  - [ ] `node_modules/`
  - [ ] `legacy/`
  - [ ] `.cache/` / temp
- [ ] `README.md` aktualisieren:
  - [ ] Ziel + Constraints (vanilla runtime)
  - [ ] Commands (fetch/build/serve/check)
  - [ ] Deploy (GitHub Pages / `docs/`)
  - [ ] Content-Workflow (News hinzufügen)

## 1) Legacy Discovery (Quelle verstehen)
- [ ] Menüstruktur aus `https://www.bsc70linz.at/cms/` erfassen:
  - [ ] Hauptmenüpunkte + Untermenüs
  - [ ] alle Ziel-URLs sammeln
- [ ] News-Struktur erfassen:
  - [ ] Kategorien identifizieren
  - [ ] Pagination-Mechanik verifizieren
- [ ] Download-Artefakte identifizieren:
  - [ ] PDFs/Formulare
  - [ ] Bilder in Artikeln/Seiten

## 2) Importer: `scripts/fetch-legacy.mjs`
- [ ] HTTP Fetch Layer:
  - [ ] Retry/Backoff bei transienten Fehlern
  - [ ] Rate-Limit Schutz (max concurrent requests)
  - [ ] deterministische User-Agent Kennzeichnung
- [ ] Crawl-Plan:
  - [ ] Seed-URLs: Start + alle Menüs + alle News-Kategorien
  - [ ] News-Pagination: bis Ende crawlen
  - [ ] dedupe URLs
- [ ] Content Extraction:
  - [ ] Main Content selector fixieren (z.B. `#content_in`)
  - [ ] „Actions“ entfernen (print/mailto)
  - [ ] Breadcrumb/Sidebar aus Content entfernen
- [ ] Asset Handling:
  - [ ] alle `img src` sammeln
  - [ ] alle Download-Links (`.pdf`, etc.) sammeln
  - [ ] Assets herunterladen nach `assets/` (stabile Pfade)
  - [ ] Kollisionen lösen (Hash-Suffix oder Ordnerstruktur)
- [ ] Link Rewriting:
  - [ ] interne Joomla-Links auf neue Pfade mappen
  - [ ] externe Links unverändert lassen
- [ ] DE Content Output:
  - [ ] Pages: `content/pages/de/*.md` erzeugen
  - [ ] News: `content/news/de/*.md` erzeugen
  - [ ] Frontmatter vollständig (title/slug/date/category/sourceUrl/teaser optional)
- [ ] Redirect Mapping Output:
  - [ ] `content/legacy-redirects.json` generieren (für alle Pages + News)
- [ ] Import-Report erzeugen:
  - [ ] Anzahl Pages/News/Assets
  - [ ] Liste fehlgeschlagener URLs
  - [ ] Liste fehlender Assets

## 3) Übersetzung DE → EN (skalierbar + QA)
- [ ] `content/glossary.json` erstellen:
  - [ ] Vereins-/Hallennamen “do-not-translate” Liste
  - [ ] Standardbegriffe (Trainingszeiten, Vorstand, Mitgliedschaft, etc.)
- [ ] EN Skeleton:
  - [ ] für jede DE Page EN Datei anlegen
  - [ ] für jede DE News EN Datei anlegen
- [ ] Übersetzung pro Datei:
  - [ ] `translatedFrom` setzen
  - [ ] `translationStatus: draft`
  - [ ] keine Links/Downloads ändern
  - [ ] keine neuen Fakten hinzufügen (Namen/Daten/Ergebnisse/Orte)
- [ ] Translation QA Gate (blockiert „fertig“):
  - [ ] 100% der EN Dateien mindestens `draft`
  - [ ] Stichprobe: 50 News + 20 Pages „reviewed“
  - [ ] Glossar-Compliance geprüft (automatischer Check im `npm run check`)

## 4) Navigation (decision-complete)
- [ ] Nav-Konzept festlegen:
  - [ ] Nav Tree wird aus `navGroup` + `navOrder` generiert
  - [ ] Dropdowns (Nachwuchs etc.) funktionieren Desktop/Mobile
- [ ] Language switch:
  - [ ] Slug-Symmetrie: `/de/<slug>/` ↔ `/en/<slug>/`
  - [ ] Fallback: wenn Zielseite in anderer Sprache fehlt → `/de/` oder `/en/`

## 5) Build: `scripts/build.mjs` → `docs/`
- [ ] Template Engine (minimal, build-time):
  - [ ] `layout.html` + partials
  - [ ] Platzhalter: title, nav, content, footer
- [ ] Content Loader:
  - [ ] Pages/News pro Sprache einlesen
  - [ ] Sortierung News nach Datum desc
- [ ] News Ausgabe:
  - [ ] Listing `/de/news/` + `/en/news/`
  - [ ] Kategorie Listings `/de/news/<category>/`
  - [ ] Detailseiten `/de/news/<slug>/`
  - [ ] **statische Pagination verpflichtend** (z.B. 20 pro Seite) wegen kompletter Historie
- [ ] Assets Copy:
  - [ ] `assets/` → `docs/assets/`
- [ ] GitHub Pages Hygiene:
  - [ ] `docs/.nojekyll` erzeugen
  - [ ] `docs/CNAME` je Umgebung erzeugen (Staging/Prod Switch)
- [ ] SEO Files:
  - [ ] `docs/robots.txt`
  - [ ] `docs/sitemap.xml` (DE + EN)
  - [ ] `hreflang` alternates in `<head>`
- [ ] Legacy Redirect:
  - [ ] `docs/404.html` generieren + `redirect-404.js` einbinden

## 6) UI/Design System (vanilla)
- [ ] CSS Variables (Farben/Typo/Spacing)
- [ ] Layout Container + Grid Regeln
- [ ] Header:
  - [ ] Desktop Nav
  - [ ] Mobile Nav (Hamburger)
  - [ ] Skip-Link + Focus Styles
- [ ] Footer (Kontakt/Impressum/Links)
- [ ] Komponenten:
  - [ ] News Card
  - [ ] Buttons/Links
  - [ ] Tables (falls Trainingszeiten/Listen)
- [ ] A11y Basics:
  - [ ] sichtbarer Fokus
  - [ ] Kontrast
  - [ ] Headings korrekt

## 7) Galerie
- [ ] `content/photos/albums.json` Schema definieren und befüllen
- [ ] `assets/photos/<album>/*` strukturieren
- [ ] Galerie-Rendering:
  - [ ] Album-Liste
  - [ ] Album-Detail Grid
  - [ ] Lightbox:
    - [ ] ESC close
    - [ ] Fokus-Handling
- [ ] Asset Budget Policy:
  - [ ] Max Bildgröße definieren (z.B. 2000px Kante)
  - [ ] Max Datei-Größe definieren (z.B. 1–2 MB)
  - [ ] Komprimierung/Resize Script (build-time) falls nötig

## 8) QA / DoD (harte Gates)
P0 (muss grün sein):
- [ ] Navigation mobile/desktop ok
- [ ] DE/EN Switch ok
- [ ] Keine toten internen Links
- [ ] Downloads (PDFs) öffnen korrekt
- [ ] News: Listing/Kategorie/Detail + Pagination ok
- [ ] 404 Redirect Mapping funktioniert (mindestens für Menü + News-Details)
- [ ] Layout lesbar bei 360px Breite

P1/P2 (dürfen bei Launch offen sein, aber gelistet):
- [ ] Performance Optimierungen (Bildgrößen, caching headers nicht möglich auf Pages)
- [ ] OG/Twitter Meta (optional)
- [ ] Suche (optional; wenn zu teuer, streichen)

## 9) Deployment Workflow (Staging → Prod)
- [ ] GitHub Pages aktivieren (Deploy aus `/docs`)
- [ ] Staging Domain Setup:
  - [ ] DNS für `bsc70linz.neyda.at`
  - [ ] `docs/CNAME` = `bsc70linz.neyda.at`
- [ ] Prod vorbereiten:
  - [ ] DNS für `bsc70linz.at`
  - [ ] Workflow/Prozess dokumentieren:
    - [ ] Umschalten `docs/CNAME`
    - [ ] Domain in GitHub Pages Settings wechseln
- [ ] Release Check:
  - [ ] frischer Clone: `npm ci` → `npm run build` → `npm run serve` smoke test

---

## Test Plan (konkret)
- [ ] Lokal: `npm run fetch` (wenn Import neu/inkrementell)
- [ ] Lokal: `npm run build`
- [ ] Lokal: `npm run serve`
- [ ] Lokal: `npm run check` (Links + Glossar + minimale HTML sanity)
- [ ] Geräte/Breakpoints:
  - [ ] 360–430px
  - [ ] 768px
  - [ ] 1280px+
- [ ] Smoke:
  - [ ] Startseite (DE/EN)
  - [ ] News alt + neu (DE/EN)
  - [ ] Mitgliedschaft Download
  - [ ] Hallen/Training (Adressen/Links)
  - [ ] Galerie Lightbox

---

## Assumptions
- Du besitzt die Rechte, Inhalte/Assets von `https://www.bsc70linz.at/cms/` zu übernehmen.
- Vollständige News-Historie wird importiert; deshalb sind Pagination + Asset-Budget Pflicht.
- EN Übersetzung wird schrittweise erstellt; DoD verlangt final mindestens „draft“ überall + definierte „reviewed“ Stichproben.
