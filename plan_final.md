# Plan FINAL: Relaunch BSC 70 Linz Website (Statisch, Vanilla Runtime, GitHub Pages, DE+EN)

## 0) Zielbild (Definition of Done)
Die Website gilt als **fertig**, wenn:
- Alle Inhalte/Assets von `https://www.bsc70linz.at/cms/` übernommen sind (Texte, Bilder, Downloads) und korrekt dargestellt werden.
- Alle Menüpunkte der aktuellen Seite im neuen System vorhanden sind (DE + EN).
- Navigation, Sprache (DE/EN), News, Galerie und Downloads funktionieren auf Mobile/Tablet/Desktop.
- Es gibt keine „P0“-Probleme: kaputte Navigation/Links/Downloads, unlesbares Mobile-Layout, fehlerhafte Language-Switches, News-Detailseiten nicht erreichbar.
- Deployment ist reproduzierbar (Build → `docs/` → GitHub Pages) und unterstützt **Staging** und später **Prod** per CNAME-Switch.

## 1) Harte Constraints (nicht verhandelbar)
- Runtime (deployte Seite): **nur HTML, CSS, JavaScript**.
- Node.js ist erlaubt **nur** als Import-/Build-/Check-Tool (Dev-Tooling).
- Quelle der Inhalte: ausschließlich `https://www.bsc70linz.at/cms/` (Joomla).
- Hosting: **GitHub Pages**.
- Security/Updates: Es wird **immer die aktuellste stabile Version** (mindestens aktuelle LTS) der verwendeten Tools/Dependencies genutzt; Abhängigkeiten werden regelmäßig aktualisiert, um Sicherheitslücken zu vermeiden.
- Domains:
  - Staging: `bsc70linz.neyda.at`
  - Prod später: `bsc70linz.at`
  - Deployment-Strategie: **GitHub Pages + CNAME Switch** (pro Umgebung unterschiedlicher `docs/CNAME`).

## 2) Entscheide und fixe Regeln (damit niemand später rät)
### 2.1 URL-/Pfad-Regeln
- Neue Seite nutzt Sprachpfade: `/de/...` und `/en/...`.
- `docs/index.html` leitet auf `/de/` weiter.
- Content speichert Asset-Pfade **ohne führenden Slash**: `assets/...`.
- Build darf Asset-Pfade final als `/assets/...` schreiben (Custom-Domain ok) oder relativ; Entscheidung im Build zentral.

### 2.2 Slug-Regeln (kritisch für Language-Switch)
- **DE und EN teilen denselben `slug`** pro Seite/News.
- Slugs sind stabil (nach Import nicht mehr ändern, außer bewusst mit Redirect-Update).
- Slugs sind lowercase, ASCII, `-` als Trenner, keine Umlaute (ä→ae, ö→oe, ü→ue, ß→ss).

### 2.3 Navigation
- Navigation wird aus Content-Metadaten generiert:
  - `navGroup` (Top-Level / Dropdown)
  - `navOrder` (Sortierung innerhalb Gruppe)
  - `navLabel` optional (Anzeige-Text)
- Für Dropdowns (z.B. „Nachwuchs“) wird `navGroup` genutzt; es gibt **keinen** separaten manuellen Menü-Editor.

### 2.4 Übersetzung (DE → EN)
- EN-Inhalte werden „Seite für Seite“ erstellt (Subagent/AI-Workflow).
- Jede EN-Datei muss `translatedFrom` enthalten und `translationStatus` (`draft` oder `reviewed`).
- Harte Regel: **keine neuen Fakten** (Namen/Daten/Ergebnisse/Orte dürfen nicht erfunden werden).

## 3) Repo-Struktur (Source vs Deploy)
### 3.1 Ordner
- `src/` Templates/Styles/JS (Source)
- `content/` Pages/News/Navigation/Glossar/Redirects (Source)
- `assets/` Bilder/PDFs/Fotos (Source)
- `scripts/` Import/Build/Check (Dev-Tools)
- `docs/` Deploy-Output (GitHub Pages)
- `legacy/` optional: rohe HTML-Dumps (immer `.gitignore`)

