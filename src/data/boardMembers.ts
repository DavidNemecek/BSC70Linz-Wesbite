import type { TranslationDict } from '@/i18n/translations'

export type BoardRoleKey = keyof TranslationDict['boardRoles']

// Board as elected at the extraordinary general assembly on 12 August 2026
// (Vorstand gem. §11(1) der Vereinsstatuten). The statutes define exactly
// these six positions — there is deliberately no "sportliche Leitung" here.
// The three Rechnungsprüfer (§15) are not published on the site.
//
// Names and roles only: the individual mailboxes and phone numbers are
// deliberately not published. Enquiries go to the club's office address and
// phone number in src/data/clubInfo.ts, which is what the site shows instead.
export const boardMembers: {
  name: string
  roleKey: BoardRoleKey
  initials: string
}[] = [
  { name: 'Christina Wu', roleKey: 'obfrau', initials: 'CW' },
  { name: 'Reinhard Hechenberger', roleKey: 'obfrauStellvertreter', initials: 'RH' },
  { name: 'David Nemecek', roleKey: 'schriftfuehrer', initials: 'DN' },
  { name: 'Andrea Binder', roleKey: 'schriftfuehrerinStellvertreterin', initials: 'AB' },
  { name: 'Roland Bauer', roleKey: 'finanzreferent', initials: 'RB' },
  { name: 'Johann Burgstaller', roleKey: 'finanzreferentStellvertreter', initials: 'JB' },
]
