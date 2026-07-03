import { Link } from 'react-router-dom'
import { useTheme } from '@/context/ThemeContext'

export default function Footer() {
  const { theme } = useTheme()

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('/#')) {
      e.preventDefault()
      const id = href.replace('/#', '')
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <footer className="bg-card border-t border-theme">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          <div>
            <Link to="/" className="inline-flex items-center">
              <img
                src={theme === 'dark' ? '/assets/bsc-logo-dark-themepng.png' : '/assets/bsc-logo-light.png'}
                alt="BSC 70 Linz"
                className="h-10 w-auto object-contain"
              />
            </Link>
            <p className="mt-3 text-sm text-muted">Badminton seit 1970</p>
            <p className="mt-4 text-sm text-dim leading-relaxed">
              ASKÖ BSC 70 Linz<br />
              Badminton Sport Club Linz<br />
              Oberösterreich, Austria
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-dim mb-5">Navigation</h4>
            <ul className="space-y-3">
              {[
                { label: 'Club', href: '/#club' },
                { label: 'Training', href: '/#training' },
                { label: 'Teams', href: '/#teams' },
                { label: 'Erfolge', href: '/#erfolge' },
                { label: 'Vorstand', href: '/#vorstand' },
                { label: 'Mitgliedschaft', href: '/#mitgliedschaft' },
                { label: 'Sponsoren', href: '/#sponsoren' },
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
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-dim mb-5">Links</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/anmeldung" className="text-sm text-secondary hover:text-primary transition-colors duration-200">
                  Beitrittserklärung
                </Link>
              </li>
              <li>
                <a href="https://www.badminton.at" target="_blank" rel="noopener noreferrer" className="text-sm text-secondary hover:text-primary transition-colors duration-200">
                  Badminton Österreich
                </a>
              </li>
              <li>
                <a href="https://www.askoe.at" target="_blank" rel="noopener noreferrer" className="text-sm text-secondary hover:text-primary transition-colors duration-200">
                  ASKÖ
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-dim mb-5">Kontakt</h4>
            <a
              href="mailto:anmeldung@bsc70linz.at"
              className="text-sm text-accent hover:text-primary transition-colors duration-200 block mb-3"
            >
              anmeldung@bsc70linz.at
            </a>
            <p className="text-sm text-dim">
              Obmann: Stephan Ziermayr<br />
              <a href="tel:+436767042186" className="text-secondary hover:text-primary transition-colors">+43 676 7042187</a>
            </p>
          </div>
        </div>

        <div className="mt-12 lg:mt-16 pt-8 border-t border-theme">
          <p className="text-xs text-dim text-center">
            &copy; {new Date().getFullYear()} BSC 70 Linz &middot; Alle Rechte vorbehalten
          </p>
        </div>
      </div>
    </footer>
  )
}
