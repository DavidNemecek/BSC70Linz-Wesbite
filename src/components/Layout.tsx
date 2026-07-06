import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useLenisScroll } from '@/context/LenisContext'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'

export default function Layout() {
  const { scrollTo } = useLenisScroll()
  const location = useLocation()

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
