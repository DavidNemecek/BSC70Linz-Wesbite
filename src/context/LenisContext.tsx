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

  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
    })
    lenisRef.current = lenis

    lenis.on('scroll', () => {
      ScrollTrigger.update()
    })

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000)
    })
    gsap.ticker.lagSmoothing(0)

    return () => {
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  const scrollTo: LenisContextValue['scrollTo'] = (target, options) => {
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
