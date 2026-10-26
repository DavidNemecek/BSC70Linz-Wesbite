# Dependency- und Sicherheitsupdates

Die Freigabe des Owners steht in `Agents.md`. Automatisch übernommen werden nur
vom vertrauenswürdigen Controller erstellte Dependency-Kandidaten. Andere PRs
erhalten ebenfalls eine KI-Prüfung, werden aber nicht automatisch gemergt.

## Ablauf

1. Der Workflow **Researched dependency updates** prüft stündlich zur Minute 17
   den aktuellen `main` und den bestehenden Stand von `updates`.
2. npm-/OSV-Advisories und Veröffentlichungsdaten bestimmen mögliche Updates.
   Jede neue oder geänderte Paketversion im Lockfile muss mindestens sieben
   volle Tage alt sein. Eine bestätigte CVE in einer tatsächlich verwendeten
   Version erlaubt nur dem konkret notwendigen Fix eine Ausnahme.
3. Eine frische KI-Instanz recherchiert die exakten Versionen mit nachgewiesener
   Websuche auf Supply-Chain-Vorfälle und andere Probleme. Fehlende Suchbelege,
   unvollständige Abdeckung und ungeklärte Befunde blockieren den Kandidaten.
4. Lockfile-Auflösung, Audits, Installation ohne Lifecycle-Skripte, Dependency-
   Baum, Lint und Build laufen getrennt vom privilegierten Controller. Fremder
   Paket-Code läuft in kurzlebigen, eingeschränkten Containern ohne Secrets,
   Host-Prozesszugriff oder Schreibzugriff auf Laufzeit und Prüf-Nachweise.
5. Der Controller speichert die bestehende Produktion als unveränderliche
   Browser-Baseline. Danach veröffentlicht er den geprüften Kandidaten auf
   `updates` und wartet auf das passende Vercel-Deployment.
6. Ein separater Headless-Chromium-Lauf vergleicht
   <https://updates.dev.bsc70linz.at/> mit dieser Baseline. Er prüft zwölf
   Kombinationen aus Breite, Sprache und Theme sowie Navigation, Downloads,
   PDFs, echte API-/SEO-Endpunkte, Assets und Laufzeitfehler. Alle 96
   Screenshot-Paare werden außerdem von frischen KI-Aufrufen beurteilt.
7. Erst nach erfolgreichen Prüfungen öffnet der Controller den Promotions-PR
   nach `main`, startet dessen CI und PR-Review ausdrücklich und wartet auf
   Nachweise für genau diesen PR, Zielbranch und die beiden Commit-SHAs.
   GitHub erzwingt die erforderlichen Checks auch beim Merge.
8. Nach dem Merge werden Deployment-Identität, öffentliche Produktionsdomain
   und Browser-Verhalten erneut gegen die ursprüngliche Baseline geprüft.
   Eine bestätigte Regression führt zum Vercel-Rollback und einem GitHub-Issue.
   Der Git-Stand wird anschließend über einen geprüften Wiederherstellungs-PR
   mit dem zurückgerollten Produktionsstand abgeglichen.

Major-Upgrades dürfen diesen Ablauf durchlaufen. Kleine notwendige
Kompatibilitätskorrekturen sind begrenzt; eine KI darf weder Sicherheitsregeln
noch Workflows, Tests oder den Browser-Prüfer nach Belieben umschreiben.
Nicht zuordenbare Änderungen auf `updates` werden niemals überschrieben.
Unterbrochene eigene Läufe werden nur anhand authentifizierter GitHub-Nachweise
wiederaufgenommen.

## Konfiguration

Repository-Secrets:

| Name | Verwendung |
| --- | --- |
| `AI_API_KEY` | CodexLB-Zugriff für Recherche und Reviews |
| `AI_BASE_URL` | HTTPS-Responses-Endpunkt mit Websuche und Bildverarbeitung |
| `VERCEL_TOKEN` | Auf dieses Vercel-Projekt beschränkte Deployment-Prüfung und Rollback |

