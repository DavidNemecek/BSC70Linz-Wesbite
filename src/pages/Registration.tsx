import { Link } from 'react-router-dom'
import { useRef, useEffect, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight, ClipboardList, FileDown, Info, ExternalLink, CheckCircle2 } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { clubInfo } from '@/data/clubInfo'
import { generateMembershipPdf } from '@/lib/generateMembershipPdf'
import { FORM_ORIGIN, registrationFormUrl, hasLocalisedForm } from '@/data/registrationForm'

gsap.registerPlugin(ScrollTrigger)

/**
 * The club's registration form, hosted by Vereinsplaner (our Art. 28 processor)
 * and embedded here. This is the only third-party content the site loads, and
 * only on this page — see the Vereinsplaner section of the privacy policy.
 *
 * The embed sends the parent window a bare 'form-submitted' string on success
 * but never reports its content height, so the iframe cannot auto-size to its
 * content across origins. Hence the fixed viewport-relative height below and
 * the form's own internal scrollbar.
 */
export default function Registration() {
  const { t, language } = useLanguage()
  const formUrl = registrationFormUrl(language)
  const { fees, tableHeaders } = t.membership
  const containerRef = useRef<HTMLDivElement>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    const ctx = gsap.context(() => {
      const elements = containerRef.current!.querySelectorAll('[data-animate]')
      elements.forEach((el) => {
        gsap.fromTo(el, { opacity: 0, y: 40 }, {
          opacity: 1, y: 0, duration: 0.7, ease: 'power3.out',
          // immediateRender: false so a ScrollTrigger.refresh() cannot re-apply
          // the hidden "from" state to blocks that have already played. The
          // submit swap below triggers exactly such a refresh, and the initial
          // hidden state comes from the opacity-0 class anyway.
          immediateRender: false,
          scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' }
        })
      })
    }, containerRef)

    return () => ctx.revert()
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // The embed broadcasts with targetOrigin '*', so any frame or opener
      // could send this same string. Only act on it when it demonstrably came
      // from the form itself.
      if (event.origin !== FORM_ORIGIN) return
      if (event.data === 'form-submitted') setSubmitted(true)
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!submitted) return

    // Swapping the tall iframe for the short confirmation shifts everything
    // below it up by ~700px. ScrollTrigger still holds the start positions it
    // measured before that, so the cards further down would never reach their
    // trigger point and stay stuck at opacity 0. Remeasure after the paint.
    const frame = requestAnimationFrame(() => ScrollTrigger.refresh())
    return () => cancelAnimationFrame(frame)
  }, [submitted])

  return (
    <div className="bg-page min-h-screen pt-[72px]">
      <div ref={containerRef} className="max-w-[860px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
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
            {t.registration.subtitle}
          </p>
        </div>

        {/* Option 1: the embedded online form. The wrapper stays mounted across
            the submit swap so its scroll-in animation is not re-registered. */}
        <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-8 mb-6 opacity-0">
          {submitted ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-full bg-accent-glow flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-7 h-7 text-accent" />
              </div>
              <h2 className="text-xl font-semibold text-primary mb-3">{t.registration.submittedTitle}</h2>
              <p className="text-sm text-secondary max-w-[52ch] mx-auto">{t.registration.submittedText}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-accent-glow flex items-center justify-center shrink-0">
                  <ClipboardList className="w-5 h-5 text-accent" />
                </div>
                <h2 className="text-lg font-semibold text-primary">{t.registration.formCardTitle}</h2>
              </div>
              <p className="text-sm text-secondary mb-3">
                {t.registration.formCardText}
              </p>
              <p className="text-sm text-secondary mb-6">
                {t.registration.formAccountText}
                {!hasLocalisedForm(language) && (
                  <> {t.registration.formGermanOnlyNote}</>
                )}
              </p>

              {/* bg-white: the embedded form is locked to a light colour scheme
                  and renders on a white canvas, so the frame must not inherit
                  the site's dark theme behind it.
                  -mx-6: on phones the form needs every pixel for its two-column
                  field rows, so it breaks out of the card's padding there and
                  only becomes an inset, rounded sheet from sm upwards. */}
              <div className="-mx-6 sm:mx-0 border-y sm:border sm:rounded-lg border-theme overflow-hidden bg-white">
                <iframe
                  // Keyed by language so switching swaps in a fresh frame
                  // rather than navigating the existing one, which would push
                  // an entry onto the browser's history.
                  key={language}
                  src={formUrl}
                  title={t.registration.formIframeTitle}
                  className="block w-full h-[80vh] min-h-[560px] max-h-[1100px] border-0"
                />
              </div>

              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-xs text-muted">
                  {t.registration.formPrivacyNote}{' '}
                  <Link to="/datenschutz" className="text-accent hover:underline">
                    {t.registration.formPrivacyLinkText}
                  </Link>
                  .
                </p>
                <a
                  href={formUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-accent hover:underline shrink-0"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t.registration.formOpenExternal}
                </a>
              </div>
            </>
          )}
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
          <button
            onClick={() => generateMembershipPdf(language)}
            className="inline-flex items-center gap-2 border border-theme text-primary text-base font-semibold rounded-full px-8 py-4 hover:bg-card-alt transition-all duration-200"
          >
            <FileDown className="w-4 h-4" />
            {t.registration.downloadButton}
          </button>
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
