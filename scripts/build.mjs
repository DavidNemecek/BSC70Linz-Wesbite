import path from "node:path";
import fs from "node:fs/promises";
import matter from "gray-matter";

import { paths } from "./lib/paths.mjs";
import { copyDir, emptyDir, ensureDir, fileExists, listFilesRecursive, readText, writeText } from "./lib/fs.mjs";
import { renderTemplate } from "./lib/template.mjs";
import { createMarkdownRenderer } from "./lib/markdown.mjs";

const PAGE_SIZE = 20;

const NAV_GROUPS = {
  start: { order: 0, labels: { de: "Start", en: "Home" } },
  club: { order: 10, labels: { de: "Verein", en: "Club" } },
  join: { order: 40, labels: { de: "Mitmachen", en: "Join" } },
  contact: { order: 60, labels: { de: "Kontakt", en: "Contact" } },
};

const NAV_GROUP_KEY_BY_LABEL = new Map([
  ["start", "start"],
  ["home", "start"],
  ["verein", "club"],
  ["club", "club"],
  ["mitmachen", "join"],
  ["join", "join"],
  ["kontakt", "contact"],
  ["contact", "contact"],
]);

function navGroupKeyFromLabel(label) {
  const l = String(label || "")
    .trim()
    .toLowerCase();
  if (!l) return "club";
  return NAV_GROUP_KEY_BY_LABEL.get(l) || "club";
}

function navGroupLabelFromKey(key, lang) {
  const g = NAV_GROUPS[key];
  if (!g) return lang === "en" ? "Club" : "Verein";
  return g.labels[lang] || g.labels.de;
}

function assertPageLangParity(pagesDe, pagesEn) {
  const de = new Map(pagesDe.map((p) => [p.slug, p]));
  const en = new Map(pagesEn.map((p) => [p.slug, p]));
  const onlyDe = [...de.keys()].filter((s) => !en.has(s));
  const onlyEn = [...en.keys()].filter((s) => !de.has(s));
  if (onlyDe.length || onlyEn.length) {
    throw new Error(
      `Page parity error: missing slugs. Only DE: ${onlyDe.join(", ") || "-"}; only EN: ${onlyEn.join(", ") || "-"}`
    );
  }
  const mism = [];
  for (const [slug, d] of de.entries()) {
    const e = en.get(slug);
    if (!e) continue;
    if (Boolean(d.published) !== Boolean(e.published)) mism.push(`${slug}: published mismatch`);
    if (Boolean(d.navHidden) !== Boolean(e.navHidden)) mism.push(`${slug}: navHidden mismatch`);
  }
  if (mism.length) throw new Error(`Page parity error: ${mism.join("; ")}`);
}

function canonicalizeNav(pagesThis, pagesCanonical, lang) {
  const canonBySlug = new Map(pagesCanonical.map((p) => [p.slug, p]));
  return pagesThis.map((p) => {
    const canon = canonBySlug.get(p.slug);
    const groupKey = canon ? canon.navGroupKey : p.navGroupKey;
    return {
      ...p,
      navGroupKey: groupKey,
      navGroup: navGroupLabelFromKey(groupKey, lang),
      navOrder: canon && canon.navOrder !== undefined ? canon.navOrder : p.navOrder,
      navHidden: canon ? canon.navHidden : p.navHidden,
      published: canon ? canon.published : p.published,
      navLabel: p.navLabel || (canon ? canon.navLabel : p.navLabel),
    };
  });
}

function parseArgs(argv) {
  const out = { env: process.env.BSC_ENV || "staging" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--env") out.env = argv[++i] || out.env;
  }
  return out;
}

function getEnvConfig(envName) {
  if (envName === "prod") return { cname: "bsc70linz.at", origin: "https://bsc70linz.at" };
  return { cname: "bsc70linz.neyda.at", origin: "https://bsc70linz.neyda.at" };
}

function pageUrlFor({ lang, slug, kind, category, page }) {
  if (kind === "home") return `/${lang}/`;
  if (kind === "page") return `/${lang}/${slug}/`;
  if (kind === "news-list" && !category && !page) return `/${lang}/news/`;
  if (kind === "news-list" && category && !page) return `/${lang}/news/${category}/`;
  if (kind === "news-list" && !category && page) return `/${lang}/news/page/${page}/`;
  if (kind === "news-list" && category && page) return `/${lang}/news/${category}/page/${page}/`;
  if (kind === "news-detail") return `/${lang}/news/${slug}/`;
  return `/${lang}/`;
}

