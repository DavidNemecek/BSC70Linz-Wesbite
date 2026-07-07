import { Link } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Calendar, ArrowRight } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'

gsap.registerPlugin(ScrollTrigger)

export default function News() {
  const { t } = useLanguage()
  const newsArticles = t.news.articles
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
            {t.news.back}
          </Link>
          <span className="block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4">
            {t.news.overline}
          </span>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05]">
            {t.news.title}
          </h1>
          <p className="mt-4 text-base text-secondary max-w-[600px]">
            {t.news.subtitle}
          </p>
        </div>

        {/* Featured Article */}
        {featuredNews && (
          <div data-animate className="mb-12 opacity-0">
            <div className="bg-card rounded-xl border border-theme p-6 sm:p-10">
              <span className="inline-block text-xs font-medium uppercase tracking-[0.05em] bg-accent-gradient text-white rounded-full px-3 py-1 mb-4">
                {t.news.topStory}
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
          {regularNews.map((article, i) => (
            <article
              key={i}
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
