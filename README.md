# BSC 70 Linz Website

Zweisprachige Vereinswebsite mit React, TypeScript und Vite. Tailwind CSS
liefert das Styling; GSAP und Lenis steuern die Animationen. Die Anmeldung
kann ein PDF mit jsPDF erzeugen.

## Entwicklung und Prüfung

Node.js **24 LTS, mindestens 24.22.1**, verwenden (siehe `engines` in `package.json`).

```sh
nvm install # optional, liest .nvmrc
npm ci
npm run dev
npm run lint
npm run build
npm run audit
npm run audit:production
npm run preview
```

`npm ci` installiert die im Lockfile geprüften Versionen. Der Build prüft
Frontend, Vite-Konfiguration und die Edge-Handler in `api/` mit TypeScript.
`npm run audit` berücksichtigt auch die Entwicklungswerkzeuge;
`audit:production` prüft die Produktionsabhängigkeiten.

## Veröffentlichung

Vercel baut `development` für <https://dev.bsc70linz.at> und `main` für
<https://www.bsc70linz.at>. Die Website wird aus `dist/` ausgeliefert.
Dependency-Kandidaten werden auf `updates` unter
<https://updates.dev.bsc70linz.at/> unabhängig geprüft, bevor sie nach `main`
übernommen werden. Betrieb, Schutzregeln und Nachweise beschreibt
[die Update-Automatisierung](.github/AUTOMATION.md).
`api/teams.ts`, `api/robots.ts` und `api/sitemap.ts` sind JavaScript
Edge-Funktionen. Die Anwendung verwendet weder PHP noch React Server Components.
`assets/uploads/*.php` sind archivierte Fehlermeldungen der alten Website und
werden nicht in den aktuellen Build übernommen.

### Coolify

Coolify verwendet das versionierte `Dockerfile` und den Node-Server unter
`server/coolify.mjs`. Die Anwendung lauscht intern auf Port `8080`; der
Container stellt zusätzlich `/health`, `/api/teams`, `/robots.txt` und
`/sitemap.xml` bereit und verwendet für unbekannte, routenartige Pfade den
Vite-SPA-Fallback. In Coolify sind daher Build-Strategie **Dockerfile**,
Dockerfile-Pfad `/Dockerfile`, Port `8080` und ein HTTP-Healthcheck auf
`/health` zu setzen. `PUBLIC_ORIGIN` muss auf die tatsächlich verwendete
öffentliche Domain zeigen.

Vercel bleibt bis zur erfolgreichen Coolify-Abnahme als manueller DNS-Fallback
bestehen. Die DNS-Umschaltung erfolgt erst nach Container-, API-, PDF- und
Browserprüfung.

## Abhängigkeiten und Sicherheit

Den Prüfstand und begründete Versionsausnahmen dokumentiert
[die Sicherheitsprüfung vom 25. Oktober 2026](security/dependencies-2026-10-25.md).
Bei Updates sowohl `package.json` als auch `package-lock.json` aktualisieren,
danach Installation, Lint, Build, beide Audits und Browserfunktionen prüfen.
Major-Upgrades zusätzlich gegen die jeweiligen Migrationshinweise prüfen.
