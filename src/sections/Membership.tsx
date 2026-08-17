import { useState } from 'react'
import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { Link } from 'react-router-dom'
import { Info } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { buildTrialMailto } from '@/lib/trialMailto'

export default function Membership() {
  const ref = useScrollAnimation()
  const { t } = useLanguage()
  const { fees, tableHeaders } = t.membership
  const trialMailtoHref = buildTrialMailto()
  // Which tier has its conditions expanded. Only one at a time keeps the
  // table from growing tall enough to lose the header on small screens.
  const [openFee, setOpenFee] = useState<number | null>(null)

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
          {fees.map((fee, i) => {
            const isOpen = openFee === i
            return (
              <div
                key={i}
                data-stagger-item
                className={`opacity-0 ${i % 2 === 0 ? 'bg-card' : ''}`}
              >
                <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4">
                  <span className="text-sm text-secondary min-w-0">
                    {fee.label}
                    {fee.detail && (
                      <button
                        type="button"
                        onClick={() => setOpenFee(isOpen ? null : i)}
                        aria-expanded={isOpen}
                        aria-controls={`fee-detail-${i}`}
                        aria-label={`${fee.label} — ${t.membership.detailToggleLabel}`}
                        title={t.membership.detailToggleLabel}
                        className={`ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full align-middle transition-colors duration-200 ${
                          isOpen
                            ? 'bg-accent text-white'
                            : 'text-accent hover:bg-accent-glow'
                        }`}
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                  <span className="text-base sm:text-lg font-semibold text-primary whitespace-nowrap flex-shrink-0">{fee.price}</span>
                </div>
                {fee.detail && isOpen && (
                  <p
                    id={`fee-detail-${i}`}
                    className="mx-4 sm:mx-6 mb-4 border-l-2 border-accent bg-accent-glow rounded-r px-4 py-3 text-sm text-secondary leading-relaxed max-w-[70ch]"
                  >
                    {fee.detail}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <p data-animate className="text-base text-primary mb-2 opacity-0">
          {t.membership.validity}
        </p>

        <p data-animate className="text-base text-primary mb-10 lg:mb-12 opacity-0">
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
            <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
              <a
                href={trialMailtoHref}
                className="inline-flex items-center justify-center bg-transparent border border-white/60 text-white font-semibold text-sm rounded-full px-8 py-3.5 hover:bg-white/10 transition-colors duration-200"
              >
                {t.membership.trialButton}
              </a>
              <Link
                to="/anmeldung"
                className="inline-flex items-center justify-center bg-white text-accent font-semibold text-sm rounded-full px-8 py-3.5 hover:scale-[1.02] transition-transform duration-200"
              >
                {t.membership.ctaButton}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
