import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { useLanguage } from '@/context/LanguageContext'

// `label` distinguishes tiles that share a brand mark. VICTOR runs both sites
// as one company — victor-austria.at's own imprint names VICTOR Europe GmbH —
// so there is no Austria-specific logo to tell them apart, and the two tiles
// would otherwise read as the same sponsor listed twice.
const sponsors: { name: string; logo: string; url: string; label?: string }[] = [
  { name: 'LINZ AG', logo: '/assets/sponsor-linzag.png', url: 'https://www.linzag.at' },
  { name: 'Magnus Packaging', logo: '/assets/sponsor-magnus-packaging.jpg', url: 'https://www.magnus.at' },
  { name: 'VICTOR Europe', logo: '/assets/sponsor-victor-europe.png', url: 'https://www.victor-europe.com', label: 'Europe' },
  { name: 'VICTOR Austria', logo: '/assets/sponsor-victor-austria.png', url: 'https://www.victor-austria.at', label: 'Austria' },
  // Reuses the header's ASKÖ file — same current mark, no second copy to keep
  // in step. Labelled because it points at the Oberösterreich association that
  // actually funds the club, while the footer links the federal ASKÖ.
  { name: 'ASKÖ Oberösterreich', logo: '/assets/asko-logo.png', url: 'https://www.askoe-ooe.at', label: 'Oberösterreich' },
  { name: 'Sportland Oberösterreich', logo: '/assets/sponsor-sportland-ooe.png', url: 'https://www.sport-ooe.at' },
  // The city's mark is the stylised "L_nz" wordmark, which does not say
  // "Stadt" — and LINZ AG sits in the same row, so the label disambiguates.
  { name: 'Stadt Linz', logo: '/assets/sponsor-stadt-linz.svg', url: 'https://www.linz.at', label: 'Stadt' },
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
              className="bg-white rounded-lg border border-theme h-24 w-full max-w-[220px] px-6 flex flex-col items-center justify-center gap-1.5 opacity-0 hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
            >
              {/* max-w-full as well as the height cap: wide wordmarks (the
                  VICTOR one is 7:1) would otherwise be sized by height alone
                  and run past the edge of the tile. */}
              <img
                src={sponsor.logo}
                alt={sponsor.name}
                className="max-h-10 sm:max-h-12 max-w-full w-auto object-contain"
              />
              {sponsor.label && (
                // Fixed grey rather than a theme colour: the tile stays white
                // in dark mode, so a theme-aware muted tone would wash out.
                // aria-hidden because alt already carries the full name.
                <span aria-hidden className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#6b7280] leading-none">
                  {sponsor.label}
                </span>
              )}
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
