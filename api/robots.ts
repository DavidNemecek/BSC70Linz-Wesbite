import { originFrom } from './_origin'

export const config = { runtime: 'edge' }

export default function handler(request: Request): Response {
  const origin = originFrom(request)

  const body = `User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // Varies by host, so it must not be cached across domains.
      'cache-control': 'public, max-age=0, s-maxage=3600',
      vary: 'host, x-forwarded-host',
    },
  })
}
