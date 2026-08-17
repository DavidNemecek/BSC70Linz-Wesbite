import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { useLanguage } from '@/context/LanguageContext'

// Served by api/teams.ts, which fetches the background task's JSON on our
// behalf. Deliberately a same-origin path: hitting the upstream repository
// directly would disclose every visitor's IP address to GitHub.
const TEAMS_DATA_URL = '/api/teams'

interface Team {
  name: string
  competition: string
  standing: number
  points: number
  team_url: string
}

interface TeamsData {
  club: { team_count: number }
  teams: Team[]
}

function formatCompetition(competition: string) {
  return competition.replace(/^(\d+)\.(?=\S)/, '$1. ')
}

export default function Teams() {
  const ref = useScrollAnimation()
  const { t } = useLanguage()
  const [data, setData] = useState<TeamsData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(TEAMS_DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error('Request failed')
        return res.json() as Promise<TeamsData>
      })
      .then(setData)
      .catch(() => setError(true))
  }, [])

  const teamCount = data?.club.team_count ?? data?.teams.length

  return (
    <section id="teams" className="py-16 sm:py-20 lg:py-32" style={{ backgroundColor: 'var(--bg-section)' }}>
      <div ref={ref} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <span data-animate className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4 opacity-0">
          {t.teams.overline}
        </span>

        <h2 data-animate className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05] mb-4 opacity-0">
          {t.teams.title}
        </h2>

        <p data-animate className="text-base text-secondary leading-relaxed max-w-[640px] mb-10 lg:mb-12 opacity-0">
          {teamCount != null ? t.teams.descriptionWithCount(teamCount) : t.teams.descriptionNoCount}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {error && (
            <p className="text-sm text-muted col-span-full">{t.teams.errorMessage}</p>
          )}

          {!data && !error && [0, 1].map((i) => (
            <div
              key={i}
              className="bg-card rounded-lg border border-theme p-6 sm:p-8 lg:p-10 animate-pulse"
            >
              <div className="h-5 w-28 rounded-full bg-card-alt mb-4" />
              <div className="h-8 w-40 rounded bg-card-alt mb-2" />
              <div className="h-4 w-32 rounded bg-card-alt mb-6" />
              <div className="border-t border-theme pt-6 flex gap-8 sm:gap-12">
                <div className="h-10 w-12 rounded bg-card-alt" />
                <div className="h-10 w-12 rounded bg-card-alt" />
              </div>
            </div>
          ))}

          {data?.teams.map((team, i) => (
            <a
              key={team.team_url}
              href={team.team_url}
              target="_blank"
              rel="noopener noreferrer"
              title={t.teams.externalLinkHint}
              className="block bg-card rounded-lg border border-theme p-6 sm:p-8 lg:p-10 hover:-translate-y-1 hover:border-[var(--border-hover)] transition-all duration-300"
            >
              <span className="inline-block text-xs font-medium uppercase tracking-[0.05em] bg-accent-gradient text-white rounded-full px-3 py-1 mb-4">
                {t.teams.teamLabel(i + 1)}
              </span>

              <h3 className="text-[clamp(1.5rem,3vw,2.8rem)] font-semibold tracking-tight text-primary mb-1">
                {team.name}
              </h3>
              <p className="text-base text-secondary mb-6">{formatCompetition(team.competition)}</p>

              <div className="border-t border-theme pt-6 flex gap-8 sm:gap-12">
                <div>
                  <div className="text-[clamp(2rem,5vw,4rem)] font-bold text-primary leading-none">
                    {team.standing}.
                  </div>
                  <div className="text-xs uppercase tracking-[0.05em] text-muted mt-1">{t.teams.place}</div>
                </div>
                <div>
                  <div className="text-[clamp(2rem,5vw,4rem)] font-bold text-primary leading-none">
                    {team.points}
                  </div>
                  <div className="text-xs uppercase tracking-[0.05em] text-muted mt-1">
                    {team.points === 1 ? t.teams.point : t.teams.points}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <span className="inline-flex items-center gap-2 bg-accent-gradient text-white text-xs font-semibold rounded-full px-4 py-2">
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                  {t.teams.externalLinkHint}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
