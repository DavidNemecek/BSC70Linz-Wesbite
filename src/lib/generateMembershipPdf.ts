import { jsPDF } from 'jspdf'
import { clubInfo } from '@/data/clubInfo'
import { translations, type Language } from '@/i18n/translations'

const MARGIN = 15
const PAGE_WIDTH = 210
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

interface PdfStrings {
  fileName: string
  title: string
  intro: string
  feesHeading: string
  mainMember: string
  gender: string
  birthDate: string
  address: string
  email: string
  phone: string
  mobile: string
  familyHeading: string
  familyName: string
  dsgvoHeading: string
  dsgvoText: string
  date: string
  signature: string
  signatureHint: string
  exitNote: string
  emailLabel: string
  zvrLabel: string
  /** Reads as a title before the name, so it is translated rather than left as the register term. */
  chairRole: string
  /**
   * Only set for translations. An Austrian association's statutes and this
   * declaration exist in German, so a translated form has to say which wording
   * governs — otherwise it reads as an alternative legal text rather than a
   * reading aid.
   */
  bindingNote: string | null
}

const PDF_STRINGS: Record<Language, PdfStrings> = {
  de: {
    fileName: 'beitrittserklaerung-bsc70linz.pdf',
    title: 'Beitrittserklärung',
    intro: `Ich erkläre meinen Beitritt zum ${clubInfo.name} und verpflichte mich, die Satzungen des Vereins und die Beschlüsse des Vereinsvorstandes einzuhalten sowie die festgesetzten Mitgliedsbeiträge zu entrichten.`,
    feesHeading: 'Mitgliedschaft und Kosten (bitte zutreffende Option(en) ankreuzen)',
    mainMember: 'Hauptmitglied (Titel, Vor- und Nachname):',
    gender: 'Geschlecht:',
    birthDate: 'Geburtsdatum:',
    address: 'Adresse (Straße, HausNr., PLZ, Ort):',
    email: 'E-Mail:',
    phone: 'Telefon:',
    mobile: 'Handy:',
    familyHeading: 'Daten für die Familienkarte (nur falls zutreffend)',
    familyName: 'Name:',
    dsgvoHeading: 'Informationspflicht gem. DSGVO:',
    dsgvoText:
      'Der Beitrittswillige erteilt hiermit freiwillig die Einwilligung zur Verarbeitung von personenbezogenen Daten (Name, Geburtsdatum, Geschlecht, Kontaktdaten, Bild(er), sportliche Ausbildungen) zum Zweck der allgemeinen Vereins- und Mitgliederverwaltung. Verantwortlicher ist das Leitungsorgan des Vereines (Obfrau). Ihnen stehen die Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung und Widerspruch gemäß Art. 15–21 DSGVO sowie ein Beschwerderecht bei der Aufsichtsbehörde zu.',
    date: 'Datum:',
    signature: 'Eigenhändige Unterschrift:',
    signatureHint: '(bei Jugendlichen unter 14 Jahren die der Eltern)',
    exitNote:
      'Ich nehme zur Kenntnis, dass ein Austritt (und damit auch die Befreiung vom Mitgliedsbeitrag) nur zum 31.3., 30.6., 30.9. bzw. 31.12. jeden Jahres möglich ist. Ein Austritt muss dem Vorstand vorher schriftlich bekannt gegeben werden. Änderungen der persönlichen Daten sind dem Vorstand schriftlich (per E-Mail) bekanntzugeben.',
    emailLabel: 'E-Mail',
    zvrLabel: 'ZVR-Nr.',
    chairRole: clubInfo.chairRole,
    bindingNote: null,
  },
  en: {
    fileName: 'membership-declaration-bsc70linz.pdf',
    // The German term stays in the title: this is the document the club files,
    // and members are asked for a "Beitrittserklärung" by that name.
    title: 'Membership Declaration',
    intro: `I hereby declare my membership of ${clubInfo.name} and undertake to comply with the club's statutes and the resolutions of its board, and to pay the membership fees as set.`,
    feesHeading: 'Membership and fees (please tick the applicable option(s))',
    mainMember: 'Main member (title, first and last name):',
    gender: 'Gender:',
    birthDate: 'Date of birth:',
    address: 'Address (street, no., postcode, town):',
    email: 'E-mail:',
    phone: 'Phone:',
    mobile: 'Mobile:',
    familyHeading: 'Details for the family membership (only if applicable)',
    familyName: 'Name:',
    dsgvoHeading: 'Information pursuant to the GDPR:',
    dsgvoText:
      'The prospective member hereby freely consents to the processing of personal data (name, date of birth, gender, contact details, image(s), sports qualifications) for the purpose of general club and membership administration. The controller is the club’s managing body (the chairwoman). You have the rights of access, rectification, erasure, restriction and objection pursuant to Art. 15–21 GDPR, as well as the right to lodge a complaint with the supervisory authority.',
    date: 'Date:',
    signature: 'Signature:',
    signatureHint: '(for young people under 14, that of a parent or guardian)',
    exitNote:
      'I acknowledge that leaving the club (and with it the release from the membership fee) is only possible as of 31 March, 30 June, 30 September or 31 December of each year. Notice of leaving must be given to the board in writing beforehand. Changes to personal details must be reported to the board in writing (by e-mail).',
    emailLabel: 'E-mail',
    zvrLabel: 'Register no. (ZVR)',
    chairRole: 'Chairwoman',
    bindingNote:
      'This English version is a translation provided for your convenience. Should any question of interpretation arise, the German wording of this declaration and of the club statutes prevails.',
  },
}

