export interface MembershipTier {
  id: string
  label: string
  price: string
}

// Single source of truth for membership fees. Update prices here only —
// the pricing table, the e-mail template and the printable form all read from this list.
export const membershipTiers: MembershipTier[] = [
  { id: 'adult', label: 'Erwachsene (ab 18 Jahre)', price: '154,00' },
  { id: 'student', label: 'Studenten (bis 26 Jahre)', price: '84,00' },
  { id: 'youth', label: 'Jugendliche (15–18 Jahre)', price: '55,00' },
  { id: 'child', label: 'Kinder (bis 14 Jahre)', price: '44,00' },
  { id: 'family', label: 'Familienkarte (2 Erwachsene + max. 2 Kinder bis 15 Jahre)', price: '264,00' },
  { id: 'supporting', label: 'Unterstützende Mitgliedschaft', price: '44,00' },
]

export const juniorTraining: MembershipTier = {
  id: 'junior-training',
  label: 'Kindertraining pro Semester',
  price: '38,50',
}

export const clubInfo = {
  name: 'ASKÖ BSC 70 Linz',
  obmann: 'DI Stephan Ziermayr',
  address: 'Reuchlinstraße 4, 4020 Linz',
  officeEmail: 'office@bsc70linz.at',
  registrationEmail: 'anmeldung@bsc70linz.at',
  website: 'www.bsc70linz.at',
  zvr: '222569469',
  iban: 'AT51 5400 0000 0032 3337',
  bic: 'OBLAAT2L',
}
