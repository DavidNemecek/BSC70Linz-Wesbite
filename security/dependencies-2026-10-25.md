# Dependency- und Sicherheitsprüfung — 25. Oktober 2026

## Umfang und Ergebnis

Geprüft wurden die direkten npm-Abhängigkeiten, der vollständige Lockfile-Baum,
die Build-Konfiguration, die Edge-Handler und die in `dist/` ausgelieferten Assets.
Der anfängliche npm-Audit meldete 22 betroffene Pakete: 1 kritisch, 15 hoch,
5 mittel und 1 niedrig. Diese Einstufungen bezeichnen Paketmeldungen, keine
nachgewiesene Ausnutzung der Website.

Nach der Aktualisierung melden sowohl `npm audit` als auch
`npm audit --omit=dev` **0 bekannte Schwachstellen**. Der Stand gilt für die
zum Prüfzeitpunkt verfügbare npm-Advisory-Datenbank und ist keine Garantie
gegen unbekannte Sicherheitslücken.

## Aktualisierungen

Alle verbleibenden direkten Abhängigkeiten verwenden den aktuellen stabilen
`latest`-Release, mit den beiden unten dokumentierten Ausnahmen. Dazu gehören
React/React DOM 19.3.1, React Router 8.5.0, Vite 8.3.5, Tailwind CSS 4.3.3,
ESLint 10.13.0, Recharts 3.10.1, React Day Picker 10.0.2 und Sharp 0.35.5.
DOMPurify, eine indirekte jsPDF-Abhängigkeit, wurde auf 3.4.17 aktualisiert.
Auch die übrigen indirekten Abhängigkeiten wurden neu aufgelöst und geprüft.

Entfernt wurden das ungenutzte und mit Vite 8 inkompatible
`kimi-plugin-inspect-react`, die ungenutzten Pakete `@hookform/resolvers`,
`three`, `@types/three` und `zod`, das durch React Router 8 ersetzte
`react-router-dom` sowie die durch den Tailwind-Vite-Adapter bzw.
`tw-animate-css` ersetzten direkten PostCSS-/Autoprefixer-/Animationspakete.
Das Inspector-Plugin hatte Quellpfade in den Produktionsbuild eingefügt.

Für die Hauptversionswechsel wurden Router-Imports, Tailwind-Utilities und
Konfiguration, Chart- und Kalender-Typen angepasst. Gemeinsame Hooks und
Varianten wurden aus Komponentenmodulen ausgelagert, damit Fast Refresh und
der aktualisierte Linter korrekt arbeiten. Die TypeScript-Buildprüfung
schließt jetzt auch die Edge-Handler ein.

## Begründete Ausnahmen

- **TypeScript 6.0.3 statt 7.0.2:** Das aktuelle `typescript-eslint` 8.72.0
  unterstützt laut Peer-Abhängigkeit TypeScript `>=4.8.4 <6.1.0`.
  Eine erzwungene Installation würde diese geprüfte Kompatibilität verlassen.
  Auf TypeScript 7 wechseln, sobald der Parser dies offiziell unterstützt.
- **@types/node 24.19.2 statt 26.6.5:** Die Typen folgen der eingesetzten
  Node-24-LTS-Laufzeit. `engines.node` legt die unterstützte 24er-Reihe und mindestens 24.22.1 fest.
  Einen Wechsel auf Node 26 mit der Hosting-Laufzeit gemeinsam vornehmen.

`npm outdated` zeigt deshalb genau diese beiden Einträge an. Es wurden keine
Peer-Abhängigkeiten mit `--force` oder `--legacy-peer-deps` übergangen.

## Node.js-Sicherheitsrelease

Node.js 24.22.1 ist das Sicherheitsrelease vom 21. Oktober 2026 und behebt
unter anderem DNS-/TLS-Probleme und eine Brotli-Schwachstelle.
`.nvmrc` wählt diesen lokalen Prüfstand, `engines.node` verlangt
`>=24.22.1 <25`, und `.npmrc` verhindert Installationen auf älteren bzw.
abweichenden Node-Hauptversionen. Der Build protokolliert `node --version`,
sodass die tatsächlich verwendete Hosting-Version geprüft werden kann.
Vercel wählt innerhalb der konfigurierten Hauptversion automatisch den
bereitgestellten Minor-/Patchstand; der Hosting-Rollout selbst liegt bei Vercel.

## PHP2Shell und React2Shell

PHPs Meldung zu **CVE-2026-109618 / CVE-2026-109619** betrifft PHP-Laufzeiten,
die Webanfragen verarbeiten. In dieser Anwendung existieren eine Browser-SPA
und drei JavaScript-Edge-Handler, keine PHP-Laufzeit. Die drei `.php`-Dateien
im alten Asset-Archiv enthalten nur gespeicherte Joomla-Fehlermeldungen, keine
PHP-Tags; sie sind nicht Teil des aktuellen Builds. Ein npm-Update würde eine
etwaige separate PHP-Installation nicht patchen. Andere Server und der
Hostinganbieter liegen außerhalb dieser Repository-Prüfung.

React2Shell und die nachfolgenden RSC-Sicherheitsmeldungen betreffen React
Server Components bzw. deren Server-Deserialisierung. Die Anwendung verwendet
`createRoot`, `BrowserRouter` und keine RSC-Pakete oder Server-Function-Endpunkte.
Daraus ergibt sich nach der geprüften Architektur keine Betroffenheit durch
diese RSC-Lücken; React und Router wurden trotzdem aktualisiert.

DOMPurify wurde trotz fehlendem `doc.html()`-Aufruf im eigenen PDF-Code gepatcht.
Die PDF-Erzeugung verwendet Text- und Zeichenoperationen. Ein im Audit als
kritisch eingestuftes Paket bedeutet hier deshalb nicht automatisch einen
erreichbaren kritischen Angriffsweg.

## Wiederholbare Abnahme

```sh
npm ci
npm ls --all
npm run lint
npm run build
npm run audit
npm run audit:production
npm outdated
```

Im Browser prüfen: Startseite und Unterseiten bei 360/768/1280 Pixeln,
Hell-/Dunkelmodus, Deutsch/Englisch, Navigation und Anker, Anmeldung und
PDF-Download, Mitgliedsbeitrags-Infos. Nach einem Vercel-Deployment zusätzlich
`/api/teams`, `/robots.txt`, `/sitemap.xml` und den tatsächlichen Deploymentstatus
prüfen. Für Tailwind 4 gilt die dokumentierte Browser-Basislinie
Safari 16.4+, Chrome 111+ und Firefox 128+.

## Primärquellen

- [PHP-Sicherheitsmeldung](https://www.php.net/archive/2026.php#2026-10-21-1)
- [React: Critical Security Vulnerability in React Server Components](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components)
- [React: RSC-Sicherheitsmeldung vom Oktober](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3)
- [DOMPurify-Advisory](https://github.com/cure53/DOMPurify/security/advisories/GHSA-cg2g-xh64-v4q7)
- [React Router: Upgrade auf v8](https://reactrouter.com/upgrading/v8)
- [Vite-Migration](https://vite.dev/guide/migration)
- [Tailwind-Migration](https://tailwindcss.com/docs/upgrade-guide)
- [typescript-eslint-Paketmetadaten](https://registry.npmjs.org/typescript-eslint/8.72.0)
- [Node.js: Sicherheitsrelease Oktober 2026](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Vercel: Node-Versionen](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