function underline(doc: jsPDF, x: number, y: number, width: number) {
  doc.setDrawColor(60)
  doc.setLineWidth(0.2)
  doc.line(x, y, x + width, y)
}

function checkbox(doc: jsPDF, x: number, y: number) {
  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  doc.circle(x + 1.6, y - 1.2, 1.6)
}

export function buildMembershipPdf(language: Language = 'de'): jsPDF {
  const s = PDF_STRINGS[language]
  const { fees, note } = translations[language].membership
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setLanguage(language)
  let y = MARGIN

  // Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text(s.title, MARGIN, y + 6)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('BSC 70 LINZ', PAGE_WIDTH - MARGIN, y + 4, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(clubInfo.website, PAGE_WIDTH - MARGIN, y + 9, { align: 'right' })

  y += 12
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  const intro = doc.splitTextToSize(s.intro, 130)
  doc.text(intro, MARGIN, y)
  y += intro.length * 4.2 + 4

  if (s.bindingNote) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    const binding = doc.splitTextToSize(s.bindingNote, CONTENT_WIDTH)
    doc.text(binding, MARGIN, y)
    y += binding.length * 3.2 + 3
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
  }

  doc.setDrawColor(0)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 7

  // Membership & fees
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(s.feesHeading, MARGIN, y)
  y += 6

  doc.setFontSize(9.5)
  fees.forEach((fee) => {
    doc.setFont('helvetica', 'normal')
    checkbox(doc, MARGIN, y)
    doc.text(fee.label, MARGIN + 6, y)
    doc.setFont('helvetica', 'bold')
    doc.text(fee.price, PAGE_WIDTH - MARGIN, y, { align: 'right' })
    y += 5

    // The conditions belong on the form too — tiers like the student special
    // or the family membership are ambiguous without them.
    if (fee.detail) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(7.5)
      const lines = doc.splitTextToSize(fee.detail, CONTENT_WIDTH - 30)
      doc.text(lines, MARGIN + 6, y)
      y += lines.length * 3.2 + 1.5
      doc.setFontSize(9.5)
    } else {
      y += 0.5
    }
  })

  y += 1
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  const oebv = doc.splitTextToSize(note, CONTENT_WIDTH)
  doc.text(oebv, MARGIN, y)
  y += oebv.length * 3.6 + 6

  // Personal data box
  const boxTop = y
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  // Places label/underline pairs left to right, each field claiming exactly
  // `lineWidth` mm for the answer — keeps later fields from overlapping
  // the previous underline regardless of how long a label's text is.
  const fieldRow = (fields: { label: string; lineWidth: number }[], startX: number) => {
    let x = startX
    fields.forEach(({ label, lineWidth }) => {
      doc.text(label, x, y)
      const labelWidth = (doc.getStringUnitWidth(label) * doc.getFontSize()) / doc.internal.scaleFactor
      const lineStart = x + labelWidth + 2
      underline(doc, lineStart, y + 0.5, lineWidth)
      x = lineStart + lineWidth + 4
    })
  }

  y += 6
  fieldRow(
    [
      { label: s.mainMember, lineWidth: 35 },
      { label: s.gender, lineWidth: 8 },
      { label: s.birthDate, lineWidth: 18 },
    ],
    MARGIN + 3
  )
  y += 8
  fieldRow([{ label: s.address, lineWidth: 115 }], MARGIN + 3)
  y += 8
  fieldRow(
    [
      { label: s.email, lineWidth: 55 },
      { label: s.phone, lineWidth: 30 },
      { label: s.mobile, lineWidth: 30 },
    ],
    MARGIN + 3
  )
  y += 9

  doc.setFont('helvetica', 'bold')
  doc.text(s.familyHeading, MARGIN + 3, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  for (let i = 0; i < 2; i++) {
    fieldRow(
      [
        { label: s.familyName, lineWidth: 55 },
        { label: s.birthDate, lineWidth: 25 },
        { label: s.gender, lineWidth: 20 },
      ],
      MARGIN + 3
    )
    y += 7
  }
  y += 2

  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  doc.rect(MARGIN, boxTop, CONTENT_WIDTH, y - boxTop)
  y += 6

  // DSGVO
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(s.dsgvoHeading, MARGIN, y)
  y += 3.6
  doc.setFont('helvetica', 'normal')
  const dsgvo = doc.splitTextToSize(s.dsgvoText, CONTENT_WIDTH)
  doc.text(dsgvo, MARGIN, y)
  y += dsgvo.length * 3.4 + 8

  // Signature
  doc.setFontSize(9)
  fieldRow(
    [
      { label: s.date, lineWidth: 35 },
      { label: s.signature, lineWidth: 65 },
    ],
    MARGIN + 3
  )
  y += 4
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.text(s.signatureHint, MARGIN + 3, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const austritt = doc.splitTextToSize(s.exitNote, CONTENT_WIDTH)
  doc.text(austritt, MARGIN, y)
  y += austritt.length * 3.4 + 6

  // Footer
  doc.setDrawColor(0)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 5
  doc.setFontSize(8.5)
  doc.text(`${s.chairRole} ${clubInfo.chair}, ${clubInfo.address}`, MARGIN, y)
  doc.text(`${s.emailLabel}: ${clubInfo.officeEmail}`, MARGIN, y + 4)
  doc.text(`${s.zvrLabel}: ${clubInfo.zvr}`, MARGIN, y + 8)
  doc.text(`IBAN: ${clubInfo.iban}, BIC: ${clubInfo.bic}`, MARGIN, y + 12)

  return doc
}

export function generateMembershipPdf(language: Language = 'de') {
  buildMembershipPdf(language).save(PDF_STRINGS[language].fileName)
}
