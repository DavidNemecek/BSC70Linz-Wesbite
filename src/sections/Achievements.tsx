import { useScrollAnimation } from '@/hooks/useScrollAnimation'

const achievements = [
  {
    number: '1992',
    title: 'Europacup-Sieg',
    description: 'Erste und einzige österreichische Mannschaft mit dem Europameistertitel der Landesmeister',
  },
  {
    number: '7×',
    title: 'Ö. Staatsmeister',
    description: '7-facher österreichischer Mannschaftsstaatsmeister mit der 1. Mannschaft',
  },
  {
    number: '15×',
    title: 'OÖ Landesmeister',
    description: '15-facher OÖ Mannschafts-Landesmeister mit der 2. Mannschaft',
  },
  {
    number: '2025',
    title: 'Europameisterschaft',
    description: 'Daniel-Aria Dinata erreicht das EM-Halbfinale und sichert Bronze',
  },
]

export default function Achievements() {
  const ref = useScrollAnimation()

  return (
    <section id="erfolge" className="bg-[rgba(232,80,44,0.08)] py-12 sm:py-16 lg:py-20">
      <div ref={ref} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <span data-animate className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-ember mb-4 opacity-0">
          ERFOLGE
        </span>

        <h2 data-animate className="text-[clamp(1.5rem,3vw,2.8rem)] font-semibold tracking-tight text-ink leading-[1.15] mb-8 lg:mb-10 opacity-0">
          Meister auf allen Ebenen
        </h2>

        <div data-stagger className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-none -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0">
          {achievements.map((a, i) => (
            <div
              key={i}
              data-stagger-item
              className="min-w-[260px] sm:min-w-[280px] flex-shrink-0 bg-white rounded-lg border border-[rgba(26,28,35,0.08)] p-6 sm:p-8 opacity-0 snap-start hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all duration-300"
            >
              <div className="text-[clamp(2rem,5vw,4rem)] font-bold text-ember leading-none mb-3">
                {a.number}
              </div>
              <h3 className="text-lg font-semibold text-ink mb-2">{a.title}</h3>
              <p className="text-sm text-slate leading-relaxed">{a.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