### 3.2 Erwartete Dateien
- `package.json` (Scripts: `fetch`, `build`, `serve`, `check`)
- `.gitignore` (mindestens `legacy/`, `node_modules/`)
- `README.md` (How to build/deploy/content edit)

## 3.3 Theme-/CSS-Switching (Design schnell austauschbar) [P0]
Ziel: Designs schnell wechseln können, ohne Komponenten-Styles zu duplizieren.

Regeln:
- `base.css` enthält **Komponenten/Layout/Reset** (stabil, kaum je pro Theme ändern).
- Jedes Theme ist **eine separate CSS-Datei**, die primär **CSS-Variablen** setzt/überschreibt.
- Runtime lädt immer `base.css` + genau **ein** Theme (`<link id="theme">`).

Struktur (Source):
- `src/styles/base.css`
- `src/styles/themes/default.css`
- `src/styles/themes/dark.css` (Beispiel)

Struktur (Deploy):
- `docs/assets/css/base.css`
- `docs/assets/css/themes/<theme>.css`

HTML-Head (verpflichtend):
```html
<link rel="stylesheet" href="/assets/css/base.css">
<link rel="stylesheet" href="/assets/css/themes/default.css" id="theme">
```

Theme wechseln (optional, JS):
```js
// src/scripts/theme.js
const themeLink = document.getElementById("theme");
const saved = localStorage.getItem("theme");
if (saved) themeLink.href = `/assets/css/themes/${saved}.css`;

export function setTheme(themeName) {
  themeLink.href = `/assets/css/themes/${themeName}.css`;
  localStorage.setItem("theme", themeName);
}
```

## 4) Content-Modelle (decision-complete)
### 4.1 Pages (Markdown)
Pfad:
- DE: `content/pages/de/<slug>.md`
- EN: `content/pages/en/<slug>.md`

Frontmatter (Pflichtfelder):
```yaml
---
title: "Trainingszeiten"
slug: "trainingszeiten"
navGroup: "verein"
navOrder: 50
navLabel: "Trainingszeiten"
translationStatus: "reviewed" # DE default: reviewed; EN: draft/reviewed
translatedFrom: "content/pages/de/trainingszeiten.md" # nur EN
---
```

Body:
- Markdown-Subset (Überschriften, Absätze, Listen, Links, Bilder) + HTML-Passthrough.

### 4.2 News (Markdown)
Pfad:
- DE: `content/news/de/<slug>.md`
- EN: `content/news/en/<slug>.md`

Frontmatter (Pflichtfelder):
```yaml
---
title: "Titel"
slug: "titel-slug"
date: "YYYY-MM-DD"
category: "news" # news|bundesliga|ooe-meisterschaft|turniere|nachwuchs|mitglieder
teaser: "Kurztext..."
heroImage: "assets/uploads/..."
sourceUrl: "https://www.bsc70linz.at/cms/index.php/..."
translationStatus: "draft"
translatedFrom: "content/news/de/titel-slug.md"
---
```

### 4.3 Galerie
- Bilder: `assets/photos/<album-slug>/*`
- Index: `content/photos/albums.json`
  - Felder: `albumSlug`, `title`, `date`, `cover`, `description`, `images[]`

### 4.4 Legacy Redirects
- Datei: `content/legacy-redirects.json`
  - Key: Joomla-Pfad (inkl. Query wenn nötig) oder normalisierte ID
  - Value: neuer Pfad (DE Default, optional EN)

### 4.5 Glossar
- Datei: `content/glossary.json`
  - `doNotTranslate[]` (Namen/Hallen/Adressen)
  - `terms[]` (DE→EN fest)

## 5) Import (Joomla → content/assets) – `scripts/fetch-legacy.mjs`
Ziel: Vollständiger, deterministischer Import, reproduzierbar.

