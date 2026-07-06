import { Link } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight } from 'lucide-react'
import { boardMembers } from '@/data/boardMembers'

gsap.registerPlugin(ScrollTrigger)

const vorstand = boardMembers.filter((m) => !m.role.includes('Sportlicher Leiter'))
const sportlicheLeitung = boardMembers.filter((m) => m.role.includes('Sportlicher Leiter'))

export default function Impressum() {
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
            Zurück zur Startseite
          </Link>
          <span className="block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4">
            RECHTLICHES
          </span>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05]">
            Impressum
          </h1>
          <p className="mt-4 text-base text-secondary max-w-[600px]">
            Impressum und Offenlegung gemäß § 5 ECG und § 25 MedienG.
          </p>
        </div>

        <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-10 opacity-0 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-primary mb-3">Medieninhaber, Herausgeber und Betreiber der Website</h2>
            <p className="text-sm text-secondary leading-relaxed">
              ASKÖ BSC 70 Linz<br />
              Badminton Sport Club<br />
              pA Obmann DI Stephan Ziermayr<br />
              Reuchlinstraße 4<br />
              4020 Linz<br />
              Österreich
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">ZVR-Zahl</h2>
            <p className="text-sm text-secondary leading-relaxed">222569469</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">Kontakt</h2>
            <p className="text-sm text-secondary leading-relaxed">
              E-Mail: <a href="mailto:office@bsc70linz.at" className="text-accent hover:underline">office@bsc70linz.at</a><br />
              Telefon: <a href="tel:+436767042186" className="text-accent hover:underline">+43 676 7042186</a>
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">Vereinszweck / Tätigkeitsbereich</h2>
            <p className="text-sm text-secondary leading-relaxed">
              Der Verein bezweckt die Förderung, Ausübung und Organisation des Badmintonsports. Dazu zählen insbesondere Trainingsbetrieb, Nachwuchsarbeit, Mannschafts- und Wettkampfbetrieb, Vereinsveranstaltungen sowie die Information von Mitgliedern, Spielerinnen und Spielern, Eltern, Interessierten und der Öffentlichkeit über Vereinsaktivitäten.
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">Grundlegende Richtung der Website / Blattlinie</h2>
            <p className="text-sm text-secondary leading-relaxed">
              Diese Website dient der Information über den Verein ASKÖ BSC 70 Linz, dessen Trainings- und Spielbetrieb, Mannschaften, Nachwuchsarbeit, Veranstaltungen, sportliche Ergebnisse, Mitgliedschaft, Kontaktmöglichkeiten und sonstige Vereinsaktivitäten.
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">Vertretungsbefugte Organe / Vereinsvorstand</h2>
            <p className="text-xs text-dim mb-3">
              Siehe auch <Link to="/#vorstand" className="text-accent hover:underline">Unser Vorstand</Link> auf der Startseite.
            </p>
            <ul className="text-sm text-secondary leading-relaxed space-y-1">
              {vorstand.map((m) => (
                <li key={m.name}>{m.name}, {m.role}</li>
              ))}
            </ul>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">Sportliche Leitung</h2>
            <ul className="text-sm text-secondary leading-relaxed space-y-1">
              {sportlicheLeitung.map((m) => (
                <li key={m.name}>{m.name}, {m.role}</li>
              ))}
            </ul>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">Mitgliedschaft</h2>
            <p className="text-sm text-secondary leading-relaxed">Mitgliedsverein der ASKÖ.</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">Verantwortlich für den Inhalt</h2>
            <p className="text-sm text-secondary leading-relaxed">ASKÖ BSC 70 Linz</p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">Urheberrecht</h2>
            <p className="text-sm text-secondary leading-relaxed">
              Die Inhalte dieser Website, insbesondere Texte, Bilder, Grafiken, Logos und sonstige Medien, sind urheberrechtlich geschützt. Eine Verwendung, Vervielfältigung, Bearbeitung oder Weitergabe ist nur mit Zustimmung des jeweiligen Rechteinhabers zulässig, soweit keine gesetzliche Erlaubnis besteht.
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">Haftung für Inhalte</h2>
            <p className="text-sm text-secondary leading-relaxed">
              Die Inhalte dieser Website werden mit größtmöglicher Sorgfalt erstellt und gepflegt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte wird keine Gewähr übernommen.
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">Haftung für externe Links</h2>
            <p className="text-sm text-secondary leading-relaxed">
              Diese Website kann Links zu externen Websites Dritter enthalten. Auf deren Inhalte hat der Verein keinen Einfluss. Für die Inhalte verlinkter Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.
            </p>
          </section>

          <section className="pt-8 border-t border-theme">
            <h2 className="text-lg font-semibold text-primary mb-3">Vereins-Kontodaten</h2>
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
