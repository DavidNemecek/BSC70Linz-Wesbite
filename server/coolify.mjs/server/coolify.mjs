import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT || 8080);
const publicOrigin = String(process.env.PUBLIC_ORIGIN || 'https://www.bsc70linz.at').replace(/\/$/, '');
const teamsURL = 'https://raw.githubusercontent.com/DavidNemecek/BSC70Linz-Wesbite-BackgroundTasks/refs/heads/main/data/bsc70-teams.json';

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, contentType, headers = {}) {
  res.writeHead(status, { 'content-type': contentType, ...headers });
  res.end(body);
}

function origin() {
  return publicOrigin;
}

function robots(res) {
  send(res, 200, `User-agent: *\nAllow: /\nSitemap: ${origin()}/sitemap.xml\n`, 'text/plain; charset=utf-8', {
    'cache-control': 'public, max-age=3600',
  });
}

function sitemap(res) {
  const routes = ['/', '/anmeldung', '/chronik', '/anfahrt/solarcity', '/anfahrt/auhof', '/impressum', '/datenschutz'];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(route => `  <url><loc>${origin()}${route}</loc></url>`).join('\n')}\n</urlset>\n`;
  send(res, 200, body, 'application/xml; charset=utf-8', {
    'cache-control': 'public, max-age=3600',
  });
}

async function teams(res) {
  try {
    const response = await fetch(teamsURL, { signal: AbortSignal.timeout(8_000), headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('upstream status');
    const body = await response.text();
    JSON.parse(body);
    send(res, 200, body, 'application/json; charset=utf-8', {
      'cache-control': 'public, max-age=0, s-maxage=900, stale-while-revalidate=86400',
    });
  } catch {
    send(res, 502, JSON.stringify({ error: 'upstream unavailable' }), 'application/json; charset=utf-8', {
      'cache-control': 'no-store',
    });
  }
}

async function staticFile(res, pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidate = path.resolve(root, relative || 'index.html');
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return send(res, 400, 'Bad request', 'text/plain; charset=utf-8');
  let target = candidate;
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = path.join(target, 'index.html');
  } catch {
    // An asset typo must remain a 404. Only extensionless paths use the SPA
    // entry point as their fallback.
    if (path.posix.basename(relative).includes('.')) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    target = path.join(root, 'index.html');
  }
  try {
    const body = await readFile(target);
    send(res, 200, body, types[path.extname(target).toLowerCase()] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
}

const server = http.createServer(async (req, res) => {
  const requestURL = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (requestURL.pathname === '/health') return send(res, 200, '{"status":"ok"}', 'application/json; charset=utf-8', { 'cache-control': 'no-store' });
  if (requestURL.pathname === '/api/teams') return teams(res);
  if (requestURL.pathname === '/robots.txt') return robots(res);
  if (requestURL.pathname === '/sitemap.xml') return sitemap(res);
  return staticFile(res, requestURL.pathname);
});

server.listen(port, '0.0.0.0', () => console.log(`Coolify server listening on ${port}`));
