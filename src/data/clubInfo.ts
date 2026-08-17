// Language-independent club/legal details (same in every locale).
// Membership tiers and prices live in src/i18n/translations.ts instead,
// since those are already translated per language throughout the site.
// Note there is deliberately no canonical origin here: canonical/Open Graph
// URLs and sitemap.xml are derived per request from the domain being served
// (src/lib/seo.ts, api/_origin.ts), so the site works on every domain it
// answers on without one of them claiming to be the original.
export const clubInfo = {
  name: 'ASKÖ BSC 70 Linz',
  // Chair and delivery address per the association register after the
  // 12 August 2026 general assembly: seat Linz, c/o the current Obfrau.
  chairRole: 'Obfrau',
  chair: 'Christina Wu',
  address: 'Suttnerstraße 15, 4030 Linz',
  officeEmail: 'office@bsc70linz.at',
  registrationEmail: 'anmeldung@bsc70linz.at',
  phone: '+43 664 2179311',
  website: 'www.bsc70linz.at',
  zvr: '222569469',
  iban: 'AT51 5400 0000 0032 3337',
  bic: 'OBLAAT2L',
}
