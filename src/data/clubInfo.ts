// Language-independent club/legal details (same in every locale).
// Membership tiers and prices live in src/i18n/translations.ts instead,
// since those are already translated per language throughout the site.
// Note there is deliberately no canonical origin here: canonical/Open Graph
// URLs and sitemap.xml are derived per request from the domain being served
// (src/lib/seo.ts, api/_origin.ts), so the site works on every domain it
// answers on without one of them claiming to be the original.
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
