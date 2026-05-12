import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

import { load } from "cheerio";
import TurndownService from "turndown";

import { paths, repoRoot } from "./lib/paths.mjs";
import { ensureDir, fileExists, listFilesRecursive, readText, writeBytes, writeText } from "./lib/fs.mjs";
import { slugify } from "./lib/slugify.mjs";

const SEED = "https://www.bsc70linz.at/cms/";
const HOSTNAME = "www.bsc70linz.at";
const CMS_PREFIX = "/cms/";

const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 30000);
const RETRIES = Number(process.env.RETRIES || 3);
const SAVE_LEGACY_HTML = process.env.SAVE_LEGACY_HTML === "1";

const NEWS_CATEGORIES = [
  { url: "https://www.bsc70linz.at/cms/", category: "news" },
  { url: "https://www.bsc70linz.at/cms/index.php/news/news-bundesliga", category: "bundesliga" },
  { url: "https://www.bsc70linz.at/cms/index.php/news/news-ooe-meisterschaft", category: "ooe-meisterschaft" },
  { url: "https://www.bsc70linz.at/cms/index.php/news/news-turniere", category: "turniere" },
  { url: "https://www.bsc70linz.at/cms/index.php/news/news-nachwuchs", category: "nachwuchs" },
  { url: "https://www.bsc70linz.at/cms/index.php/news/news-mitglieder", category: "mitglieder" },
];

function absUrl(href, base = SEED) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function isInternal(url) {
  try {
    const u = new URL(url);
    return u.hostname === HOSTNAME && u.pathname.startsWith(CMS_PREFIX);
  } catch {
    return false;
  }
}

function normalizeJoomlaPath(url) {
  const u = new URL(url);
  const p = `${u.pathname}${u.search}`;
  return p.replace(/^\/cms\/?/, "/cms/");
}

function sha1Short(input) {
  return crypto.createHash("sha1").update(String(input)).digest("hex").slice(0, 10);
}

function safeJsonString(v) {
  return JSON.stringify(v ?? "");
}

function createTurndown() {
  const td = new TurndownService({ codeBlockStyle: "fenced" });
  td.keep(["iframe"]);
  return td;
}

function frontmatterForPage({ title, slug, navGroup, navOrder, lang, translatedFrom }) {
  const base = {
    title,
    slug,
    navGroup,
    navOrder,
    navLabel: title,
    translationStatus: lang === "de" ? "reviewed" : "draft",
  };
  if (lang === "en") base.translatedFrom = translatedFrom;
  return `---\n${Object.entries(base)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${safeJsonString(v)}`)
    .join("\n")}\n---\n`;
}

function frontmatterForNews({ title, slug, date, category, teaser, sourceUrl, lang, translatedFrom }) {
  const base = {
    title,
    slug,
    date,
    category,
    teaser,
    sourceUrl,
    translationStatus: lang === "de" ? "reviewed" : "draft",
  };
  if (lang === "en") base.translatedFrom = translatedFrom;
  return `---\n${Object.entries(base)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${safeJsonString(v)}`)
    .join("\n")}\n---\n`;
}

