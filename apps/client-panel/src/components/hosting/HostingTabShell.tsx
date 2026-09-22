'use client';

import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

/** Kontekstowa, uspokajająca podpowiedź w zakładce — „jesteś tu zaopiekowany". */
export interface HostingTabHelp {
  /** Krótkie, przyjazne zdanie wyjaśniające, że to bezpieczne i jak działa. */
  blurb: string;
  /** Fraza do wyszukania w Bazie wiedzy (deep-link /dashboard/knowledge?q=…). */
  kbQuery: string;
}

export function HostingHelpHint({ help }: { help: HostingTabHelp }) {
  return (
    <p className="mb-4 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
      {help.blurb}{' '}
      <a
        href={`/dashboard/knowledge?q=${encodeURIComponent(help.kbQuery)}`}
        className="inline-flex items-center gap-0.5 font-medium text-data-hi underline-offset-2 hover:underline"
      >
        Poradnik krok po kroku <ArrowRight className="h-3 w-3" />
      </a>
    </p>
  );
}

/** Sekcja zakładki wg wzorca: tytuł (h2) + opis + akcje, treść pod spodem — bez ramki. */
export function HostingTabShell({
  title,
  description,
  actions,
  help,
  children,
}: {
  title: string;
  description?: string;
  /** Zachowane dla zgodności — wzorzec nie pokazuje ikon przy nagłówkach sekcji. */
  icon?: ReactNode;
  actions?: ReactNode;
  help?: HostingTabHelp;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 max-w-full">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="m-0 font-display text-[17px] font-bold leading-tight tracking-[-0.01em] text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-[60ch] text-[13.5px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">{actions}</div>
        ) : null}
      </div>
      {help ? <HostingHelpHint help={help} /> : null}
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function DaExternalLink({
  href,
  children,
  variant = 'outline',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'outline';
}) {
  const cls =
    variant === 'primary'
      ? 'inline-flex w-full items-center justify-center gap-2 rounded-[7px] border border-primary bg-primary px-[13px] py-2 text-sm font-semibold text-primary-foreground hover:bg-data-hi sm:w-auto'
      : 'inline-flex w-full items-center justify-center gap-2 rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:border-primary sm:w-auto';
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
    </a>
  );
}
