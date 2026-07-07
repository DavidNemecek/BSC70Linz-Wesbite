import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { useLanguage } from '@/context/LanguageContext'

export default function About() {
  const ref = useScrollAnimation()
  const { t } = useLanguage()
  const stats = t.about.stats

  return (
    <section id="club" className="bg-surface py-16 sm:py-20 lg:py-32">
      <div ref={ref} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-10 lg:gap-16 items-center">
          <div>
            <span data-animate className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4 opacity-0">
              {t.about.overline}
            </span>

            <h2 data-animate className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05] mb-6 opacity-0">
              {t.about.title}
            </h2>

            <p data-animate className="text-base text-secondary leading-relaxed max-w-[520px] mb-8 opacity-0">
              {t.about.paragraph1}
            </p>

            <div data-stagger className="flex flex-wrap items-center gap-y-6 gap-x-8 mb-8">
              {stats.map((stat, i) => (
                <div key={i} data-stagger-item className="flex items-center gap-8 opacity-0">
                  <div>
                    <div className="text-[clamp(2rem,5vw,4rem)] font-bold tracking-tight text-accent leading-none">
                      {stat.number}
                    </div>
                    <div className="text-sm text-muted mt-1">{stat.label}</div>
                  </div>
                  {i < stats.length - 1 && (
                    <div className="hidden sm:block w-px h-10 border-l border-theme" />
                  )}
                </div>
              ))}
            </div>

            <p data-animate className="text-base text-secondary leading-relaxed max-w-[520px] opacity-0">
              {t.about.paragraph2}
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