function outputPathForUrl(urlPath) {
  const cleaned = urlPath.replace(/^\//, "");
  if (!cleaned) return path.join(paths.docsDir, "index.html");
  const fullDir = path.join(paths.docsDir, cleaned);
  return path.join(fullDir, "index.html");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function descriptionFromMarkdown(markdown, fallbackTitle) {
  const lines = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim());
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("---")) continue;
    const cleaned = line
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned) return cleaned.length > 160 ? `${cleaned.slice(0, 157)}\u2026` : cleaned;
  }
  return String(fallbackTitle || "BSC 70 Linz");
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function compareNewsDesc(a, b) {
  const c = String(b.date).localeCompare(String(a.date));
  if (c !== 0) return c;
  const ia = sourceIdFromUrl(a.sourceUrl);
  const ib = sourceIdFromUrl(b.sourceUrl);
  if (ia !== ib) return ib - ia;
  return String(b.slug).localeCompare(String(a.slug));
}

function sourceIdFromUrl(url) {
  const u = String(url || "");
  const m = u.match(/\/(\d+)-/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

function formatDateDisplay(iso, lang) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = lang === "en" ? "en-GB" : "de-AT";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function isEmptyBody(body) {
  return !String(body || "").trim();
}

function findBySlug(items, slug) {
  return items.find((it) => it.slug === slug) || null;
}

function displayCategory(category, lang) {
  const c = String(category || "").toLowerCase();
  const mapDe = {
    news: "News",
    bundesliga: "Bundesliga",
    "ooe-meisterschaft": "OÖ Meisterschaft",
    turniere: "Turniere",
    nachwuchs: "Nachwuchs",
    mitglieder: "Mitglieder",
  };
  const mapEn = {
    news: "News",
    bundesliga: "Bundesliga",
    "ooe-meisterschaft": "Upper Austria Championship",
    turniere: "Tournaments",
    nachwuchs: "Youth",
    mitglieder: "Members",
  };
  const label = (lang === "en" ? mapEn : mapDe)[c];
  if (label) return label;
  return c.replace(/-/g, " ");
}

function normalizeLegacyKeyFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;

  const tryParse = (s) => {
    try {
      return new URL(s);
    } catch {
      return null;
    }
  };

  const u = raw.startsWith("http://") || raw.startsWith("https://") ? tryParse(raw) : tryParse(`https://www.bsc70linz.at${raw.startsWith("/") ? "" : "/"}${raw}`);
  if (!u) return null;

  const host = (u.hostname || "").toLowerCase();
  if (!host.includes("bsc70linz.at")) return null;

  const key = `${u.pathname || ""}${u.search || ""}`.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (!key) return null;
  if (!key.startsWith("/cms/")) return null;
  return key;
}

function rewriteLegacyLinksInMarkdown(markdown, { lang, redirects, existingUrls }) {
  const map = redirects || {};
  const urls = existingUrls || { de: new Set(), en: new Set() };

  const pickLangUrl = (urlDe) => {
    const de = String(urlDe || "");
    if (lang !== "en") return de;
    if (!de.startsWith("/de/")) return de;
    const en = de.replace(/^\/de\//, "/en/");
    return urls.en && urls.en.has(en) ? en : de;
  };

  // Replace markdown links that point to the legacy domain with mapped internal URLs.
  // If we cannot map, drop the legacy href but keep label.
  let out = String(markdown || "");

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)/g, (m, label, href) => {
    const key = normalizeLegacyKeyFromUrl(href);
    if (!key) return m;
    const mapped = map[key];
    if (mapped) return `[${label}](${pickLangUrl(mapped)})`;
    return label;
  });

  // Replace HTML anchors/images that still reference the old site.
  out = out.replace(/\s(href|src)=["']([^"']+)["']/gi, (m, attr, href) => {
    const key = normalizeLegacyKeyFromUrl(href);
    if (!key) return m;
    const mapped = map[key];
    if (mapped) return ` ${attr}="${pickLangUrl(mapped)}"`;
    // Drop the attribute entirely to avoid referencing the legacy site.
    return "";
  });

  // Replace plain legacy URLs (markdown-it linkify would otherwise turn them into links).
  out = out.replace(/https?:\/\/(?:www\.)?bsc70linz\.at\/cms\/[^\s)>\"]+/gi, (rawUrl) => {
    const key = normalizeLegacyKeyFromUrl(rawUrl);
    if (!key) return "";
    const mapped = map[key];
    return mapped ? pickLangUrl(mapped) : "";
  });

  return out;
}

