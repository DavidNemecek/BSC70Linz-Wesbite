(() => {
  const vp = document.getElementById("vp");
  const dpr = document.getElementById("dpr");
  if (vp) vp.textContent = `${window.innerWidth}×${window.innerHeight}`;
  if (dpr) dpr.textContent = String(window.devicePixelRatio || 1);

  const deployBadge = document.getElementById("deployBadge");
  if (deployBadge) {
    deployBadge.textContent = "deployed";
    deployBadge.classList.add("badge--ok");
  }

  const themeLink = document.getElementById("theme");
  const saved = localStorage.getItem("theme");
  if (themeLink && saved) themeLink.href = `/assets/css/themes/${saved}.css`;

  document.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const themeName = btn.getAttribute("data-theme");
      if (!themeLink || !themeName) return;
      themeLink.href = `/assets/css/themes/${themeName}.css`;
      localStorage.setItem("theme", themeName);
    });
  });
})();

