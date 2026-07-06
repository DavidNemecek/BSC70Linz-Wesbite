import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { Clock, Users, MapPin } from 'lucide-react'

const infoNotes = [
  'Wir spielen grundsätzlich nur an Schultagen. An den schulfreien Tagen (Schulferien, Feiertage, schulautonome Tage) sind die Hallen geschlossen.',
  'Wir bieten ein Training für unsere fortgeschrittenen Nachwuchs-, Hobby- und Ligaspieler an. Badminton-Neulinge jeden Alters können die Grundlagen in unseren Basic-Trainings erlernen.',
  'Bei unseren Trainern können auch privat individuelle (Einzel- u. Gruppen-)Trainings gebucht werden.',
  'Niemand kauft gerne die Katze im Sack! Nutze die Möglichkeit von bis zu drei Schnuppertrainings zu allen Hallenterminen nach vorheriger Anmeldung. Komm vorbei und überzeuge dich selbst!',
]

function ArrowBullet() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0">
      <path d="M2 3 L16 12 L8 12 Z" fill="var(--accent-light)" />
      <path d="M2 21 L16 12 L8 12 Z" fill="var(--accent-dark)" />
    </svg>
  )
}

const schedule = [
  { day: 'Dienstag', time: '17:00 – 19:00', group: 'Nachwuchstraining', location: 'AHS Solar City' },
  { day: 'Dienstag', time: '19:00 – 21:30', group: 'Hobbysportler', location: 'AHS Solar City' },
  { day: 'Donnerstag', time: '18:30 – 21:00', group: 'alle Mitglieder', location: 'AHS Solar City' },
  { day: 'Freitag', time: '18:00 – 19:30', group: 'Training für Anfänger', location: 'Europagym. Auhof' },
  { day: 'Freitag', time: '18:00 – 20:00', group: 'Alle Mitglieder', location: 'Europagym. Auhof' },
]

const locations = [
  {
    label: 'Hauptstandort',
    title: 'AHS Solar City',
    detail: 'Große Halle – 8 Spielfelder',
    address: 'Heliosallee 140–142, 4030 Linz',
    image: '/assets/Hall_Solarcity.jpg',
  },
  {
    title: 'Europagymnasium Auhof',
    detail: 'Große Halle (Halle 2+3) – 6 Spielfelder',
    address: 'Aubrunnerweg 4, 4040 Linz',
    image: '/assets/Hall_Auhof.jpg',
  },
]

export default function Training() {
  const ref = useScrollAnimation()

  return (
    <section id="training" className="bg-card-alt py-16 sm:py-20 lg:py-32">
      <div ref={ref} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <span data-animate className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4 opacity-0">
          TRAINING
        </span>

        <h2 data-animate className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05] mb-10 lg:mb-12 opacity-0">
          Trainingszeiten & Spielmöglichkeiten
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-10 lg:gap-12">
          <div data-stagger className="min-w-0">
            {/* Mobile: stacked cards */}
            <div className="lg:hidden space-y-3">
              {schedule.map((row, i) => (
                <div
                  key={i}
                  data-stagger-item
                  className="bg-card rounded-xl border border-theme p-5 opacity-0"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent mb-3">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{row.day} · {row.time}</span>
                  </div>
                  <div className="flex items-start gap-2 mb-1.5">
                    <Users className="w-4 h-4 text-muted mt-0.5 flex-shrink-0" />
                    <span className="text-sm font-medium text-primary">{row.group}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-muted mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-muted">{row.location}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div data-animate className="hidden lg:block rounded-lg border border-theme overflow-hidden opacity-0">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--accent-dark)' }} className="text-white">
                    <th className="text-left px-4 sm:px-5 py-3 text-xs font-medium uppercase tracking-[0.05em]">Tag</th>
                    <th className="text-left px-4 sm:px-5 py-3 text-xs font-medium uppercase tracking-[0.05em]">Zeit</th>
                    <th className="text-left px-4 sm:px-5 py-3 text-xs font-medium uppercase tracking-[0.05em]">Gruppe</th>
                    <th className="text-left px-4 sm:px-5 py-3 text-xs font-medium uppercase tracking-[0.05em]">Ort</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((row, i) => (
                    <tr
                      key={i}
                      className={i % 2 === 0 ? 'bg-card' : 'bg-card-alt'}
                    >
                      <td className="px-4 sm:px-5 py-3.5 font-medium text-primary whitespace-nowrap">{row.day}</td>
                      <td className="px-4 sm:px-5 py-3.5 text-primary whitespace-nowrap">{row.time}</td>
                      <td className="px-4 sm:px-5 py-3.5 text-primary">{row.group}</td>
                      <td className="px-4 sm:px-5 py-3.5 text-muted whitespace-nowrap">{row.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul data-animate className="mt-6 lg:mt-8 space-y-3 opacity-0">
              {infoNotes.map((note, i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-secondary leading-relaxed">
                  <ArrowBullet />
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <div data-stagger className="space-y-6">
            {locations.map((loc, i) => (
              <div
                key={i}
                data-stagger-item
                className="bg-card rounded-lg border border-theme overflow-hidden opacity-0 hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
              >
                <div className="aspect-[11/6] overflow-hidden">
                  <img
                    src={loc.image}
                    alt={loc.title}
                    className="w-full h-full object-cover hover:scale-[1.04] transition-transform duration-700"
                  />
                </div>
                <div className="p-5 sm:p-6">
                  {loc.label && (
                    <span className="inline-block text-xs font-medium uppercase tracking-[0.05em] bg-accent-glow text-accent rounded-full px-3 py-1 mb-3">
                      {loc.label}
                    </span>
                  )}
                  <h3 className="text-lg font-semibold text-primary tracking-tight mb-1">{loc.title}</h3>
                  <p className="text-sm text-primary mb-1">{loc.detail}</p>
                  <p className="text-sm text-muted">{loc.address}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
