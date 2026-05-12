import { setTheme } from "./theme.js";

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

