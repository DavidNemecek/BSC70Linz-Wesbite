import { useScrollAnimation } from '@/hooks/useScrollAnimation'

const schedule = [
  { day: 'Dienstag', time: '17:00 – 19:00', group: 'Nachwuchstraining', location: 'AHS Solar City' },
  { day: 'Dienstag', time: '19:00 – 21:30', group: 'Hobbysportler', location: 'AHS Solar City' },
  { day: 'Donnerstag', time: '18:30 – 21:00', group: 'Bundesliga, alle Mitglieder', location: 'AHS Solar City' },
  { day: 'Freitag', time: '18:00 – 19:30', group: 'Nachwuchstraining (ab 19 Uhr)', location: 'Europagym. Auhof' },
  { day: 'Freitag', time: '19:00 – 20:00', group: 'Alle Mitglieder', location: 'Europagym. Auhof' },
]

const locations = [
  {
    label: 'Hauptstandort',
    title: 'AHS Solar City',
    detail: 'Große Halle – 8 Spielfelder',
    address: 'Heliosallee 140–142, 4030 Linz',
  },
  {
    title: 'Europagymnasium Auhof',
    detail: 'Große Halle (Halle 2+3) – 6 Spielfelder',
    address: 'Aubrunnerweg 4, 4040 Linz',
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
            <div className="overflow-x-auto -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0">
              <div className="min-w-[600px] lg:min-w-0 rounded-lg border border-theme overflow-hidden">
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
                        data-stagger-item
                        className={`opacity-0 ${i % 2 === 0 ? 'bg-card' : 'bg-card-alt'}`}
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
            </div>
          </div>

          <div data-stagger className="space-y-6">
            {locations.map((loc, i) => (
              <div
                key={i}
                data-stagger-item
                className="bg-card rounded-lg border border-theme p-5 sm:p-6 opacity-0 hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
              >
                {loc.label && (
                  <span className="inline-block text-xs font-medium uppercase tracking-[0.05em] bg-accent-glow text-accent rounded-full px-3 py-1 mb-3">
                    {loc.label}
                  </span>
                )}
                <h3 className="text-lg font-semibold text-primary tracking-tight mb-1">{loc.title}</h3>
                <p className="text-sm text-primary mb-1">{loc.detail}</p>
                <p className="text-sm text-muted">{loc.address}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
