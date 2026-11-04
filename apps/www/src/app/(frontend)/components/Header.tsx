'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Logo } from './ui';
import { headerLinks, PANEL, topLinks, ZAMOW } from '@/lib/site';
import { ZAMOW_POCZTE } from '@/lib/proba';

/** P4-4: na stronach poczty przycisk w nagłówku zamawia pocztę, nie hosting za cenę roczną hostingu. */
export function celZamowienia(sciezka: string | null): { href: string; dopisek: string; plan?: string } {
  return sciezka?.startsWith('/poczta') ? { href: ZAMOW_POCZTE, dopisek: 'pocztę', plan: 'poczta' } : { href: ZAMOW, dopisek: 'hosting' };
}

/**
 * Nagłówek całego verris.pl (makieta 14.10, plansza Naglowek): pasek pomocniczy (pomoc, status, kontakt, agencje),
 * logo, nawigacja, „Zaloguj się”, „Zamów hosting” (/zamow — trzy kroki przed panelem).
 * Poniżej 1024 px menu chowa się pod przyciskiem (aria-expanded/aria-controls, Esc zamyka i oddaje fokus).
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const path = usePathname();
  const zamow = celZamowienia(path);

  // A3-10: przy otwartym menu treść strony i stopka są nieaktywne (inert) — Tab nie ucieka spod menu na niewidoczne linki.
  useEffect(() => {
    if (!open) return;
    const tlo = Array.from(document.querySelectorAll<HTMLElement>('body > main, body > footer'));
    tlo.forEach((el) => el.setAttribute('inert', ''));
    return () => tlo.forEach((el) => el.removeAttribute('inert'));
  }, [open]);

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
        <a className="btn btn-primary nav-cta" href={zamow.href} data-event="cta_click" data-cta="nav" data-plan={zamow.plan}>
          Zamów<span className="nav-cta-long">{zamow.dopisek}</span>
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
        {/* P4-5: przy powiększeniu 200% przycisk „Zamów” z paska chowa się — tu jest zawsze. */}
        <a className="btn btn-primary" href={zamow.href} data-event="cta_click" data-cta="menu" data-plan={zamow.plan}>
          Zamów {zamow.dopisek}
        </a>
        <a className="btn btn-ghost" href={PANEL}>
          Zaloguj się
        </a>
      </nav>
    </header>
  );
}
