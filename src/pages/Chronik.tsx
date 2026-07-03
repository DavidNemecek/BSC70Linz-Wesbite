import { Link } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight } from 'lucide-react'

gsap.registerPlugin(ScrollTrigger)

const eras = [
  {
    period: '1970 – 1979',
    title: 'Die Gründung',
    paragraphs: [
      'Am 3. Februar 1970 erlebte Linz mit der Gründung des BSC 70 Linz die Geburtsstunde eines der erfolgreichsten Badminton Vereine in Österreich.',
      'Ein großer Dank gilt Hilde und Gerti Bogensperger, Hofrat Richard Hemmelmayr, Fritz Wallner, Karl Klesadl und Hans Bogensperger für den Mut zur Gründung dieses Vereines.',
      'Bereits damals gab es viele, die die Arbeit der Gründungsmitglieder als Besserwisser sabotieren wollten. Doch wie man sieht, gelang es ihnen nicht, und der BSC 70 Linz feiert im Jahr 2010 bereits sein 40-jähriges Bestehen. Schon 2 Jahre nach der Gründung gelang der Sprung in die Staatsliga B. Ab dem Jahr 1977 spielte man in der höchsten österreichischen Liga – der Staatsliga A. 1978 gelang es, den 1. Trainer des BSC 70 Linz – Dr. Jürgen Ranzmayer – zu verpflichten. Durch ihn wurden Talente wie Gerhard Hofer, der es sogar zum Staatsmeister und vielfachen Landesmeister brachte, und Wilfried Zieri stark gefördert.',
      'In seine Zeit fiel auch die Verpflichtung von Tariq Farooq, der als pakistanischer Weltklassespieler nach Österreich geholt wurde.',
      'Mit dem Einstieg des Verteilerprofis – FEIBRA – konnte ein edler Förderer für den Sport gefunden werden. Feibra-Gründer KR Anton Feistl investierte in Badminton als Plattform. Durch seine Hilfe wurde aus dem Verein BSC 70 Linz einer der erfolgreichsten Badmintonvereine, der sich mittlerweile auch über 33 Jahre (2010) in der Staatsliga/Bundesliga präsentieren kann. Das ist wirklich einzigartig.',
      'Tariq Farooq wurde als erster Badminton-Legionär für den österreichischen Badmintonsport verpflichtet. Der pakistanische Weltklassespieler mit viel Disziplin steigerte das professionelle Denken im Verein.',
    ],
  },
  {
    period: '1980 – 1999',
    title: 'Die Dominanz',
    paragraphs: [
      'Gemeinsam mit ihm, Hertha Almer, Gabi Kumpfmüller, Renate Bogensperger, Josef (Pepi) Radlinger, Dietmar Jehart, Alexander Almer, Peter Kumpfmüller und Gerhard Hofer wurde der 1. Staatsmeistertitel im Jahr 1988 eingefahren. Darauf folgten 2 weitere Titel, und 1990 die erste Teilnahme am Mannschaftseuropacup. In Moskau wurden dem Linzer Team bereits Rosen gestreut – ein Spitzenfunktionär prophezeite uns damals schon eine große (internationale) Zukunft. Mit dem 7. Platz beim ersten Antreten konnte man durchaus zufrieden sein.',
      'Die Meistermannschaft 1989: Hertha Almer, Peter Moritz, Barbara Hartleitner, Tariq Farooq, Gerhard Hofer, Gabriele Kumpfmüller, Josef Radlinger, Peter Kumpfmüller, Harald Hochgatterer.',
      'Die Dominanz im österreichischen Badmintonsport hielt bis 1993 an – der BSC 70 Linz ist Serienmeister in der Staatsliga – 6 Titel in Folge gingen an uns Linzer. Doch das herausragendste Sportereignis, welches uns in die Badminton-Sportgeschichte eingehen lässt, ist der Europacupsieg 1992. Fußballweltmeister und Berater beim FC Bayern München – Paul Breitner – sagte einmal in einem Interview: „Nur wer einmal Europameister war, weiß, was es heißt, Europacupsieger zu sein" und lieferte damit die Begründung für einen schönen, einmaligen Status unserer Spieler: „Als Europacupsieger bist du auf einmal in einer anderen Liga – egal, welche Sportart."',
      'Für dieses besondere Ereignis, den Europacupsieg 1992, gratulieren wir den BSC 70 Linz Helden: Hannes Fuchs, Gabi Kumpfmüller, Heinz Fischer, Irina Serva, Kai Abraham und Trainer Vladimir Serov. Natürlich hätte es ohne die Organisation durch Manager Hans Hartl und Obmann Hans Bogensperger nicht geklappt. Durch die finanzielle Hilfe vom Namenssponsor KR Anton Feistl (FEIBRA) konnte dieses Projekt erst ermöglicht werden.',
      'Das Team beim Europacup 1991 in Olve: Hans Bogensperger, Harald Hochgatterer, Heimo Götschl, Kai Abraham, Heinz Fischer, Tariq Farooq, Hannes Fuchs, Manfred Stündl, Hans Hartl, Sabine Götschl, Sabine Ploner, Gabi Kumpfmüller.',
    ],
  },
  {
    period: '2000 – 2009',
    title: 'Neuausrichtung & Nachwuchs',
    paragraphs: [
      'Als im Jahr 2001 die Obmannübergabe an Reinhard Hechenberger erfolgte, konnte man noch nicht wirklich absehen, wie sich die Zukunft entwickeln würde. Zunächst mussten einige Hürden überwunden werden, die uns als „Altlasten" mitübergeben wurden. Eine neue Strategie und ein modernes Konzept sollten den BSC 70 Linz wieder an die Spitze des österreichischen Badmintonsportes zurückführen. Neben der Bundesliga wollte die neue Führung verstärkt auch wieder im Nachwuchs- und Breitensport tätig werden – nur so kann die Basis für zukünftige Erfolge gelegt werden.',
      'In dieser schwierigen Zeit war es umso erfreulicher, Klaus Fischer als Stammspieler in der Mannschaft zu bekommen. Er brachte auch Stabilität in den ersten Saisonen. Sein toller 3. Platz bei den Staatsmeisterschaften 2004 in Steyr zeigte noch einmal sein Potential. Mit Maja Tvrdy und Miha Sepec wurden zwei hervorragende Spieler aus Slowenien verpflichtet.',
      'Besonders erfreulich war, dass aus dem Nachwuchstraining, in dem sich in dieser Zeit über 30 Kinder befanden, unser Spieler Martin Lechner im Jahr 2004 die Nominierung in den Nationalkader erhielt. Auch ließ er in der allgemeinen Klasse rasch aufhorchen und erreichte gemeinsam mit Reinhard Hechenberger den 5. Platz im Herrendoppel bei Staatsmeisterschaften.',
      'Eine der strategisch wichtigsten Entscheidungen war die Verpflichtung von BSC-70-Linz-„Eigenbauspielerin" Karina Lengauer und dem Steyrer Manuel Berger, die ab der Saison 2005/2006 für uns spielberechtigt waren. Manuel Berger gelang bei den Staatsmeisterschaften 2007 in Wien gemeinsam mit Heimo Götschl von WBH Wien der Sieg im Herrendoppel. Im Jahr darauf holte Karina Lengauer gemeinsam mit Iris Freimüller aus Alkoven ebenfalls den Titel nach Linz.',
      'Mit Hanka Milisova (Tschechien) und Miha Horvat (Slowenien) wurde ein weiterer Schritt in der Bundesliga getan. Mit Harald Hochgatterer, Klaus Fischer und Dietmar Draxler standen drei weitere sehr gute heimische Spieler zur Verfügung. Leider konnte der Staatsmeistertitel noch nicht wieder nach Linz geholt werden – von der Saison 2005/2006 bis 2008/2009 mussten wir uns viermal hintereinander mit dem 3. Platz begnügen.',
      'In Oberösterreich wurde der BSC 70 Linz wieder einmal die erfolgreichste Vereinsmannschaft im Lande. Neben den Landesmeistertiteln in den Saisonen 2007/2008 und 2008/2009 konnten wir auch die Erfolge im OÖ Mannschaftscup nach Hause bringen.',
      'Im Jahr 2005 erhielt Tariq Farooq die längst fällig gewordene Ehrenmitgliedschaft des BSC 70 Linz. Zudem wurde ein neuer Tarif für die Familienmitgliedschaft eingeführt. Mit der Solar City Halle erhielten wir eine neue Heimhalle, in der Training, Turniere und Meisterschaftsspiele stattfinden. Neben den neuen gesetzlichen Rahmenbedingungen im Vereinsgesetz hielt in diesem Jahrzehnt auch die „New Media" Einzug – die Präsentation mittels einer eigenen Homepage gehörte damit schon zum modernen Bild unseres Vereins.',
    ],
  },
]

export default function Chronik() {
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

  return (
    <div className="bg-page min-h-screen pt-[72px]">
      <div ref={containerRef} className="max-w-[840px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        <div data-animate className="mb-12 opacity-0">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors mb-6">
            <ArrowRight className="w-4 h-4 rotate-180" />
            Zurück zur Startseite
          </Link>
          <span className="block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4">
            SEIT 1970
          </span>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05]">
            Chronik
          </h1>
          <p className="mt-4 text-base text-secondary max-w-[600px]">
            Von der Gründung 1970 bis zum Europacupsieg und darüber hinaus — die Geschichte des BSC 70 Linz.
          </p>
        </div>

        <div className="space-y-10">
          {eras.map((era) => (
            <div
              key={era.period}
              data-animate
              className="bg-card rounded-xl border border-theme p-6 sm:p-10 opacity-0"
            >
              <span className="inline-block text-xs font-medium uppercase tracking-[0.05em] bg-accent-gradient text-white rounded-full px-3 py-1 mb-4">
                {era.period}
              </span>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-primary mb-5 leading-tight">
                {era.title}
              </h2>
              <div className="space-y-4">
                {era.paragraphs.map((p, i) => (
                  <p key={i} className="text-base text-secondary leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
