import { setTheme } from "./theme.js";

document.documentElement.classList.add("js");

const lang = (document.documentElement.lang || "de").toLowerCase().startsWith("en") ? "en" : "de";
const labels =
  lang === "en"
    ? {
        skip: "Skip to content",
        nav: "Main navigation",
        menu: "Menu",
        categories: "News categories",
        all: "All",
        switchTo: "Switch language",
        backToNews: "Back to news",
      }
    : {
        skip: "Zum Inhalt",
        nav: "Navigation",
        menu: "Menü",
        categories: "News-Kategorien",
        all: "Alle",
        switchTo: "Sprache wechseln",
        backToNews: "Zurück zu News",
      };

const themeLink = document.getElementById("theme");
if (themeLink) {
  const saved = localStorage.getItem("theme");
  if (saved) themeLink.href = `/assets/css/themes/${saved}.css`;
}

document.querySelectorAll("[data-theme]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const themeName = btn.getAttribute("data-theme");
    if (!themeName) return;
    setTheme(themeName);
  });
});

function closeOpenNavGroups() {
  const open = [...document.querySelectorAll(".nav__group[open]")];
  for (const d of open) d.open = false;
  return open.length > 0;
}

function initNavGroups() {
  const groups = [...document.querySelectorAll(".nav__group")];
  if (groups.length === 0) return;
  for (const details of groups) {
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      for (const other of groups) if (other !== details) other.open = false;
    });
  }
}

function initNavToggle() {
  const btn = document.querySelector("[data-nav-toggle]");
  const panel = document.querySelector("[data-nav-panel]");
  if (!(btn instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return;

  btn.textContent = labels.menu;

  const mq = window.matchMedia("(max-width: 860px)");
  const sync = () => {
    if (mq.matches) {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    } else {
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "false");
    }
  };
  sync();
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", sync);
  else if (typeof mq.addListener === "function") mq.addListener(sync);

  btn.addEventListener("click", () => {
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (willOpen) closeOpenNavGroups();
  });

  document.addEventListener(
    "click",
    (e) => {
      if (panel.hidden) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (btn.contains(target) || panel.contains(target)) return;
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      closeOpenNavGroups();
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const hadGroups = closeOpenNavGroups();
    if (!panel.hidden) {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.focus();
      return;
    }
    if (hadGroups) btn.focus();
  });
}

function initLanguageA11y() {
  const skip = document.querySelector(".skip");
  if (skip) skip.textContent = labels.skip;

  const nav = document.querySelector("nav.nav");
  if (nav) nav.setAttribute("aria-label", labels.nav);

  const langLink = document.querySelector("a.lang");
  if (langLink instanceof HTMLAnchorElement) {
    langLink.setAttribute("title", labels.switchTo);
    langLink.setAttribute("aria-label", labels.switchTo);
  }
}

function initNewsEnhancements() {
  const grid = document.querySelector(".news-grid");
  const meta = document.querySelector(".news-head__meta");

  const makeCategoryHref = (cat) => `/${lang}/news/${encodeURIComponent(cat)}/`;

  const upgradeCatEl = (el) => {
    const cat = (el.textContent || "").trim();
    if (!cat) return null;
    const a = document.createElement("a");
    a.className = "news-cat";
    a.href = makeCategoryHref(cat);
    a.rel = "tag";
    a.textContent = cat;
    el.replaceWith(a);
    return a;
  };

  if (meta) {
    const spans = meta.querySelectorAll("span");
    if (spans.length >= 2) upgradeCatEl(spans[1]);
  }

  if (!(grid instanceof HTMLElement)) return;

  const cards = [...grid.querySelectorAll(".news-card")];
  const cats = new Set();
  for (const card of cards) {
    const catEl = card.querySelector(".news-card__cat");
    if (!catEl) continue;
    const link = upgradeCatEl(catEl);
    if (link) cats.add(link.textContent || "");
  }

  if (cats.size === 0) return;

  const path = window.location.pathname || "";
  let activeCat = "";
  const m = path.match(new RegExp(`^/${lang}/news/([^/]+)/`));
  if (m && m[1] && m[1] !== "page") activeCat = decodeURIComponent(m[1]);

  const filter = document.createElement("nav");
  filter.className = "news-filter";
  filter.setAttribute("aria-label", labels.categories);
  const inner = document.createElement("div");
  inner.className = "news-filter__inner";
  filter.appendChild(inner);

  const addChip = (href, text, isActive) => {
    const a = document.createElement("a");
    a.className = `chip${isActive ? " is-active" : ""}`;
    a.href = href;
    a.textContent = text;
    if (isActive) a.setAttribute("aria-current", "page");
    inner.appendChild(a);
  };

  addChip(`/${lang}/news/`, labels.all, !activeCat);
  [...cats]
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), lang))
    .forEach((cat) => addChip(makeCategoryHref(cat), cat, cat === activeCat));

  grid.parentElement?.insertBefore(filter, grid);
}

function initNewsBacklink() {
  const head = document.querySelector(".news-head");
  if (!(head instanceof HTMLElement)) return;

  const prose = head.closest(".prose");
  if (!(prose instanceof HTMLElement)) return;
  if (prose.querySelector("[data-news-backlink]")) return;

  const nav = document.createElement("nav");
  nav.className = "news-back";
  nav.setAttribute("data-news-backlink", "true");

  const a = document.createElement("a");
  a.className = "news-back__link";
  a.href = `/${lang}/news/`;
  a.textContent = `\u2190 ${labels.backToNews}`;
  nav.appendChild(a);

  prose.insertBefore(nav, head);
}

initNavGroups();
initNavToggle();
initLanguageA11y();
initNewsEnhancements();
initNewsBacklink();
