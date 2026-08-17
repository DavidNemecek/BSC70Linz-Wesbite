import { jsPDF } from 'jspdf'
import { clubInfo } from '@/data/clubInfo'
import { translations } from '@/i18n/translations'

const MARGIN = 15
const PAGE_WIDTH = 210
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

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

export function buildMembershipPdf(): jsPDF {
  const { fees, note, validity } = translations.de.membership
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGIN

  // Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('Beitrittserklärung', MARGIN, y + 6)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('BSC 70 LINZ', PAGE_WIDTH - MARGIN, y + 4, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(clubInfo.website, PAGE_WIDTH - MARGIN, y + 9, { align: 'right' })

  y += 12
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  const intro = doc.splitTextToSize(
    `Ich erkläre meinen Beitritt zum ${clubInfo.name} und verpflichte mich, die Satzungen des Vereins und die Beschlüsse des Vereinsvorstandes einzuhalten sowie die festgesetzten Mitgliedsbeiträge zu entrichten.`,
    130
  )
  doc.text(intro, MARGIN, y)
  y += intro.length * 4.2 + 4

  doc.setDrawColor(0)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 7

  // Membership & fees
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Mitgliedschaft und Kosten (bitte zutreffende Option(en) ankreuzen)', MARGIN, y)
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
  const oebv = doc.splitTextToSize(`${validity} ${note}`, CONTENT_WIDTH)
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
      { label: 'Hauptmitglied (Titel, Vor- und Nachname):', lineWidth: 35 },
      { label: 'Geschlecht:', lineWidth: 8 },
      { label: 'Geburtsdatum:', lineWidth: 18 },
    ],
    MARGIN + 3
  )
  y += 8
  fieldRow([{ label: 'Adresse (Straße, HausNr., PLZ, Ort):', lineWidth: 115 }], MARGIN + 3)
  y += 8
  fieldRow(
    [
      { label: 'E-Mail:', lineWidth: 55 },
      { label: 'Telefon:', lineWidth: 30 },
      { label: 'Handy:', lineWidth: 30 },
    ],
    MARGIN + 3
  )
  y += 9

  doc.setFont('helvetica', 'bold')
  doc.text('Daten für die Familienkarte (nur falls zutreffend)', MARGIN + 3, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  for (let i = 0; i < 2; i++) {
    fieldRow(
      [
        { label: 'Name:', lineWidth: 55 },
        { label: 'Geburtsdatum:', lineWidth: 25 },
        { label: 'Geschlecht:', lineWidth: 20 },
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
  doc.text('Informationspflicht gem. DSGVO:', MARGIN, y)
  y += 3.6
  doc.setFont('helvetica', 'normal')
  const dsgvo = doc.splitTextToSize(
    'Der Beitrittswillige erteilt hiermit freiwillig die Einwilligung zur Verarbeitung von personenbezogenen Daten (Name, Geburtsdatum, Geschlecht, Kontaktdaten, Bild(er), sportliche Ausbildungen) zum Zweck der allgemeinen Vereins- und Mitgliederverwaltung. Verantwortlicher ist das Leitungsorgan des Vereines (Obfrau). Ihnen stehen die Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung und Widerspruch gemäß Art. 15–21 DSGVO sowie ein Beschwerderecht bei der Aufsichtsbehörde zu.',
    CONTENT_WIDTH
  )
  doc.text(dsgvo, MARGIN, y)
  y += dsgvo.length * 3.4 + 8

  // Signature
  doc.setFontSize(9)
  fieldRow(
    [
      { label: 'Datum:', lineWidth: 35 },
      { label: 'Eigenhändige Unterschrift:', lineWidth: 65 },
    ],
    MARGIN + 3
  )
  y += 4
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.text('(bei Jugendlichen unter 14 Jahren die der Eltern)', MARGIN + 3, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const austritt = doc.splitTextToSize(
    'Ich nehme zur Kenntnis, dass ein Austritt (und damit auch die Befreiung vom Mitgliedsbeitrag) nur zum 31.3., 30.6., 30.9. bzw. 31.12. jeden Jahres möglich ist. Ein Austritt muss dem Vorstand vorher schriftlich bekannt gegeben werden. Änderungen der persönlichen Daten sind dem Vorstand schriftlich (per E-Mail) bekanntzugeben.',
    CONTENT_WIDTH
  )
  doc.text(austritt, MARGIN, y)
  y += austritt.length * 3.4 + 6

  // Footer
  doc.setDrawColor(0)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 5
  doc.setFontSize(8.5)
  doc.text(`${clubInfo.chairRole} ${clubInfo.chair}, ${clubInfo.address}`, MARGIN, y)
  doc.text(`E-Mail: ${clubInfo.officeEmail}`, MARGIN, y + 4)
  doc.text(`ZVR-Nr.: ${clubInfo.zvr}`, MARGIN, y + 8)
  doc.text(`IBAN: ${clubInfo.iban}, BIC: ${clubInfo.bic}`, MARGIN, y + 12)

  return doc
}

export function generateMembershipPdf() {
  buildMembershipPdf().save('beitrittserklaerung-bsc70linz.pdf')
}
