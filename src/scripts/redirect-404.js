async function loadRedirects() {
  const res = await fetch("/legacy-redirects.json", { cache: "no-store" });
  if (!res.ok) return null;
  return await res.json();
}

function normalizeKey() {
  const url = new URL(window.location.href);
  const key = `${url.pathname}${url.search}`.replace(/\/+$/, "");
  return key || "/";
}

const key = normalizeKey();
const redirects = await loadRedirects();
if (redirects && redirects[key]) {
  window.location.replace(redirects[key]);
}

