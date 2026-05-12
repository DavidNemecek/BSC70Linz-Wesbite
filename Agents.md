<!--
AGENTS.md – Hinweise für KI-Assistenten (ChatGPT/Codex) in diesem Repo.
Kurz, praxisnah, und auf saubere Software-Engineering-Standards ausgerichtet.
-->

# Agent Guidelines (Software Engineering Best Practices)

## Projektkontext (kurz)
- Dieses Repo enthält die Website/Homepage für **BSC 70 Linz**.
- Wenn du Annahmen über Tech-Stack/Build machst, belege sie durch vorhandene Dateien (z.B. `package.json`, Lockfiles, `Makefile`) – sonst nachfragen.
- Zielbild (wenn freigegeben): Relaunch/Erneuerung als **vanilla HTML/CSS/JavaScript** (keine Framework-Pflicht, keine komplizierte Build-Pipeline), aber so strukturiert, dass z.B. **News** später einfach erweiterbar sind.
- Inhalt/Assets-Quelle: alle Texte/Bilder/Infos kommen von `https://bsc70linz.at/` (bestehende Seite) und werden für die neue Seite übernommen.

## Nicht verhandelbar (Owner-Prioritäten)
- Runtime ist **nur HTML/CSS/JS**; Build/Import/Checks dürfen Dev-Tools (z.B. Node) nutzen.
- CI/CD muss Änderungen publizieren; bevor „fertig“ gesagt wird, muss die Live-Seite nach Deploy **sichtbar** geprüft werden (inkl. Wartezeit).
- GitHub Actions müssen **aktuell** gehalten werden (zuerst Updates, erst dann Workarounds).

## Subagents: Rollenmodell (Manager + Spezialisten)
- **Manager (Lead-Agent)**: priorisiert Tasks, verteilt Arbeit, hält Scope/DoD, integriert Änderungen, entscheidet bei Tradeoffs, sorgt für konsistente Umsetzung.
- **Responsive/UX-Analyst (Read-only)**: analysiert Layout/Usability auf Mobile/Tablet/Desktop; liefert Findings (P0–P2), Repro-Schritte, ggf. Screenshots/Breakpoint-Angaben.
- **Builder (Frontend)**: setzt Seiten/Komponenten in HTML/CSS/JS um; achtet auf Struktur/Erweiterbarkeit (z.B. News-Listing + Detail).
- **QA (Qualitätssicherung)**: prüft A11y/SEO/Performance/Links/Formulare; liefert Abnahmebericht und blockt „fertig“ bei P0-Problemen.
- **Content/Assets (optional)**: extrahiert/normalisiert Inhalte von `https://bsc70linz.at/` (Bilder, Texte, Downloads) und liefert sie in vereinbartem Repo-Format (z.B. `assets/`, `content/`).

## Subagents: Arbeitsregeln
- **Klare Write-Scopes**: Builder ändert UI/Code; QA/UX liefern primär Reports; Manager merged/integrated (oder weist gezielt Fixes zu).
- **Deliverables statt „Gefühl“**: jeder Task endet mit einem konkreten Ergebnis (Report/Checklist/Metriken/Änderungen in klar benannten Dateien).
- **Vanilla-first**: keine neuen Frameworks/Toolchains ohne explizite Entscheidung; bevorzugt statisches Hosting-fähig.
- **Reviewbarkeit**: kleine Diffs, keine massenhaften Reformatierungen, Änderungen nur taskbezogen.
- **Fertig heißt**: Navigation funktioniert, mobile-first Layout passt, keine toten Links, A11y-Basics eingehalten, Inhalte von `https://bsc70linz.at/` korrekt übernommen.
- **CI/CD-Pflichtabnahme via Subagent (immer!)**: Bevor der Manager „fertig“ sagt, muss ein **QA-Subagent** unabhängig prüfen:
  - letzter GitHub Actions Run (Pages Deploy) ist **completed/success**
  - Deployment ist **sichtbar** auf der Live-URL (nach Wartezeit; GitHub Pages braucht oft ~1–2 Minuten)
  - Seite/Änderung ist korrekt auf mehreren Viewports (z.B. ~360px, ~768px, ~1280px) und Assets laden ohne Fehler
  - wenn etwas nicht passt: Subagent liefert konkrete Findings + Fix-Vorschläge; Manager lässt korrigieren und lässt erneut prüfen