function rewriteLegacyAssets(markdown, assetMap) {
  let out = String(markdown || "");
  const entries = assetMap ? Object.entries(assetMap) : [];
  for (const [from, to] of entries) {
    if (!from || !to) continue;
    out = out.split(from).join(to);
    out = out.split(from.replace(/^https:\/\//, "http://")).join(to);
    out = out.split(from.replace("https://www.", "https://")).join(to);
    out = out.split(from.replace("https://www.", "http://")).join(to);
  }
  return out;
}

function cleanLegacyMarkdown(markdown, { kind, lang, redirects, assetMap, existingUrls }) {
  let out = String(markdown || "").replace(/\r\n/g, "\n");
  out = rewriteLegacyAssets(out, assetMap);
  out = rewriteLegacyLinksInMarkdown(out, { lang, redirects, existingUrls });
  const lines = out.split("\n");

  // Common legacy pattern in news bodies:
  // [Title](/de/news/slug/)
  // -----------------------
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const first = (lines[i] || "").trim();
  const second = (lines[i + 1] || "").trim();
  const looksLikeSelfLink = /^\[[^\]]+\]\(\/(de|en)\/news\/[^)]+\/\)\s*$/.test(first);
  const looksLikeDashLine = /^-{20,}\s*$/.test(second);
  if (kind === "news" && looksLikeSelfLink && looksLikeDashLine) {
    lines.splice(i, 2);
  }

  out = lines
    .filter((l) => !/^-{20,}\s*$/.test(l.trim()))
    .filter((l) => !/^\*\s*\[(<\s*Zur\u00fcck|<\s*Zur\u00fcck|Zur\u00fcck)\]\(/i.test(l.trim()))
    .filter((l) => !/^\*\s*\[(Weiter\s*>|Weiter)\]\(/i.test(l.trim()))
    .filter((l) => l.trim() !== "0/th")
    .join("\n")
    .replace(/\[\]\((https?:\/\/[^)\s]+)\)/g, "")
    .replace(/^\[\s*$/gm, "")
    .replace(/^#\s+/gm, "## ")
    .replace(/^([^\n]+)\n={3,}\s*$/gm, "## $1")
    .replace(/\*{4,}/g, "**")
    .replace(/\\([\\`*{}\[\]()#+.!_-])/g, "$1")
    .replace(/^\*\*\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return out;
}

function cleanTeaser(teaser) {
  let out = String(teaser || "").replace(/\r\n/g, "\n").trim();
  out = out.replace(/^-{10,}\s*/g, "");
  out = out.replace(/\\([\\`*{}\[\]()#+.!_-])/g, "$1");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

function paginate(items, pageSize) {
  const pages = [];
  for (let i = 0; i < items.length; i += pageSize) pages.push(items.slice(i, i + pageSize));
  return pages;
}

function buildNavHtml(pages, { lang, activeUrl }) {
  const navPages = pages.filter((p) => {
    if (p.published === false) return false;
    if (p.navHidden) return false;
    if (p.slug === "index") return false;
    return true;
  });
  const byGroup = new Map();
  for (const p of navPages) {
    const group = String(p.navGroup || "misc");
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(p);
  }

  const groups = [...byGroup.entries()]
    .map(([group, items]) => ({
      group,
      minOrder: Math.min(...items.map((it) => Number(it.navOrder ?? 9999))),
      items: items.slice().sort((a, b) => Number(a.navOrder ?? 9999) - Number(b.navOrder ?? 9999)),
    }))
    .sort((a, b) => a.minOrder - b.minOrder || a.group.localeCompare(b.group));

  const parts = [];
  parts.push(`<ul class="nav__list">`);
  for (const g of groups) {
    if (g.items.length === 1) {
      const it = g.items[0];
      const isActive = it.url === activeUrl;
      parts.push(
        `<li class="nav__item"><a class="nav__link${isActive ? " is-active" : ""}" href="${it.url}"${
          isActive ? ' aria-current="page"' : ""
        }>${escapeHtml(it.navLabel || it.title)}</a></li>`
      );
      continue;
    }
    const anyActive = g.items.some((it) => it.url === activeUrl);
    parts.push(`<li class="nav__item nav__item--group">`);
    parts.push(`<details class="nav__group"${anyActive ? ' data-active="true"' : ""}>`);
    parts.push(`<summary class="nav__summary">${escapeHtml(g.group)}</summary>`);
    parts.push(`<div class="nav__dropdown" role="group" aria-label="${escapeHtml(g.group)}">`);
    for (const it of g.items) {
      const isActive = it.url === activeUrl;
      parts.push(
        `<a class="nav__sublink${isActive ? " is-active" : ""}" href="${it.url}"${
          isActive ? ' aria-current="page"' : ""
        }>${escapeHtml(it.navLabel || it.title)}</a>`
      );
    }
    parts.push(`</div></details></li>`);
  }

  parts.push(
    `<li class="nav__item"><a class="nav__link${activeUrl.startsWith(`/${lang}/news`) ? " is-active" : ""}" href="/${lang}/news/"${
      activeUrl.startsWith(`/${lang}/news`) ? ' aria-current="page"' : ""
    }>News</a></li>`
  );
  parts.push(`</ul>`);

  return parts.join("");
}

async function loadTemplates() {
  const layoutPath = path.join(paths.templatesDir, "layout.html");
  const headerPath = path.join(paths.templatesDir, "partials", "header.html");
  const footerPath = path.join(paths.templatesDir, "partials", "footer.html");
  return {
    layout: await readText(layoutPath),
    header: await readText(headerPath),
    footer: await readText(footerPath),
  };
}

function buildHreflangLinks({ origin, urlDe, urlEn }) {
  const parts = [];
  if (urlDe) parts.push(`<link rel="alternate" hreflang="de" href="${origin}${urlDe}">`);
  if (urlEn) parts.push(`<link rel="alternate" hreflang="en" href="${origin}${urlEn}">`);
  if (urlDe) parts.push(`<link rel="alternate" hreflang="x-default" href="${origin}${urlDe}">`);
  return parts.join("\n");
}

function otherLang(lang) {
  return lang === "de" ? "en" : "de";
}

function buildLangSwitch({ lang, currentUrl, existsOther }) {
  const other = otherLang(lang);
  const target = existsOther ? currentUrl.replace(`/${lang}/`, `/${other}/`) : `/${other}/`;
  const label = lang === "de" ? "EN" : "DE";
  return `<a class="lang" href="${target}" rel="alternate" hreflang="${other}">${label}</a>`;
}

async function loadMarkdownEntries(dir) {
  if (!(await fileExists(dir))) return [];
  const files = await listFilesRecursive(dir, { filter: (f) => f.endsWith(".md") });
  const entries = [];
  for (const filePath of files) {
    const raw = await readText(filePath);
    const parsed = matter(raw);
    entries.push({ filePath, ...parsed });
  }
  return entries;
}

function normalizePageMeta({ data, content }, { lang }) {
  const title = data.title ? String(data.title) : "Untitled";
  const slug = data.slug ? String(data.slug) : "";
  const isHome = slug === "index" || slug === "" || slug === "home";
  const url = isHome ? `/${lang}/` : `/${lang}/${slug}/`;
  const heroImage = data.heroImage ? String(data.heroImage) : "";
  const navGroupKey = navGroupKeyFromLabel(data.navGroup);
  return {
    kind: "page",
    lang,
    title,
    slug: isHome ? "index" : slug,
    navGroup: data.navGroup,
    navGroupKey,
    navOrder: data.navOrder,
    navLabel: data.navLabel,
    navHidden: data.navHidden === true,
    published: data.published !== false,
    translationStatus: data.translationStatus,
    translatedFrom: data.translatedFrom,
    description: data.description || data.teaser || descriptionFromMarkdown(content, title),
    url,
    heroImage,
    body: content,
  };
}

function normalizeNewsMeta({ data, content }, { lang }) {
  const title = data.title ? String(data.title) : "Untitled";
  const slug = String(data.slug || "");
  const date = String(data.date || "");
  const category = String(data.category || "news");
  const teaser = String(data.teaser || "");
  const heroImage = data.heroImage ? String(data.heroImage) : "";
  const url = `/${lang}/news/${slug}/`;
  return {
    kind: "news",
    lang,
    title,
    slug,
    date,
    category,
    teaser,
    heroImage,
    translationStatus: data.translationStatus,
    translatedFrom: data.translatedFrom,
    sourceUrl: data.sourceUrl,
    url,
    body: content,
  };
}

function buildNewsCard(item) {
  const date = escapeHtml(formatDateDisplay(item.date, item.lang));
  const title = escapeHtml(item.title);
  const teaser = escapeHtml(cleanTeaser(item.teaser));
  const catSlug = escapeHtml(String(item.category || ""));
  return `<article class="news-card">
  <div class="news-card__meta">
    <span class="news-card__date">${date}</span>
    <span class="news-card__cat" data-category="${catSlug}">${escapeHtml(displayCategory(item.category, item.lang))}</span>
  </div>
  <h2 class="news-card__title"><a href="${item.url}">${title}</a></h2>
  ${teaser ? `<p class="news-card__teaser">${teaser}</p>` : ""}
</article>`;
}

function buildPagination({ lang, baseUrl, pageIndex, totalPages }) {
  if (totalPages <= 1) return "";
  const labels =
    lang === "en"
      ? { prev: "Previous", next: "Next", page: "Page" }
      : { prev: "Zurück", next: "Weiter", page: "Seite" };
  const parts = [];
  const current = pageIndex + 1;
  const prev = current > 1 ? `${baseUrl}${current - 1 === 1 ? "" : `page/${current - 1}/`}` : null;
  const next = current < totalPages ? `${baseUrl}page/${current + 1}/` : null;
  parts.push(`<nav class="pager" aria-label="Pagination">`);
  parts.push(`<div class="pager__inner">`);
  parts.push(
    prev ? `<a class="pager__link" href="${prev}">${labels.prev}</a>` : `<span class="pager__disabled">${labels.prev}</span>`
  );
  parts.push(`<span class="pager__current">${labels.page} ${current} / ${totalPages}</span>`);
  parts.push(
    next ? `<a class="pager__link" href="${next}">${labels.next}</a>` : `<span class="pager__disabled">${labels.next}</span>`
  );
  parts.push(`</div></nav>`);
  return parts.join("");
}

async function writePage({
  templates,
  lang,
  navHtml,
  langSwitch,
  brandHref,
  origin,
  title,
  description,
  contentHtml,
  activeUrl,
  urlDe,
  urlEn,
  bodyClass,
}) {
  // Keep the header compact (especially on mobile): no always-on CTA in the nav bar.
  const cta = "";
  const menuLabel = lang === "en" ? "Menu" : "Menü";
  const headerHtml = renderTemplate(templates.header, { nav: navHtml, langSwitch, brandHref, cta, menuLabel });
  const footerHtml = renderTemplate(templates.footer, {
    contactHref: `/${lang}/kontakt/`,
    contactLabel: lang === "en" ? "Contact" : "Kontakt",
    legalHref: `/${lang}/impressum-vereinsdaten/`,
    legalLabel: lang === "en" ? "Imprint" : "Impressum",
  });
  const hreflangs = buildHreflangLinks({ origin, urlDe, urlEn });
  const html = renderTemplate(templates.layout, {
    lang,
    title: escapeHtml(title),
    description: escapeHtml(description || title || ""),
    hreflangLinks: hreflangs,
    header: headerHtml,
    content: contentHtml,
    footer: footerHtml,
    canonical: `${origin}${activeUrl}`,
    skipText: lang === "en" ? "Skip to content" : "Zum Inhalt",
    bodyClass: bodyClass || "",
  });
  const outPath = outputPathForUrl(activeUrl);
  await writeText(outPath, html);
}

async function main() {
  const args = parseArgs(process.argv);
  const envConfig = getEnvConfig(args.env);
  const md = createMarkdownRenderer();
  const templates = await loadTemplates();

  await emptyDir(paths.docsDir);
  await writeText(path.join(paths.docsDir, ".nojekyll"), "\n");
  await writeText(path.join(paths.docsDir, "CNAME"), `${envConfig.cname}\n`);

  // Root index: language chooser (avoid meta refresh for SEO/A11y)
  const rootIndex = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BSC 70 Linz</title>
    <meta name="description" content="Offizielle Website des BSC 70 Linz." />
    <link rel="canonical" href="${envConfig.origin}/" />
    <link rel="alternate" hreflang="de" href="${envConfig.origin}/de/">
    <link rel="alternate" hreflang="en" href="${envConfig.origin}/en/">
    <link rel="alternate" hreflang="x-default" href="${envConfig.origin}/">
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" />
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/assets/css/base.css" />
    <link rel="stylesheet" href="/assets/css/themes/light.css" id="theme" />
  </head>
  <body class="page page--root">
    <main class="main">
      <div class="page">
        <div class="container">
        <article class="prose">
          <h1>BSC 70 Linz</h1>
          <p class="lead">Bitte Sprache wählen.</p>
          <div class="lang-chooser">
            <a class="btn" href="/de/">Deutsch</a>
            <a class="btn btn--ghost" href="/en/">English</a>
          </div>
          <noscript>
            <p>JavaScript ist deaktiviert. Bitte wähle eine Sprache über die Links oben.</p>
          </noscript>
        </article>
        </div>
      </div>
    </main>
    <script type="module">
      // Theme: system preference + optional saved override
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = savedTheme || (prefersDark ? 'dark' : 'light');
      const link = document.getElementById('theme');
      if (link) link.setAttribute('href', '/assets/css/themes/' + theme + '.css');

      const lang = (navigator.language || '').toLowerCase();
      if (lang.startsWith('en')) location.replace('/en/');
      else location.replace('/de/');
    </script>
  </body>
</html>`;
  await writeText(path.join(paths.docsDir, "index.html"), rootIndex);

  // Static assets
  if (await fileExists(paths.assetsDir)) await copyDir(paths.assetsDir, path.join(paths.docsDir, "assets"));
  await ensureDir(path.join(paths.docsDir, "assets", "css"));
  await copyDir(path.join(paths.srcDir, "styles"), path.join(paths.docsDir, "assets", "css"));
  await ensureDir(path.join(paths.docsDir, "assets", "js"));
  if (await fileExists(path.join(paths.srcDir, "scripts"))) {
    await copyDir(path.join(paths.srcDir, "scripts"), path.join(paths.docsDir, "assets", "js"));
  }

  // Content load
  const pageEntriesDe = await loadMarkdownEntries(path.join(paths.contentDir, "pages", "de"));
  const pageEntriesEn = await loadMarkdownEntries(path.join(paths.contentDir, "pages", "en"));
  const pagesDeRaw = pageEntriesDe.map((e) => normalizePageMeta(e, { lang: "de" }));
  const pagesEnRaw = pageEntriesEn.map((e) => normalizePageMeta(e, { lang: "en" }));

  const newsEntriesDe = await loadMarkdownEntries(path.join(paths.contentDir, "news", "de"));
  const newsEntriesEn = await loadMarkdownEntries(path.join(paths.contentDir, "news", "en"));
  const newsDe = newsEntriesDe.map((e) => normalizeNewsMeta(e, { lang: "de" })).sort(compareNewsDesc);
  const newsEn = newsEntriesEn.map((e) => normalizeNewsMeta(e, { lang: "en" })).sort(compareNewsDesc);

  // Enforce DE/EN parity for navigation/page availability so the nav cannot diverge.
  assertPageLangParity(pagesDeRaw, pagesEnRaw);

  // Canonicalize navigation: DE defines ordering + grouping; EN reuses it with translated group labels.
  const pagesDe = canonicalizeNav(pagesDeRaw, pagesDeRaw, "de");
  const pagesEn = canonicalizeNav(pagesEnRaw, pagesDeRaw, "en");

  // Legacy mapping (used to avoid linking to the old Joomla site)
  const redirects = JSON.parse(await readText(path.join(paths.contentDir, "legacy-redirects.json")));
  const assetMap = JSON.parse(await readText(path.join(paths.contentDir, ".asset-map.json")));
  const existingUrls = {
    de: new Set([...pagesDe.map((p) => p.url), ...newsDe.map((n) => n.url)]),
    en: new Set([...pagesEn.map((p) => p.url), ...newsEn.map((n) => n.url)]),
  };

  const allUrls = new Set();
  function addUrl(u) {
    allUrls.add(u.endsWith("/") ? u : `${u}/`);
  }

  async function renderLangPages(lang, pagesThis, pagesOther) {
    for (const p of pagesThis) {
      if (p.published === false) continue;
      const other = pagesOther.find((o) => o.slug === p.slug && o.published !== false) || null;
      const otherExists = Boolean(other);
      const activeUrl = p.url;
      const navHtml = buildNavHtml(pagesThis, { lang, activeUrl });
      const langSwitch = buildLangSwitch({ lang, currentUrl: activeUrl, existsOther: otherExists });
      const useFallback = isEmptyBody(p.body) && other && !isEmptyBody(other.body);
      const body = !isEmptyBody(p.body) ? p.body : useFallback ? other.body : "";
      const description = useFallback ? other.description || p.description : p.description || (other ? other.description : "");
      const fallbackNote = useFallback
        ? `<div class="callout callout--info">${
            lang === "en"
              ? "This page is not translated yet. You are seeing the German version."
              : "Diese Seite ist noch nicht \u00fcbersetzt. Du siehst die englische Version."
          }</div>`
        : "";
      const bodyClean = cleanLegacyMarkdown(body, { kind: "page", lang, redirects, assetMap, existingUrls });
      const isHome = p.slug === "index";
      const newsThis = lang === "de" ? newsDe : newsEn;
      const newsOther = lang === "de" ? newsEn : newsDe;
      const latestNews = newsThis.slice(0, 6).map((it) => {
        const otherNews = findBySlug(newsOther, it.slug);
        return { ...it, teaser: it.teaser || (otherNews ? otherNews.teaser : "") };
      });
      const latestCards = latestNews.map(buildNewsCard).join("\n");
      const quickLinks =
        lang === "en"
          ? [
              { href: `/${lang}/trainingszeiten/`, label: "Training Times" },
              { href: `/${lang}/spiel-und-trainingshallen/`, label: "Sports Halls" },
              { href: `/${lang}/mitgliedschaft/`, label: "Membership" },
              { href: `/${lang}/schnuppertraining/`, label: "Trial Training" },
              { href: `/${lang}/nachwuchs/`, label: "Youth" },
              { href: `/${lang}/kontakt/`, label: "Contact" },
            ]
          : [
              { href: `/${lang}/trainingszeiten/`, label: "Trainingszeiten" },
              { href: `/${lang}/spiel-und-trainingshallen/`, label: "Hallen" },
              { href: `/${lang}/mitgliedschaft/`, label: "Mitgliedschaft" },
              { href: `/${lang}/schnuppertraining/`, label: "Schnuppertraining" },
              { href: `/${lang}/nachwuchs/`, label: "Nachwuchs" },
              { href: `/${lang}/kontakt/`, label: "Kontakt" },
            ];
      const quickHtml = `<div class="home-links__grid">${quickLinks
        .map((l) => `<a class="btn btn--ghost" href="${l.href}">${escapeHtml(l.label)}</a>`)
        .join("")}</div>`;
      const homeExtras = isHome
        ? `<section class="section section--home-links"><div class="container"><h2 class="section__title">${
            lang === "en" ? "Quick Links" : "Schnellzugriff"
          }</h2>${quickHtml}</div></section>
           <section class="section section--home-news"><div class="container"><h2 class="section__title">${
             lang === "en" ? "Latest News" : "Aktuelle News"
           }</h2><div class="news-grid">${latestCards}</div><p class="home-news__more"><a class="btn" href="/${lang}/news/">${
             lang === "en" ? "All news" : "Alle News"
           }</a></p></div></section>`
        : "";
      const renderedBody = md.render(bodyClean, { assetPrefix: "/assets/" });
      const contentHtml = isHome
        ? `<div class="home">${fallbackNote}${renderedBody}${homeExtras}</div>`
        : `<div class="page"><div class="container"><article class="prose"><h1>${escapeHtml(p.title)}</h1>${fallbackNote}${renderedBody}</article></div></div>`;
      const urlDe = lang === "de" ? activeUrl : otherExists ? activeUrl.replace("/en/", "/de/") : "/de/";
      const urlEn = lang === "en" ? activeUrl : otherExists ? activeUrl.replace("/de/", "/en/") : "/en/";
      await writePage({
        templates,
        lang,
        navHtml,
        langSwitch,
        brandHref: `/${lang}/`,
        origin: envConfig.origin,
        title: p.title,
        description,
        contentHtml,
        activeUrl,
        urlDe,
        urlEn,
        bodyClass: isHome ? "page page--home" : "page",
      });
      addUrl(activeUrl);
    }
  }

  await renderLangPages("de", pagesDe, pagesEn);
  await renderLangPages("en", pagesEn, pagesDe);

  async function renderNews(lang, itemsThis, itemsOther, pagesThis) {
    const navBase = buildNavHtml(pagesThis, { lang, activeUrl: `/${lang}/news/` });
    const langSwitchBase = buildLangSwitch({ lang, currentUrl: `/${lang}/news/`, existsOther: true });
    const listingDescription = lang === "en" ? "Latest news and match reports." : "Aktuelle News und Berichte.";

    // Index listing with pagination
    const paged = paginate(itemsThis, PAGE_SIZE);
    if (paged.length === 0) paged.push([]);
    for (let i = 0; i < paged.length; i++) {
      const pageNo = i + 1;
      const url = pageNo === 1 ? `/${lang}/news/` : `/${lang}/news/page/${pageNo}/`;
      const pageItems = paged[i].map((it) => {
        const other = findBySlug(itemsOther, it.slug);
        return { ...it, teaser: it.teaser || (other ? other.teaser : "") };
      });
      const cards = pageItems.map(buildNewsCard).join("\n");
      const pagination = buildPagination({ lang, baseUrl: `/${lang}/news/`, pageIndex: i, totalPages: paged.length });
      const contentHtml = `<div class="page"><div class="container"><section class="prose"><h1>News</h1><div class="news-grid">${cards}</div>${pagination}</section></div></div>`;
      await writePage({
        templates,
        lang,
        navHtml: navBase,
        langSwitch: langSwitchBase,
        brandHref: `/${lang}/`,
        origin: envConfig.origin,
        title: "News",
        description: listingDescription,
        contentHtml,
        activeUrl: url,
        urlDe: url.replace(`/${lang}/`, "/de/"),
        urlEn: url.replace(`/${lang}/`, "/en/"),
        bodyClass: "page page--news-list",
      });
      addUrl(url);
    }

    // Category listings
    const byCat = new Map();
    for (const it of itemsThis) {
      if (!byCat.has(it.category)) byCat.set(it.category, []);
      byCat.get(it.category).push(it);
    }
    for (const [category, catItems] of byCat.entries()) {
      if (category === "news") continue;
      const catPaged = paginate(catItems, PAGE_SIZE);
      for (let i = 0; i < catPaged.length; i++) {
        const pageNo = i + 1;
        const baseUrl = `/${lang}/news/${category}/`;
        const url = pageNo === 1 ? baseUrl : `${baseUrl}page/${pageNo}/`;
        const pageItems = catPaged[i].map((it) => {
          const other = findBySlug(itemsOther, it.slug);
          return { ...it, teaser: it.teaser || (other ? other.teaser : "") };
        });
        const cards = pageItems.map(buildNewsCard).join("\n");
        const pagination = buildPagination({ lang, baseUrl, pageIndex: i, totalPages: catPaged.length });
        const contentHtml = `<div class="page"><div class="container"><section class="prose"><h1>News: ${escapeHtml(
          displayCategory(category, lang)
        )}</h1><div class="news-grid">${cards}</div>${pagination}</section></div></div>`;
        await writePage({
          templates,
          lang,
          navHtml: buildNavHtml(pagesThis, { lang, activeUrl: baseUrl }),
          langSwitch: buildLangSwitch({ lang, currentUrl: baseUrl, existsOther: true }),
          brandHref: `/${lang}/`,
          origin: envConfig.origin,
          title: `News: ${category}`,
          description: lang === "en" ? `News category ${category}.` : `News Kategorie ${category}.`,
          contentHtml,
          activeUrl: url,
          urlDe: url.replace(`/${lang}/`, "/de/"),
          urlEn: url.replace(`/${lang}/`, "/en/"),
          bodyClass: "page page--news-list",
        });
        addUrl(url);
      }
    }

    // Detail pages
    for (const it of itemsThis) {
      const otherExists = itemsOther.some((o) => o.slug === it.slug);
      const other = otherExists ? findBySlug(itemsOther, it.slug) : null;
      const navHtml = buildNavHtml(pagesThis, { lang, activeUrl: it.url });
      const langSwitch = buildLangSwitch({ lang, currentUrl: it.url, existsOther: otherExists });
      const displayTitle = it.title && it.title !== "Untitled" ? it.title : other ? other.title : it.title;
      const useFallback = isEmptyBody(it.body) && other && !isEmptyBody(other.body);
      const bodySource = !isEmptyBody(it.body) ? it.body : useFallback ? other.body : "";
      const teaser = cleanTeaser(it.teaser || (other ? other.teaser : ""));
      const heroImage = it.heroImage || (other ? other.heroImage : "");
      const hero = heroImage
        ? `<figure class="hero-img"><img src="${heroImage.startsWith("/") ? heroImage : `/${heroImage}`}" alt=""></figure>`
        : "";
      const fallbackNote = useFallback
        ? `<div class="callout callout--info">${
            lang === "en"
              ? "This article is not translated yet. You are seeing the German version."
              : "Dieser Artikel ist noch nicht \u00fcbersetzt. Du siehst die englische Version."
          }</div>`
        : "";
      const bodyClean = cleanLegacyMarkdown(bodySource, { kind: "news", lang, redirects, assetMap, existingUrls });
      const bodyHtml = md.render(bodyClean, { assetPrefix: "/assets/" });
      const contentInner = `<article class="prose"><header class="news-head"><p class="news-head__meta"><span>${escapeHtml(
        formatDateDisplay(it.date, lang)
      )}</span> · <span data-category="${escapeHtml(String(it.category || ""))}">${escapeHtml(
        displayCategory(it.category, lang)
      )}</span></p><h1>${escapeHtml(displayTitle)}</h1>${
        teaser ? `<p class="lead">${escapeHtml(teaser)}</p>` : ""
      }</header>${hero}${fallbackNote}${bodyHtml}</article>`;
      const contentHtml = `<div class="page"><div class="container">${contentInner}</div></div>`;
      const urlDe = lang === "de" ? it.url : otherExists ? it.url.replace("/en/", "/de/") : "/de/news/";
      const urlEn = lang === "en" ? it.url : otherExists ? it.url.replace("/de/", "/en/") : "/en/news/";
      await writePage({
        templates,
        lang,
        navHtml,
        langSwitch,
        brandHref: `/${lang}/`,
        origin: envConfig.origin,
        title: displayTitle,
        description: teaser,
        contentHtml,
        activeUrl: it.url,
        urlDe,
        urlEn,
        bodyClass: "page page--news-detail",
      });
      addUrl(it.url);
    }
  }

  await renderNews("de", newsDe, newsEn, pagesDe);
  await renderNews("en", newsEn, newsDe, pagesEn);

  // Robots + sitemap
  const sitemapUrls = [...allUrls].sort();
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls
    .map((u) => `  <url><loc>${envConfig.origin}${u}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  await writeText(path.join(paths.docsDir, "sitemap.xml"), sitemapXml);
  await writeText(
    path.join(paths.docsDir, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${envConfig.origin}/sitemap.xml\n`
  );

  // Legacy redirects and 404
  const redirectsSrc = path.join(paths.contentDir, "legacy-redirects.json");
  if (await fileExists(redirectsSrc)) await fs.copyFile(redirectsSrc, path.join(paths.docsDir, "legacy-redirects.json"));
  const notFoundHtml = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Seite nicht gefunden</title>
    <meta name="robots" content="noindex">
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" />
    <link rel="stylesheet" href="/assets/css/base.css">
    <link rel="stylesheet" href="/assets/css/themes/light.css" id="theme">
  </head>
  <body class="page page--root">
    <main class="main">
      <div class="page">
        <div class="container">
        <h1>404 – Seite nicht gefunden</h1>
        <p>Falls du von der alten Seite kommst, versuchen wir dich automatisch weiterzuleiten.</p>
        <p><a href="/de/">Zur Startseite</a></p>
        </div>
      </div>
    </main>
    <script type="module" src="/assets/js/redirect-404.js"></script>
  </body>
</html>`;
  await writeText(path.join(paths.docsDir, "404.html"), notFoundHtml);
}

await main();
