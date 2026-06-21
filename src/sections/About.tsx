import { useScrollAnimation } from '@/hooks/useScrollAnimation'

const stats = [
  { number: '55+', label: 'Jahre Badminton' },
  { number: '2', label: 'Mannschaften' },
  { number: '1', label: 'Europacup-Sieg' },
]

export default function About() {
  const ref = useScrollAnimation()

  return (
    <section id="club" className="bg-paper py-16 sm:py-20 lg:py-32">
      <div ref={ref} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-10 lg:gap-16 items-center">
          <div>
            <span data-animate className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-ember mb-4 opacity-0">
              ÜBER UNS
            </span>

            <h2 data-animate className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-ink leading-[1.05] mb-6 opacity-0">
              Seit über 55 Jahren Badminton in Linz
            </h2>

            <p data-animate className="text-base text-slate leading-relaxed max-w-[520px] mb-8 opacity-0">
              Der BSC 70 Linz ist einer der erfolgreichsten Badmintonvereine in Österreich. Gegründet 1970, blicken wir auf eine über 55-jährige Geschichte voller sportlicher Höhepunkte zurück — vom Nachwuchs bis zu den Senioren.
            </p>

            <div data-stagger className="flex flex-wrap items-center gap-y-6 gap-x-8 mb-8">
              {stats.map((stat, i) => (
                <div key={i} data-stagger-item className="flex items-center gap-8 opacity-0">
                  <div>
                    <div className="text-[clamp(2rem,5vw,4rem)] font-bold tracking-tight text-ink leading-none">
                      {stat.number}
                    </div>
                    <div className="text-sm text-slate mt-1">{stat.label}</div>
                  </div>
                  {i < stats.length - 1 && (
                    <div className="hidden sm:block w-px h-10 bg-[rgba(26,28,35,0.08)]" />
                  )}
                </div>
              ))}
            </div>

            <p data-animate className="text-base text-slate leading-relaxed max-w-[520px] opacity-0">
              Unsere sportlichen Erfolge reichen vom Nachwuchs bis zu den Senioren. 1992 gelang es dem BSC 70 Feibra Linz als erste und einzige Mannschaft Österreichs, den Europameistertitel der Landesmeister zu erringen. Die 1. Mannschaft ist 7-facher österreichischer Mannschaftsstaatsmeister, die 2. Mannschaft 15-facher OÖ Mannschafts-Landesmeister.
            </p>
          </div>

          <div data-animate className="opacity-0">
            <div className="overflow-hidden rounded-lg">
              <img
                src="/assets/about-court.jpg"
                alt="Badminton Court"
                className="w-full h-auto object-cover hover:scale-[1.02] transition-transform duration-700"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