- **GitHub Actions Node-Version (immer!)**:
  - Zuerst immer prüfen, ob es ein **Update** der betroffenen Actions gibt, das die Runner-Änderung (z.B. Node 20 → Node 24) sauber unterstützt; dann die Workflow-Refs upgraden (z.B. `actions/checkout@v6`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`).
  - Falls (temporär) **kein Update verfügbar** ist: Workaround zulässig, z.B. `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` als **Mitigation** in der Workflow-`env`.
  - Workarounds sind **zeitlich befristet**: sobald ein Update verfügbar ist, Workaround entfernen und Actions upgraden.
  - Nach jedem CI-Run Logs auf Deprecation-Warnings prüfen; Warnungen sind zu behandeln (Update/Mitigation), nicht zu ignorieren.

## Wie AGENTS.md wirkt (Scope)
- Viele Agent-Tools lesen `AGENTS.md` automatisch aus dem **aktuellen Ordner und Elternordnern**; zusätzliche `AGENTS.md` in Unterordnern können Regeln **präzisieren/überschreiben**.
- Halte diese Datei kurz; wenn es später mehr Regeln braucht, lege lieber **zusätzliche** `AGENTS.md` in betroffenen Unterordnern an.
- Falls unterstützt, dürfen zusätzliche Regel-Dateien per `@./pfad.md` eingebunden werden (statt alles hier zu duplizieren).

## Grundprinzipien
- Arbeite **inkrementell**: kleine, nachvollziehbare Änderungen statt großer Refactors.
- **Respektiere bestehende Patterns** (Ordnerstruktur, Namenskonventionen, Code-Stil).
- **Keine unnötigen Abhängigkeiten** hinzufügen; bevorzuge Standardbibliotheken/vanilla.
- Ändere nur, was zur Aufgabe gehört; **keine „Drive-by“-Fixes** ohne Auftrag.

## Vorgehen im Repo
- Prüfe zuerst den aktuellen Stand: relevante Dateien suchen/lesen, dann gezielt ändern.
- Nutze schnelle Suche: bevorzugt `rg` (ripgrep) für Textsuche.
- Wenn Befehle/Build/Test existieren: **ausführen**, bevor du Änderungen als fertig markierst (und Fehler beheben, bis alles grün ist).
- Bei Unklarheiten, die nicht aus dem Code ersichtlich sind: **kurz nachfragen**, statt zu raten.

## Standard-Kommandos (falls vorhanden)
- Bevor du rätst: finde heraus, welches Tooling genutzt wird (z.B. `pnpm-lock.yaml` ⇒ `pnpm`, `package-lock.json` ⇒ `npm`, `yarn.lock` ⇒ `yarn`).
- Dokumentiere und verwende die im Repo vorhandenen Kommandos (typisch: Install/Dev/Lint/Test).
- Beispiele, wie sie in vielen Repos direkt in `AGENTS.md` stehen (nur nutzen, wenn passend zum Projekt):
  - Install: `pnpm install`
  - Dev: `pnpm run dev`
  - Lint: `pnpm run lint`
  - Test: `pnpm run test`
- Wenn CI vorhanden ist: orientiere dich an `.github/workflows/*` und spiegle die wichtigen Checks lokal.

## Code-Qualität
- Schreibe **lesbaren, wartbaren Code** (sprechende Namen, klare Struktur).
- Behandle Fehlerfälle sauber (Input-Validierung, sinnvolle Fehlermeldungen).
- Halte Funktionen/Komponenten klein; vermeide Duplikate (aber nicht über-abstrahieren).
- Passe Dokumentation an, wenn Verhalten/Setup sich ändert (`README.md`, Kommentare nur wenn nötig).

## Struktur & Wartbarkeit
- Vermeide unnötige Indirektion: keine „Mini-Helper“, die nur **einmal** verwendet werden.
- Vermeide übergroße Dateien/Module; neue Funktionalität lieber in passende neue Dateien/Module auslagern.

## Tests & Qualitätssicherung
- Wenn Tests vorhanden sind: **relevante Tests erweitern/aktualisieren**.
- Keine Tests vorhanden: nur dann neue hinzufügen, wenn es im Projekt bereits ein Test-Setup gibt.
- Beachte vorhandene Linter/Formatter; keine neuen Toolchains ohne klaren Nutzen.

## Definition of Done (kurz)
- Änderung erfüllt die Anforderung und ist minimal-invasiv.
- Relevante Checks laufen lokal durch (Build/Lint/Test, falls vorhanden).
- Doku angepasst, falls Setup/Verhalten geändert wurde.
- CI/CD-Abnahme ist erfolgt: erfolgreicher Workflow-Run + sichtbare Änderung auf der Live-URL + Responsive-Sanity-Check (durch QA-Subagent).

## Security & Datenschutz
- **Keine Secrets** (API-Keys, Tokens, Passwörter) einchecken oder ausgeben.
- Vermeide unsichere Defaults (z.B. ungefiltertes HTML/JS-Injection, `eval`).
- Für Web-Inhalte: Eingaben/Parameter sanitizen/validieren, wenn dynamisch verarbeitet.

## Web-spezifisch (Website)
- Achte auf **Accessibility** (Semantik, Labels, Kontrast, Tastaturbedienung).
- Achte auf **Performance** (optimierte Assets, keine unnötigen großen Libraries).
- Achte auf **Responsiveness** (mobile-first, sinnvolle Breakpoints).
- Achte auf **SEO Basics** (Titel/Meta, saubere Überschriftenstruktur), sofern relevant.

## Git/Review-Qualität
- Änderungen sollen reviewbar sein: klare Diff-Struktur, keine massenhaften Format-Umbrüche.
- Keine `git commit`/Branch-Aktionen, außer ausdrücklich gewünscht.

## Kommunikation im Output
- Antworte kurz und konkret: **Was wurde geändert**, **wo** (Dateipfade), **wie testen**.
- Nenne Annahmen explizit, wenn etwas nicht aus dem Repo ableitbar ist.
