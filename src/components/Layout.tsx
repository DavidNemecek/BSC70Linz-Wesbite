import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useLenis } from '@/hooks/useLenis'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'

export default function Layout() {
  const lenisRef = useLenis()
  const location = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { immediate: true })
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
