import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { Link } from 'react-router-dom'
import { juniorTraining, membershipTiers } from '@/data/membership'

const fees = [
  ...membershipTiers.map((tier) => ({ label: tier.label, price: `€ ${tier.price}` })),
  { label: juniorTraining.label, price: `€ ${juniorTraining.price}` },
]

const membershipTypes = [
  'Aktive Mitglieder — volle Trainings- und Spielberechtigung',
  'Unterstützende Mitglieder — fördern den Verein durch Beitrag',
  'Ehrenmitglieder — für besondere Verdienste um den Verein',
]

export default function Membership() {
  const ref = useScrollAnimation()

  return (
    <section id="mitgliedschaft" className="bg-night py-16 sm:py-20 lg:py-32">
      <div ref={ref} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <span data-animate className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-ember mb-4 opacity-0">
          MITGLIEDSCHAFT
        </span>

        <h2 data-animate className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-white leading-[1.05] mb-4 opacity-0">
          Werde Teil des BSC 70 Linz
        </h2>

        <p data-animate className="text-base text-white/60 leading-relaxed max-w-[600px] mb-10 lg:mb-12 opacity-0">
          Bei uns ist jeder willkommen — vom Anfänger bis zum erfahrenen Spieler. Wir bieten faire Beiträge, professionelle Betreuung und eine tolle Gemeinschaft.
        </p>

        <div data-stagger className="mb-10 lg:mb-12 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0">
          <div className="overflow-x-auto">
            <div className="min-w-[500px] lg:min-w-0">
              <div className="overflow-hidden rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08]">
                      <th className="text-left px-4 sm:px-6 py-4 text-xs font-medium uppercase tracking-[0.05em] text-ember">Mitgliedschaft</th>
                      <th className="text-right px-4 sm:px-6 py-4 text-xs font-medium uppercase tracking-[0.05em] text-ember">Jahresbeitrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((fee, i) => (
                      <tr
                        key={i}
                        data-stagger-item
                        className={`opacity-0 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}
                      >
                        <td className="px-4 sm:px-6 py-4 text-white/80">{fee.label}</td>
                        <td className="px-4 sm:px-6 py-4 text-right text-base sm:text-lg font-semibold text-white">{fee.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 mb-10 lg:mb-12">
          <div data-animate className="opacity-0">
            <h3 className="text-lg font-semibold text-white mb-4">Mitgliedschaftsarten</h3>
            <ul className="space-y-3">
              {membershipTypes.map((type, i) => (
                <li key={i} className="text-sm text-white/60 flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-ember mt-2 flex-shrink-0" />
                  {type}
                </li>
              ))}
            </ul>
          </div>

          <div data-animate className="opacity-0">
            <h3 className="text-lg font-semibold text-white mb-4">Schnuppertraining</h3>
            <p className="text-sm text-white/60 leading-relaxed">
              Niemand kauft gerne die Katze im Sack. In allen Hallen besteht die Möglichkeit eines Schnuppertrainings. Komm vorbei und überzeuge dich selbst!
            </p>
          </div>
        </div>

        <div data-animate className="bg-ember rounded-lg p-6 sm:p-8 lg:p-10 opacity-0">
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
              className="inline-flex items-center justify-center bg-white text-ember font-semibold text-sm rounded-full px-8 py-3.5 hover:scale-[1.02] transition-transform duration-200 flex-shrink-0"
            >
              Zur Anmeldung
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
