import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { useLanguage } from '@/context/LanguageContext'

const sponsors = [
  { name: 'LINZ AG', logo: '/assets/sponsor-linzag.png', url: 'https://www.linzag.at' },
  { name: 'Magnus Packaging', logo: '/assets/sponsor-magnus-packaging.jpg', url: 'https://www.magnus.at' },
  { name: 'VICTOR Europe', logo: '/assets/sponsor-victor-europe.png', url: 'https://www.victor-europe.com' },
  { name: 'VICTOR Austria', logo: '/assets/sponsor-victor-austria.png', url: 'https://www.victor-austria.at' },
]

export default function Sponsors() {
  const ref = useScrollAnimation()
  const { t } = useLanguage()

  return (
    <section id="sponsoren" className="bg-card-alt py-16 sm:py-20 lg:py-32">
      <div ref={ref} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 text-center">
        {/* No overline here: it read "Partner", which the heading now says
            itself, and repeating the word above it looked like a stutter. */}
        <h2 data-animate className="font-display text-[clamp(2rem,5vw,3.5rem)] tracking-[0.02em] text-primary leading-[1.05] mb-10 lg:mb-12 opacity-0">
          {t.sponsors.title}
        </h2>

        <div data-stagger className="flex flex-wrap items-center justify-center gap-6">
          {sponsors.map((sponsor, i) => (
            <a
              key={i}
              href={sponsor.url}
              target="_blank"
              rel="noopener noreferrer"
              data-stagger-item
              className="bg-white rounded-lg border border-theme h-24 w-full max-w-[220px] px-6 flex items-center justify-center opacity-0 hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
            >
              {/* max-w-full as well as the height cap: wide wordmarks (the
                  VICTOR one is 7:1) would otherwise be sized by height alone
                  and run past the edge of the tile. */}
              <img
                src={sponsor.logo}
                alt={sponsor.name}
                className="max-h-10 sm:max-h-12 max-w-full w-auto object-contain"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
