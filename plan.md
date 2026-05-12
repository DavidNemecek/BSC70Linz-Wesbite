# Plan: Relaunch BSC 70 Linz Website (Vanilla HTML/CSS/JS, GitHub Pages)

## Summary
Ziel: Die Homepage von **BSC 70 Linz** wird neu aufgebaut – **einfach**, **modern**, **mobilfreundlich**, aber **erweiterbar** (z.B. News, Galerie). Inhalte (Texte/Bilder/Downloads) werden von `https://www.bsc70linz.at/cms/` übernommen.  
Technik: Auslieferung als statische Dateien (**HTML/CSS/JS**), Hosting über **GitHub Pages**. Für Wartbarkeit nutzen wir einen **Mini-Build in Node/JS** (ohne Framework), der aus Templates + Content statische Seiten generiert.

### Fixe Entscheidungen (locked)
- Hosting: **GitHub Pages**
- Sprachen: **DE + EN**
- News: **Markdown im Repo**
- Layout: **neu**, Inhalte übernommen (keine 1:1 Optik-Kopie)
- Sidebar-Tabellen: **weglassen** (keine Landesliga/Playoff-Tables überall)
- Fotos: **einfache Galerie-Seite**
- News-Historie: **vollständig übernehmen**
- Übersetzung EN: **durch AI/Subagent Seite-für-Seite** (kein externer API-Provider nötig)

---

## Repo-/Build-Architektur (decision-complete)

### Ziel-Ordnerstruktur
- `src/` – Templates, Styles, JS-Quellcode (nicht direkt deployt)
  - `src/templates/`
    - `layout.html` (Basislayout)
    - `partials/header.html`, `partials/footer.html`
  - `src/styles/` (`main.css`)
  - `src/scripts/` (`main.js`, `gallery.js`, optional `news.js`)
- `content/` – Inhalte (Quellformat)
  - `content/pages/de/*.md` und `content/pages/en/*.md`
  - `content/news/de/*.md` und `content/news/en/*.md`
  - `content/photos/` (Alben/Meta oder JSON-Index)
- `assets/` – Original-Assets (Bilder, PDFs), strukturiert & sprechend benannt
  - `assets/img/` (Logo, Icons, UI-Bilder)
  - `assets/uploads/` (PDFs, Formulare)
  - `assets/photos/` (Galerie)
- `scripts/` – Build/Import Tools
  - `scripts/fetch-legacy.mjs` (Joomla-Seiten/Assets ziehen)
  - `scripts/build.mjs` (statisches Generieren nach `docs/`)
  - `scripts/translate.mjs` (optional: orchestriert DE→EN Übersetzung via Subagent-Workflow)
- `docs/` – **Deploy-Output** für GitHub Pages (generierte HTML/CSS/JS + kopierte Assets)
- `.gitignore` – `legacy/` (Mirror/Raw-HTML) und Caches ausschließen

### Lokale Commands (definiert im `package.json`)
- `npm run fetch` → zieht Rohdaten nach `legacy/` + Assets nach `assets/` + erstellt DE-Content Skeletons
- `npm run build` → generiert Site nach `docs/`
- `npm run serve` → lokaler Preview-Server für `docs/` (z.B. Node/kleines Script oder `python -m http.server`)
- `npm run check` → Linkcheck + simple HTML validation (minimal, ohne schwere Toolchain)

### Routing & URLs (GitHub Pages kompatibel)
- Output: `docs/`
- Sprachen:
  - `docs/de/...` und `docs/en/...`
  - `docs/index.html` leitet auf `./de/` weiter (Default: DE)
- Links sind **relative** Links (kein hardcodiertes `/`), damit es in GitHub Pages (Repo-Path) sauber funktioniert.

---

## Content-Modell (decision-complete)

### Pages
Jede Seite als Markdown mit Frontmatter:

```yaml
---
title: "Trainingszeiten"
slug: "trainingszeiten"
navOrder: 50
---
Body...
```

- Body darf Markdown-Subset enthalten **und** bei Bedarf rohe HTML-Blöcke (werden durchgereicht).

### News
Jeder Beitrag als Markdown:

