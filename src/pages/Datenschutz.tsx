import { Link } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'

gsap.registerPlugin(ScrollTrigger)

export default function Datenschutz() {
  const { t } = useLanguage()
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
            {t.datenschutz.back}
          </Link>
          <span className="block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4">
            {t.datenschutz.overline}
          </span>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05]">
            {t.datenschutz.title}
          </h1>
        </div>

        <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-10 opacity-0 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-primary mb-3">{t.datenschutz.controllerHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed mb-3">{t.datenschutz.controllerIntro}</p>
            <p className="text-sm text-secondary leading-relaxed">
              {t.datenschutz.controllerLines.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.datenschutz.controllerLines.length - 1 && <br />}
                </span>
              ))}
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.datenschutz.aboutHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed mb-3">{t.datenschutz.aboutText1}</p>
            <p className="text-sm text-secondary leading-relaxed">{t.datenschutz.aboutText2}</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.datenschutz.hostingHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">{t.datenschutz.hostingText1}</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.datenschutz.mapsHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">{t.datenschutz.mapsText}</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.datenschutz.vereinsplanerHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">{t.datenschutz.vereinsplanerText}</p>
            <p className="text-sm text-secondary leading-relaxed mt-3">{t.datenschutz.vereinsplanerFormText}</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.datenschutz.legalBasisHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">{t.datenschutz.legalBasisText}</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.datenschutz.storageHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">{t.datenschutz.storageText}</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.datenschutz.cookiesHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">{t.datenschutz.cookiesText}</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.datenschutz.thirdPartyHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">{t.datenschutz.thirdPartyText}</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.datenschutz.rightsHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed mb-3">{t.datenschutz.rightsIntro}</p>
            <ul className="text-sm text-secondary leading-relaxed list-disc list-inside space-y-1">
              {t.datenschutz.rightsItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
