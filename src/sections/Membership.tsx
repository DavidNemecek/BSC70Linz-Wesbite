import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { Link } from 'react-router-dom'
import { useLanguage } from '@/context/LanguageContext'

export default function Membership() {
  const ref = useScrollAnimation()
  const { t } = useLanguage()
  const { fees, tableHeaders } = t.membership

  return (
    <section id="mitgliedschaft" className="py-16 sm:py-20 lg:py-32" style={{ backgroundColor: 'var(--bg-section)' }}>
      <div ref={ref} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <span data-animate className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4 opacity-0">
          {t.membership.overline}
        </span>

        <h2 data-animate className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05] mb-4 opacity-0">
          {t.membership.title}
        </h2>

        <p data-animate className="text-base text-secondary leading-relaxed max-w-[600px] mb-10 lg:mb-12 opacity-0">
          {t.membership.subtitle}
        </p>

        <div data-stagger className="mb-4 rounded-lg border border-theme overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-theme">
            <span className="text-xs font-medium uppercase tracking-[0.05em] text-accent">{tableHeaders.membership}</span>
            <span className="text-xs font-medium uppercase tracking-[0.05em] text-accent flex-shrink-0">{tableHeaders.fee}</span>
          </div>
          {fees.map((fee, i) => (
            <div
              key={i}
              data-stagger-item
              className={`flex items-center justify-between gap-4 px-4 sm:px-6 py-4 opacity-0 ${i % 2 === 0 ? 'bg-card' : ''}`}
            >
              <span className="text-sm text-secondary">{fee.label}</span>
              <span className="text-base sm:text-lg font-semibold text-primary whitespace-nowrap flex-shrink-0">{fee.price}</span>
            </div>
          ))}
        </div>

        <p data-animate className="text-xs text-dim mb-10 lg:mb-12 opacity-0">
          {t.membership.note}
        </p>

        <div data-animate className="bg-accent-gradient rounded-lg p-6 sm:p-8 lg:p-10 opacity-0">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <h3 className="text-[clamp(1.5rem,3vw,2.8rem)] font-semibold text-white leading-[1.15]">
                {t.membership.ctaTitle}
              </h3>
              <p className="text-sm text-white/85 mt-2">
                {t.membership.ctaText}
              </p>
            </div>
            <Link
              to="/anmeldung"
              className="inline-flex items-center justify-center bg-white text-accent font-semibold text-sm rounded-full px-8 py-3.5 hover:scale-[1.02] transition-transform duration-200 flex-shrink-0"
            >
              {t.membership.ctaButton}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
