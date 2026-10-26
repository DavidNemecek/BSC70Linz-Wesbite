# Independent browser QA

This Node 24 harness has its own dependencies and lockfile. It imports no app
modules and requires no changes to the application's package/lock or build.
Run it from the repository root. An unsuccessful check exits 1; a successful
run exits 0. Evidence is always written to a new, empty output directory's
`result.json` (except malformed CLI arguments or an unwritable/existing report).
The harness never updates or accepts a baseline automatically.

## Install

Use the Node version pinned in `.github/qa/.nvmrc` (24.22.1),
`pdftotext` (Ubuntu package `poppler-utils`), `fc-list` (fontconfig)
and the system libraries/fonts required by Playwright Chromium. Install on the
same pinned OS/container image for capture and verification. Keep browser caches
outside uploaded evidence; the following cache is local to this harness:

```sh
npm ci --prefix .github/qa --ignore-scripts
PLAYWRIGHT_BROWSERS_PATH="$PWD/.github/qa/.browsers" \
  .github/qa/node_modules/.bin/playwright install --with-deps chromium
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.github/qa/.browsers"
node --test .github/qa/support.test.mjs
```

Exact direct dependencies, independently checked against the npm registry on
2026-10-26; each was the newest stable release at least seven days old:

- [playwright 1.64.1](https://registry.npmjs.org/playwright): published 2026-10-14T11:54:49.998Z.
- [pixelmatch 8.0.0](https://registry.npmjs.org/pixelmatch): published 2026-10-06T09:14:23.921Z.
- [pngjs 7.0.0](https://registry.npmjs.org/pngjs): published 2023-02-20T06:59:21.772Z.

The lockfile also pins Playwright's matching core package. Recheck registry
publication dates when updating this independent QA toolchain; application
dependency updates should not also change the QA toolchain/baseline.

## Interface

Compare two live deployments before changing production:

```sh
node .github/qa/browser.mjs \
  --baseline-url https://www.bsc70linz.at \
  --candidate-url https://bsc-70-linz-wesbite-git-updates-davidnemeceks-projects.vercel.app \
  --output .github/qa/artifacts/pre-production
```

**Before changing main/production**, capture its immutable baseline:

```sh
node .github/qa/browser.mjs --baseline-url https://www.bsc70linz.at \
  --capture-only --output .github/qa/artifacts/before-production
```

Preserve that **whole directory** as an immutable, trusted CI artifact. After
changing production, download that artifact and compare without fetching the
old URL again (it now serves the changed deployment):

```sh
node .github/qa/browser.mjs \
  --baseline-dir .github/qa/artifacts/before-production \
  --candidate-url https://www.bsc70linz.at \
  --output .github/qa/artifacts/after-production
```

`--baseline-dir` and `--baseline-url` are mutually exclusive. Capture-only uses
only `--baseline-url`, without a candidate. URLs must be origins, without paths,
queries, fragments or credentials. HTTPS is required on `bsc70linz.at`, its
subdomains, and subdomains of `vercel.app`; a nondefault public port is rejected.
`--local` additionally permits `localhost`, `127.0.0.1` and `::1` over HTTP(S).
Public redirects and browser resources are checked too. The existing registration
iframe may load HTTPS resources from `formular.vereinsplaner.com` and
`cdn.vereinsplaner.at`; these are never accepted as top-level target arguments.

## Coverage and gate

All 12 combinations of widths **360/768/1280**, languages **de/en**, and themes
**light/dark** are checked. The viewport is 900 CSS pixels high, DPR 1, locale
de-AT, timezone Europe/Vienna. Both sides run in one Chromium process and reuse
the same browser context for each variant in a live comparison. Three variants
run concurrently. Fresh pages separate real functional checks from screenshots.

- Direct loads and full-page screenshots of `/`, `/news`, `/anmeldung`,
  `/chronik`, `/impressum`, `/datenschutz`, `/anfahrt/solarcity`, and
  `/anfahrt/auhof`: the seven secondary URLs expand App's parameterized hall
  route. This yields 96 screenshots per side and 96 diff images.
- Actual SPA links to all six linked secondary pages; all six section anchors
  from subpages and repeated on home; footer anchor; responsive menu closing,
  short 640-pixel menu/CTA access and logo-home behavior; real language/theme
  controls and persistence through reload; all fee disclosures, single-open
  state and closing. Outcomes are compared as well as asserted individually.
  Anchor measurements wait for image decode and settled scrolling. Cross-page
  jumps must bring the target section's lead-in into the viewport (−12…719px);
  repeated anchor clicks must align its top within 12px. Raw positions remain
  in evidence; functional equality compares successful reachability rather than
  asynchronous scroll coordinates. Static page dimensions/pixels still compare
  exactly.
- Two real PDF downloads, one per language, through the actual download button.
  Checks PDF magic/EOF, minimum size and extracted membership/annual fee/bank
  content with `pdftotext`; compares normalized extracted text between sides.
  Random PDF document IDs/creation dates do not affect this comparison.
  `completion.pdfs[lang]` records attempted/retrieved/parsed/validated stages.
  Text comparisons require retrieved and parsed captures on both sides; missing
  evidence fails as `PDF <lang> capture incomplete`, never as a text difference.
- Every registration visit waits for a visible input, the iframe's network-idle
  state and loaded fonts before navigating away or downloading the PDF. The
  language/theme init script runs only in the top frame; runtime observation
  still includes iframe exceptions and failed requests.
- All six 480×640 portraits, all document images decoded, headings, description,
  canonical/current host and hidden news noindex. Semantic evidence includes
  links, image sources, headings and document dimensions. Existing overflow is
  permitted only when its recorded dimensions match the candidate exactly.
- Page exceptions, console errors/warnings, failed requests and HTTP errors fail
  the run; responses/assets are recorded. Only `net::ERR_ABORTED` on navigation
  requests (cancelled navigation/download) is excluded, together with an aborted
  known theme-logo fetch proven no longer referenced by any document image. The
  latter are recorded separately; replacement images must still decode. No
  general network-error suppression or console allowlist is used.
  Page errors retain a bounded original `stack` (8192 characters), `message`
  (2048), `scriptURL` (2048), `line`, `column` and the existing `phase`. The script
  URL is extracted only from the throwing stack frame; anonymous/eval/unknown
  origins stay null. The event's `url` is top-page context, **not script-origin
  evidence**. Consumers must validate `scriptURL` against their site allowlist
  and checked origin; neither that page URL nor a first-party caller lower in a
  stack proves origin.
  HTTP and failed-request events also include `resourceType` and `frameURL` when
  available. All these events still fail the runtime-clean gate.
- Real unmocked `/api/teams`, `/robots.txt` and `/sitemap.xml` on both hosts;
  checks response types/status, teams schema/count/values and rendered team names,
  exact sitemap routes (excluding news), and the **response host's** absolute
  URLs in robots/sitemap. Host names are normalized only for canonical comparison;
  live API content is not required to be byte-identical between deployments.

Screenshots wait for fonts/images, naturally scroll through the complete page
to trigger GSAP reveals, return to the top, and use a controlled Playwright
clock. The clock advances existing GSAP/Lenis/hero-canvas code without hiding it
or overriding opacity/transform styles. CSS animations are finished/disabled by
Playwright's screenshot option, caret hidden, reduced-motion preference enabled.
There are **no masks**. The only data substitution is `/api/teams` on the visual
page: its complete successful baseline response is saved in `teams-fixture.json`
and used on both sides. Functional pages and API probes remain live/unmocked.

Pixelmatch uses a tight **0.05 perceptual color threshold**, includes antialias
pixels, and permits **zero** pixels beyond that threshold; any image dimension
change fails. Diff PNGs are always emitted, including successful comparisons.
Semantic/functional differences fail independently of screenshot tolerance.

The JSON contains timestamps, URLs, runtime/browser/OS/font fingerprints,
tool versions, full check outcomes/counts/errors, route/functional/PDF evidence,
asset responses, and SHA-256 hashes of every evidence artifact. A stored baseline
must be a successful complete capture-only run, with unchanged artifact hashes
and exactly matching harness/lock/browser/Node/OS/font/settings metadata. Its
manifest hash is recorded in the new result. This detects damaged/changed files;
authenticating and retaining the trusted baseline artifact is the parent's job.

## Prove regression rejection locally

The optional read-only local proxy forwards public production GET requests. It
rewrites robots/sitemap to the local response host, and can inject a conspicuous
H1 color change and/or break fee control clicks without touching application
source. It never submits registrations. Start it in a separate shell:

```sh
node .github/qa/regression-proxy.mjs --upstream https://www.bsc70linz.at \
  --port 4387 --regression both
node .github/qa/browser.mjs --local --baseline-url https://www.bsc70linz.at \
  --candidate-url http://127.0.0.1:4387 \
  --output .github/qa/artifacts/injected-regression
```

Use `--regression none` for a control, or `visible`/`functional` separately. The
combined regression must exit 1 with pixel and functional failures. `support.test.mjs`
also tests target rejection, single-pixel/dimension changes and baseline tampering.

## Limits

This is a Chromium regression gate, not a cross-browser/accessibility/performance
audit. It does not submit the real third-party registration form, test mail/tel or
external destinations, validate every API field, assess API freshness beyond a
valid update date, or prove semantic PDF equivalence beyond extracted text.
Initial cross-page anchor alignment is checked for target visibility, not exact
top alignment; repeating the anchor checks top alignment.
Third-party iframe availability/content changes can fail the run: no fallback
snapshot or automatic masking accepts those changes. A runner OS, font, browser,
Node or harness update needs an intentional new baseline **before** deployment.
Exit 0 establishes only this harness's checks; the parent must separately verify
deployment identity, CI status, branch protections, rollout and the full pipeline.

## Implementation validation, 2026-10-26

Before the iframe initialization/readiness fix, the harness was exercised with
Node 24.22.1 and its pinned Chromium 156:

- Production `https://www.bsc70linz.at` capture-only: **113/113 checks passed**, all
  12 variants, 96 screenshots and both actual PDFs. Evidence:
  `artifacts/baseline-verified/result.json`.
- Updates alias `https://bsc-70-linz-wesbite-git-updates-davidnemeceks-projects.vercel.app`,
  using the stored production baseline: **415/415 checks passed**, all 96 pixel
  comparisons had **zero** changed pixels; all functional comparisons passed.
  Evidence: `artifacts/updates-verified/result.json`.
- Live production versus local proxy with **both** regressions injected: expected
  **exit 1**, 96/96 pixel comparisons rejected and 12/12 functional variants
  rejected the fee clicks. All 192 route screenshots were captured; candidate
  runtime/network errors were zero. Evidence:
  `artifacts/regression-verified/result.json`. Missing candidate PDFs and their
  comparison failures are secondary consequences of stopping the broken
  functional sequence at the fee controls.
- Three helper tests passed (target allowlist, pixel/dimension regression,
  immutable artifact corruption). Isolated `npm audit` reported zero
  vulnerabilities; evidence: `artifacts/qa-audit.json`.
- Production, the `git-main` Vercel alias and the `git-updates` alias served
  identical SHA-256 hashes for the app's entry JavaScript and CSS. Evidence:
  `artifacts/deployments.json`. This establishes identical application assets;
  deployment commit identity and pipeline status remain the parent's checks.

These generated artifacts and local logs are ignored by git; retain/upload the
needed evidence separately. No workflow, deployment, branch, commit or push was
performed by this implementation task.

## Iframe initialization/readiness verification, 2026-10-26

The revised harness was run locally with the same Node 24.22.1, Playwright
1.64.1 and Chromium 156.0.8078.4 toolchain:

- A focused Chromium fixture executed the actual init callback and runtime
  observer extracted from `browser.mjs`. The old callback threw in sandboxed
  frames and reproduced `Failed to read the 'localStorage' property from
  'Window': Access is denied for this document.` in a failed-navigation frame.
  The top-frame guard removed those harness exceptions, preserved top-frame
  preferences across reload, and still recorded the failed request and an
  injected iframe exception. Evidence: `artifacts/frame-init-fixture.mjs` and
  `artifacts/frame-init-fixture.json`.
- Input/font readiness alone left some automatic Livewire initialization
  requests unfinished on navigation. The shared readiness helper additionally
  waits for the iframe's own network-idle state. The initial attempt also
  encountered `ERR_NETWORK_CHANGED` on application assets and correctly failed;
  its evidence is retained at `artifacts/frame-init-baseline/result.json`.
- Readiness-fix production capture: **113/113 passed**, 12 variants, 96 screenshots,
  both PDFs and zero runtime events. Evidence:
  `artifacts/frame-ready-baseline/result.json`.
- Stored-baseline comparison against the live updates alias: **415/415 passed**,
  96/96 zero-pixel differences and zero runtime events. Evidence:
  `artifacts/frame-ready-comparison/result.json`. These two runs precede the
  subsequent runtime/PDF evidence metadata changes.
- Syntax validation and all three helper tests passed, including pixel/dimension
  rejection and baseline tampering. Evidence:
  `artifacts/frame-ready-helper-tests.txt`. The earlier complete injected visual/
  fee regression run was not repeated; runtime rejection was exercised by the
  focused fixture above.

These local results do not establish that CI's intermittent third-party reset
is eliminated. Genuine iframe/network failures still fail the run. CI retesting
and independent review remain the parent's responsibility.

The final source, including review R2 runtime-origin/PDF-completion metadata,
then passed a fresh **113/113** production capture and **415/415** stored-baseline
comparison against the live updates alias. Both had zero runtime events; all
96 pixel comparisons had zero changed pixels and both actual PDFs were retrieved,
parsed and validated. Evidence: `artifacts/runtime-metadata-baseline/result.json`
and `artifacts/runtime-metadata-comparison/result.json` (matching harness
fingerprint `53bde10305034518d89934562e3a9e09683fdcca4415ba310faf46c98d065df3`).
The updates deployment may have changed identity during these read-only runs;
they establish observed application behavior, not a deployment commit identity.

All **five** helper tests passed, including throwing-frame origin extraction,
forged-message/unknown-origin rejection, and incomplete-PDF versus actual text
difference handling (`artifacts/runtime-metadata-helper-tests.txt`). The extended
browser fixture also verified an exception from a script origin different from
the top page, and an iframe script 404 with `resourceType`/`frameURL`. Its failed
request and exception remained recorded; the guard only removed init-script
storage errors (`artifacts/frame-init-fixture.json`). No complete injected
visual/fee regression rerun was needed for these metadata-only additions.