### 5.1 Import-Checkliste (kleinstufig)
- [ ] Seed-URL fixieren: `https://www.bsc70linz.at/cms/`
- [ ] Menüstruktur automatisch ermitteln:
  - [ ] Hauptmenü-Links extrahieren
  - [ ] Untermenüs extrahieren
  - [ ] Liste deduplizieren
- [ ] News-Kategorien finden (News, Bundesliga, OÖ Meisterschaft, Turniere, Nachwuchs, Mitglieder)
- [ ] News-Pagination crawlen:
  - [ ] „Weiter/Nächste Seite“ erkennen
  - [ ] alle News-Detail-URLs sammeln
  - [ ] Dedupe über alle Kategorien
- [ ] HTTP Layer:
  - [ ] Concurrency-Limit (z.B. 3–5)
  - [ ] Retry bei 429/5xx
  - [ ] Timeout pro Request
  - [ ] Logging: URL + Status
- [ ] HTML speichern (optional) nach `legacy/` (nur Debug; `.gitignore`)
- [ ] Content Extraction:
  - [ ] Hauptcontent-Selector fixieren (z.B. `#content_in`)
  - [ ] Print/Mail-Actions entfernen
  - [ ] Breadcrumb/Sidebar aus Content entfernen
- [ ] Metadata Extraction:
  - [ ] Page/News Titel extrahieren
  - [ ] News Datum extrahieren und normalisieren (`YYYY-MM-DD`)
  - [ ] Category ableiten
  - [ ] Teaser ableiten (erste sinnvolle Passage, max X Zeichen)
- [ ] Slugify:
  - [ ] Slug aus Titel ableiten
  - [ ] Slug-Kollisionen behandeln (Suffix `-2`, `-3` etc.)
  - [ ] Slug-Liste persistent halten (damit Re-Import stabil bleibt)
- [ ] Asset Discovery:
  - [ ] `img src` sammeln
  - [ ] Download-Links sammeln (PDF, DOC, etc.)
  - [ ] CSS background images optional
- [ ] Asset Download:
  - [ ] Zielpfade festlegen (`assets/uploads/...`, `assets/img/...`)
  - [ ] Content-Type checken
  - [ ] Dedupe (gleiche URL → gleiche Datei)
  - [ ] Kollisionen lösen (Hash-Suffix)
- [ ] Link Rewriting (in DE Content):
  - [ ] interne Joomla Links → neue Pfade
  - [ ] relative/absolute Joomla Links normalisieren
  - [ ] externe Links unverändert lassen
- [ ] Markdown Erzeugung:
  - [ ] Seiten als `content/pages/de/*.md`
  - [ ] News als `content/news/de/*.md`
  - [ ] HTML→Markdown (Turndown) + HTML-Passthrough für schwierige Blöcke
- [ ] Redirect Mapping erzeugen:
  - [ ] für jede importierte Seite: Joomla URL → neuer Pfad
  - [ ] für jede News Detailseite: Joomla URL → neuer Pfad
  - [ ] speichern nach `content/legacy-redirects.json`
- [ ] Import-Report ausgeben:
  - [ ] Anzahl Pages
  - [ ] Anzahl News
  - [ ] Anzahl Assets
  - [ ] Fehlerliste (URLs, die nicht importiert wurden)

## 6) Übersetzung (DE → EN)
Ziel: Vollständige EN-Version ohne Halluzinationen.

### 6.1 Übersetzungs-Workflow (kleinstufig)
- [ ] `content/glossary.json` initial anlegen
- [ ] EN Skeleton erstellen:
  - [ ] jede DE Page → EN Page Datei anlegen
  - [ ] jede DE News → EN News Datei anlegen
- [ ] Pro Datei übersetzen:
  - [ ] Titel übersetzen
  - [ ] Teaser übersetzen
  - [ ] Body übersetzen (Links/Downloads unverändert)
  - [ ] `translatedFrom` setzen
  - [ ] `translationStatus: draft` setzen
