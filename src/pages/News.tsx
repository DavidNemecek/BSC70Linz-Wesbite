import { Link } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Calendar, ArrowRight } from 'lucide-react'

gsap.registerPlugin(ScrollTrigger)

const newsArticles = [
  {
    id: 1,
    date: 'Mai 2025',
    category: 'Bundesliga',
    title: 'Sensationsmeldung aus der heimischen Badminton Szene!',
    excerpt: 'Der Teamspieler des BSC70 Linz, Daniel-Aria Dinata, hat bei den Europameisterschaften im dänischen Horsensen sensationell das Halbfinale erreicht und damit im schlimmsten Fall die Bronzemediaille sicher.',
    featured: true,
  },
  {
    id: 2,
    date: 'Januar 2025',
    category: 'Mannschaften',
    title: 'Die ersten Mannschaftsergebnisse im neuen Jahr',
    excerpt: 'Die 1er Mannschaft des BSC70 hat das erste Spiel in der 1. Landesliga gegen die Voest 5:3 gewonnen. Die 2er Mannschaft hat das erste obere Playoff Spiel der 2. Klasse Nord gegen Neuhofen 2:6 verloren.',
    featured: false,
  },
  {
    id: 3,
    date: 'Juni 2024',
    category: 'Verein',
    title: 'Neuer Vereinsvorstand ab Juni 2024',
    excerpt: 'Mit der ordentlichen Generalversammlung wurde die Zukunft des Vereins neu gestaltet. Stephan Ziermayr bleibt Obmann, Nikita Arnold wird Stellvertreter. Nach über 50 Jahren wurde der Austieg aus der Badminton Bundesliga beschlossen.',
    featured: false,
  },
  {
    id: 4,
    date: 'September 2024',
    category: 'Mannschaften',
    title: 'Erfolgreiche Starts in die Herbstsaison 2024',
    excerpt: 'Unsere Mannschaften sind erfolgreich in die neue Saison gestartet. Die 1. Mannschaft kämpft um die Tabellenspitze in der 1. Landesliga.',
    featured: false,
  },
  {
    id: 5,
    date: 'August 2024',
    category: 'Nachwuchs',
    title: 'Nachwuchstraining startet wieder durch',
    excerpt: 'Ab September startet das Nachwuchstraining wieder in beiden Hallen. Neue Spielerinnen und Spieler sind jederzeit herzlich willkommen.',
    featured: false,
  },
]

export default function News() {
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

      const cards = containerRef.current!.querySelectorAll('[data-card]')
      gsap.fromTo(cards, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.08,
        scrollTrigger: { trigger: cards[0], start: 'top 85%', toggleActions: 'play none none none' }
      })
    }, containerRef)

    return () => ctx.revert()
  }, [])

  const featuredNews = newsArticles.find(n => n.featured)
  const regularNews = newsArticles.filter(n => !n.featured)

  return (
    <div className="bg-page min-h-screen pt-[72px]">
      <div ref={containerRef} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        {/* Header */}
        <div data-animate className="mb-12 opacity-0">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors mb-6">
            <ArrowRight className="w-4 h-4 rotate-180" />
            Zurück zur Startseite
          </Link>
          <span className="block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4">
            BSC 70 LINZ
          </span>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05]">
            Aktuelle News
          </h1>
          <p className="mt-4 text-base text-secondary max-w-[600px]">
            Bleib auf dem Laufenden über alles was in unserem Verein passiert.
          </p>
        </div>

        {/* Featured Article */}
        {featuredNews && (
          <div data-animate className="mb-12 opacity-0">
            <div className="bg-card rounded-xl border border-theme p-6 sm:p-10">
              <span className="inline-block text-xs font-medium uppercase tracking-[0.05em] bg-accent-gradient text-white rounded-full px-3 py-1 mb-4">
                Top Story
              </span>
              <div className="flex items-center gap-3 text-sm text-muted mb-4">
                <Calendar className="w-4 h-4" />
                <span>{featuredNews.date}</span>
                <span className="text-dim">·</span>
                <span className="text-accent">{featuredNews.category}</span>
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-primary mb-4 leading-tight">
                {featuredNews.title}
              </h2>
              <p className="text-base text-secondary leading-relaxed max-w-[800px]">
                {featuredNews.excerpt}
              </p>
            </div>
          </div>
        )}

        {/* News Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {regularNews.map((article) => (
            <article
              key={article.id}
              data-card
              className="bg-card rounded-xl border border-theme p-6 opacity-0 hover:-translate-y-1 hover:border-[var(--border-hover)] transition-all duration-300"
            >
              <div className="flex items-center gap-2 text-xs text-muted mb-3">
                <Calendar className="w-3.5 h-3.5" />
                <span>{article.date}</span>
                <span className="text-dim">·</span>
                <span className="text-accent">{article.category}</span>
              </div>
              <h3 className="text-lg font-semibold text-primary mb-3 leading-snug">
                {article.title}
              </h3>
              <p className="text-sm text-muted leading-relaxed">
                {article.excerpt}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
