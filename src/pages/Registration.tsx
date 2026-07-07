import { Link } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight, Check, User, Mail, Phone, MapPin, Calendar, Users } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'

gsap.registerPlugin(ScrollTrigger)

export default function Registration() {
  const { t } = useLanguage()
  const membershipOptions = t.registration.membershipOptions
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

  const inputClass = 'w-full bg-input-theme border border-theme rounded-lg px-4 py-3 text-primary placeholder-[var(--text-dim)] text-sm focus:outline-none focus:border-[var(--border-hover)] focus:ring-1 focus:ring-[var(--border-hover)] transition-all'
  const labelClass = 'block text-sm font-medium text-secondary mb-1.5'

  return (
    <div className="bg-page min-h-screen pt-[72px]">
      <div ref={containerRef} className="max-w-[720px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        {/* Header */}
        <div data-animate className="mb-10 opacity-0">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors mb-6">
            <ArrowRight className="w-4 h-4 rotate-180" />
            {t.registration.back}
          </Link>
          <span className="block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4">
            {t.registration.overline}
          </span>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05]">
            {t.registration.title}
          </h1>
          <p className="mt-4 text-base text-secondary">
            {t.registration.subtitlePrefix}{' '}
            <a href="mailto:anmeldung@bsc70linz.at" className="text-accent hover:underline">anmeldung@bsc70linz.at</a>.
          </p>
        </div>

        {submitted ? (
          <div data-animate className="bg-card rounded-xl border border-theme p-8 sm:p-12 text-center opacity-0">
            <div className="w-16 h-16 rounded-full bg-accent-glow flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-accent" />
            </div>
            <h2 className="text-2xl font-semibold text-primary mb-3">{t.registration.thankYouTitle}</h2>
            <p className="text-secondary mb-6">
              {t.registration.thankYouText}
            </p>
            <Link
              to="/"
              className="inline-flex items-center bg-accent-gradient text-white text-sm font-semibold rounded-full px-8 py-3 hover:-translate-y-0.5 transition-all duration-200"
            >
              {t.registration.backHome}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Personal Info */}
            <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-8 opacity-0">
              <div className="flex items-center gap-3 mb-6">
                <User className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-primary">{t.registration.personalData}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>{t.registration.firstName}</label>
                  <input
                    type="text" name="firstName" required
                    value={formData.firstName} onChange={handleChange}
                    className={inputClass} placeholder={t.registration.firstNamePh}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t.registration.lastName}</label>
                  <input
                    type="text" name="lastName" required
                    value={formData.lastName} onChange={handleChange}
                    className={inputClass} placeholder={t.registration.lastNamePh}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t.registration.email}</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
                    <input
                      type="email" name="email" required
                      value={formData.email} onChange={handleChange}
                      className={`${inputClass} pl-11`} placeholder={t.registration.emailPh}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t.registration.phone}</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
                    <input
                      type="tel" name="phone"
                      value={formData.phone} onChange={handleChange}
                      className={`${inputClass} pl-11`} placeholder={t.registration.phonePh}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t.registration.birthDate}</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
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
            <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-8 opacity-0">
              <div className="flex items-center gap-3 mb-6">
                <MapPin className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-primary">{t.registration.addressHeading}</h2>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelClass}>{t.registration.streetLabel}</label>
                  <input
                    type="text" name="address"
                    value={formData.address} onChange={handleChange}
                    className={inputClass} placeholder={t.registration.streetPh}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <label className={labelClass}>{t.registration.zip}</label>
                    <input
                      type="text" name="zip"
                      value={formData.zip} onChange={handleChange}
                      className={inputClass} placeholder={t.registration.zipPh}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <label className={labelClass}>{t.registration.city}</label>
                    <input
                      type="text" name="city"
                      value={formData.city} onChange={handleChange}
                      className={inputClass} placeholder={t.registration.cityPh}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Membership */}
            <div data-animate className="bg-card rounded-xl border border-theme p-6 sm:p-8 opacity-0">
              <div className="flex items-center gap-3 mb-6">
                <Users className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-primary">{t.registration.membershipHeading}</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>{t.registration.membershipTypeLabel}</label>
                  <select
                    name="membership" required
                    value={formData.membership} onChange={handleChange}
                    className={`${inputClass} appearance-none cursor-pointer`}
                  >
                    {membershipOptions.map(opt => (
                      <option key={opt.value} value={opt.value} className="bg-card text-primary">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{t.registration.messageLabel}</label>
                  <textarea
                    name="message" rows={4}
                    value={formData.message} onChange={handleChange}
                    className={`${inputClass} resize-none`}
                    placeholder={t.registration.messagePh}
                  />
                </div>
              </div>
            </div>

            {/* Submit */}
            <div data-animate className="opacity-0">
              <button
                type="submit"
                className="w-full sm:w-auto bg-accent-gradient text-white text-base font-semibold rounded-full px-10 py-4 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(14,143,185,0.4)] transition-all duration-200"
              >
                {t.registration.submitButton}
              </button>
              <p className="text-xs text-dim mt-4">
                {t.registration.requiredNote}
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
