import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { boardMembers } from '@/data/boardMembers';
import { useLanguage } from '@/context/LanguageContext';

export default function Board() {
  const ref = useScrollAnimation();
  const { t } = useLanguage();

  return (
    <section id="vorstand" className="bg-surface py-16 sm:py-20 lg:py-32">
      <div ref={ref} className="max-w-[1280px] mx-auto px-6 lg:px-10">
        <span data-animate className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-accent mb-4 opacity-0">
          {t.board.overline}
        </span>

        <h2 data-animate className="font-display text-[clamp(3rem,7vw,5.5rem)] tracking-[0.02em] text-primary leading-[1.05] mb-12 opacity-0">
          {t.board.title}
        </h2>

        <div data-stagger className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {boardMembers.map((member, i) => (
            <div
              key={i}
              data-stagger-item
              className="flex items-center gap-6 bg-card rounded-lg border border-theme p-5 opacity-0 hover:-translate-y-1 hover:border-[var(--border-hover)] hover:shadow-[0_8px_30px_rgba(14,143,185,0.1)] transition-all duration-300"
            >
              {/* Photos are cut out with a transparent background, so the
                  gradient behind them is the same one the initials sit on. */}
              <div className="w-28 sm:w-36 aspect-[3/4] rounded-lg overflow-hidden bg-accent-gradient flex items-center justify-center flex-shrink-0">
                {member.image ? (
                  // alt is empty on purpose: the name is right next to it.
                  <img
                    src={member.image}
                    alt=""
                    width={144}
                    height={192}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="font-display text-5xl tracking-[0.04em] text-white">{member.initials}</span>
                )}
              </div>

              <div className="min-w-0">
                <h3 className="text-lg sm:text-xl font-semibold text-primary tracking-tight leading-snug">{member.name}</h3>
                <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-accent">
                  {t.boardRoles[member.roleKey]}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
