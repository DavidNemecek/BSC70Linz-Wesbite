import { Link, useParams } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight, MapPin, Navigation as NavigationIcon } from 'lucide-react'
// import { PlayCircle } from 'lucide-react' // re-add when the "Video zur Anfahrt" section below is reactivated
import { useLanguage } from '@/context/LanguageContext'
import { hallDirections, type HallId } from '@/data/hallDirections'

gsap.registerPlugin(ScrollTrigger)

export default function Anfahrt() {
  const { hall } = useParams<{ hall: string }>()
  const { t } = useLanguage()
  const containerRef = useRef<HTMLDivElement>(null)

  const location = t.training.locations.find((loc) => loc.id === hall)
  const directions = location ? hallDirections[hall as HallId] : undefined

  useEffect(() => {
    if (!containerRef.current) return

    const ctx = gsap.context(() => {
      const elements = containerRef.current!.querySelectorAll('[data-animate]')
      elements.forEach((el) => {
        gsap.fromTo(el, { opacity: 0, y: 40 }, {
          opacity: 1, y: 0, duration: 0.7, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' }
        })
      })
    }, containerRef)

    return () => ctx.revert()
  }, [])

  if (!location || !directions) {
    return (
      <div className="bg-page min-h-screen pt-[72px]">
        <div className="max-w-[720px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors">
            <ArrowRight className="w-4 h-4 rotate-180" />
            {t.anfahrt.back}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-page min-h-screen pt-[72px]">
      <div ref={containerRef} className="max-w-[720px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        <div data-animate className="mb-10 opacity-0">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors mb-6">
            <ArrowRight className="w-4 h-4 rotate-180" />
            {t.anfahrt.back}
          </Link>
          <span className="block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4">
            {t.anfahrt.overline}
          </span>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05]">
            {t.anfahrt.titlePrefix} {location.title}
          </h1>
        </div>

        <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-8 opacity-0 mb-8">
          <div className="flex items-center gap-3 mb-3">
            <MapPin className="w-5 h-5 text-accent flex-shrink-0" />
            <h2 className="text-lg font-semibold text-primary">{t.anfahrt.addressHeading}</h2>
          </div>
          <p className="text-sm text-secondary mb-6">{location.address}</p>
          <a
            href={directions.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-accent-gradient text-white text-sm font-semibold rounded-full px-8 py-3.5 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(14,143,185,0.4)] transition-all duration-200"
          >
            <NavigationIcon className="w-4 h-4" />
            {t.anfahrt.routeButton}
          </a>
        </div>

        <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-8 opacity-0 mb-8">
          <h2 className="text-lg font-semibold text-primary mb-4">{t.anfahrt.photoHeading}</h2>
          <div className="rounded-lg border border-theme overflow-hidden">
            <img
              src={directions.overviewImage}
              alt={t.anfahrt.photoHeading}
              loading="lazy"
              decoding="async"
              className="w-full h-auto object-contain"
            />
          </div>
        </div>

        {directions.routeImages && directions.routeImages.length > 0 && (
          <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-8 opacity-0 mb-8">
            <h2 className="text-lg font-semibold text-primary mb-4">{t.anfahrt.routePhotosHeading}</h2>
            <div className="space-y-4">
              {directions.routeImages.map((image, i) => (
                <div key={image} className="rounded-lg border border-theme overflow-hidden">
                  <img
                    src={image}
                    alt={`${t.anfahrt.routePhotosHeading} ${i + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-auto object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Video zur Anfahrt — vorerst ausgeblendet, bis ein echtes Video vorhanden ist.
        <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-8 opacity-0">
          <h2 className="text-lg font-semibold text-primary mb-4">{t.anfahrt.videoHeading}</h2>
          <div className="aspect-video rounded-lg border border-dashed border-theme flex flex-col items-center justify-center gap-3 text-dim">
            <PlayCircle className="w-8 h-8" />
            <span className="text-sm">{t.anfahrt.videoComingSoon}</span>
          </div>
        </div>
        */}
      </div>
    </div>
  )
}
