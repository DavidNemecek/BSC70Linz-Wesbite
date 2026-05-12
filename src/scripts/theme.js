function getThemeLink() {
  const link = document.getElementById("theme");
  return link instanceof HTMLLinkElement ? link : null;
}

function systemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(themeName) {
  const link = getThemeLink();
  if (!link) return;
  const theme = themeName === "dark" ? "dark" : "light";
  link.href = `/assets/css/themes/${theme}.css`;
  document.documentElement.dataset.theme = theme;
}

export function initTheme() {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) applyTheme(savedTheme);
  else applyTheme(systemTheme());

  if (savedTheme) return;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (localStorage.getItem("theme")) return;
    applyTheme(systemTheme());
  };
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
  else if (typeof mq.addListener === "function") mq.addListener(onChange);
}

export function setTheme(themeName) {
  applyTheme(themeName);
  localStorage.setItem("theme", themeName === "dark" ? "dark" : "light");
}

export function toggleTheme() {
  const current = (document.documentElement.dataset.theme || systemTheme()).toLowerCase();
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
