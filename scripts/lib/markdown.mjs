import MarkdownIt from "markdown-it";

function stripDangerousHtml(html) {
  let out = html;
  out = out.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");
  out = out.replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, ' $1="#"');
  return out;
}

function normalizeAssetUrls(html, { assetPrefix = "/assets/" } = {}) {
  const prefix = assetPrefix.endsWith("/") ? assetPrefix : `${assetPrefix}/`;
  return html
    .replace(/(\s(?:src|href)=["'])assets\//gi, `$1${prefix}`)
    .replace(/(\s(?:src|href)=["'])\.\/assets\//gi, `$1${prefix}`);
}

export function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
  });
  return {
    render(markdown, opts) {
      const raw = md.render(markdown ?? "");
      const safe = stripDangerousHtml(raw);
      return normalizeAssetUrls(safe, opts);
    },
  };
}

