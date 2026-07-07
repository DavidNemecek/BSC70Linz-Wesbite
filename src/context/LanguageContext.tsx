import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { translations, type Language } from '@/i18n/translations'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
  t: typeof translations['de']
}

function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return 'de'
  const codes = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language]
  for (const code of codes) {
    if (code?.toLowerCase().startsWith('en')) return 'en'
    if (code?.toLowerCase().startsWith('de')) return 'de'
  }
  return 'de'
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'de',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: translations.de,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('bsc70-lang')
      if (stored === 'de' || stored === 'en') return stored
    }
    return detectLanguage()
  })

  useEffect(() => {
    document.documentElement.setAttribute('lang', language)
    localStorage.setItem('bsc70-lang', language)
  }, [language])

  const toggleLanguage = () => setLanguage((l) => (l === 'de' ? 'en' : 'de'))

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
