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

        <div data-stagger className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {boardMembers.map((member, i) => (
            <div
              key={i}
              data-stagger-item
              className="bg-card rounded-lg p-6 opacity-0 hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 border border-theme"
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-accent-glow flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-semibold text-lg">{member.initials}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-primary tracking-tight">{member.name}</h3>
                  <p className="text-sm text-muted mt-0.5">{t.boardRoles[member.roleKey]}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