```yaml
---
title: "Neuer Vereinsvorstand ab Juni 2024"
slug: "neuer-vereinsvorstand-2024"
date: "2024-06-15"
category: "news" # oder: "bundesliga" | "ooe-meisterschaft" | "turniere" | "nachwuchs" | "mitglieder"
teaser: "Kurztext..."
heroImage: "/assets/uploads/..."
sourceUrl: "https://www.bsc70linz.at/cms/index.php/..."
---
Body...
```

- Kategorien werden aus den Joomla-Bereichen abgeleitet.
- News-Listing:
  - global: `/de/news/` + `/en/news/`
  - category filters: query param oder separate Seiten (Entscheidung: **separate Seiten** für SEO/Einfachheit)
    - `/de/news/bundesliga/`, `/de/news/nachwuchs/`, etc.

### Fotos/Galerie
- `assets/photos/<album-slug>/*`
- `content/photos/albums.json` (oder YAML) enthält:
  - `albumSlug`, `title`, `date`, `cover`, `description`, `images[]`
- Galerie rendert Grid + einfache Lightbox in Vanilla JS.

---

## Seitenumfang (aus aktueller Navigation)
Alle Menüpunkte der aktuellen Seite werden abgedeckt (DE & EN):
- News (inkl. Kategorien: Bundesliga, OÖ Meisterschaft, Turniere, Nachwuchs, Mitglieder)
- Nachwuchs (inkl. Unterseiten: News Nachwuchs, Kooperationen, NW-Trainer, Termine OÖ. Nachwuchs)
- Vorstand
- Mannschaften
- Mitgliedschaft (inkl. Downloads wie Beitrittserklärung PDF)
- Trainingszeiten
- Spiel- und Trainingshallen
- Termine (als Seite; ggf. statischer Inhalt/Links)
- Chronik
- Erfolge
- Sponsoren
- Kontakt
- Impressum/Vereinsdaten
- Fotos

---

## Rollen / Subagents (Arbeitsmodell)

### Manager (Lead, integrator)
- bricht alles in kleine Tasks + Checkliste
- weist Write-Scope zu
- reviewed, merged, hält Konsistenz (Design/IA/SEO)

### Content-Importer
- Verantwortung: `scripts/fetch-legacy.mjs`, `assets/`, `legacy/` (gitignored), `content/pages/de`, `content/news/de`
- Liefert: vollständige Content-Sammlung + Asset-Downloads + Mapping-Liste

### Translator (DE→EN)
- Verantwortung: `content/pages/en`, `content/news/en`
- Liefert: vollständige EN-Übersetzung, konsistent & natürlich, ohne Halluzinationen
- Regeln: Eigennamen/Orte nicht „übersetzen“, Daten/Preise korrekt übernehmen, Links/Downloads intakt

### Builder (Frontend)
- Verantwortung: `src/` + `scripts/build.mjs` + Output nach `docs/`
- Liefert: Layout, Navigation, News, Gallery, responsive UI

### QA
- Liefert: Abnahme-Checkliste, Issues P0/P1/P2, A11y/SEO/Performance Report
- Blockt „fertig“, wenn P0 offen (Broken Nav, kaputte Links, unlesbar mobil, etc.)

---

## Master-Checklist (kleinteilig, handoff-fähig)

### 0) Projekt-Grundlagen
- [ ] `README.md` aktualisieren: Ziel, Commands, Deploy (GitHub Pages / `docs/`)
- [ ] `.gitignore` definieren: `legacy/`, `node_modules/`, `.cache/`, temp outputs
- [ ] `package.json` anlegen mit Scripts: `fetch`, `build`, `serve`, `check`
- [ ] Node-Version festlegen (z.B. `>=18`) in `package.json engines`

