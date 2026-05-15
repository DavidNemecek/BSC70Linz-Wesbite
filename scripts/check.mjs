import path from "node:path";
import matter from "gray-matter";

import { paths } from "./lib/paths.mjs";
import { fileExists, listFilesRecursive, readText } from "./lib/fs.mjs";

function isExternalHref(href) {
  return /^https?:\/\//i.test(href) || /^mailto:/i.test(href) || /^tel:/i.test(href);
}

function stripHashAndQuery(url) {
  return url.split("#")[0].split("?")[0];
}

function toDocsFilePath(href) {
  const clean = stripHashAndQuery(href);
  if (!clean.startsWith("/")) return null;
  const rel = clean.replace(/^\//, "");
  if (!rel) return path.join(paths.docsDir, "index.html");
  return path.join(paths.docsDir, rel, "index.html");
}

function extractHrefs(html) {
  const hrefs = [];
  const re = /<a\b[^>]*\shref=(["'])(.*?)\1/gi;
  for (let m; (m = re.exec(html)); ) hrefs.push(m[2]);
  return hrefs;
}

async function checkInternalLinks() {
  if (!(await fileExists(paths.docsDir))) return { ok: true, broken: [] };
  const htmlFiles = await listFilesRecursive(paths.docsDir, { filter: (f) => f.endsWith(".html") });
  const broken = [];

  for (const filePath of htmlFiles) {
    const html = await readText(filePath);
    for (const href of extractHrefs(html)) {
      if (!href || href.startsWith("#")) continue;
      if (isExternalHref(href)) continue;
      if (href.startsWith("javascript:")) continue;
      if (href.startsWith("/assets/")) continue;
      if (href.startsWith("/legacy-redirects.json")) continue;
      if (href.startsWith("/sitemap.xml") || href.startsWith("/robots.txt")) continue;
      const target = toDocsFilePath(href);
      if (!target) continue;
      if (!(await fileExists(target))) broken.push({ from: filePath, href, target });
    }
  }

  return { ok: broken.length === 0, broken };
}

async function checkContentFrontmatter() {
  const issues = [];
  const newsDirs = [path.join(paths.contentDir, "news", "de"), path.join(paths.contentDir, "news", "en")];
  for (const dir of newsDirs) {
    if (!(await fileExists(dir))) continue;
    const files = await listFilesRecursive(dir, { filter: (f) => f.endsWith(".md") });
    for (const filePath of files) {
      const raw = await readText(filePath);
      const parsed = matter(raw);
      const data = parsed.data || {};
      for (const key of ["date", "slug", "category"]) {
        if (!data[key]) issues.push({ file: filePath, issue: `Missing news field: ${key}` });
      }
    }
  }

  const enDirs = [path.join(paths.contentDir, "pages", "en"), path.join(paths.contentDir, "news", "en")];
  for (const dir of enDirs) {
    if (!(await fileExists(dir))) continue;
    const files = await listFilesRecursive(dir, { filter: (f) => f.endsWith(".md") });
    for (const filePath of files) {
      const raw = await readText(filePath);
      const parsed = matter(raw);
      const data = parsed.data || {};
      if (!data.translatedFrom) issues.push({ file: filePath, issue: "Missing translatedFrom in EN content" });
    }
  }

  const allContentDirs = [
    path.join(paths.contentDir, "pages", "de"),
    path.join(paths.contentDir, "pages", "en"),
    path.join(paths.contentDir, "news", "de"),
    path.join(paths.contentDir, "news", "en"),
  ];
  for (const dir of allContentDirs) {
    if (!(await fileExists(dir))) continue;
    const files = await listFilesRecursive(dir, { filter: (f) => f.endsWith(".md") });
    for (const filePath of files) {
      const raw = await readText(filePath);
      const parsed = matter(raw);
      const data = parsed.data || {};
      if (!data.translationStatus) issues.push({ file: filePath, issue: "Missing translationStatus" });
    }
  }

  // Asset path rule: Source content should not contain "/assets"
  const sourceMdFiles = [];
  for (const dir of [path.join(paths.contentDir, "pages"), path.join(paths.contentDir, "news")]) {
    if (await fileExists(dir)) {
      sourceMdFiles.push(...(await listFilesRecursive(dir, { filter: (f) => f.endsWith(".md") })));
    }
  }
  for (const filePath of sourceMdFiles) {
    const raw = await readText(filePath);
    if (raw.includes("](/assets/") || raw.includes('src="/assets/') || raw.includes('href="/assets/')) {
      issues.push({ file: filePath, issue: 'Source content uses leading "/assets/" (should be "assets/...")' });
    }
  }

  // Page parity rule: slugs and publish/navHidden must match across DE/EN
  const pageDirDe = path.join(paths.contentDir, "pages", "de");
  const pageDirEn = path.join(paths.contentDir, "pages", "en");
  if ((await fileExists(pageDirDe)) && (await fileExists(pageDirEn))) {
    const pagesDe = await listFilesRecursive(pageDirDe, { filter: (f) => f.endsWith(".md") });
    const pagesEn = await listFilesRecursive(pageDirEn, { filter: (f) => f.endsWith(".md") });

    const parse = async (filePath) => {
      const raw = await readText(filePath);
      const parsed = matter(raw);
      const data = parsed.data || {};
      const slug = String(data.slug || "").trim();
      const published = data.published !== false;
      const navHidden = data.navHidden === true;
      return { slug, published, navHidden, filePath };
    };

    const de = new Map();
    for (const fp of pagesDe) {
      const p = await parse(fp);
      if (!p.slug) continue;
      de.set(p.slug, p);
    }

    const en = new Map();
    for (const fp of pagesEn) {
      const p = await parse(fp);
      if (!p.slug) continue;
      en.set(p.slug, p);
    }

    for (const slug of de.keys()) if (!en.has(slug)) issues.push({ file: pageDirEn, issue: `Missing EN page for slug: ${slug}` });
    for (const slug of en.keys()) if (!de.has(slug)) issues.push({ file: pageDirDe, issue: `Missing DE page for slug: ${slug}` });

    for (const [slug, d] of de.entries()) {
      const e = en.get(slug);
      if (!e) continue;
      if (d.published !== e.published) issues.push({ file: e.filePath, issue: `Published mismatch for slug ${slug} (DE vs EN)` });
      if (d.navHidden !== e.navHidden) issues.push({ file: e.filePath, issue: `navHidden mismatch for slug ${slug} (DE vs EN)` });
    }
  }

  return { ok: issues.length === 0, issues };
}

async function main() {
  const link = await checkInternalLinks();
  const frontmatter = await checkContentFrontmatter();

  if (!link.ok) {
    console.error("Broken internal links:");
    for (const b of link.broken) console.error(`- ${b.href} from ${path.relative(process.cwd(), b.from)}`);
  }
  if (!frontmatter.ok) {
    console.error("Content issues:");
    for (const i of frontmatter.issues) console.error(`- ${i.issue}: ${i.file}`);
  }

  if (!link.ok || !frontmatter.ok) process.exit(1);
  console.log("OK");
}

await main();
