import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { translations, type Language } from '@/i18n/translations'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
  t: typeof translations['de']
}

const STORAGE_KEY = 'bsc70-lang'

function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return 'de'
  const codes = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language]
  for (const code of codes) {
    if (code?.toLowerCase().startsWith('en')) return 'en'
    if (code?.toLowerCase().startsWith('de')) return 'de'
  }
  return 'de'
}

function storedLanguage(): Language | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'de' || stored === 'en' ? stored : null
}

/**
 * Whether the browser is machine-translating the page.
 *
 * Chrome and Chromium-based browsers mark the document with translated-ltr /
 * translated-rtl; Edge's translator instead tags every element it has rewritten
 * with _msttexthash. Firefox and Safari expose no marker at all, so this is
 * best-effort by design — a false negative just leaves the language as it was.
 *
 * The target language is deliberately not read: it is not exposed anywhere, and
 * for a visitor translating the page away from German, English is the better
 * source text regardless of which language they picked.
 */
function isBrowserTranslating(): boolean {
  if (typeof document === 'undefined') return false
  const html = document.documentElement
  if (html.classList.contains('translated-ltr') || html.classList.contains('translated-rtl')) return true
  return !!document.body?.querySelector('[_msttexthash]')
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'de',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: translations.de,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => storedLanguage() ?? detectLanguage())

  // Only a deliberate choice is persisted. An auto-detected language must stay
  // unpersisted, otherwise the very first render would write a value that is
  // indistinguishable from the visitor having picked it — and the translation
  // handling below would then never be allowed to override it.
  const setLanguage = (lang: Language) => {
    localStorage.setItem(STORAGE_KEY, lang)
    setLanguageState(lang)
  }

  useEffect(() => {
    document.documentElement.setAttribute('lang', language)
  }, [language])

  useEffect(() => {
    // A visitor who has chosen a language keeps it, translated page or not.
    if (storedLanguage()) return

    const applyIfTranslating = () => {
      if (!isBrowserTranslating()) return false
      // Machine translation does not reach across into the cross-origin form
      // embed, so a translated page would otherwise still show a German form.
      setLanguageState('en')
      return true
    }

    if (applyIfTranslating()) return

    // Translation can start at any point — on the visitor's command, or by
    // itself a moment after load when auto-translate is on.
    const observer = new MutationObserver(() => {
      if (applyIfTranslating()) observer.disconnect()
    })
    observer.observe(document.documentElement, { attributeFilter: ['class'] })
    if (document.body) {
      observer.observe(document.body, { subtree: true, attributeFilter: ['_msttexthash'] })
    }

    return () => observer.disconnect()
  }, [])

  const toggleLanguage = () => setLanguage(language === 'de' ? 'en' : 'de')

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
