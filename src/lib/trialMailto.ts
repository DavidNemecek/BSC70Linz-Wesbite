import { clubInfo } from '@/data/clubInfo'

export function buildTrialMailto(): string {
  const subject = 'Anfrage zum Schnuppertraining – [TODO: Vor- und Nachname]'

  const body = `Hallo liebes Team des BSC 70 Linz,

ich möchte gerne an einem Schnuppertraining teilnehmen.

Name: [TODO: Vor- und Nachname]

Alter: [TODO: Alter]

Wunschtermin: [TODO: Datum – siehe https://${clubInfo.website}/#training]

Erfahrung im Badminton: [TODO: Keine / gelegentlich gespielt / bereits im Verein gespielt / sonstige Erfahrung]

Ausrüstung: [TODO: Ich bringe einen eigenen Schläger mit / Ich benötige einen Leihschläger - Geeignete Hallenschuhe sind Voraussetzung]

Telefonnummer (optional): [TODO: z. B. für Rückfragen oder bei unter 18-Jährigen die Nummer einer erziehungsberechtigten Person, falls während des Trainings jemand erreicht werden muss]

Weitere Informationen, die ich vorab benötige:

[TODO: Fragen ergänzen oder „keine“ eintragen]

Sportliche Grüße

[TODO: Vorname]
`

  return `mailto:${clubInfo.officeEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
