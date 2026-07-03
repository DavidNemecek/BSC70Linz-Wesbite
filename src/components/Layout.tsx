import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useLenisScroll } from '@/context/LenisContext'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'

export default function Layout() {
  const { scrollTo } = useLenisScroll()
  const location = useLocation()

  useEffect(() => {
    scrollTo(0)
  }, [location.pathname, scrollTo])

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
