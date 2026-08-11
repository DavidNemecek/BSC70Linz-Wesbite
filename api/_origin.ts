/**
 * Derives the origin from the incoming request instead of hardcoding a host.
 *
 * robots.txt and sitemap.xml have to name absolute URLs, and the site answers
 * on several domains that do not redirect to one another. A static file could
 * only ever name one of them — and a sitemap listing URLs on a different host
 * than the one it was fetched from is ignored by search engines. So both are
 * served per-request on whatever domain was actually asked.
 */
const HOST_PATTERN = /^[a-z0-9.-]+(:\d+)?$/i

export function originFrom(request: Request): string {
  const url = new URL(request.url)

  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  // Never interpolate an unvalidated header into a served document.
  const host = forwardedHost && HOST_PATTERN.test(forwardedHost) ? forwardedHost : url.host

  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const scheme = proto === 'http' ? 'http' : 'https'

  return `${scheme}://${host}`
}
