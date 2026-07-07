import { Link } from 'react-router-dom'
import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { ArrowRight, Calendar } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'

export default function NewsPreview() {
  const ref = useScrollAnimation()
  const { t } = useLanguage()
  const latestNews = t.newsPreview.items

  return (
    <section className="bg-card-alt py-20 lg:py-32">
      <div ref={ref} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <div data-animate className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10 opacity-0">
          <div>
            <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4">
              {t.newsPreview.overline}
            </span>
            <h2 className="font-display text-[clamp(2rem,5vw,4rem)] tracking-[0.02em] text-primary leading-[1.05]">
              {t.newsPreview.title}
            </h2>
          </div>
          <Link
            to="/news"
            className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:gap-3 transition-all duration-200 flex-shrink-0"
          >
            {t.newsPreview.viewAll}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div data-stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {latestNews.map((article, i) => (
            <article
              key={i}
              data-stagger-item
              className="bg-card rounded-xl border border-theme p-6 opacity-0 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(14,143,185,0.08)] transition-all duration-300"
            >
              <div className="flex items-center gap-2 text-xs text-muted mb-3">
                <Calendar className="w-3.5 h-3.5" />
                <span>{article.date}</span>
                <span>·</span>
                <span className="text-accent">{article.category}</span>
              </div>
              <h3 className="text-base font-semibold text-primary mb-2 leading-snug">
                {article.title}
              </h3>
              <p className="text-sm text-muted leading-relaxed">
                {article.excerpt}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
