import { Link } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'

gsap.registerPlugin(ScrollTrigger)

export default function Chronik() {
  const { t } = useLanguage()
  const eras = t.chronik.eras
  const containerRef = useRef<HTMLDivElement>(null)

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

  return (
    <div className="bg-page min-h-screen pt-[72px]">
      <div ref={containerRef} className="max-w-[840px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        <div data-animate className="mb-12 opacity-0">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors mb-6">
            <ArrowRight className="w-4 h-4 rotate-180" />
            {t.chronik.back}
          </Link>
          <span className="block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4">
            {t.chronik.overline}
          </span>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05]">
            {t.chronik.title}
          </h1>
          <p className="mt-4 text-base text-secondary max-w-[600px]">
            {t.chronik.subtitle}
          </p>
        </div>

        <div className="space-y-10">
          {eras.map((era) => (
            <div
              key={era.period}
              data-animate
              className="bg-card rounded-xl border border-theme p-6 sm:p-10 opacity-0"
            >
              <span className="inline-block text-xs font-medium uppercase tracking-[0.05em] bg-accent-gradient text-white rounded-full px-3 py-1 mb-4">
                {era.period}
              </span>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-primary mb-5 leading-tight">
                {era.title}
              </h2>
              <div className="space-y-4">
                {era.paragraphs.map((p, i) => (
                  <p key={i} className="text-base text-secondary leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
