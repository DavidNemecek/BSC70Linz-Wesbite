import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { Link } from 'react-router-dom'

const fees = [
  { label: 'Erwachsene', price: '€ 154,00' },
  { label: 'Studenten (bis 26 J.)', price: '€ 84,00' },
  { label: 'Jugendliche (15–18 J.)', price: '€ 55,00' },
  { label: 'Kinder (bis 14 J.)', price: '€ 44,00' },
  { label: 'Familienkarte (2 Erw. + max. 2 Kinder)', price: '€ 264,00' },
  { label: 'Unterstützende Mitglieder', price: '€ 44,00' },
  { label: 'Kindertraining pro Semester', price: '€ 38,50' },
]

const membershipTypes = [
  'Aktive Mitglieder — volle Trainings- und Spielberechtigung',
  'Unterstützende Mitglieder — fördern den Verein durch Beitrag',
  'Ehrenmitglieder — für besondere Verdienste um den Verein',
]

export default function Membership() {
  const ref = useScrollAnimation()

  return (
    <section id="mitgliedschaft" className="py-16 sm:py-20 lg:py-32" style={{ backgroundColor: 'var(--bg-section)' }}>
      <div ref={ref} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <span data-animate className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4 opacity-0">
          MITGLIEDSCHAFT
        </span>

        <h2 data-animate className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05] mb-4 opacity-0">
          Werde Teil des BSC 70 Linz
        </h2>

        <p data-animate className="text-base text-secondary leading-relaxed max-w-[600px] mb-10 lg:mb-12 opacity-0">
          Bei uns ist jeder willkommen, wir machen für jeden Platz — vom Schüler bis zum Senior und vom Anfänger bis zum erfahrenen Spieler.
        </p>

        <div data-stagger className="mb-4 rounded-lg border border-theme overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-theme">
            <span className="text-xs font-medium uppercase tracking-[0.05em] text-accent">Mitgliedschaft</span>
            <span className="text-xs font-medium uppercase tracking-[0.05em] text-accent flex-shrink-0">Jahresbeitrag</span>
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
          Für Turnier- und Meisterschaftsspieler wird zusätzlich die ÖBV Spielberechtigungsgebühr eingehoben.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 mb-10 lg:mb-12">
          <div data-animate className="opacity-0">
            <h3 className="text-lg font-semibold text-primary mb-4">Mitgliedschaftsarten</h3>
            <ul className="space-y-3">
              {membershipTypes.map((type, i) => (
                <li key={i} className="text-sm text-secondary flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
                  {type}
                </li>
              ))}
            </ul>
          </div>

          <div data-animate className="opacity-0">
            <h3 className="text-lg font-semibold text-primary mb-4">Schnuppertraining</h3>
            <p className="text-sm text-secondary leading-relaxed">
              Niemand kauft gerne die Katze im Sack. In allen Hallen besteht die Möglichkeit eines Schnuppertrainings. Komm vorbei und überzeuge dich selbst!
            </p>
          </div>
        </div>

        <div data-animate className="bg-accent-gradient rounded-lg p-6 sm:p-8 lg:p-10 opacity-0">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <h3 className="text-[clamp(1.5rem,3vw,2.8rem)] font-semibold text-white leading-[1.15]">
                Bereit durchzustarten?
              </h3>
              <p className="text-sm text-white/85 mt-2">
                Melde dich zum Schnuppertraining an oder werde direkt Mitglied.
              </p>
            </div>
            <Link
              to="/anmeldung"
              className="inline-flex items-center justify-center bg-white text-accent font-semibold text-sm rounded-full px-8 py-3.5 hover:scale-[1.02] transition-transform duration-200 flex-shrink-0"
            >
              Zur Anmeldung
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