`DEPENDENCY_AUTOMATION_ENABLED=true` aktiviert Scans und automatische
Übernahmen. Jeder andere Wert deaktiviert sie. Der manuelle Modus `preflight`
bleibt zur Diagnose verfügbar. Secrets werden ausschließlich dem
vertrauenswürdigen Controller bzw. separaten Review-Jobs bereitgestellt.

GitHub Actions benötigt die Repository-Einstellung **Allow GitHub Actions to
create and approve pull requests** zum Erstellen eigener PRs. Die Automatisierung
erteilt selbst keine menschlichen Freigaben. Der Default-Workflow-Token bleibt
read-only; Schreibrechte werden nur den dafür vorgesehenen Jobs eingeräumt.

Der aktive Ruleset für `refs/heads/main` verlangt einen PR, einen aktuellen
Branch und diese Checks der GitHub-Actions-Integration:

- `security/ai-review`
- `Automation tests`
- `Application lint, build and audit`

Force-Push und Löschen sind gesperrt. Der Controller akzeptiert nur Regeln,
für die GitHub ausdrücklich bestätigt, dass sein tatsächlicher Token keinen
Bypass besitzt. Weitere acht Promotionsprüfungen werden intern erzwungen;
fachfremde PRs müssen keine Dependency-Promotion simulieren.

## Betrieb und Nachweise

- **Researched dependency updates → Run workflow → preflight** prüft Zugang,
  Schutzregeln und die Fähigkeit zur echten Websuche.
- **scan** führt bei aktivierter Variable den vollständigen Ablauf aus.
- **Independent PR review** kann mit einer offenen PR-Nummer manuell gestartet
  werden. Bot-erstellte PRs werden vom Controller ausdrücklich angestoßen.
- Controller-Artefakte heißen `dependency-controller-<run-id>` und bleiben 90
  Tage erhalten. Worker-Artefakte enthalten gebundene Prüfergebnisse,
  Screenshot-Hashes und vollständige Browserberichte und bleiben 30 Tage erhalten.
- Bei Fehlern zuerst das zugehörige Issue, den Workflow-Run und dessen
  Artefakte prüfen. Ein fehlender Nachweis ist keine Freigabe.
- Zum Stoppen neuer Übernahmen die Aktivierungsvariable auf `false` setzen.
  Einen laufenden Run während Produktionsprüfung oder Wiederherstellung nicht
  abbrechen, ohne den aktuellen Deployment- und Recovery-Stand zu prüfen.

Lokal mit dem gepinnten Node aus `.nvmrc`:

```sh
node --test .github/automation/*.test.mjs
npm ci --prefix .github/qa --ignore-scripts
node --test .github/qa/support.test.mjs
```

Die reale Container-Prüfung `sandbox-integration.mjs` benötigt einen Linux-x64-
Docker-Host, einen nicht privilegierten Benutzer und das in
`dependency-sandbox.mjs` festgelegte Image. Die CI führt diesen feindlichen
Testfall zusätzlich aus. Browser-Aufrufe stehen in [qa/README.md](qa/README.md).

## Grenzen

Websuche kann bekannte Angriffe finden, aber nicht beweisen, dass eine Version
keinen bislang unbekannten Schadcode enthält. Deshalb bleiben Wartefrist,
Isolation, unabhängige Prüfungen und Rollback zusätzliche Schranken.

Die Browserabnahme verwendet Chromium. Sie sendet keine echte Vereinsanmeldung
ab. PDF-Prüfungen kontrollieren Inhalt und Format über extrahierten Text.
Externe Dienste müssen erreichbar sein; ungeklärte Verbindungsfehler blockieren
die Freigabe. Bereits bestehende Layoutprobleme werden gegen die gespeicherte
Baseline beurteilt. Eine abweichende Prüfumgebung blockiert einen Bildvergleich.

Runtime- und Action-Pins sowie der Container-Digest gehören zur
vertrauenswürdigen Infrastruktur. Änderungen müssen deterministisch erzeugt,
recherchiert und unabhängig geprüft werden. Ein fehlender CVE-Fix oder eine
nicht unterstützte Migration wird gemeldet und blockiert, statt Schutzregeln
automatisch zu umgehen.