### 1) Legacy-Erfassung (Quelle: Joomla)
- [ ] Menüstruktur aus `https://www.bsc70linz.at/cms/` erfassen (alle URLs + Unterpunkte)
- [ ] URL-Mapping-Tabelle erstellen (Joomla URL → neuer Zielpfad DE/EN)
- [ ] `scripts/fetch-legacy.mjs` anlegen:
  - [ ] Seed-URLs definieren (Start + alle Menüpunkte + News Kategorien + Nachwuchs Unterseiten)
  - [ ] Pagination-Crawl für News-Kategorien implementieren (folgt „Weiter“ bis Ende)
  - [ ] Sammeln aller Artikel-URLs (dedupe)
  - [ ] Für jede Seite/Artikel: HTML laden, HTTP errors behandeln (retry/backoff)
  - [ ] Main-Content extrahieren (Cheerio): `#content_in` als primäre Quelle
  - [ ] Druck/E-Mail Actions entfernen (`ul.actions`, print/mailto Links)
  - [ ] Interne Links in canonical Form bringen (Joomla → neue Pfade)
  - [ ] Alle `img src` + `a href` Downloads (PDF) sammeln
  - [ ] Assets herunterladen nach `assets/` (stabile Dateinamen, Collision-Handling)
  - [ ] Erzeuge DE Markdown für Pages + News:
    - [ ] Frontmatter befüllen (title/slug/date/category/sourceUrl)
    - [ ] Body: HTML→Markdown via Turndown ODER HTML-Blöcke beibehalten (Entscheidung: **Turndown + HTML-Passthrough**)
- [ ] Import-Run dokumentieren (wie man neu importiert/inkrementell updated)

### 2) Übersetzung DE → EN (Subagent/AI-Workflow)
- [ ] Übersetzungs-Regeln festlegen (Glossar/Begriffe):
  - [ ] „BSC 70 Linz“, Hallen-Namen, Adressen, Personen bleiben exakt
  - [ ] „Trainingszeiten“ → “Training Times”, etc. (Begriffs-Map)
- [ ] EN-Struktur erzeugen:
  - [ ] Für jede DE-Page `content/pages/en/<slug>.md` anlegen
  - [ ] Für jede DE-News `content/news/en/<slug>.md` anlegen
- [ ] Übersetzen Seite für Seite (mit Review):
  - [ ] Titel/Teaser übersetzen
  - [ ] Body übersetzen (Links/Downloads unverändert)
  - [ ] Datums-/Zahlenformat konsistent (EN-Format definieren)
- [ ] Stichproben-Review: 20 zufällige News prüfen (Sinn, keine erfundenen Details)

### 3) Design-System (leichtgewichtig)
- [ ] CSS Variables definieren (Farben, Typo, Spacing, Radius, Shadow)
- [ ] Typography-Scale definieren (h1–h3, body, small)
- [ ] Komponenten-Styles:
  - [ ] Header + Navigation (Desktop)
  - [ ] Mobile Nav (Hamburger, focus-trap optional, ESC-close)
  - [ ] Footer (Kontakt/Impressum/Links)
  - [ ] Section Layout (max-width container, spacing)
  - [ ] Card (News preview)
  - [ ] Button/Link styles (primary/secondary)
- [ ] Accessibility-Basics:
  - [ ] sichtbarer Fokus
  - [ ] ausreichender Kontrast
  - [ ] skip-link im Header

### 4) Build-System (statisch nach `docs/`)
- [ ] `scripts/build.mjs` implementieren:
  - [ ] Templates laden (`layout.html` + partials)
  - [ ] Content laden (Pages + News) pro Sprache
  - [ ] Markdown rendern (Minimal-Renderer + HTML passthrough)
  - [ ] URL-Routing erzeugen (slug → Pfad)
  - [ ] Seiten generieren: `docs/de/<slug>/index.html` etc.
  - [ ] News generieren:
    - [ ] Listing: `/de/news/`, `/en/news/`
    - [ ] Kategorie-Listings: `/de/news/<category>/`
    - [ ] Detailseiten: `/de/news/<slug>/`
    - [ ] Sortierung nach Datum desc
  - [ ] Assets kopieren: `assets/` → `docs/assets/`
  - [ ] `docs/index.html` als Redirect zu `./de/`
- [ ] `npm run serve`:
  - [ ] lokaler Server auf `docs/` mit korrekten relativen Links testen

