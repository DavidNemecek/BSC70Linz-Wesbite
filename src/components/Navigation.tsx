import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'

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
  const { theme, toggleTheme } = useTheme()

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

  const opaque = scrolled || !isHome || mobileOpen
  const navBgClass = (scrolled || !isHome) ? 'bg-nav backdrop-blur-xl shadow-sm' : 'bg-transparent'
  const logoTextClass = opaque ? 'text-primary' : 'text-white'
  const linkTextClass = opaque
    ? 'text-secondary hover:text-primary'
    : 'text-white/70 hover:text-white'

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
            <span className={logoTextClass}>BSC 70</span>
            <span className="text-gradient ml-1">LINZ</span>
          </Link>

          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleAnchorClick(e, link.href)}
                className={`text-[0.8125rem] font-medium tracking-wide transition-colors duration-250 ${linkTextClass}`}
              >
                {link.label}
              </a>
            ))}
            {pageLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`text-[0.8125rem] font-medium tracking-wide transition-colors duration-250 ${linkTextClass}`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-3">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
                opaque ? 'text-secondary hover:text-primary hover:bg-[var(--border-color)]' : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Link
              to="/anmeldung"
              className="inline-flex items-center bg-accent-gradient text-white text-sm font-semibold rounded-full px-6 py-2.5 hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(14,143,185,0.35)] transition-all duration-200"
            >
              Mitglied werden
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden flex flex-col gap-1.5 p-2 z-[101]"
            aria-label="Menu"
          >
            <span className={`block w-6 h-0.5 transition-all duration-300 ${opaque ? 'bg-[var(--text-primary)]' : 'bg-white'} ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-6 h-0.5 transition-all duration-300 ${opaque ? 'bg-[var(--text-primary)]' : 'bg-white'} ${mobileOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-6 h-0.5 transition-all duration-300 ${opaque ? 'bg-[var(--text-primary)]' : 'bg-white'} ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-[99] bg-page backdrop-blur-xl transition-all duration-300 lg:hidden ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col items-center justify-center h-full gap-6 pt-20 px-6">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleAnchorClick(e, link.href)}
              className="text-xl sm:text-2xl font-display tracking-wide text-secondary hover:text-accent transition-colors"
            >
              {link.label}
            </a>
          ))}
          <Link
            to="/news"
            onClick={() => setMobileOpen(false)}
            className="text-xl sm:text-2xl font-display tracking-wide text-secondary hover:text-accent transition-colors"
          >
            News
          </Link>

          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="flex items-center gap-2 text-secondary hover:text-primary transition-colors px-4 py-2 rounded-full border border-theme mt-4"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="text-sm">{theme === 'dark' ? 'Hell' : 'Dunkel'}</span>
          </button>

          <Link
            to="/anmeldung"
            onClick={() => setMobileOpen(false)}
            className="mt-2 bg-accent-gradient text-white text-base font-semibold rounded-full px-8 py-3"
          >
            Mitglied werden
          </Link>
        </div>
      </div>
    </>
  )
}
