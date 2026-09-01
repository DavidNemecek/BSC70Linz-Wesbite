import { Link } from 'react-router-dom'
import { useTheme } from '@/context/ThemeContext'
import { useLanguage } from '@/context/LanguageContext'
import { useAnchorNavigation } from '@/hooks/useAnchorNavigation'
import { clubInfo } from '@/data/clubInfo'

export default function Footer() {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const { handleAnchorClick, handleTopClick } = useAnchorNavigation()

  return (
    <footer className="bg-card border-t border-theme">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          <div>
            <Link to="/" onClick={handleTopClick} className="inline-flex items-center min-w-0 shrink-0 overflow-hidden">
              <img
                src={theme === 'dark' ? '/assets/bsc-logo-dark-themepng.png' : '/assets/bsc-logo-light.png'}
                alt="BSC 70 Linz"
                width={200}
                height={94}
                className="w-[85px] h-10 min-w-0 object-contain"
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
              <li>
                <Link to="/datenschutz" className="text-sm text-secondary hover:text-primary transition-colors duration-200">
                  {t.footer.datenschutz}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-dim mb-5">{t.footer.contactHeading}</h4>
            {/* Reads as a contact card: who to ask for, then how to reach
                them. Board roles are not repeated here — those are in the
                Impressum and on the board section, and would only be a second
                place to keep in sync. */}
            <p className="text-sm text-dim mb-2">{clubInfo.contactPerson}</p>
            <a
              href={`mailto:${clubInfo.officeEmail}`}
              className="text-sm text-accent hover:text-primary transition-colors duration-200 block break-all"
            >
              {clubInfo.officeEmail}
            </a>
            <a
              href={`tel:${clubInfo.phone.replace(/\s/g, '')}`}
              className="text-sm text-secondary hover:text-primary transition-colors block mt-1"
            >
              {clubInfo.phone}
            </a>
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
