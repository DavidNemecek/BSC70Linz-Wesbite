import { originFrom } from './_origin'

export const config = { runtime: 'edge' }

/** Keep in sync with the routes in src/App.tsx. */
const ROUTES: { path: string; changefreq: string; priority: string }[] = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/news', changefreq: 'weekly', priority: '0.8' },
  { path: '/anmeldung', changefreq: 'monthly', priority: '0.8' },
  { path: '/chronik', changefreq: 'yearly', priority: '0.5' },
  { path: '/anfahrt/solarcity', changefreq: 'yearly', priority: '0.6' },
  { path: '/anfahrt/auhof', changefreq: 'yearly', priority: '0.6' },
  { path: '/impressum', changefreq: 'yearly', priority: '0.3' },
  { path: '/datenschutz', changefreq: 'yearly', priority: '0.3' },
]

export default function handler(request: Request): Response {
  const origin = originFrom(request)

  const urls = ROUTES.map(
    ({ path, changefreq, priority }) => `  <url>
    <loc>${origin}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
  ).join('\n')

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // Varies by host, so it must not be cached across domains.
      'cache-control': 'public, max-age=0, s-maxage=3600',
      vary: 'host, x-forwarded-host',
    },
  })
}
