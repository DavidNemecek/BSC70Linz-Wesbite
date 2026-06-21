import { Link } from 'react-router-dom'

export default function Footer() {
  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('/#')) {
      e.preventDefault()
      const id = href.replace('/#', '')
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <footer className="bg-night text-white">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          <div>
            <Link to="/" className="font-display text-2xl tracking-wide inline-block">
              <span className="text-white">BSC 70</span>
              <span className="text-ember ml-1">LINZ</span>
            </Link>
            <p className="mt-3 text-sm text-white/50">Badminton seit 1970</p>
            <p className="mt-4 text-sm text-white/40 leading-relaxed">
              ASKÖ BSC 70 Linz<br />
              Badminton Sport Club Linz<br />
              Oberösterreich, Austria
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-white/40 mb-5">Navigation</h4>
            <ul className="space-y-3">
              {[
                { label: 'Club', href: '/#club' },
                { label: 'Training', href: '/#training' },
                { label: 'Teams', href: '/#teams' },
                { label: 'Vorstand', href: '/#vorstand' },
                { label: 'Mitgliedschaft', href: '/#mitgliedschaft' },
                { label: 'Kontakt', href: '/#kontakt' },
              ].map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={(e) => handleAnchorClick(e, link.href)}
                    className="text-sm text-white/60 hover:text-white transition-colors duration-200"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-white/40 mb-5">Links</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/anmeldung" className="text-sm text-white/60 hover:text-white transition-colors duration-200">
                  Beitrittserklärung
                </Link>
              </li>
              <li>
                <a href="https://www.badminton.at" target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-white transition-colors duration-200">
                  Badminton Österreich
                </a>
              </li>
              <li>
                <a href="https://www.askoe.at" target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-white transition-colors duration-200">
                  ASKÖ
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-white/40 mb-5">Kontakt</h4>
            <a
              href="mailto:anmeldung@bsc70linz.at"
              className="text-sm text-ember hover:text-white transition-colors duration-200 block mb-3"
            >
              anmeldung@bsc70linz.at
            </a>
            <p className="text-sm text-white/40">
              Obmann: Stephan Ziermayr<br />
              <a href="tel:+436767042186" className="text-white/60 hover:text-white transition-colors">+43 676 7042187</a>
            </p>
          </div>
        </div>

        <div className="mt-12 lg:mt-16 pt-8 border-t border-white/[0.08]">
          <p className="text-xs text-white/30 text-center">
            &copy; {new Date().getFullYear()} BSC 70 Linz &middot; Alle Rechte vorbehalten
          </p>
        </div>
      </div>
    </footer>
  )
}
