import { Link } from 'react-router-dom'
import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight, Mail, FileDown, Eye, Info } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { clubInfo } from '@/data/clubInfo'
import { buildMembershipMailto } from '@/lib/membershipMailto'
import { generateMembershipPdf } from '@/lib/generateMembershipPdf'

gsap.registerPlugin(ScrollTrigger)

export default function Registration() {
  const { t } = useLanguage()
  const { fees, tableHeaders } = t.membership
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

  const mailtoHref = buildMembershipMailto()

  return (
    <div className="bg-page min-h-screen pt-[72px]">
      <div ref={containerRef} className="max-w-[720px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        {/* Header */}
        <div data-animate className="mb-10 opacity-0">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors mb-6">
            <ArrowRight className="w-4 h-4 rotate-180" />
            {t.registration.back}
          </Link>
          <span className="block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4">
            {t.registration.overline}
          </span>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05]">
            {t.registration.title}
          </h1>
          <p className="mt-4 text-base text-secondary">
            {t.registration.subtitlePrefix}
          </p>
        </div>

        {/* Option 1: E-Mail */}
        <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-8 mb-6 opacity-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-accent-glow flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-accent" />
            </div>
            <h2 className="text-lg font-semibold text-primary">{t.registration.emailCardTitle}</h2>
          </div>
          <p className="text-sm text-secondary mb-6">
            {t.registration.emailCardText}
          </p>
          <a
            href={mailtoHref}
            className="inline-flex items-center gap-2 bg-accent-gradient text-white text-base font-semibold rounded-full px-8 py-4 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(14,143,185,0.4)] transition-all duration-200"
          >
            <Mail className="w-4 h-4" />
            {t.registration.emailButton}
          </a>
        </div>

        {/* Option 2: Download */}
        <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-8 mb-6 opacity-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-accent-glow flex items-center justify-center shrink-0">
              <FileDown className="w-5 h-5 text-accent" />
            </div>
            <h2 className="text-lg font-semibold text-primary">{t.registration.downloadCardTitle}</h2>
          </div>
          <p className="text-sm text-secondary mb-6">
            {t.registration.downloadCardText}
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => generateMembershipPdf()}
              className="inline-flex items-center gap-2 border border-theme text-primary text-base font-semibold rounded-full px-8 py-4 hover:bg-card-alt transition-all duration-200"
            >
              <FileDown className="w-4 h-4" />
              {t.registration.downloadButton}
            </button>
            <Link
              to="/beitrittserklaerung"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors self-center"
            >
              <Eye className="w-4 h-4" />
              {t.registration.previewLink}
            </Link>
          </div>
        </div>

        {/* Fallback instructions */}
        <div data-animate className="flex items-start gap-3 text-sm text-muted mb-10 opacity-0">
          <Info className="w-4 h-4 text-accent mt-0.5 shrink-0" />
          <p>
            {t.registration.fallbackNote}{' '}
            <a href={`mailto:${clubInfo.registrationEmail}`} className="text-accent hover:underline">
              {clubInfo.registrationEmail}
            </a>{' '}
            {t.registration.fallbackNoteSuffix}
          </p>
        </div>

        {/* Fee overview */}
        <div data-animate className="opacity-0">
          <h2 className="text-lg font-semibold text-primary mb-4">{t.registration.feesHeading}</h2>
          <div className="rounded-xl border border-theme overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-theme">
              <span className="text-xs font-medium uppercase tracking-[0.05em] text-accent">{tableHeaders.membership}</span>
              <span className="text-xs font-medium uppercase tracking-[0.05em] text-accent flex-shrink-0">{tableHeaders.fee}</span>
            </div>
            {fees.map((fee, i) => (
              <div
                key={i}
                className={`flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 ${i % 2 === 0 ? 'bg-card' : ''}`}
              >
                <span className="text-sm text-secondary">{fee.label}</span>
                <span className="font-semibold text-primary whitespace-nowrap flex-shrink-0">{fee.price}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
