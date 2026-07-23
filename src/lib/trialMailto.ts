import { clubInfo } from '@/data/clubInfo'

// Schnuppertraining request — deliberately minimal (just name + date),
// unlike the full Beitrittserklärung membership mailto.
export function buildTrialMailto(): string {
  const subject = 'Schnuppertraining – Anfrage'

  const body = `Ich möchte gerne unverbindlich zum Schnuppertraining vorbeikommen.

Name:
Wunschtermin:
`

  return `mailto:${clubInfo.officeEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
