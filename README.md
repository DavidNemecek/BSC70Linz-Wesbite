# BSC 70 Linz Website (Relaunch)

Statische Website (Runtime: **HTML/CSS/JS**) mit Build-Tools in Node.js und Deployment via **GitHub Pages**.

Quelle der Inhalte: `https://www.bsc70linz.at/cms/` (Joomla)

## Struktur
- `src/` Layout/Templates, Styles, Runtime-JS
- `content/` Markdown für Seiten + News (DE/EN) + Redirects/Glossar
- `assets/` Bilder/PDFs (ohne führenden Slash in Content: `assets/...`)
- `scripts/` Import/Build/Checks (Node)
- `docs/` Build-Output (generiert, nicht eingecheckt)

## Lokal
- Install: `npm ci`
- Build: `npm run build`
- Serve: `npm run serve` (öffnet `http://localhost:5173`)
- Checks: `npm run check`

## Staging vs Prod (CNAME Switch)
Der Build schreibt `docs/CNAME` abhängig von `BSC_ENV`:
- `BSC_ENV=staging` → `bsc70linz.neyda.at` (default)
- `BSC_ENV=prod` → `bsc70linz.at`

Beispiel:
- `BSC_ENV=staging npm run build`
- `BSC_ENV=prod npm run build`
