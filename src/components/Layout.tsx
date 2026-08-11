import { Outlet, useLocation } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import { useLenisScroll } from '@/context/LenisContext'
import { useLanguage } from '@/context/LanguageContext'
import { useSeo } from '@/hooks/useSeo'
import { resolveSeo } from '@/lib/seo'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'

export default function Layout() {
  const { scrollTo } = useLenisScroll()
  const { t, language } = useLanguage()
  const location = useLocation()

  useSeo(
    useMemo(
      () => resolveSeo(location.pathname, t, language),
      [location.pathname, t, language],
    ),
  )

  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1))
      if (el) {
        scrollTo(el)
        return
      }
    }
    scrollTo(0)
  }, [location.pathname, location.hash, scrollTo])

  return (
    <div className="relative">
      <Navigation />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
