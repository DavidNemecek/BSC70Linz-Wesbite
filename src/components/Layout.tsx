import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useLenis } from '@/hooks/useLenis'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'

export default function Layout() {
  const lenisRef = useLenis()
  const location = useLocation()

  useEffect(() => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { immediate: false })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [location.pathname, lenisRef])

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
