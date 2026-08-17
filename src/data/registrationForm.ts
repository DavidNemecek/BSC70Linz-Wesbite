import type { Language } from '@/i18n/translations'

export const FORM_ORIGIN = 'https://formular.vereinsplaner.com'

/**
 * Vereinsplaner form embeds, one per site language.
 *
 * Vereinsplaner has no locale switch of its own: it ignores ?lang, ?locale and
 * ?language as well as the Accept-Language header, and serves <html lang="de">
 * in every case. An English form therefore has to be built as a *separate*
 * form in the Vereinsplaner backend, which yields its own embed id — there is
 * no way to derive it from the German one.
 *
 * Until that form exists, `en` stays null and the German embed is served in its
 * place, so the page never shows an empty frame. Dropping the new id in here is
 * the only change needed to switch English visitors over; Registration.tsx
 * also stops showing its "the form is in German" note by itself.
 */
const FORM_IDS: Record<Language, string | null> = {
  de: 'da9f7886-3ee4-4974-a64d-cf9cfdf92bea',
  en: null,
}

/** True once a form actually exists in that language. */
export function hasLocalisedForm(language: Language): boolean {
  return FORM_IDS[language] !== null
}

export function registrationFormUrl(language: Language): string {
  return `${FORM_ORIGIN}/embed/${FORM_IDS[language] ?? FORM_IDS.de}`
}
