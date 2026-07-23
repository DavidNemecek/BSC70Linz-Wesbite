import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

type ScrollTarget = number | string | HTMLElement

interface LenisContextValue {
  scrollTo: (target: ScrollTarget, options?: { immediate?: boolean }) => void
  subscribeScroll: (callback: (scroll: number) => void) => () => void
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

  // Consumers that need the live scroll position (e.g. the nav bar's
  // opaque-on-scroll state) should read it from Lenis directly rather than
  // from native `window.scroll` events — Lenis drives the actual scroll
  // position itself, and relying on a separate native listener risks the two
  // getting out of sync depending on how a given browser dispatches scroll
  // events while Lenis is animating.
  const subscribeScroll: LenisContextValue['subscribeScroll'] = (callback) => {
    const lenis = lenisRef.current!
    const handler = (instance: Lenis) => callback(instance.scroll)
    lenis.on('scroll', handler)
    return () => lenis.off('scroll', handler)
  }

  return (
    <LenisContext.Provider value={{ scrollTo, subscribeScroll }}>
      {children}
    </LenisContext.Provider>
  )
}

export function useLenisScroll() {
  const ctx = useContext(LenisContext)
  if (!ctx) throw new Error('useLenisScroll must be used within LenisProvider')
  return ctx
}
