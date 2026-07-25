import type { TranslationDict } from '@/i18n/translations'

export type BoardRoleKey = keyof TranslationDict['boardRoles']

export const boardMembers: { name: string; roleKey: BoardRoleKey; phone: string | null; initials: string }[] = [
  { name: 'Stephan Ziermayr', roleKey: 'obmann', phone: '+43 676 7042186', initials: 'SZ' },
  { name: 'Nikita Arnold', roleKey: 'obmannStellvertreter', phone: null, initials: 'NA' },
  { name: 'Ursula Hochgatterer', roleKey: 'schriftfuehrerin', phone: null, initials: 'UH' },
  { name: 'Arthur Tomsovic', roleKey: 'schriftfuehrerStellvertreter', phone: null, initials: 'AT' },
  { name: 'Christoph Kainrath', roleKey: 'finanzreferent', phone: null, initials: 'CK' },
  { name: 'Johann Burgstaller', roleKey: 'finanzreferentStellvertreter', phone: null, initials: 'JB' },
  { name: 'Harald Hochgatterer', roleKey: 'sportlicherLeiter', phone: '+43 664 99331614', initials: 'HH' },
  { name: 'Andreas Böhm', roleKey: 'sportlicherLeiterStellvertreter', phone: '+43 664 8430613', initials: 'AB' },
]
