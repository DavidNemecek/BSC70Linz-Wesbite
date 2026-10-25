import { createContext, useContext } from 'react'
import { translations, type Language } from '@/i18n/translations'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
  t: typeof translations['de']
}

export const LanguageContext = createContext<LanguageContextValue>({
  language: 'de',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: translations.de,
})

export function useLanguage() {
  return useContext(LanguageContext)
}
