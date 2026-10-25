import { createContext, useContext } from 'react'

type ScrollTarget = number | string | HTMLElement

export interface LenisContextValue {
  scrollTo: (target: ScrollTarget, options?: { immediate?: boolean }) => void
}

export const LenisContext = createContext<LenisContextValue | null>(null)

export function useLenisScroll() {
  const ctx = useContext(LenisContext)
  if (!ctx) throw new Error('useLenisScroll must be used within LenisProvider')
  return ctx
}
