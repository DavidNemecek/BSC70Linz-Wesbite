import { Link } from 'react-router-dom'
import { ArrowLeft, Printer, FileDown } from 'lucide-react'
import { clubInfo, juniorTraining, membershipTiers } from '@/data/membership'
import { generateMembershipPdf } from '@/lib/generateMembershipPdf'

const line = 'border-b border-black/40 flex-1'

export default function Beitrittserklaerung() {
  return (
    <div className="min-h-screen bg-[#d9d9d9] print:bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-night text-white">
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/anmeldung" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Zurück zur Anmeldung
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 bg-white/[0.06] border border-white/[0.15] text-white text-sm font-semibold rounded-full px-5 py-2.5 hover:bg-white/[0.1] transition-all duration-200"
            >
              <Printer className="w-4 h-4" />
              Drucken
            </button>
            <button
              onClick={() => generateMembershipPdf()}
              className="inline-flex items-center gap-2 bg-ember text-white text-sm font-semibold rounded-full px-6 py-2.5 hover:-translate-y-0.5 transition-all duration-200"
            >
              <FileDown className="w-4 h-4" />
              PDF herunterladen
            </button>
          </div>
        </div>
      </div>

      {/* Printable A4 sheet */}
      <div className="max-w-[900px] mx-auto py-8 px-4 sm:px-6 print:py-0 print:px-0 print:max-w-none">
        <div className="bg-white text-black rounded-lg print:rounded-none shadow-xl print:shadow-none p-8 sm:p-10 print:p-[14mm] text-[13px] leading-snug">
          {/* Header */}
          <div className="flex items-start justify-between gap-6 border-b-2 border-black pb-4 mb-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Beitrittserklärung</h1>
              <p className="mt-2 max-w-[520px] text-[12px]">
                Ich erkläre meinen Beitritt zum {clubInfo.name} und verpflichte mich, die Satzungen des Vereins
                und die Beschlüsse des Vereinsvorstandes einzuhalten sowie die festgesetzten Mitgliedsbeiträge
                zu entrichten.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="font-display text-2xl leading-none">
                BSC 70 <span className="text-ember">LINZ</span>
              </div>
              <p className="text-[11px] mt-1">{clubInfo.website}</p>
            </div>
          </div>

          {/* Membership & fees */}
          <div className="mb-4">
            <h2 className="font-semibold text-[14px] mb-2">Mitgliedschaft und Kosten (bitte 1 Option ankreuzen)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
              {membershipTiers.map((tier) => (
                <div key={tier.id} className="flex items-baseline gap-2">
                  <span className="inline-block w-3.5 h-3.5 rounded-full border border-black shrink-0" />
                  <span className="flex-1">{tier.label}</span>
                  <span className="font-semibold whitespace-nowrap">€ {tier.price}</span>
                </div>
              ))}
            </div>
            <p className="text-[10.5px] mt-2 italic">
              Für Meisterschafts- und Turnierspieler ist zusätzlich die ÖBV-Spielberechtigungsgebühr gemäß Finanzordnung ÖBV fällig.
            </p>
          </div>

          {/* Personal data */}
          <div className="border border-black/60 mb-4">
            <div className="flex items-end gap-3 px-3 py-2 border-b border-black/30">
              <span className="text-[11px] shrink-0">Hauptmitglied (Titel, Vor- und Nachname):</span>
              <span className={line} />
              <span className="text-[11px] shrink-0">Geschlecht:</span>
              <span className="w-16 border-b border-black/40" />
              <span className="text-[11px] shrink-0">Geburtsdatum:</span>
              <span className="w-24 border-b border-black/40" />
            </div>
            <div className="flex items-end gap-3 px-3 py-2 border-b border-black/30">
              <span className="text-[11px] shrink-0">Adresse (Straße, HausNr., PLZ, Ort):</span>
              <span className={line} />
            </div>
            <div className="flex items-end gap-3 px-3 py-2 border-b border-black/30">
              <span className="text-[11px] shrink-0">E-Mail:</span>
              <span className={line} />
              <span className="text-[11px] shrink-0">Telefon:</span>
              <span className="w-32 border-b border-black/40" />
              <span className="text-[11px] shrink-0">Handy:</span>
              <span className="w-32 border-b border-black/40" />
            </div>

            {/* Family card */}
            <div className="px-3 py-2 border-b border-black/30">
              <p className="text-[11px] font-semibold mb-1.5">Daten für die Familienkarte (nur falls zutreffend)</p>
              {[0, 1].map((i) => (
                <div key={i} className="flex items-end gap-3 mb-1.5 last:mb-0">
                  <span className="text-[11px] shrink-0">Name:</span>
                  <span className={line} />
                  <span className="text-[11px] shrink-0">Geburtsdatum:</span>
                  <span className="w-24 border-b border-black/40" />
                  <span className="text-[11px] shrink-0">Geschlecht:</span>
                  <span className="w-16 border-b border-black/40" />
                </div>
              ))}
            </div>

            {/* Junior training */}
            <div className="flex items-start gap-2 px-3 py-2">
              <span className="inline-block w-3.5 h-3.5 border border-black shrink-0 mt-0.5" />
              <p className="text-[11px]">
                Ich melde mein Kind zusätzlich zum Nachwuchstraining an. Der Selbstkostenbetrag dafür beträgt pro
                Schulsemester € {juniorTraining.price} und wird jeweils zum Semesterbeginn vorgeschrieben.
              </p>
            </div>
          </div>

          {/* DSGVO */}
          <div className="text-[9.5px] leading-tight text-black/80 mb-4">
            <p className="font-semibold mb-1">Informationspflicht gem. DSGVO:</p>
            <p>
              Der Beitrittswillige erteilt hiermit freiwillig die Einwilligung zur Verarbeitung von personenbezogenen
              Daten (Name, Geburtsdatum, Geschlecht, Kontaktdaten, Bild(er), sportliche Ausbildungen) zum Zweck der
              allgemeinen Vereins- und Mitgliederverwaltung. Verantwortlicher ist das Leitungsorgan des Vereines
              (Obmann). Ihnen stehen die Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung und Widerspruch
              gemäß Art. 15–21 DSGVO sowie ein Beschwerderecht bei der Aufsichtsbehörde zu.
            </p>
          </div>

          {/* Signature */}
          <div className="flex items-end gap-8 mb-4">
            <div className="flex items-end gap-3 flex-1">
              <span className="text-[11px] shrink-0">Datum:</span>
              <span className={line} />
            </div>
            <div className="flex items-end gap-3 flex-1">
              <span className="text-[11px] shrink-0">Eigenhändige Unterschrift:</span>
              <span className={line} />
            </div>
          </div>
          <p className="text-[9.5px] italic mb-4">(bei Jugendlichen unter 14 Jahren die der Eltern)</p>

          <p className="text-[9.5px] leading-tight text-black/80 mb-4">
            Ich nehme zur Kenntnis, dass ein Austritt (und damit auch die Befreiung vom Mitgliedsbeitrag) nur zum
            31.3., 30.6., 30.9. bzw. 31.12. jeden Jahres möglich ist. Ein Austritt muss dem Vorstand vorher schriftlich
            bekannt gegeben werden. Änderungen der persönlichen Daten sind dem Vorstand schriftlich (per E-Mail)
            bekanntzugeben.
          </p>

          {/* Footer */}
          <div className="border-t-2 border-black pt-3 text-[10.5px] flex flex-wrap justify-between gap-x-6 gap-y-1">
            <span>Obmann {clubInfo.obmann}, {clubInfo.address}</span>
            <span>E-Mail: {clubInfo.officeEmail}</span>
            <span>ZVR-Nr.: {clubInfo.zvr}</span>
            <span>IBAN: {clubInfo.iban}, BIC: {clubInfo.bic}</span>
          </div>
        </div>

        <p className="print:hidden text-center text-white/50 text-xs mt-6">
          Bitte ausgefüllt und unterschrieben per E-Mail an{' '}
          <a href={`mailto:${clubInfo.registrationEmail}`} className="text-ember hover:underline">{clubInfo.registrationEmail}</a>{' '}
          senden oder in der Halle abgeben.
        </p>
      </div>
    </div>
  )
}
