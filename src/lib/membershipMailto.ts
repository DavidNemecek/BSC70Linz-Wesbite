import { clubInfo, juniorTraining, membershipTiers } from '@/data/membership'

export function buildMembershipMailto(): string {
  const subject = 'Beitrittserklärung – Anmeldung ASKÖ BSC 70 Linz'

  const tierLines = membershipTiers
    .map((tier) => `[ ] ${tier.label} - € ${tier.price}/Jahr`)
    .join('\n')

  const body = `Ich erkläre hiermit meinen Beitritt zum ASKÖ BSC 70 Linz und verpflichte mich, die Vereinssatzung sowie die Beschlüsse des Vereinsvorstandes einzuhalten und die festgesetzten Mitgliedsbeiträge zu entrichten.

GEWÜNSCHTE MITGLIEDSCHAFT (bitte 1 Option ankreuzen, Rest löschen)
${tierLines}
[ ] zusätzlich ${juniorTraining.label} - € ${juniorTraining.price}/Semester

PERSÖNLICHE DATEN
Vor- und Nachname:
Geburtsdatum:
Geschlecht:
Adresse (Straße, Hausnr., PLZ, Ort):
Telefon:
E-Mail:

Nur bei Familienkarte: bitte Name, Geburtsdatum und Geschlecht der weiteren Familienmitglieder ergänzen.

Ich nehme zur Kenntnis, dass ein Austritt nur zum 31.3./30.6./30.9./31.12. möglich ist und dem Vorstand vorher schriftlich bekanntzugeben ist. Mit dem Absenden dieser E-Mail stimme ich der Verarbeitung meiner Daten gemäß DSGVO zur Vereins- und Mitgliederverwaltung zu.

Datum: `

  return `mailto:${clubInfo.registrationEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
