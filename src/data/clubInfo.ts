// Language-independent club/legal details (same in every locale).
// Membership tiers and prices live in src/i18n/translations.ts instead,
// since those are already translated per language throughout the site.
// siteUrl is the canonical origin used for <link rel="canonical">, Open
// Graph/Twitter tags and sitemap.xml. It must match whichever domain is
// actually serving the site right now — switch it to 'https://bsc70linz.at'
// (and update robots.txt / sitemap.xml / index.html accordingly) once that
// domain is DNS-pointed here, not before, or search engines will canonicalize
// to a domain that doesn't yet serve the content.
export const clubInfo = {
  name: 'ASKÖ BSC 70 Linz',
  obmann: 'DI Stephan Ziermayr',
  address: 'Reuchlinstraße 4, 4020 Linz',
  officeEmail: 'office@bsc70linz.at',
  registrationEmail: 'anmeldung@bsc70linz.at',
  website: 'www.bsc70linz.at',
  siteUrl: 'https://bsc70linz.neyda.at',
  zvr: '222569469',
  iban: 'AT51 5400 0000 0032 3337',
  bic: 'OBLAAT2L',
}