async function fetchWithRetry(url, { binary = false } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { redirect: "follow", signal: controller.signal });
      if (!res.ok) {
        const retryable = res.status === 429 || (res.status >= 500 && res.status <= 599);
        if (!retryable) throw new Error(`${res.status} ${res.statusText}`);
        throw new Error(`${res.status} ${res.statusText} (retryable)`);
      }
      const contentType = res.headers.get("content-type") || "";
      if (binary) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        clearTimeout(timeout);
        return { url, bytes, headers: res.headers, contentType };
      }
      const text = await res.text();
      clearTimeout(timeout);
      return { url, text, headers: res.headers, contentType };
    } catch (e) {
      clearTimeout(timeout);
      lastErr = e;
      const delay = Math.min(1500 * attempt, 4000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function queueAll(items, worker) {
  const results = [];
  let index = 0;

  async function runner() {
    while (index < items.length) {
      const item = items[index++];
      try {
        results.push(await worker(item));
      } catch (e) {
        results.push({ ok: false, item, error: String(e) });
      }
    }
  }

  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => runner());
  await Promise.all(runners);
  return results;
}

function pickTitle($) {
  const h1 = $("#content_in h1").first().text().trim();
  if (h1) return h1;
  const h2 = $("#content_in h2").first().text().trim();
  if (h2) return h2;
  const t = $("title").first().text().trim();
  return t || "Untitled";
}

function extractMainContentHtml($) {
  const root = $("#content_in").first();
  if (!root.length) return "";
  const item = root.find(".item-page").first();
  const blog = root.find(".blog").first();
  const el = item.length ? item : blog.length ? blog : root;

  // Strip dangerous/noisy blocks
  el.find("script, style, noscript").remove();
  el.find("form").remove();
  el.find(".breadcrumbs, #breadcrumbs, .pathway").remove();
  el.find(".print, .email, .actions, .buttonheading, .pagination, .items-more").remove();
  el.find("img[alt=\"Drucken\"], img[alt=\"E-Mail\"]").closest("a").remove();

  return el.html() || "";
}

function discoverMenuLinks($) {
  const hrefs = new Set();
  $("ul.menu a[href]").each((_i, a) => {
    const href = $(a).attr("href");
    const url = absUrl(href);
    if (url && isInternal(url)) hrefs.add(url);
  });

  return [...hrefs].filter((u) => {
    if (u === "https://www.bsc70linz.at/cms/" || u === "https://www.bsc70linz.at/cms") return false;
    if (u.includes("/index.php/news/")) return false;
    if (u.includes("/component/mailto")) return false;
    if (u.includes("tmpl=component")) return false;
    return true;
  });
}

function deriveTeaser(markdownBody) {
  const text = String(markdownBody || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/[#>*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

function guessIsoDate({ title, url, text, headers }) {
  const candidates = [title, url, text].filter(Boolean);
  for (const c of candidates) {
    const m = String(c).match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
    if (m) {
      const d = String(m[1]).padStart(2, "0");
      const mo = String(m[2]).padStart(2, "0");
      return `${m[3]}-${mo}-${d}`;
    }
    const m2 = String(c).match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2})\b/);
    if (m2) {
      const yy = Number(m2[3]);
      const year = yy >= 70 ? 1900 + yy : 2000 + yy;
      const d = String(m2[1]).padStart(2, "0");
      const mo = String(m2[2]).padStart(2, "0");
      return `${year}-${mo}-${d}`;
    }
    const m3 = String(c).match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`;
  }
  const lastMod = headers?.get?.("last-modified");
  if (lastMod) {
    const d = new Date(lastMod);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const startTime = Date.now();
  await ensureDir(paths.contentDir);
  await ensureDir(paths.assetsDir);
  await ensureDir(path.join(paths.contentDir, "pages", "de"));
  await ensureDir(path.join(paths.contentDir, "pages", "en"));
  await ensureDir(path.join(paths.contentDir, "news", "de"));
  await ensureDir(path.join(paths.contentDir, "news", "en"));

  const legacyDir = path.join(repoRoot, "legacy");
  if (SAVE_LEGACY_HTML) await ensureDir(legacyDir);

  const seedRes = await fetchWithRetry(SEED);
  const $seed = load(seedRes.text, { xmlMode: true });
  const menuLinks = discoverMenuLinks($seed);
  console.log(`Discovered ${menuLinks.length} menu links`);

  const td = createTurndown();

  const slugMapPath = path.join(paths.contentDir, ".slug-map.json");
  const slugMap = (await fileExists(slugMapPath)) ? JSON.parse(await fs.readFile(slugMapPath, "utf8")) : {};
  const assetMapPath = path.join(paths.contentDir, ".asset-map.json");
  const assetMap = (await fileExists(assetMapPath)) ? JSON.parse(await fs.readFile(assetMapPath, "utf8")) : {};

  function stableSlug(key, preferredTitle) {
    const k = String(key || "").trim();
    if (slugMap[k]) return slugMap[k];
    const base = slugify(preferredTitle || k);
    let out = base;
    let n = 2;
    const used = new Set(Object.values(slugMap));
    while (used.has(out)) out = `${base}-${n++}`;
    slugMap[k] = out;
    return out;
  }

  function stableAssetPath(url) {
    if (assetMap[url]) return assetMap[url];
    const u = new URL(url);
    const baseName = path.basename(u.pathname) || `file-${sha1Short(url)}`;
    const ext = path.extname(baseName);
    const name = ext ? baseName.slice(0, -ext.length) : baseName;
    const safeBase = slugify(name);
    const suffix = sha1Short(url);
    const finalName = `${safeBase}-${suffix}${ext || ""}`.replace(/-+$/g, "");
    const rel = `assets/uploads/${finalName}`;
    assetMap[url] = rel;
    return rel;
  }

  async function downloadAsset(url) {
    const rel = stableAssetPath(url);
    const outPath = path.join(repoRoot, rel);
    if (await fileExists(outPath)) return rel;
    const res = await fetchWithRetry(url, { binary: true });
    await writeBytes(outPath, res.bytes);
    return rel;
  }

  function rewriteInternalLinks($frag, redirects) {
    $frag("a[href]").each((_i, el) => {
      const raw = $frag(el).attr("href");
      if (!raw || raw.startsWith("#")) return;
      const abs = absUrl(raw);
      if (!abs) return;
      if (!isInternal(abs)) return;
      const key = normalizeJoomlaPath(abs);
      const mapped = redirects[key];
      if (mapped) $frag(el).attr("href", mapped);
      else $frag(el).attr("href", abs);
    });
  }

  async function localizeAssetsInHtml(htmlFragment, redirects) {
    const $frag = load(`<div id="__wrap__">${htmlFragment}</div>`, { xmlMode: true });
    const wrap = $frag("#__wrap__");
    rewriteInternalLinks($frag, redirects);

    const assetUrls = new Set();
    wrap.find("img[src]").each((_i, el) => {
      const src = $frag(el).attr("src");
      const abs = absUrl(src);
      if (!abs) return;
      // only localize legacy cms assets (avoid 3rd party)
      if (isInternal(abs) && new URL(abs).pathname.startsWith("/cms/")) assetUrls.add(abs);
    });
    wrap.find("a[href]").each((_i, el) => {
      const href = $frag(el).attr("href");
      const abs = absUrl(href);
      if (!abs) return;
      const p = new URL(abs).pathname.toLowerCase();
      if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip)$/i.test(p) && isInternal(abs)) assetUrls.add(abs);
      if (isInternal(abs) && p.includes("/cms/images/")) assetUrls.add(abs);
    });

    const urlToRel = {};
    await queueAll([...assetUrls], async (u) => {
      urlToRel[u] = await downloadAsset(u);
      return { ok: true };
    });

    wrap.find("img[src]").each((_i, el) => {
      const abs = absUrl($frag(el).attr("src"));
      if (abs && urlToRel[abs]) $frag(el).attr("src", urlToRel[abs]);
    });
    wrap.find("a[href]").each((_i, el) => {
      const abs = absUrl($frag(el).attr("href"));
      if (abs && urlToRel[abs]) $frag(el).attr("href", urlToRel[abs]);
    });

    return wrap.html() || "";
  }

  function rewriteMarkdownLinks(markdown, redirects) {
    let out = markdown;
    out = out.replace(/\]\((\/cms\/[^)\s]+)(\s+\"[^\"]*\")?\)/g, (_m, href, titlePart) => {
      const abs = absUrl(href);
      if (!abs) return `](${href}${titlePart || ""})`;
      const key = normalizeJoomlaPath(abs);
      const mapped = redirects[key];
      if (mapped) return `](${mapped}${titlePart || ""})`;
      return `](${abs}${titlePart || ""})`;
    });
    out = out.replace(/\]\((\/cms\/[^)\s]+)(\s+\'[^\']*\')?\)/g, (_m, href, titlePart) => {
      const abs = absUrl(href);
      if (!abs) return `](${href}${titlePart || ""})`;
      const key = normalizeJoomlaPath(abs);
      const mapped = redirects[key];
      if (mapped) return `](${mapped}${titlePart || ""})`;
      return `](${abs}${titlePart || ""})`;
    });
    out = out.replace(/href=(["'])(\/cms\/[^"']+)\1/gi, (_m, q, href) => {
      const abs = absUrl(href);
      if (!abs) return `href=${q}${href}${q}`;
      const key = normalizeJoomlaPath(abs);
      const mapped = redirects[key];
      if (mapped) return `href=${q}${mapped}${q}`;
      return `href=${q}${abs}${q}`;
    });
    return out;
  }

  // Redirect mapping (Joomla path -> new DE path)
  const redirects = {};

  // Discover all news detail urls through pagination
  const newsDetailUrls = new Map(); // url -> {category}
  async function discoverNewsListing(listUrl, category) {
    const seen = new Set();
    const pending = [listUrl];
    while (pending.length) {
      const url = pending.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      console.log(`GET ${url}`);
      const res = await fetchWithRetry(url);
      if (SAVE_LEGACY_HTML) await writeText(path.join(legacyDir, `news-list-${sha1Short(url)}.html`), res.text);
      const $l = load(res.text, { xmlMode: true });
      const main = $l("#content_in");

      // Turniere root can contain cat-children instead of posts; still has links we want.
      main.find("h2 a[href], .items-more a[href], .cat-children a[href]").each((_i, a) => {
        const abs = absUrl($l(a).attr("href"), url);
        if (abs && isInternal(abs) && abs.includes("/index.php/news/")) newsDetailUrls.set(abs, { category });
      });

      main.find(".pagination a[href]").each((_i, a) => {
        const abs = absUrl($l(a).attr("href"), url);
        if (abs && isInternal(abs) && abs.includes("/index.php/news/")) pending.push(abs);
      });
    }
  }

  for (const c of NEWS_CATEGORIES) await discoverNewsListing(c.url, c.category);
  console.log(`Discovered news detail urls: ${newsDetailUrls.size}`);

  // Import pages (DE) + create EN skeletons
  const menuOrder = new Map();
  for (const [idx, u] of menuLinks.entries()) menuOrder.set(u, idx * 10);

  const pages = [];
  const pageResults = await queueAll(menuLinks, async (url) => {
    console.log(`GET ${url}`);
    const res = await fetchWithRetry(url);
    if (SAVE_LEGACY_HTML) await writeText(path.join(legacyDir, `page-${sha1Short(url)}.html`), res.text);
    const $p = load(res.text, { xmlMode: true });
    const title = pickTitle($p);
    const slugKey = `page:${normalizeJoomlaPath(url)}`;
    const slug = stableSlug(slugKey, title);
    const navOrder = menuOrder.get(url) ?? 999;

    // Pre-register redirect, so later rewrites can already resolve it.
    redirects[normalizeJoomlaPath(url)] = `/de/${slug}/`;

    const htmlFragment = extractMainContentHtml($p);
    const localizedHtml = await localizeAssetsInHtml(htmlFragment, redirects);
    const markdownBody = td.turndown(localizedHtml).trim();
    const fixedMarkdown = rewriteMarkdownLinks(markdownBody, redirects);

    const fmDe = frontmatterForPage({ title, slug, navGroup: "Verein", navOrder, lang: "de" });
    const outDe = path.join(paths.contentDir, "pages", "de", `${slug}.md`);
    await writeText(outDe, `${fmDe}\n${fixedMarkdown}\n`);

    const outEn = path.join(paths.contentDir, "pages", "en", `${slug}.md`);
    if (!(await fileExists(outEn))) {
      const fmEn = frontmatterForPage({
        title,
        slug,
        navGroup: "Club",
        navOrder,
        lang: "en",
        translatedFrom: `content/pages/de/${slug}.md`,
      });
      await writeText(outEn, `${fmEn}\n\n`);
    }

    pages.push({ title, slug, url });
    return { ok: true, url, slug };
  });

  // Import news details (DE) + create EN skeletons
  const newsItems = [];
  const newsUrls = [...newsDetailUrls.entries()].map(([url, meta]) => ({ url, category: meta.category }));
  const newsResults = await queueAll(newsUrls, async ({ url, category }) => {
    console.log(`GET ${url}`);
    const res = await fetchWithRetry(url);
    if (SAVE_LEGACY_HTML) await writeText(path.join(legacyDir, `news-${sha1Short(url)}.html`), res.text);
    const $n = load(res.text, { xmlMode: true });
    const title = pickTitle($n);
    const slugKey = `news:${normalizeJoomlaPath(url)}`;
    const slug = stableSlug(slugKey, title);

    redirects[normalizeJoomlaPath(url)] = `/de/news/${slug}/`;

    const htmlFragment = extractMainContentHtml($n);
    const localizedHtml = await localizeAssetsInHtml(htmlFragment, redirects);
    const markdownBody = td.turndown(localizedHtml).trim();
    const fixedMarkdown = rewriteMarkdownLinks(markdownBody, redirects);
    const teaser = deriveTeaser(fixedMarkdown);
    const isoDate = guessIsoDate({ title, url, text: fixedMarkdown, headers: res.headers });

    const fmDe = frontmatterForNews({
      title,
      slug,
      date: isoDate,
      category,
      teaser,
      sourceUrl: url,
      lang: "de",
    });
    const outDe = path.join(paths.contentDir, "news", "de", `${slug}.md`);
    await writeText(outDe, `${fmDe}\n${fixedMarkdown}\n`);

    const outEn = path.join(paths.contentDir, "news", "en", `${slug}.md`);
    if (!(await fileExists(outEn))) {
      const fmEn = frontmatterForNews({
        title,
        slug,
        date: isoDate,
        category,
        teaser: "",
        sourceUrl: url,
        lang: "en",
        translatedFrom: `content/news/de/${slug}.md`,
      });
      await writeText(outEn, `${fmEn}\n\n`);
    }

    newsItems.push({ title, slug, category, date: isoDate, url });
    return { ok: true, url, slug };
  });

  // Post-pass: rewrite remaining legacy internal links using the final redirects map
  for (const root of [path.join(paths.contentDir, "pages", "de"), path.join(paths.contentDir, "news", "de")]) {
    if (!(await fileExists(root))) continue;
    const files = await listFilesRecursive(root, { filter: (f) => f.endsWith(".md") });
    for (const filePath of files) {
      const raw = await readText(filePath);
      const updated = rewriteMarkdownLinks(raw, redirects);
      if (updated !== raw) await writeText(filePath, updated);
    }
  }

  await writeText(slugMapPath, `${JSON.stringify(slugMap, null, 2)}\n`);
  await writeText(assetMapPath, `${JSON.stringify(assetMap, null, 2)}\n`);
  await writeText(path.join(paths.contentDir, "legacy-redirects.json"), `${JSON.stringify(redirects, null, 2)}\n`);

  const failures = [...pageResults, ...newsResults].filter((r) => !r.ok);
  if (failures.length) {
    console.error("Some imports failed:");
    for (const f of failures) console.error(`- ${f.item?.url || f.item}: ${f.error}`);
    process.exit(1);
  }

  console.log(`Imported pages: ${pages.length}`);
  console.log(`Imported news: ${newsItems.length}`);
  console.log(`Done in ${Math.round((Date.now() - startTime) / 1000)}s`);
}

await main();
