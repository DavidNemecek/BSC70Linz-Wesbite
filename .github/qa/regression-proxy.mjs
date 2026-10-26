// Local, read-only fixture for proving the gate rejects visible/functional changes.
import http from 'node:http';
import { parseArgs } from 'node:util';
import { safeURL } from './support.mjs';

const { values } = parseArgs({ options: { upstream: { type: 'string' }, port: { type: 'string', default: '4387' }, regression: { type: 'string', default: 'none' } } });
const upstream = safeURL(values.upstream).origin;
if (!['none', 'visible', 'functional', 'both'].includes(values.regression)) throw new Error('Use --regression none|visible|functional|both');
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const localOrigin = `http://127.0.0.1:${port}`;
const injection = [
  ['visible', 'both'].includes(values.regression) ? '<style>h1{color:#ff0044!important}</style>' : '',
  ['functional', 'both'].includes(values.regression) ? '<script>document.addEventListener("click",event=>{if(event.target.closest("#mitgliedschaft button[aria-controls]")){event.preventDefault();event.stopImmediatePropagation()}},true)</script>' : '',
].join('');
const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  try {
    const url = new URL(req.url, upstream);
    if (url.origin !== upstream) throw new Error('Cross-origin path rejected');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    let body = Buffer.from(await response.arrayBuffer());
    if (contentType.includes('text/html')) body = Buffer.from(body.toString().replace('</head>', injection + '</head>'));
    if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') body = Buffer.from(body.toString().replaceAll(upstream, localOrigin));
    res.writeHead(response.status, { 'content-type': contentType, 'cache-control': 'no-store' }); res.end(body);
  } catch (error) { res.writeHead(502, { 'content-type': 'text/plain' }); res.end(error.message); }
});
server.listen(port, '127.0.0.1', () => console.log(`${localOrigin} -> ${upstream}, regression=${values.regression}`));
