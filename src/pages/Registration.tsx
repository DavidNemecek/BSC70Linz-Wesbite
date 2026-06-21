import { Link } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight, Check, User, Mail, Phone, MapPin, Calendar, Users } from 'lucide-react'

gsap.registerPlugin(ScrollTrigger)

const membershipOptions = [
  { value: '', label: 'Mitgliedschaft wählen' },
  { value: 'adult', label: 'Erwachsene (€ 154,00/Jahr)' },
  { value: 'student', label: 'Studenten bis 26 J. (€ 84,00/Jahr)' },
  { value: 'youth', label: 'Jugendliche 15–18 J. (€ 55,00/Jahr)' },
  { value: 'child', label: 'Kinder bis 14 J. (€ 44,00/Jahr)' },
  { value: 'family', label: 'Familienkarte (€ 264,00/Jahr)' },
  { value: 'supporting', label: 'Unterstützendes Mitglied (€ 44,00/Jahr)' },
]

export default function Registration() {
  const [submitted, setSubmitted] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthDate: '',
    address: '',
    city: '',
    zip: '',
    membership: '',
    message: '',
  })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.scrollTo(0, 0)
    if (!containerRef.current) return

    const ctx = gsap.context(() => {
      const elements = containerRef.current!.querySelectorAll('[data-animate]')
      elements.forEach((el) => {
        gsap.fromTo(el, { opacity: 0, y: 40 }, {
          opacity: 1, y: 0, duration: 0.7, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' }
        })
      })
    }, containerRef)

    return () => ctx.revert()
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  const inputClass = 'w-full bg-charcoal border border-white/[0.08] rounded-lg px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-ember/50 focus:ring-1 focus:ring-ember/50 transition-all'
  const labelClass = 'block text-sm font-medium text-white/70 mb-1.5'

  return (
    <div className="bg-night min-h-screen pt-[72px]">
      <div ref={containerRef} className="max-w-[720px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        {/* Header */}
        <div data-animate className="mb-10 opacity-0">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-ember transition-colors mb-6">
            <ArrowRight className="w-4 h-4 rotate-180" />
            Zurück zur Startseite
          </Link>
          <span className="block text-xs font-medium uppercase tracking-[0.15em] text-ember mb-4">
            ANMELDUNG
          </span>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-white leading-[1.05]">
            Mitglied werden
          </h1>
          <p className="mt-4 text-base text-white/60">
            Fülle das Formular aus und wir melden uns bei dir. Oder schick uns die Beitrittserklärung direkt per E-Mail an{' '}
            <a href="mailto:anmeldung@bsc70linz.at" className="text-ember hover:underline">anmeldung@bsc70linz.at</a>.
          </p>
        </div>

        {submitted ? (
          <div data-animate className="bg-charcoal rounded-xl border border-white/[0.08] p-8 sm:p-12 text-center opacity-0">
            <div className="w-16 h-16 rounded-full bg-ember/20 flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-ember" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-3">Vielen Dank!</h2>
            <p className="text-white/60 mb-6">
              Wir haben deine Anmeldung erhalten und melden uns so schnell wie möglich bei dir.
            </p>
            <Link
              to="/"
              className="inline-flex items-center bg-ember text-white text-sm font-semibold rounded-full px-8 py-3 hover:-translate-y-0.5 transition-all duration-200"
            >
              Zurück zur Startseite
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Personal Info */}
            <div data-animate className="bg-charcoal rounded-xl border border-white/[0.08] p-6 sm:p-8 opacity-0">
              <div className="flex items-center gap-3 mb-6">
                <User className="w-5 h-5 text-ember" />
                <h2 className="text-lg font-semibold text-white">Persönliche Daten</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Vorname *</label>
                  <input
                    type="text" name="firstName" required
                    value={formData.firstName} onChange={handleChange}
                    className={inputClass} placeholder="Max"
                  />
                </div>
                <div>
                  <label className={labelClass}>Nachname *</label>
                  <input
                    type="text" name="lastName" required
                    value={formData.lastName} onChange={handleChange}
                    className={inputClass} placeholder="Mustermann"
                  />
                </div>
                <div>
                  <label className={labelClass}>E-Mail *</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="email" name="email" required
                      value={formData.email} onChange={handleChange}
                      className={`${inputClass} pl-11`} placeholder="max@email.at"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Telefon</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="tel" name="phone"
                      value={formData.phone} onChange={handleChange}
                      className={`${inputClass} pl-11`} placeholder="+43 664 1234567"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Geburtsdatum</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="date" name="birthDate"
                      value={formData.birthDate} onChange={handleChange}
                      className={`${inputClass} pl-11`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Address */}
            <div data-animate className="bg-charcoal rounded-xl border border-white/[0.08] p-6 sm:p-8 opacity-0">
              <div className="flex items-center gap-3 mb-6">
                <MapPin className="w-5 h-5 text-ember" />
                <h2 className="text-lg font-semibold text-white">Adresse</h2>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelClass}>Straße & Hausnummer</label>
                  <input
                    type="text" name="address"
                    value={formData.address} onChange={handleChange}
                    className={inputClass} placeholder="Musterstraße 12"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <label className={labelClass}>PLZ</label>
                    <input
                      type="text" name="zip"
                      value={formData.zip} onChange={handleChange}
                      className={inputClass} placeholder="4030"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <label className={labelClass}>Ort</label>
                    <input
                      type="text" name="city"
                      value={formData.city} onChange={handleChange}
                      className={inputClass} placeholder="Linz"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Membership */}
            <div data-animate className="bg-charcoal rounded-xl border border-white/[0.08] p-6 sm:p-8 opacity-0">
              <div className="flex items-center gap-3 mb-6">
                <Users className="w-5 h-5 text-ember" />
                <h2 className="text-lg font-semibold text-white">Mitgliedschaft</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Mitgliedschaftsart *</label>
                  <select
                    name="membership" required
                    value={formData.membership} onChange={handleChange}
                    className={`${inputClass} appearance-none cursor-pointer`}
                  >
                    {membershipOptions.map(opt => (
                      <option key={opt.value} value={opt.value} className="bg-charcoal text-white">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Nachricht (optional)</label>
                  <textarea
                    name="message" rows={4}
                    value={formData.message} onChange={handleChange}
                    className={`${inputClass} resize-none`}
                    placeholder="Hast du Fragen oder möchtest du uns noch etwas mitteilen?"
                  />
                </div>
              </div>
            </div>

            {/* Submit */}
            <div data-animate className="opacity-0">
              <button
                type="submit"
                className="w-full sm:w-auto bg-ember text-white text-base font-semibold rounded-full px-10 py-4 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(232,80,44,0.4)] transition-all duration-200"
              >
                Anmeldung absenden
              </button>
              <p className="text-xs text-white/40 mt-4">
                * Pflichtfelder. Die Daten werden nur zur Bearbeitung deiner Anmeldung verwendet.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