- [ ] Review-Gate:
  - [ ] Stichprobe Pages: 20 random → `reviewed`
  - [ ] Stichprobe News: 50 random + 10 sehr alte Posts → `reviewed`
  - [ ] Glossar-Compliance prüfen (Terms und do-not-translate)
  - [ ] No-new-facts Check (manuell in Stichprobe)

## 7) Build (content/src → docs) – `scripts/build.mjs`
Ziel: Statische Ausgabe in `docs/`, GitHub Pages ready.

### 7.1 Build-Checkliste
- [ ] Template-System (build-time):
  - [ ] `layout.html` laden
  - [ ] `partials/header.html` laden
  - [ ] `partials/footer.html` laden
  - [ ] Platzhalter definieren: title, meta, nav, content, footer
- [ ] Markdown Rendering:
  - [ ] Minimal-Parser implementieren
  - [ ] HTML-Passthrough sicher durchreichen
- [ ] Navigation generieren:
  - [ ] Content-Metadaten einlesen
  - [ ] nach `navGroup` gruppieren
  - [ ] innerhalb Gruppe nach `navOrder`
  - [ ] aktive Seite markieren
- [ ] Pages generieren:
  - [ ] `docs/de/<slug>/index.html`
  - [ ] `docs/en/<slug>/index.html`
- [ ] News generieren:
  - [ ] Listing: `docs/de/news/index.html` und `docs/en/news/index.html`
  - [ ] Kategorie Listing: `docs/<lang>/news/<category>/index.html`
  - [ ] Detail: `docs/<lang>/news/<slug>/index.html`
  - [ ] Sortierung nach Datum (desc)
  - [ ] Pagination fix (z.B. 20 pro Seite):
    - [ ] `.../page/2/`, `.../page/3/` etc.
- [ ] Language switch implementieren:
  - [ ] Symmetrische Slugs nutzen
  - [ ] Fallback auf Sprach-Home wenn Ziel fehlt
- [ ] Assets kopieren:
  - [ ] `assets/` → `docs/assets/`
- [ ] CSS Themes kopieren:
  - [ ] `src/styles/base.css` → `docs/assets/css/base.css`
  - [ ] `src/styles/themes/*.css` → `docs/assets/css/themes/*.css`
- [ ] Theme-Link im Layout:
  - [ ] `base.css` immer einbinden
  - [ ] Default Theme (`default.css`) einbinden und `id="theme"` setzen
- [ ] SEO / Meta:
  - [ ] `<title>` aus Frontmatter
  - [ ] meta description aus Teaser (fallback)
  - [ ] `hreflang` Links (DE/EN)
- [ ] `docs/sitemap.xml` generieren:
  - [ ] alle DE URLs
  - [ ] alle EN URLs
- [ ] `docs/robots.txt` generieren
- [ ] GitHub Pages Hygiene:
  - [ ] `docs/.nojekyll` schreiben
  - [ ] `docs/CNAME` schreiben (Umgebungsabhängig)
- [ ] Legacy Redirect:
  - [ ] `docs/404.html` generieren
  - [ ] `redirect-404.js` einbinden
  - [ ] `content/legacy-redirects.json` in `docs/` kopieren

## 8) QA / Checks – `scripts/check.mjs` + manuell
### 8.1 Automatische Checks (npm run check)
- [ ] Interne Links in `docs/` crawlen (broken links report)
- [ ] Check: jede News hat `date`, `slug`, `category`
- [ ] Check: keine führenden `/assets` in Source-Content (oder konsistent)
- [ ] Check: `translatedFrom` existiert für EN Dateien
- [ ] Check: `translationStatus` existiert überall
- [ ] Check: Glossar Begriffe (automatisch) in EN nicht verletzt (basic string checks)
- [ ] Security: Dependency-Check (z.B. `npm audit`) läuft ohne kritische Findings vor Release

