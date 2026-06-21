import { useScrollAnimation } from '@/hooks/useScrollAnimation'

const teams = [
  {
    badge: '1. Mannschaft',
    name: 'BSC 70 Linz I',
    league: '1. Landesliga',
    position: '2.',
    positionLabel: 'Platz',
    points: '12',
    pointsLabel: 'Punkte',
    result: 'Letztes Spiel: 5:3 Sieg gegen SK Vöest',
  },
  {
    badge: '2. Mannschaft',
    name: 'BSC 70 Linz II',
    league: '2. Klasse Nord — Playoff',
    position: '3.',
    positionLabel: 'Platz',
    points: '1',
    pointsLabel: 'Punkt',
    result: 'Letztes Spiel: 2:6 gegen UBC Neuhofen VI',
  },
]

export default function Teams() {
  const ref = useScrollAnimation()

  return (
    <section id="teams" className="bg-night py-16 sm:py-20 lg:py-32">
      <div ref={ref} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <span data-animate className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-ember mb-4 opacity-0">
          MANNSCHAFTEN
        </span>

        <h2 data-animate className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-white leading-[1.05] mb-4 opacity-0">
          Unsere Mannschaften
        </h2>

        <p data-animate className="text-base text-white/60 leading-relaxed max-w-[640px] mb-10 lg:mb-12 opacity-0">
          Der BSC 70 Linz stellt zwei Mannschaften in den oberösterreichischen Ligen. Nach über 50 Jahren Bundesliga-Zugehörigkeit haben wir uns 2024 bewusst neu orientiert — und setzen nun mit voller Kraft auf unsere Landesliga-Teams.
        </p>

        <div data-stagger className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {teams.map((team, i) => (
            <div
              key={i}
              data-stagger-item
              className="bg-charcoal rounded-lg border border-white/[0.08] p-6 sm:p-8 lg:p-10 opacity-0 hover:-translate-y-1 hover:border-ember/30 transition-all duration-300"
            >
              <span className="inline-block text-xs font-medium uppercase tracking-[0.05em] bg-ember text-white rounded-full px-3 py-1 mb-4">
                {team.badge}
              </span>

              <h3 className="text-[clamp(1.5rem,3vw,2.8rem)] font-semibold tracking-tight text-white mb-1">
                {team.name}
              </h3>
              <p className="text-base text-white/50 mb-6">{team.league}</p>

              <div className="border-t border-white/[0.08] pt-6 flex gap-8 sm:gap-12">
                <div>
                  <div className="text-[clamp(2rem,5vw,4rem)] font-bold text-white leading-none">
                    {team.position}
                  </div>
                  <div className="text-xs uppercase tracking-[0.05em] text-slate mt-1">{team.positionLabel}</div>
                </div>
                <div>
                  <div className="text-[clamp(2rem,5vw,4rem)] font-bold text-white leading-none">
                    {team.points}
                  </div>
                  <div className="text-xs uppercase tracking-[0.05em] text-slate mt-1">{team.pointsLabel}</div>
                </div>
              </div>

              <p className="text-sm text-white/40 mt-6">{team.result}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
