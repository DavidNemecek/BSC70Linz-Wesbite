import { Link } from 'react-router-dom'
import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight, Mail, FileDown, Eye, Info } from 'lucide-react'
import { clubInfo, juniorTraining, membershipTiers } from '@/data/membership'
import { buildMembershipMailto } from '@/lib/membershipMailto'
import { generateMembershipPdf } from '@/lib/generateMembershipPdf'

gsap.registerPlugin(ScrollTrigger)

export default function Registration() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.scrollTo(0, 0)
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
    <div className="bg-night min-h-screen pt-[72px]">
      <div ref={containerRef} className="max-w-[720px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        {/* Header */}
        <div data-animate className="mb-10 opacity-0">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-ember transition-colors mb-6">
            <ArrowRight className="w-4 h-4 rotate-180" />
            Zurück zur Startseite
          </Link>
          <span className="block text-xs font-medium uppercase tracking-[0.15em] text-ember mb-4">
            ANMELDUNG
          </span>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-white leading-[1.05]">
            Mitglied werden
          </h1>
          <p className="mt-4 text-base text-white/60">
            Klicke auf den E-Mail-Button — dein E-Mail-Programm öffnet sich mit einer fertigen Vorlage der
            Beitrittserklärung. Du musst nur noch deine persönlichen Daten ergänzen und die E-Mail absenden.
          </p>
        </div>

        {/* Option 1: E-Mail */}
        <div data-animate className="bg-charcoal rounded-xl border border-white/[0.08] p-6 sm:p-8 mb-6 opacity-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-ember/20 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-ember" />
            </div>
            <h2 className="text-lg font-semibold text-white">Per E-Mail anmelden</h2>
          </div>
          <p className="text-sm text-white/60 mb-6">
            Öffnet dein E-Mail-Programm mit vorausgefüllter Betreffzeile und einer Vorlage — Mitgliedschaft
            ankreuzen, persönliche Daten eintragen, absenden.
          </p>
          <a
            href={mailtoHref}
            className="inline-flex items-center gap-2 bg-ember text-white text-base font-semibold rounded-full px-8 py-4 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(232,80,44,0.4)] transition-all duration-200"
          >
            <Mail className="w-4 h-4" />
            Anmeldung per E-Mail senden
          </a>
        </div>

        {/* Option 2: Download */}
        <div data-animate className="bg-charcoal rounded-xl border border-white/[0.08] p-6 sm:p-8 mb-6 opacity-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-ember/20 flex items-center justify-center shrink-0">
              <FileDown className="w-5 h-5 text-ember" />
            </div>
            <h2 className="text-lg font-semibold text-white">Formular herunterladen</h2>
          </div>
          <p className="text-sm text-white/60 mb-6">
            Alternativ kannst du die Beitrittserklärung als PDF herunterladen und handschriftlich ausfüllen.
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => generateMembershipPdf()}
              className="inline-flex items-center gap-2 bg-white/[0.06] border border-white/[0.15] text-white text-base font-semibold rounded-full px-8 py-4 hover:bg-white/[0.1] transition-all duration-200"
            >
              <FileDown className="w-4 h-4" />
              Formular als PDF herunterladen
            </button>
            <Link
              to="/beitrittserklaerung"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors self-center"
            >
              <Eye className="w-4 h-4" />
              Vorschau ansehen / drucken
            </Link>
          </div>
        </div>

        {/* Fallback instructions */}
        <div data-animate className="flex items-start gap-3 text-sm text-white/50 mb-10 opacity-0">
          <Info className="w-4 h-4 text-ember mt-0.5 shrink-0" />
          <p>
            Falls sich dein E-Mail-Programm nicht automatisch öffnet: Beitrittserklärung herunterladen, ausfüllen
            und per E-Mail an{' '}
            <a href={`mailto:${clubInfo.registrationEmail}`} className="text-ember hover:underline">
              {clubInfo.registrationEmail}
            </a>{' '}
            senden oder in der Halle abgeben.
          </p>
        </div>

        {/* Fee overview */}
        <div data-animate className="opacity-0">
          <h2 className="text-lg font-semibold text-white mb-4">Mitgliedschaften &amp; Jahresbeiträge</h2>
          <div className="bg-charcoal rounded-xl border border-white/[0.08] overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {membershipTiers.map((tier, i) => (
                  <tr key={tier.id} className={i % 2 === 0 ? 'bg-white/[0.02]' : ''}>
                    <td className="px-4 sm:px-6 py-3.5 text-white/80">{tier.label}</td>
                    <td className="px-4 sm:px-6 py-3.5 text-right font-semibold text-white whitespace-nowrap">€ {tier.price}</td>
                  </tr>
                ))}
                <tr className="border-t border-white/[0.08]">
                  <td className="px-4 sm:px-6 py-3.5 text-white/80">{juniorTraining.label}</td>
                  <td className="px-4 sm:px-6 py-3.5 text-right font-semibold text-white whitespace-nowrap">€ {juniorTraining.price}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
