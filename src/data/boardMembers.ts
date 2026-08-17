import type { TranslationDict } from '@/i18n/translations'

export type BoardRoleKey = keyof TranslationDict['boardRoles']

// Board as elected at the extraordinary general assembly on 12 August 2026
// (Vorstand gem. §11(1) der Vereinsstatuten). The statutes define exactly
// these six positions — there is deliberately no "sportliche Leitung" here.
// The three Rechnungsprüfer (§15) are not published on the site.
// Every member has a vorname.nachname@bsc70linz.at address; phone numbers
// are only listed where the person agreed to publish one.
export const boardMembers: {
  name: string
  roleKey: BoardRoleKey
  email: string
  phone: string | null
  initials: string
}[] = [
  { name: 'Christina Wu', roleKey: 'obfrau', email: 'christina.wu@bsc70linz.at', phone: null, initials: 'CW' },
  { name: 'Reinhard Hechenberger', roleKey: 'obfrauStellvertreter', email: 'reinhard.hechenberger@bsc70linz.at', phone: null, initials: 'RH' },
  { name: 'David Nemecek', roleKey: 'schriftfuehrer', email: 'david.nemecek@bsc70linz.at', phone: '+43 664 2179311', initials: 'DN' },
  { name: 'Andrea Binder', roleKey: 'schriftfuehrerinStellvertreterin', email: 'andrea.binder@bsc70linz.at', phone: null, initials: 'AB' },
  { name: 'Roland Bauer', roleKey: 'finanzreferent', email: 'roland.bauer@bsc70linz.at', phone: null, initials: 'RB' },
  { name: 'Johann Burgstaller', roleKey: 'finanzreferentStellvertreter', email: 'johann.burgstaller@bsc70linz.at', phone: null, initials: 'JB' },
]
