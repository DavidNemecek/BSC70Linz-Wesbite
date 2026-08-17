import { clubInfo } from '@/data/clubInfo'
import { translations } from '@/i18n/translations'

// The Beitrittserklärung is the club's official Austrian association
// membership declaration — always in German, regardless of site language.
export function buildMembershipMailto(): string {
  const subject = 'Beitrittserklärung – Anmeldung ASKÖ BSC 70 Linz'

  // Deliberately tiers only, no per-tier conditions: spelling them out here
  // pushed the mailto: URL past ~3300 characters, which some mail clients
  // (notably Outlook) truncate. The conditions are on the website and in the
  // PDF form instead, and the line below points at them.
  const tierLines = translations.de.membership.fees
    .map((fee) => `[ ] ${fee.label} - ${fee.price}`)
    .join('\n')

  const body = `Ich erkläre hiermit meinen Beitritt zum ${clubInfo.name} und verpflichte mich, die Vereinssatzung sowie die Beschlüsse des Vereinsvorstandes einzuhalten und die festgesetzten Mitgliedsbeiträge zu entrichten.

GEWÜNSCHTE MITGLIEDSCHAFT (bitte zutreffende Option(en) ankreuzen, Rest löschen)
${tierLines}
Bedingungen zu den einzelnen Beitragsarten: https://${clubInfo.website}/#mitgliedschaft

PERSÖNLICHE DATEN
Vor- und Nachname:
Geburtsdatum:
Geschlecht:
Adresse (Straße, Hausnr., PLZ, Ort):
Telefon:
E-Mail:

Nur bei Familienkarte: bitte Name, Geburtsdatum und Geschlecht der weiteren Familienmitglieder ergänzen.

Ich nehme zur Kenntnis, dass ein Austritt nur zum 31.3./30.6./30.9./31.12. möglich ist und dem Vorstand vorher schriftlich bekanntzugeben ist.

INFORMATIONSPFLICHT UND EINWILLIGUNG GEM. DSGVO
Der Beitrittswillige erteilt hiermit freiwillig die Einwilligung zur Verarbeitung von personenbezogenen Daten (Name, Geburtsdatum, Geschlecht, Kontaktdaten, Bild(er), sportliche Ausbildungen) zum Zweck der allgemeinen Vereins- und Mitgliederverwaltung. Verantwortlicher ist das Leitungsorgan des Vereines (Obfrau). Ihnen stehen die Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung und Widerspruch gemäß Art. 15–21 DSGVO sowie ein Beschwerderecht bei der Aufsichtsbehörde zu. Mit dem Absenden dieser E-Mail bestätige ich diese Einwilligung.

Datum: `

  return `mailto:${clubInfo.registrationEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
