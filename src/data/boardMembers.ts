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
//
// Photos are optional; without one the card falls back to the initials.
// They are hand-cropped 3:4 portraits (head to chest), cut out to 480×640
// WebPs with a transparent background, so the accent gradient of the photo
// frame shows through and they match the initials of members without one.
export const boardMembers: {
  name: string
  roleKey: BoardRoleKey
  initials: string
  image?: string
}[] = [
  { name: 'Christina Wu', roleKey: 'obfrau', initials: 'CW', image: '/assets/board-christina-wu.webp' },
  { name: 'Reinhard Hechenberger', roleKey: 'obfrauStellvertreter', initials: 'RH' },
  { name: 'David Nemecek', roleKey: 'schriftfuehrer', initials: 'DN', image: '/assets/board-david-nemecek.webp' },
  { name: 'Andrea Binder', roleKey: 'schriftfuehrerinStellvertreterin', initials: 'AB' },
  { name: 'Roland Bauer', roleKey: 'finanzreferent', initials: 'RB' },
  { name: 'Johann Burgstaller', roleKey: 'finanzreferentStellvertreter', initials: 'JB' },
]
