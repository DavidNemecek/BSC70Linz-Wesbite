import path from "node:path";
import fs from "node:fs/promises";
import cheerio from "cheerio";
import TurndownService from "turndown";

import { paths } from "./lib/paths.mjs";
import { ensureDir, fileExists, writeBytes, writeText } from "./lib/fs.mjs";
import { slugify } from "./lib/slugify.mjs";

const SEED = "https://www.bsc70linz.at/cms/";
const CONCURRENCY = 4;

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
    return u.hostname === "www.bsc70linz.at" && u.pathname.startsWith("/cms/");
  } catch {
    return false;
  }
}

function normalizeJoomlaPath(url) {
  const u = new URL(url);
  const p = `${u.pathname}${u.search}`;
  return p.replace(/^\/cms\/?/, "/cms/");
}

function pickTitle($) {
  const h1 = $("#content_in h1").first().text().trim();
  if (h1) return h1;
  const t = $("title").first().text().trim();
  return t || "Untitled";
}

function extractMainContentHtml($) {
  const el = $("#content_in").first();
  if (!el.length) return "";

  // Remove noisy elements
  el.find("form").remove();
  el.find(".breadcrumbs, #breadcrumbs, .pathway").remove();
  el.find(".print, .email, .actions, .buttonheading").remove();

  return el.html() || "";
}

function discoverMenuLinks($) {
  const hrefs = new Set();
  $("ul.menu a[href]").each((_i, a) => {
    const href = $(a).attr("href");
    const url = absUrl(href);
    if (url && isInternal(url)) hrefs.add(url);
  });
  return [...hrefs];
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
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n")}\n---\n`;
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

async function fetchBinary(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function queueAll(urls, worker) {
  const results = [];
  let index = 0;

  async function runner() {
    while (index < urls.length) {
      const url = urls[index++];
      try {
        results.push(await worker(url));
      } catch (e) {
        results.push({ ok: false, url, error: String(e) });
      }
    }
  }

  const runners = Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () => runner());
  await Promise.all(runners);
  return results;
}

async function main() {
  await ensureDir(paths.contentDir);
  await ensureDir(paths.assetsDir);
  await ensureDir(path.join(paths.contentDir, "pages", "de"));
  await ensureDir(path.join(paths.contentDir, "news", "de"));
  await ensureDir(path.join(paths.contentDir, "pages", "en"));
  await ensureDir(path.join(paths.contentDir, "news", "en"));

  const html = await fetchText(SEED);
  const $ = cheerio.load(html, { xmlMode: true });
  const menuLinks = discoverMenuLinks($);

  const td = createTurndown();
  const slugMapPath = path.join(paths.contentDir, ".slug-map.json");
  const slugMap = (await fileExists(slugMapPath)) ? JSON.parse(await fs.readFile(slugMapPath, "utf8")) : {};

  function stableSlug(title) {
    const key = title.trim();
    if (slugMap[key]) return slugMap[key];
    const base = slugify(key);
    let out = base;
    let n = 2;
    const used = new Set(Object.values(slugMap));
    while (used.has(out)) out = `${base}-${n++}`;
    slugMap[key] = out;
    return out;
  }

  const pages = [];
  console.log(`Discovered ${menuLinks.length} menu links`);

  const results = await queueAll(menuLinks, async (url) => {
    console.log(`GET ${url}`);
    const pageHtml = await fetchText(url);
    const $p = cheerio.load(pageHtml, { xmlMode: true });
    const title = pickTitle($p);
    const slug = stableSlug(title);
    const contentHtml = extractMainContentHtml($p);
    const markdownBody = td.turndown(contentHtml).trim();
    const fm = frontmatterForPage({ title, slug, navGroup: "Verein", navOrder: 999, lang: "de" });
    const outPath = path.join(paths.contentDir, "pages", "de", `${slug}.md`);
    await writeText(outPath, `${fm}\n${markdownBody}\n`);
    pages.push({ title, slug, url });
    return { ok: true, url, slug };
  });

  await writeText(slugMapPath, `${JSON.stringify(slugMap, null, 2)}\n`);

  // Redirect mapping (Joomla path -> new DE path)
  const redirects = {};
  for (const p of pages) redirects[normalizeJoomlaPath(p.url)] = `/de/${p.slug}/`;
  await writeText(path.join(paths.contentDir, "legacy-redirects.json"), `${JSON.stringify(redirects, null, 2)}\n`);

  const failures = results.filter((r) => !r.ok);
  if (failures.length) {
    console.error("Some imports failed:");
    for (const f of failures) console.error(`- ${f.url}: ${f.error}`);
    process.exit(1);
  }

  console.log(`Imported pages: ${pages.length}`);
}

await main();
