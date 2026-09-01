import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLenisScroll } from '@/context/LenisContext'

/**
 * Click handling for the in-page section links ("/#sponsoren") in the nav and
 * the footer.
 *
 * These have to do two things at once: scroll smoothly through Lenis, and
 * leave the section in the address bar so it can be copied, bookmarked and
 * reloaded. Routing already does both — Layout scrolls whenever
 * location.hash changes — so the click is handed to the router and only
 * intercepted in the one case routing cannot serve: re-clicking the section
 * you are already on, where the location does not change, no effect fires and
 * nothing would happen.
 *
 * Navigation and Footer previously each had their own version of this. They
 * drifted: the footer's stopped the click and then looked the element up in
 * the current document, so on every subpage its section links did nothing at
 * all — no scroll, no navigation.
 */
export function useAnchorNavigation(onNavigate?: () => void) {
  const location = useLocation()
  const navigate = useNavigate()
  const { scrollTo } = useLenisScroll()

  // Ctrl/Cmd/Shift-click and middle-click must keep opening a new tab, so
  // those are left to the browser untouched.
  const isPlainClick = (e: React.MouseEvent) =>
    e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

  const handleAnchorClick = useCallback(
    (e: React.MouseEvent, href: string) => {
      onNavigate?.()
      if (!isPlainClick(e)) return
      e.preventDefault()

      const id = href.replace('/#', '')
      if (location.pathname === '/' && location.hash === `#${id}`) {
        const el = document.getElementById(id)
        if (el) scrollTo(el)
        return
      }
      navigate(href)
    },
    [location.pathname, location.hash, navigate, scrollTo, onNavigate],
  )

  /** For the logo: back to the top, and drop any section from the URL. */
  const handleTopClick = useCallback(
    (e: React.MouseEvent) => {
      onNavigate?.()
      if (!isPlainClick(e)) return
      e.preventDefault()

      if (location.pathname === '/' && !location.hash) {
        scrollTo(0)
        return
      }
      navigate('/')
    },
    [location.pathname, location.hash, navigate, scrollTo, onNavigate],
  )

  return { handleAnchorClick, handleTopClick }
}
