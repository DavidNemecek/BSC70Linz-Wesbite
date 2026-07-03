import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { Link } from 'react-router-dom'

export default function Contact() {
  const ref = useScrollAnimation()

  return (
    <section id="kontakt" className="bg-surface py-16 sm:py-20 lg:py-32">
      <div ref={ref} className="max-w-[720px] mx-auto px-4 sm:px-6 lg:px-10 text-center">
        <h2 data-animate className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05] mb-6 opacity-0">
          Wir freuen uns auf dich
        </h2>

        <p data-animate className="text-base text-muted leading-relaxed mb-10 opacity-0">
          Hast du Fragen zur Mitgliedschaft, zum Training oder möchtest du einfach mehr über unseren Verein erfahren? Schreib uns oder komm direkt zum Training vorbei.
        </p>

        <div data-stagger className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          <a
            data-stagger-item
            href="mailto:anmeldung@bsc70linz.at"
            className="w-full sm:w-auto inline-flex items-center justify-center bg-accent-gradient text-white text-sm font-semibold rounded-full px-8 py-3.5 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(14,143,185,0.4)] transition-all duration-200 opacity-0"
          >
            E-Mail schreiben
          </a>
          <Link
            data-stagger-item
            to="/anmeldung"
            className="w-full sm:w-auto inline-flex items-center justify-center bg-transparent border-[1.5px] border-primary text-primary text-sm font-semibold rounded-full px-8 py-3.5 hover:bg-primary hover:text-[var(--bg-page)] transition-all duration-200 opacity-0"
          >
            Online anmelden
          </Link>
        </div>

        <div data-animate className="opacity-0">
          <h3 className="text-lg font-semibold text-primary mb-1">ASKÖ BSC 70 Linz</h3>
          <p className="text-sm text-muted">Badminton Sport Club Linz</p>
        </div>
      </div>
    </section>
  )
}
