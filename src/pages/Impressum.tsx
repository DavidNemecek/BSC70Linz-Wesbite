import { Link } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight } from 'lucide-react'
import { boardMembers } from '@/data/boardMembers'
import { clubInfo } from '@/data/clubInfo'
import { useLanguage } from '@/context/LanguageContext'

gsap.registerPlugin(ScrollTrigger)

export default function Impressum() {
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
            {t.impressum.back}
          </Link>
          <span className="block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4">
            {t.impressum.overline}
          </span>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05]">
            {t.impressum.title}
          </h1>
          <p className="mt-4 text-base text-secondary max-w-[600px]">
            {t.impressum.subtitle}
          </p>
        </div>

        <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-10 opacity-0 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-primary mb-3">{t.impressum.mediaOwnerHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">
              {t.impressum.mediaOwnerLines.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.impressum.mediaOwnerLines.length - 1 && <br />}
                </span>
              ))}
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.impressum.zvrHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">{t.impressum.zvrValue}</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.impressum.contactHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">
              {t.impressum.emailLabel}: <a href={`mailto:${clubInfo.officeEmail}`} className="text-accent hover:underline">{clubInfo.officeEmail}</a><br />
              {t.impressum.phoneLabel}: <a href={`tel:${clubInfo.phone.replace(/\s/g, '')}`} className="text-accent hover:underline">{clubInfo.phone}</a>
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.impressum.purposeHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">
              {t.impressum.purposeText}
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.impressum.directionHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">
              {t.impressum.directionText}
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.impressum.boardHeading}</h2>
            <p className="text-xs text-dim mb-3">
              {t.impressum.boardSeeAlso} <Link to="/#vorstand" className="text-accent hover:underline">{t.impressum.boardLinkText}</Link> {t.impressum.boardLinkSuffix}
            </p>
            <ul className="text-sm text-secondary leading-relaxed space-y-1">
              {boardMembers.map((m) => (
                <li key={m.name}>
                  {m.name}, {t.boardRoles[m.roleKey]} —{' '}
                  <a href={`mailto:${m.email}`} className="text-accent hover:underline break-all">{m.email}</a>
                </li>
              ))}
            </ul>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.impressum.membershipHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">{t.impressum.membershipText}</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.impressum.responsibleHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">{t.impressum.responsibleText}</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.impressum.copyrightHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">
              {t.impressum.copyrightText}
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.impressum.contentLiabilityHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">
              {t.impressum.contentLiabilityText}
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.impressum.linkLiabilityHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">
              {t.impressum.linkLiabilityText}
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">{t.impressum.bankHeading}</h2>
            <p className="text-sm text-secondary leading-relaxed">
              IBAN: AT51 5400 0000 0032 3337<br />
              BIC: OBLAAT2L
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
