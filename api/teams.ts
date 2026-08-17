export const config = { runtime: 'edge' }

// The standings are produced by a background task and published as JSON in a
// separate repository. Fetching that URL straight from the browser would send
// every visitor's IP address to GitHub, so the request is made here instead:
// visitors only ever talk to our own domain, and no third-party transfer
// happens that would need disclosing in the privacy policy.
const UPSTREAM =
  'https://raw.githubusercontent.com/DavidNemecek/BSC70Linz-Wesbite-BackgroundTasks/refs/heads/main/data/bsc70-teams.json'

export default async function handler(): Promise<Response> {
  let upstream: Response
  try {
    upstream = await fetch(UPSTREAM, {
      headers: { accept: 'application/json' },
      // Let the CDN layer below do the caching rather than the edge fetch, so
      // a stale upstream copy can't outlive the cache-control we send out.
      cache: 'no-store',
    })
  } catch {
    return error('upstream unreachable')
  }

  if (!upstream.ok) return error(`upstream responded ${upstream.status}`)

  const body = await upstream.text()

  // Guard against serving a GitHub error page as if it were standings data —
  // the client only checks res.ok, so malformed JSON would surface as a crash
  // rather than the section's own error message.
  try {
    JSON.parse(body)
  } catch {
    return error('upstream did not return JSON')
  }

  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Standings change at most a few times a week; serve from the CDN and
      // refresh in the background so GitHub sees very little traffic.
      'cache-control': 'public, max-age=0, s-maxage=900, stale-while-revalidate=86400',
    },
  })
}

function error(detail: string): Response {
  return new Response(JSON.stringify({ error: detail }), {
    status: 502,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
