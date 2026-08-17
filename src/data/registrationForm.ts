export const FORM_ORIGIN = 'https://formular.vereinsplaner.com'

/**
 * The club's Vereinsplaner registration form. It exists in German only, and
 * deliberately so — the club has decided against maintaining a second, English
 * form, and Vereinsplaner offers no locale switch of its own (it ignores ?lang,
 * ?locale and ?language as well as Accept-Language, always serving
 * <html lang="de">).
 *
 * Every language therefore embeds this one form. Non-German locales say so via
 * registration.formGermanOnlyNote rather than leaving visitors to work it out
 * from the German field labels.
 */
export const REGISTRATION_FORM_URL = `${FORM_ORIGIN}/embed/da9f7886-3ee4-4974-a64d-cf9cfdf92bea`
