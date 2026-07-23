import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sun, Moon, Languages } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useLanguage } from '@/context/LanguageContext'
import { useLenisScroll } from '@/context/LenisContext'

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const isHome = location.pathname === '/'
  const { theme, toggleTheme } = useTheme()
  const { language, toggleLanguage, t } = useLanguage()
  const { scrollTo } = useLenisScroll()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 100)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navLinks = [
    { label: t.nav.training, href: '/#training' },
    { label: t.nav.mitgliedschaft, href: '/#mitgliedschaft' },
    { label: t.nav.teams, href: '/#teams' },
    { label: t.nav.vorstand, href: '/#vorstand' },
    { label: t.nav.erfolge, href: '/#erfolge' },
    { label: t.nav.sponsoren, href: '/#sponsoren' },
  ]

  const pageLinks = [
    { label: t.nav.chronik, href: '/chronik' },
  ]

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
      scrollTo(el)
    }
  }

  const opaque = scrolled || !isHome || mobileOpen
  const navIsSolid = scrolled || !isHome
  // Set directly as an inline style rather than a Tailwind class so the
  // paint comes straight from React state with no class/cascade resolution
  // involved.
  const navStyle: CSSProperties = navIsSolid
    ? {
        backgroundColor: theme === 'dark' ? 'rgba(11, 12, 15, 0.92)' : 'rgba(240, 241, 245, 0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      }
    : { backgroundColor: 'transparent' }
  const linkTextClass = opaque
    ? 'text-secondary hover:text-primary'
    : 'text-white/70 hover:text-white'
  const logoIsDark = !opaque || theme === 'dark'

  const handleLogoClick = (e: React.MouseEvent) => {
    setMobileOpen(false)
    if (isHome) {
      e.preventDefault()
      scrollTo(0)
    }
  }

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-[100] h-[72px] flex items-center transition-all duration-300"
        style={navStyle}
      >
        <div className="w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 flex items-center justify-between">
          <Link
            to="/"
            onClick={handleLogoClick}
            className="z-[101] flex items-center min-w-0 shrink-0 overflow-hidden"
          >
            <img
              src={logoIsDark ? '/assets/bsc-logo-dark-themepng.png' : '/assets/bsc-logo-light.png'}
              alt="BSC 70 Linz"
              width={200}
              height={94}
              className="w-[76px] h-9 sm:w-[85px] sm:h-10 min-w-0 object-contain"
            />
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
            <button
              onClick={toggleLanguage}
              aria-label="Toggle language"
              className={`w-9 h-9 rounded-full flex items-center justify-center text-[0.7rem] font-semibold tracking-wide transition-all duration-200 ${
                opaque ? 'text-secondary hover:text-primary hover:bg-[var(--border-color)]' : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {language === 'de' ? 'EN' : 'DE'}
            </button>
            <Link
              to="/anmeldung"
              className="inline-flex items-center bg-accent-gradient text-white text-sm font-semibold rounded-full px-6 py-2.5 hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(14,143,185,0.35)] transition-all duration-200"
            >
              {t.nav.joinButton}
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
          {pageLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              onClick={() => setMobileOpen(false)}
              className="text-xl sm:text-2xl font-display tracking-wide text-secondary hover:text-accent transition-colors"
            >
              {link.label}
            </Link>
          ))}

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="flex items-center gap-2 text-secondary hover:text-primary transition-colors px-4 py-2 rounded-full border border-theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span className="text-sm">{theme === 'dark' ? t.nav.themeLight : t.nav.themeDark}</span>
            </button>

            <button
              onClick={toggleLanguage}
              aria-label="Toggle language"
              className="flex items-center gap-2 text-secondary hover:text-primary transition-colors px-4 py-2 rounded-full border border-theme"
            >
              <Languages className="w-4 h-4" />
              <span className="text-sm">{language === 'de' ? 'EN' : 'DE'}</span>
            </button>
          </div>

          <Link
            to="/anmeldung"
            onClick={() => setMobileOpen(false)}
            className="mt-2 bg-accent-gradient text-white text-base font-semibold rounded-full px-8 py-3"
          >
            {t.nav.joinButton}
          </Link>
        </div>
      </div>
    </>
  )
}
