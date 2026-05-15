import { initTheme, toggleTheme } from "./theme.js";

document.documentElement.classList.remove("no-js");
document.documentElement.classList.add("js");
initTheme();

function initHeaderHeightSync() {
  const header = document.querySelector(".header");
  if (!(header instanceof HTMLElement)) return () => {};

  const sync = () => {
    const h = header.getBoundingClientRect().height;
    if (Number.isFinite(h) && h > 0) document.documentElement.style.setProperty("--header-height", `${Math.ceil(h)}px`);
  };

  sync();
  window.addEventListener("resize", sync, { passive: true });

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => sync());
    ro.observe(header);
    return sync;
  }

  return sync;
}

const syncHeaderHeight = initHeaderHeightSync();

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

function initThemeToggle() {
  const btn = document.querySelector("[data-theme-toggle]");
  if (!(btn instanceof HTMLButtonElement)) return;

  const syncLabel = () => {
    const current = (document.documentElement.dataset.theme || "").toLowerCase();
    const isDark = current === "dark";
    btn.setAttribute(
      "aria-label",
      lang === "en"
        ? isDark
          ? "Switch to light theme"
          : "Switch to dark theme"
        : isDark
          ? "Zum hellen Theme wechseln"
          : "Zum dunklen Theme wechseln"
    );
    btn.textContent = isDark ? (lang === "en" ? "Light" : "Hell") : lang === "en" ? "Dark" : "Dunkel";
  };

  syncLabel();
  btn.addEventListener("click", () => {
    toggleTheme();
    syncLabel();
  });
}

function closeOpenNavGroups() {
  const open = [...document.querySelectorAll(".nav__group[open]")];
  for (const d of open) d.open = false;
  return open.length > 0;
}

function initNavGroups() {
  const groups = [...document.querySelectorAll(".nav__group")];
  if (groups.length === 0) return;

  const hoverMq = window.matchMedia("(hover: hover) and (pointer: fine)");
  const mobileMq = window.matchMedia("(max-width: 860px)");

  const isHoverDesktop = () => hoverMq.matches && !mobileMq.matches;
  const closeTimers = new WeakMap();

  const closeAll = (except) => {
    for (const other of groups) {
      if (other === except) continue;
      other.open = false;
    }
  };

  const clearCloseTimer = (details) => {
    const t = closeTimers.get(details);
    if (t) window.clearTimeout(t);
    closeTimers.delete(details);
  };

  for (const details of groups) {
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      closeAll(details);
    });

    const summary = details.querySelector(":scope > summary");
    if (summary instanceof HTMLElement) {
      let hadPointerDown = false;
      summary.addEventListener("pointerdown", () => {
        hadPointerDown = true;
        setTimeout(() => {
          hadPointerDown = false;
        }, 0);
      });
      summary.addEventListener("click", (e) => {
        if (!isHoverDesktop()) return;
        // Desktop hover UX: pointer clicks should not "stick" it open/closed.
        if (hadPointerDown) e.preventDefault();
      });
    }

    details.addEventListener("pointerenter", () => {
      if (!isHoverDesktop()) return;
      clearCloseTimer(details);
      details.open = true;
      closeAll(details);
    });

    details.addEventListener("pointerleave", () => {
      if (!isHoverDesktop()) return;
      clearCloseTimer(details);
      const t = window.setTimeout(() => {
        details.open = false;
      }, 300);
      closeTimers.set(details, t);
    });

    const links = [...details.querySelectorAll("a.nav__sublink")];
    for (const a of links) {
      a.addEventListener("click", () => {
        // Close immediately so it doesn't look "stuck" during navigation.
        details.open = false;
      });
    }
  }
}

function initNavToggle() {
  const btn = document.querySelector("[data-nav-toggle]");
  const panel = document.querySelector("[data-nav-panel]");
  if (!(btn instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return;

  btn.textContent = labels.menu;

  const mq = window.matchMedia("(max-width: 860px)");
  const ensureDesktopVisible = () => {
    if (mq.matches) return;
    if (panel.hidden) panel.hidden = false;
    btn.setAttribute("aria-expanded", "false");
  };
  const sync = () => {
    if (mq.matches) {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    } else {
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "false");
    }
    syncHeaderHeight();
  };
  sync();
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", sync);
  else if (typeof mq.addListener === "function") mq.addListener(sync);

  btn.addEventListener("click", () => {
    if (!mq.matches) {
      ensureDesktopVisible();
      return;
    }
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (willOpen) closeOpenNavGroups();
    syncHeaderHeight();
  });

  document.addEventListener(
    "click",
    (e) => {
      if (!mq.matches) {
        ensureDesktopVisible();
        return;
      }
      if (panel.hidden) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (btn.contains(target) || panel.contains(target)) return;
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      closeOpenNavGroups();
      syncHeaderHeight();
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const hadGroups = closeOpenNavGroups();
    if (!mq.matches) {
      ensureDesktopVisible();
      syncHeaderHeight();
      return;
    }
    if (!panel.hidden) {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.focus();
      syncHeaderHeight();
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

  const upgradeCatEl = (el, { slug, label } = {}) => {
    const catLabel = (label ?? el.textContent ?? "").trim();
    const catSlug = (slug ?? (el instanceof HTMLElement ? el.dataset.category : "") ?? "").trim();
    const cat = catSlug || catLabel;
    if (!cat) return null;
    const a = document.createElement("a");
    a.className = "news-cat";
    a.href = makeCategoryHref(cat);
    a.rel = "tag";
    a.textContent = catLabel || cat;
    el.replaceWith(a);
    return a;
  };

  if (meta) {
    const spans = meta.querySelectorAll("span");
    if (spans.length >= 2) upgradeCatEl(spans[1]);
  }

  if (!(grid instanceof HTMLElement)) return;

  const cards = [...grid.querySelectorAll(".news-card")];
  const cats = new Map(); // slug -> label
  for (const card of cards) {
    const catEl = card.querySelector(".news-card__cat");
    if (!catEl) continue;
    const label = (catEl.textContent || "").trim();
    const slug = catEl instanceof HTMLElement ? (catEl.dataset.category || "").trim() : "";
    const effectiveSlug = slug || label;
    if (!effectiveSlug) continue;
    cats.set(effectiveSlug, label || effectiveSlug);
    upgradeCatEl(catEl, { slug: effectiveSlug, label });
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
  [...cats.entries()]
    .sort((a, b) => String(a[1]).localeCompare(String(b[1]), lang))
    .forEach(([slug, label]) => addChip(makeCategoryHref(slug), label, slug === activeCat));

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
initThemeToggle();
initNewsEnhancements();
initNewsBacklink();
