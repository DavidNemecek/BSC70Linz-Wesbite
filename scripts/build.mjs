import path from "node:path";
import fs from "node:fs/promises";
import matter from "gray-matter";

import { paths } from "./lib/paths.mjs";
import { copyDir, emptyDir, ensureDir, fileExists, listFilesRecursive, readText, writeText } from "./lib/fs.mjs";
import { renderTemplate } from "./lib/template.mjs";
import { createMarkdownRenderer } from "./lib/markdown.mjs";

const PAGE_SIZE = 20;

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
    if (cleaned) return cleaned.length > 160 ? `${cleaned.slice(0, 157)}…` : cleaned;
  }
  return String(fallbackTitle || "BSC 70 Linz");
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function compareNewsDesc(a, b) {
  return String(b.date).localeCompare(String(a.date));
}

function paginate(items, pageSize) {
  const pages = [];
  for (let i = 0; i < items.length; i += pageSize) pages.push(items.slice(i, i + pageSize));
  return pages;
}

function buildNavHtml(pages, { lang, activeUrl }) {
  const byGroup = new Map();
  for (const p of pages) {
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
    parts.push(`<details class="nav__group"${anyActive ? " open" : ""}>`);
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
  return {
    kind: "page",
    lang,
    title,
    slug: isHome ? "index" : slug,
    navGroup: data.navGroup,
    navOrder: data.navOrder,
    navLabel: data.navLabel,
    translationStatus: data.translationStatus,
    translatedFrom: data.translatedFrom,
    description: data.description || data.teaser || descriptionFromMarkdown(content, title),
    url,
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
  const date = escapeHtml(formatDate(item.date));
  const title = escapeHtml(item.title);
  const teaser = escapeHtml(item.teaser);
  return `<article class="news-card">
  <div class="news-card__meta">
    <span class="news-card__date">${date}</span>
    <span class="news-card__cat">${escapeHtml(item.category)}</span>
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
}) {
  const headerHtml = renderTemplate(templates.header, { nav: navHtml, langSwitch, brandHref });
  const footerHtml = templates.footer;
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
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/assets/css/base.css" />
    <link rel="stylesheet" href="/assets/css/themes/default.css" id="theme" />
  </head>
  <body>
    <main class="main">
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
    </main>
    <script type="module">
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
  const pagesDe = pageEntriesDe.map((e) => normalizePageMeta(e, { lang: "de" }));
  const pagesEn = pageEntriesEn.map((e) => normalizePageMeta(e, { lang: "en" }));

  const newsEntriesDe = await loadMarkdownEntries(path.join(paths.contentDir, "news", "de"));
  const newsEntriesEn = await loadMarkdownEntries(path.join(paths.contentDir, "news", "en"));
  const newsDe = newsEntriesDe.map((e) => normalizeNewsMeta(e, { lang: "de" })).sort(compareNewsDesc);
  const newsEn = newsEntriesEn.map((e) => normalizeNewsMeta(e, { lang: "en" })).sort(compareNewsDesc);

  const allUrls = new Set();
  function addUrl(u) {
    allUrls.add(u.endsWith("/") ? u : `${u}/`);
  }

  async function renderLangPages(lang, pagesThis, pagesOther) {
    for (const p of pagesThis) {
      const otherExists = pagesOther.some((o) => o.slug === p.slug);
      const activeUrl = p.url;
      const navHtml = buildNavHtml(pagesThis, { lang, activeUrl });
      const langSwitch = buildLangSwitch({ lang, currentUrl: activeUrl, existsOther: otherExists });
      const contentHtml = `<article class="prose"><h1>${escapeHtml(p.title)}</h1>${md.render(p.body, {
        assetPrefix: "/assets/",
      })}</article>`;
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
        description: p.description,
        contentHtml,
        activeUrl,
        urlDe,
        urlEn,
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
      const cards = paged[i].map(buildNewsCard).join("\n");
      const pagination = buildPagination({ lang, baseUrl: `/${lang}/news/`, pageIndex: i, totalPages: paged.length });
      const contentHtml = `<section class="prose"><h1>News</h1><div class="news-grid">${cards}</div>${pagination}</section>`;
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
        const cards = catPaged[i].map(buildNewsCard).join("\n");
        const pagination = buildPagination({ lang, baseUrl, pageIndex: i, totalPages: catPaged.length });
        const contentHtml = `<section class="prose"><h1>News: ${escapeHtml(category)}</h1><div class="news-grid">${cards}</div>${pagination}</section>`;
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
        });
        addUrl(url);
      }
    }

    // Detail pages
    for (const it of itemsThis) {
      const otherExists = itemsOther.some((o) => o.slug === it.slug);
      const navHtml = buildNavHtml(pagesThis, { lang, activeUrl: it.url });
      const langSwitch = buildLangSwitch({ lang, currentUrl: it.url, existsOther: otherExists });
      const hero = it.heroImage
        ? `<figure class="hero-img"><img src="${it.heroImage.startsWith("/") ? it.heroImage : `/${it.heroImage}`}" alt=""></figure>`
        : "";
      const bodyHtml = md.render(it.body, { assetPrefix: "/assets/" });
      const contentHtml = `<article class="prose"><header class="news-head"><p class="news-head__meta"><span>${escapeHtml(
        formatDate(it.date)
      )}</span> · <span>${escapeHtml(it.category)}</span></p><h1>${escapeHtml(it.title)}</h1>${
        it.teaser ? `<p class="lead">${escapeHtml(it.teaser)}</p>` : ""
      }</header>${hero}${bodyHtml}</article>`;
      const urlDe = lang === "de" ? it.url : otherExists ? it.url.replace("/en/", "/de/") : "/de/news/";
      const urlEn = lang === "en" ? it.url : otherExists ? it.url.replace("/de/", "/en/") : "/en/news/";
      await writePage({
        templates,
        lang,
        navHtml,
        langSwitch,
        brandHref: `/${lang}/`,
        origin: envConfig.origin,
        title: it.title,
        description: it.teaser,
        contentHtml,
        activeUrl: it.url,
        urlDe,
        urlEn,
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
    <link rel="stylesheet" href="/assets/css/base.css">
    <link rel="stylesheet" href="/assets/css/themes/default.css" id="theme">
  </head>
  <body>
    <main class="main">
      <div class="container">
        <h1>404 – Seite nicht gefunden</h1>
        <p>Falls du von der alten Seite kommst, versuchen wir dich automatisch weiterzuleiten.</p>
        <p><a href="/de/">Zur Startseite</a></p>
      </div>
    </main>
    <script type="module" src="/assets/js/redirect-404.js"></script>
  </body>
</html>`;
  await writeText(path.join(paths.docsDir, "404.html"), notFoundHtml);
}

await main();
