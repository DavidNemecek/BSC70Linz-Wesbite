import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

export default function Hero() {
  const overlineRef = useRef<HTMLSpanElement>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const subRef = useRef<HTMLParagraphElement>(null)
  const ctaRef = useRef<HTMLAnchorElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let time = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
    }
    window.addEventListener('mousemove', handleMouse)

    const draw = () => {
      time += 0.003
      const w = canvas.width
      const h = canvas.height

      ctx.clearRect(0, 0, w, h)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      for (let i = 0; i < 80; i++) {
        const baseX = (Math.sin(i * 0.7 + time) * 0.5 + 0.5) * w
        const baseY = (Math.cos(i * 1.3 + time * 0.7) * 0.5 + 0.5) * h

        const dx = mx - baseX
        const dy = my - baseY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const influence = Math.max(0, 1 - dist / 400) * 30

        const x = baseX + (dx / (dist + 1)) * influence
        const y = baseY + (dy / (dist + 1)) * influence

        const size = 1 + Math.sin(i + time * 2) * 0.5
        const alpha = 0.15 + Math.sin(i * 0.5 + time) * 0.1

        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(14, 143, 185, ${alpha})`
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouse)
    }
  }, [])

  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.3 })

    if (overlineRef.current) {
      tl.fromTo(overlineRef.current, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' })
    }

    if (headlineRef.current) {
      const words = headlineRef.current.querySelectorAll('.word')
      tl.fromTo(words, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.12 }, '-=0.4')
    }

    if (subRef.current) {
      tl.fromTo(subRef.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, '-=0.4')
    }

    if (ctaRef.current) {
      tl.fromTo(ctaRef.current, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)' }, '-=0.3')
    }

    if (indicatorRef.current) {
      tl.fromTo(indicatorRef.current, { opacity: 0 }, { opacity: 1, duration: 0.6 }, '-=0.1')
    }

    return () => { tl.kill() }
  }, [])

  return (
    <section className="relative w-full min-h-[100dvh] flex items-center overflow-hidden bg-[#0B0C0F]">
      <img
        src="/assets/hero-bg.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ zIndex: 0 }}
      />
      <div
        className="absolute inset-0"
        style={{ zIndex: 1, background: 'linear-gradient(100deg, rgba(11,12,15,0.92) 0%, rgba(11,12,15,0.78) 40%, rgba(11,12,15,0.55) 70%, rgba(11,12,15,0.4) 100%)' }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 2 }}
      />

      <div className="relative z-10 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <span
          ref={overlineRef}
          className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-6 opacity-0"
        >
          ASKÖ BSC 70 LINZ
        </span>

        <h1 ref={headlineRef} className="font-display text-white leading-[0.95]">
          <span className="word block text-[clamp(3rem,18vw,9rem)] tracking-[0.02em] opacity-0">SCHLÄGE</span>
          <span className="word block text-[clamp(3rem,18vw,9rem)] tracking-[0.08em] opacity-0">MIT</span>
          <span className="word block text-[clamp(3rem,18vw,9rem)] tracking-[0.02em] opacity-0">TRADITION</span>
        </h1>

        <p
          ref={subRef}
          className="mt-8 text-base text-white/70 max-w-[480px] leading-relaxed opacity-0"
        >
          Badminton in Linz seit 1970. Einer der erfolgreichsten Badmintonvereine Österreichs — vom Nachwuchs bis zur Spitze.
        </p>

        <a
          ref={ctaRef}
          href="/anmeldung"
          className="inline-block mt-8 bg-accent-gradient text-white text-sm font-semibold rounded-full px-10 py-3.5 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(14,143,185,0.4)] transition-all duration-200 opacity-0"
        >
          Jetzt Mitglied werden
        </a>
      </div>

      <div
        ref={indicatorRef}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-0 z-10"
      >
        <span className="text-[0.625rem] uppercase tracking-[0.15em] text-white/30">Scroll</span>
        <div className="w-px h-10 bg-white/30 animate-scroll-bounce" />
      </div>
    </section>
  )
}
