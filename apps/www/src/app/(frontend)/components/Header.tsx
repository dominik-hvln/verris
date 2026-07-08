'use client';

import { useState } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { Logo } from './ui';
import { megaServices, headerLinks, PANEL } from '@/lib/site';

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header>
      <div className="wrap nav">
        <Logo />
        <nav className="nav-links" aria-label="Główne">
          <div className="nav-item">
            <button className="nav-trigger" aria-haspopup="true">
              Usługi <ChevronDown size={15} />
            </button>
            <div className="mega" role="menu">
              {megaServices.map((s) => (
                <a key={s.href} href={s.href} role="menuitem">
                  {s.label}
                  <span>{s.desc}</span>
                </a>
              ))}
            </div>
          </div>
          {headerLinks.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="nav-act">
          <a className="login" href={PANEL}>
            Zaloguj
          </a>
          <a
            className="btn btn-primary btn-sm"
            href={PANEL}
            data-event="cta_click"
            data-cta="nav"
            data-conv="begin_checkout"
          >
            Załóż konto
          </a>
          <button className="burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mobile-menu">
          <div className="m-head">Usługi</div>
          {megaServices.map((s) => (
            <a key={s.href} href={s.href} onClick={() => setOpen(false)}>
              {s.label}
            </a>
          ))}
          <div className="m-head">Więcej</div>
          {headerLinks.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <a href={PANEL}>Zaloguj</a>
        </div>
      )}
    </header>
  );
}