### 5) Seiten-Implementierung (IA + Inhalte)
Für jede Seite (DE & EN):
- [ ] `content/pages/<lang>/<slug>.md` vorhanden
- [ ] Seite im Nav verlinkt (korrekte Reihenfolge)
- [ ] Layout mobil/desktop geprüft
- [ ] Interne Links funktionieren
- [ ] PDFs/Downloads funktionieren

Konkrete Seiten:
- [ ] Start (Hero + Quick Links + letzte News)
- [ ] News (global + Kategorien)
- [ ] Nachwuchs (Landing)
- [ ] Nachwuchs: News Nachwuchs
- [ ] Nachwuchs: Kooperationen
- [ ] Nachwuchs: NW-Trainer
- [ ] Nachwuchs: Termine OÖ. Nachwuchs
- [ ] Vorstand
- [ ] Mannschaften
- [ ] Mitgliedschaft (inkl. Beitrittserklärung PDF)
- [ ] Trainingszeiten
- [ ] Spiel- und Trainingshallen (Map-Link/Adresse)
- [ ] Termine (statisch/Links; keine Sidebar-Widgets)
- [ ] Chronik
- [ ] Erfolge
- [ ] Sponsoren
- [ ] Kontakt (Mail/Telefon, optional Kontaktformular nur wenn gewünscht)
- [ ] Impressum/Vereinsdaten
- [ ] Fotos (Galerie)

### 6) Fotos/Galerie
- [ ] Foto-Assets strukturieren: `assets/photos/<album>/...`
- [ ] `content/photos/albums.json` pflegen
- [ ] Galerie-Seite:
  - [ ] Album-Liste
  - [ ] Album-Detail (Grid)
  - [ ] Lightbox (keyboard accessible: ESC close, arrow optional)
- [ ] Performance: Thumbnails (optional) oder CSS `object-fit` + sinnvolle Größen

### 7) QA / Definition of Done
Funktional:
- [ ] Navigation funktioniert auf Mobile/Tablet/Desktop
- [ ] Sprachumschalter funktioniert (DE↔EN) inkl. Fallback (wenn Seite nicht existiert → Sprache Home)
- [ ] Keine toten Links (intern + Downloads)
- [ ] News: Pagination (optional) oder zumindest performantes Listing bei 1000+ Posts
- [ ] Suche (optional): wenn implementiert, funktioniert clientseitig

A11y:
- [ ] Tab-Reihenfolge sinnvoll
- [ ] Fokus sichtbar
- [ ] Bilder haben Alt-Texte (mindestens Logo/Content-relevant)
- [ ] Headings korrekt (keine Sprünge ohne Grund)

SEO/Meta:
- [ ] pro Seite `<title>` + meta description (aus Frontmatter generieren)
- [ ] OpenGraph/Twitter basics (optional)
- [ ] `lang` attribute korrekt (`de`, `en`)

Performance:
- [ ] Bilder nicht unnötig riesig (komprimieren/resize wo nötig)
- [ ] CSS/JS minimal, keine großen Libraries im Runtime-Bundle

### 8) Deployment (GitHub Pages)
- [ ] GitHub Pages auf `main` / `docs/` konfigurieren
- [ ] Test: frischer Clone + `npm ci` + `npm run build` + Pages Preview ok
- [ ] README: Deploy-Hinweise + Content-Editing Workflow (News hinzufügen)

---

## Test Plan (konkret)
- Lokal:
  - `npm run fetch` (nur wenn Import gebraucht)
  - `npm run build`
  - `npm run serve`
- Manuell auf:
  - iPhone/Android Breite ~360–430px
  - Tablet ~768px
  - Desktop ~1280px+
- Pflichttests:
  - Startseite: CTA/Links, Sprachswitch
  - News: Listing, Kategorie, Detail, sehr alter Beitrag
  - Downloads: Beitrittserklärung PDF
  - Galerie: Lightbox, Keyboard
  - Kontakt/Impressum: alle Daten korrekt

---

## Assumptions
- Inhalte/Bilder/Downloads auf `https://www.bsc70linz.at/cms/` dürfen 1:1 übernommen werden (du betreibst die Seite).
- News-Historie wird in DE importiert und in EN per AI/Subagent übersetzt.
- Keine serverseitigen Features (Login, dynamische Tabellen) im v1; alles statisch.
