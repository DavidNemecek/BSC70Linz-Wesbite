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
    <section id="erfolge" className="py-12 sm:py-16 lg:py-20" style={{ backgroundColor: 'var(--accent-glow)' }}>
      <div ref={ref} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <span data-animate className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4 opacity-0">
          ERFOLGE
        </span>

        <h2 data-animate className="font-display text-[clamp(2rem,5vw,4rem)] tracking-[0.02em] text-primary leading-[1.05] mb-8 lg:mb-10 opacity-0">
          Meister auf allen Ebenen
        </h2>

        <div data-stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {achievements.map((a, i) => (
            <div
              key={i}
              data-stagger-item
              className="relative bg-card rounded-lg border border-theme p-5 sm:p-8 opacity-0 hover:-translate-y-1 hover:border-[var(--border-hover)] hover:shadow-[0_8px_30px_rgba(14,143,185,0.1)] transition-all duration-300 overflow-hidden"
            >
              <div
                className="absolute -top-6 -right-6 w-24 h-24 rounded-full"
                style={{ backgroundColor: 'var(--accent-glow)' }}
              />
              <div className="relative text-[clamp(1.75rem,4vw,3rem)] font-bold text-accent leading-none mb-3">
                {a.number}
              </div>
              <h3 className="relative text-base sm:text-lg font-semibold text-primary mb-2 break-words">{a.title}</h3>
              <p className="relative text-xs sm:text-sm text-muted leading-relaxed break-words">{a.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
