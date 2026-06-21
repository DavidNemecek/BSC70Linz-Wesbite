import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const navLinks = [
  { label: 'Club', href: '/#club' },
  { label: 'Training', href: '/#training' },
  { label: 'Teams', href: '/#teams' },
  { label: 'Vorstand', href: '/#vorstand' },
  { label: 'Mitgliedschaft', href: '/#mitgliedschaft' },
  { label: 'Kontakt', href: '/#kontakt' },
]

const pageLinks = [
  { label: 'News', href: '/news' },
]

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const isHome = location.pathname === '/'

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleAnchorClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault()
    setMobileOpen(false)

    if (!isHome) {
      window.location.href = href
      return
    }

    const id = href.replace('/#', '')
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const navBgClass = scrolled || !isHome
    ? 'bg-night/92 backdrop-blur-xl'
    : 'bg-transparent'

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-[100] h-[72px] flex items-center transition-all duration-300 ${navBgClass}`}
      >
        <div className="w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 flex items-center justify-between">
          <Link
            to="/"
            onClick={() => setMobileOpen(false)}
            className="font-display text-xl sm:text-2xl tracking-wide z-[101]"
          >
            <span className="text-white">BSC 70</span>
            <span className="text-ember ml-1">LINZ</span>
          </Link>

          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleAnchorClick(e, link.href)}
                className="text-[0.8125rem] font-medium tracking-wide text-white/70 hover:text-white transition-colors duration-250"
              >
                {link.label}
              </a>
            ))}
            {pageLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="text-[0.8125rem] font-medium tracking-wide text-white/70 hover:text-white transition-colors duration-250"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-4">
            <Link
              to="/anmeldung"
              className="inline-flex items-center bg-ember text-white text-sm font-semibold rounded-full px-6 py-2.5 hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(232,80,44,0.35)] transition-all duration-200"
            >
              Mitglied werden
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden flex flex-col gap-1.5 p-2 z-[101]"
            aria-label="Menu"
          >
            <span className={`block w-6 h-0.5 bg-white transition-all duration-300 ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-6 h-0.5 bg-white transition-all duration-300 ${mobileOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-6 h-0.5 bg-white transition-all duration-300 ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-[99] bg-night/98 backdrop-blur-xl transition-all duration-300 lg:hidden ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col items-center justify-center h-full gap-6 pt-20 px-6">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleAnchorClick(e, link.href)}
              className="text-xl sm:text-2xl font-display tracking-wide text-white/80 hover:text-ember transition-colors"
            >
              {link.label}
            </a>
          ))}
          <Link
            to="/news"
            onClick={() => setMobileOpen(false)}
            className="text-xl sm:text-2xl font-display tracking-wide text-white/80 hover:text-ember transition-colors"
          >
            News
          </Link>
          <Link
            to="/anmeldung"
            onClick={() => setMobileOpen(false)}
            className="mt-4 bg-ember text-white text-base font-semibold rounded-full px-8 py-3"
          >
            Mitglied werden
          </Link>
        </div>
      </div>
    </>
  )
}
