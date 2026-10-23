'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Logo } from './ui';
import { headerLinks, PANEL, topLinks, ZAMOW } from '@/lib/site';

/**
 * Nagłówek całego verris.pl (makieta 14.10, plansza Naglowek): pasek pomocniczy (pomoc, status, kontakt, agencje),
 * logo, nawigacja, „Zaloguj się”, „Zamów hosting” (/zamow — trzy kroki przed panelem).
 * Poniżej 1024 px menu chowa się pod przyciskiem (aria-expanded/aria-controls, Esc zamyka i oddaje fokus).
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const path = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const links = headerLinks.map((l) => (
    <Link
      key={l.href}
      href={l.href}
      aria-current={path === l.href ? 'page' : undefined}
      onClick={() => setOpen(false)}
    >
      {l.label}
    </Link>
  ));

  return (
    <header className="site-head">
      <div className="topbar">
        <div className="wrap topbar-row">
          <p>Polski hosting dla firm i sklepów · przeniesienie strony w cenie</p>
          <nav aria-label="Pomocnicze">
            {topLinks.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
      <div className="wrap nav">
        <Logo />
        <nav className="nav-links" aria-label="Główne">
          {links}
        </nav>
        <a className="nav-login" href={PANEL}>
          Zaloguj się
        </a>
        {/* checkout_intent liczy przycisk na /zamow (przejście do panelu), nie wejście na tę stronę. */}
        <a className="btn btn-primary nav-cta" href={ZAMOW} data-event="cta_click" data-cta="nav">
          Zamów<span className="nav-cta-long">hosting</span>
        </a>
        <button
          ref={btn}
          type="button"
          className="burger"
          aria-label={open ? 'Zamknij menu' : 'Otwórz menu'}
          aria-expanded={open}
          aria-controls="menu-mobilne"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      <nav id="menu-mobilne" className="mobile-menu" aria-label="Menu" hidden={!open}>
        {links}
        {topLinks.map((l) => (
          <a key={`m-${l.href}`} href={l.href}>
            {l.label}
          </a>
        ))}
        <a className="btn btn-ghost" href={PANEL}>
          Zaloguj się
        </a>
      </nav>
    </header>
  );
}
