import React, { useEffect, useRef, useState } from 'react';

interface StickyNavProps { targets?: { href: string; label: string }[] }

const defaultTargets = [
  { href: '#integrity', label: 'Integrity' },
  { href: '#coming-soon', label: 'Roadmap' },
];

export const StickyNav: React.FC<StickyNavProps> = ({ targets = defaultTargets }) => {
  const [active, setActive] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sectionIds = targets.map(t => t.href.replace('#',''));
    const sections = sectionIds
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (!('IntersectionObserver' in window) || sections.length === 0) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Sort by vertical position to ensure consistent selection when multiple intersect
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a,b) => (a.target as HTMLElement).offsetTop - (b.target as HTMLElement).offsetTop);
        if (visible.length > 0) {
          const topMost = visible[0].target as HTMLElement;
          const id = topMost.id;
          if (id && id !== active) setActive(id);
        } else {
          // Fallback: find the last section above the fold
          const scrollPos = window.scrollY + 100; // offset for early activation
            for (let i = sections.length - 1; i >= 0; i--) {
              const s = sections[i];
              if (s.offsetTop <= scrollPos) {
                if (s.id !== active) setActive(s.id);
                break;
              }
            }
        }
      },
      {
        root: null,
        threshold: [0.25, 0.5, 0.75],
        rootMargin: '-10% 0px -60% 0px'
      }
    );

    sections.forEach(sec => observerRef.current?.observe(sec));
    return () => observerRef.current?.disconnect();
  }, [targets, active]);

  return (
    <nav className="sticky-nav" aria-label="In‑page sections">
      <ul className="sticky-nav__list">
        {targets.map(t => {
          const id = t.href.replace('#','');
          const isActive = active === id;
          return (
            <li key={t.href} className="sticky-nav__item">
              <a
                href={t.href}
                className={"sticky-nav__link" + (isActive ? ' is-active' : '')}
                data-nav={id}
                aria-current={isActive ? 'true' : undefined}
              >
                {t.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default StickyNav;