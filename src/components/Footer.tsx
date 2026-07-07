import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '@/context/ThemeContext'
import { useLanguage } from '@/context/LanguageContext'
import { useLenisScroll } from '@/context/LenisContext'

export default function Footer() {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const location = useLocation()
  const isHome = location.pathname === '/'
  const { scrollTo } = useLenisScroll()

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('/#')) {
      e.preventDefault()
      const id = href.replace('/#', '')
      const el = document.getElementById(id)
      if (el) scrollTo(el)
    }
  }

  const handleLogoClick = (e: React.MouseEvent) => {
    if (isHome) {
      e.preventDefault()
      scrollTo(0)
    }
  }

  return (
    <footer className="bg-card border-t border-theme">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          <div>
            <Link to="/" onClick={handleLogoClick} className="inline-flex items-center">
              <img
                src={theme === 'dark' ? '/assets/bsc-logo-dark-themepng.png' : '/assets/bsc-logo-light.png'}
                alt="BSC 70 Linz"
                className="h-10 w-auto object-contain"
              />
            </Link>
            <p className="mt-3 text-sm text-muted">{t.footer.tagline}</p>
            <p className="mt-4 text-sm text-dim leading-relaxed">
              {t.footer.addressLines.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.footer.addressLines.length - 1 && <br />}
                </span>
              ))}
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-dim mb-5">{t.footer.navHeading}</h4>
            <ul className="space-y-3">
              {[
                { label: t.nav.training, href: '/#training' },
                { label: t.nav.mitgliedschaft, href: '/#mitgliedschaft' },
                { label: t.nav.teams, href: '/#teams' },
                { label: t.nav.vorstand, href: '/#vorstand' },
                { label: t.nav.erfolge, href: '/#erfolge' },
                { label: t.nav.sponsoren, href: '/#sponsoren' },
              ].map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={(e) => handleAnchorClick(e, link.href)}
                    className="text-sm text-secondary hover:text-primary transition-colors duration-200"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link to="/chronik" className="text-sm text-secondary hover:text-primary transition-colors duration-200">
                  {t.nav.chronik}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-dim mb-5">{t.footer.linksHeading}</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/anmeldung" className="text-sm text-secondary hover:text-primary transition-colors duration-200">
                  {t.footer.membershipDeclaration}
                </Link>
              </li>
              <li>
                <a href="https://www.badminton.at" target="_blank" rel="noopener noreferrer" className="text-sm text-secondary hover:text-primary transition-colors duration-200">
                  {t.footer.badmintonAustria}
                </a>
              </li>
              <li>
                <a href="https://www.askoe.at" target="_blank" rel="noopener noreferrer" className="text-sm text-secondary hover:text-primary transition-colors duration-200">
                  {t.footer.asko}
                </a>
              </li>
              <li>
                <Link to="/impressum" className="text-sm text-secondary hover:text-primary transition-colors duration-200">
                  {t.footer.impressum}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-dim mb-5">{t.footer.contactHeading}</h4>
            <a
              href="mailto:anmeldung@bsc70linz.at"
              className="text-sm text-accent hover:text-primary transition-colors duration-200 block mb-3"
            >
              anmeldung@bsc70linz.at
            </a>
            <p className="text-sm text-dim">
              {t.footer.chairman}: Stephan Ziermayr<br />
              <a href="tel:+436767042186" className="text-secondary hover:text-primary transition-colors">+43 676 7042187</a>
            </p>
          </div>
        </div>

        <div className="mt-12 lg:mt-16 pt-8 border-t border-theme">
          <p className="text-xs text-dim text-center">
            {t.footer.copyright(new Date().getFullYear())}
          </p>
        </div>
      </div>
    </footer>
  )
}
