const themeLink = document.getElementById("theme");
if (themeLink) {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) themeLink.href = `/assets/css/themes/${savedTheme}.css`;
}

export function setTheme(themeName) {
  const link = document.getElementById("theme");
  if (!link) return;
  link.href = `/assets/css/themes/${themeName}.css`;
  localStorage.setItem("theme", themeName);
}

