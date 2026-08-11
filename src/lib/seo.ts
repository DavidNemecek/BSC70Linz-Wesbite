import type { translations, Language } from '@/i18n/translations'

type Translation = (typeof translations)['de']

export const OG_IMAGE_PATH = '/assets/hero-bg.jpg'

export interface SeoData {
  title: string
  description: string
  canonical: string
  image: string
  locale: string
  noindex: boolean
}

/**
 * The site answers on several hosts that do NOT redirect to one another
 * (bsc70linz.at, www.bsc70linz.at, bsc70linz.neyda.at). A hardcoded host in
 * a canonical or og:url would tell search engines that every one of those
 * domains is really a copy of that one host — which is exactly what used to
 * happen: www.bsc70linz.at declared bsc70linz.neyda.at as its canonical.
 *
 * So every absolute URL is derived from the origin the page is actually
 * being served from, and each domain presents itself as its own canonical.
 * Do not reintroduce a literal hostname anywhere in this file.
 */
function origin(): string {
  return window.location.origin
}

/** Trailing slashes are stripped so `/news/` and `/news` share one canonical. */
export function canonicalPath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

/** Absolute URL on the current origin, whatever domain that happens to be. */
export function absoluteUrl(path: string): string {
  return `${origin()}${path}`
}

/**
 * Routes that load but must not be advertised. /news is deliberately unlinked
 * — there is no nav entry and NewsPreview is not rendered anywhere — and stays
 * hidden for now, so it must not invite indexing either.
 *
 * Note this is noindex rather than a robots.txt Disallow on purpose: a
 * disallowed URL cannot be crawled, so the noindex would never be read and the
 * page could still get listed from external links. To publish the page, drop
 * it here AND add it back to the routes in api/sitemap.ts.
 */
const UNLISTED_ROUTES = new Set<string>(['/news'])

const STATIC_ROUTES = {
  '/': 'home',
  '/news': 'news',
  '/anmeldung': 'anmeldung',
  '/chronik': 'chronik',
  '/impressum': 'impressum',
  '/datenschutz': 'datenschutz',
} as const

/**
 * Resolves the metadata for a pathname. Unknown paths fall back to the home
 * copy and are marked noindex: App.tsx redirects `*` to `/`, so they must
 * never present themselves as indexable pages of their own.
 */
export function resolveSeo(pathname: string, t: Translation, language: Language): SeoData {
  const path = canonicalPath(pathname)
  const seo = t.seo
  const image = absoluteUrl(OG_IMAGE_PATH)
  const locale = language === 'en' ? 'en_GB' : 'de_AT'

  const staticKey = STATIC_ROUTES[path as keyof typeof STATIC_ROUTES]
  if (staticKey) {
    const page = seo[staticKey]
    return {
      title: page.title,
      description: page.description,
      canonical: absoluteUrl(path),
      image,
      locale,
      noindex: UNLISTED_ROUTES.has(path),
    }
  }

  if (path.startsWith('/anfahrt/')) {
    const hallId = path.slice('/anfahrt/'.length)
    const hall = t.training.locations.find((loc) => loc.id === hallId)
    if (hall) {
      return {
        title: seo.anfahrt.title.replace('{hall}', hall.title),
        description: seo.anfahrt.description.replace('{hall}', hall.title),
        canonical: absoluteUrl(path),
        image,
        locale,
        noindex: false,
      }
    }
  }

  return {
    title: seo.home.title,
    description: seo.home.description,
    canonical: absoluteUrl('/'),
    image,
    locale,
    noindex: true,
  }
}