### 8.2 Manuelle Abnahme (P0)
- [ ] Mobile 360px:
  - [ ] Header/Nav bedienbar
  - [ ] Text lesbar
  - [ ] Buttons/Links gut tappbar
- [ ] Tablet 768px:
  - [ ] Layout bricht nicht
- [ ] Desktop 1280px:
  - [ ] Navigation + Footer ok
- [ ] News:
  - [ ] Listing + Kategorie + Detail
  - [ ] Pagination funktioniert
  - [ ] sehr alter Beitrag funktioniert
- [ ] Downloads:
  - [ ] Mitgliedschaft/Beitrittserklärung PDF öffnet
- [ ] Galerie:
  - [ ] Albumliste
  - [ ] Lightbox: ESC close, Fokus ok
- [ ] 404/Redirect:
  - [ ] alte Joomla URL simulieren → Redirect greift (mindestens Menü + News)

## 9) Deployment (GitHub Pages) inkl. Staging/Prod
### 9.1 Repo/Pages Setup
- [ ] GitHub Pages aktivieren (Quelle: `main` + `/docs`)
- [ ] HTTPS erzwingen

### 9.2 Staging Domain
- [ ] DNS für `bsc70linz.neyda.at` konfigurieren
- [ ] GitHub Pages Domain auf `bsc70linz.neyda.at` setzen
- [ ] `docs/CNAME` = `bsc70linz.neyda.at`

### 9.3 Prod Domain (später)
- [ ] (MANUELL, letzter Schritt) DNS für `bsc70linz.at` konfigurieren
- [ ] GitHub Pages Domain auf `bsc70linz.at` umstellen
- [ ] `docs/CNAME` = `bsc70linz.at`

### 9.4 Workflow (Build/Publish)
- [ ] GitHub Actions Workflow anlegen:
  - [ ] Trigger: Push auf `main`
  - [ ] Step: `npm ci`
  - [ ] Step: `npm run build`
  - [ ] Step: Commit/Push aktualisiertes `docs/` (oder alternative: Pages Artifact Deploy)
  - [ ] Step: Umgebung wählen (Staging vs Prod) und `docs/CNAME` entsprechend setzen
- [ ] Dokumentieren, wie man Prod aktiviert (z.B. Tag/Release/Manual Dispatch)
- [ ] Actions aktuell halten (Node 20 → Node 24 Deprecation etc.):
  - [ ] Immer zuerst Actions-Versionen prüfen/aktualisieren (z.B. `actions/checkout`, `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`)
  - [ ] Falls kein Update verfügbar ist: temporäre Mitigation via Workflow-`env` (z.B. `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`)
  - [ ] Mitigations wieder entfernen, sobald Updates verfügbar sind
  - [ ] Nach jedem Deploy-Run Logs auf Deprecation-Warnings prüfen und behandeln

### 9.5 Live-Validierung (nach Deploy)
GitHub Pages braucht oft ~1–2 Minuten, bis Änderungen sichtbar sind.
- [ ] Workflow-Run ist `completed/success`
- [ ] Live-URL liefert `200` und zeigt den neuen Stand (nicht aus Cache/alt)
- [ ] Smoke-Check auf 3 Viewports (ca. 360px / 768px / 1280px)
- [ ] Wenn nicht sichtbar: 1–2 Minuten warten, hard refresh, erneut prüfen; erst dann als Fehler behandeln

## 10) Risiken + Gegenmaßnahmen (damit es nicht kippt)
- Repo wird groß (viele News + Bilder):
  - [ ] Asset-Budget definieren (max px, max MB)
  - [ ] Bilder komprimieren/resizen (build-time Script)
  - [ ] Keine unnötigen Duplikate speichern
- Übersetzung komplett (DE+EN, News-Historie):
  - [ ] Mindestqualität über Stichproben-Review absichern
  - [ ] `translationStatus` konsequent nutzen
  - [ ] Glossar früh festlegen
