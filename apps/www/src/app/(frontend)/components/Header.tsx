'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Logo } from './ui';
import { headerLinks, PANEL } from '@/lib/site';

/**
 * Nagłówek całego verris.pl: logo, nawigacja, „Panel klienta”, „Zamów hosting”.
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
      <div className="wrap nav">
        <Logo />
        <nav className="nav-links" aria-label="Główne">
          {links}
        </nav>
        <a className="nav-login" href={PANEL}>
          Panel klienta
        </a>
        <a
          className="btn btn-primary nav-cta"
          href={PANEL}
          data-event="cta_click"
          data-cta="nav"
          data-conv="checkout_intent"
        >
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
        <a className="btn btn-ghost" href={PANEL}>
          Panel klienta
        </a>
      </nav>
    </header>
  );
}
