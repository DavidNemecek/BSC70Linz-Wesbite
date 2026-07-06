import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

type ScrollTarget = number | string | HTMLElement

interface LenisContextValue {
  scrollTo: (target: ScrollTarget, options?: { immediate?: boolean }) => void
}

const LenisContext = createContext<LenisContextValue | null>(null)

export function LenisProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null)
  if (!lenisRef.current) {
    // Created synchronously during render (not in an effect) so it already
    // exists for descendant components whose mount effects run before this
    // provider's own effect fires (e.g. Layout's scroll-on-navigation effect).
    lenisRef.current = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
    })
  }

  useEffect(() => {
    const lenis = lenisRef.current!

    const handleScroll = () => ScrollTrigger.update()
    lenis.on('scroll', handleScroll)

    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(raf)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  const scrollTo: LenisContextValue['scrollTo'] = (target, options) => {
    // Force a synchronous re-measure first: Lenis's own ResizeObserver-based
    // recalculation is async, so right after a route change (new page content
    // mounted, different document height) its cached scroll limit can still
    // reflect the previous page and clamp the target back near 0.
    lenisRef.current?.resize()
    lenisRef.current?.scrollTo(target, options)
  }

  return (
    <LenisContext.Provider value={{ scrollTo }}>
      {children}
    </LenisContext.Provider>
  )
}

export function useLenisScroll() {
  const ctx = useContext(LenisContext)
  if (!ctx) throw new Error('useLenisScroll must be used within LenisProvider')
  return ctx
}
