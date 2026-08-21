'use client';

import type { ReactNode } from 'react';
import { LifeBuoy, ArrowRight } from 'lucide-react';

/** Kontekstowa, uspokajająca podpowiedź w zakładce — „jesteś tu zaopiekowany". */
export interface HostingTabHelp {
  /** Krótkie, przyjazne zdanie wyjaśniające, że to bezpieczne i jak działa. */
  blurb: string;
  /** Fraza do wyszukania w Bazie wiedzy (deep-link /dashboard/knowledge?q=…). */
  kbQuery: string;
}

export function HostingHelpHint({ help }: { help: HostingTabHelp }) {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-violet-400/20 bg-violet-400/[0.06] px-3.5 py-2.5">
      <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
      <div className="min-w-0 text-xs leading-relaxed text-neutral-300">
        {help.blurb}{' '}
        <a
          href={`/dashboard/knowledge?q=${encodeURIComponent(help.kbQuery)}`}
          className="inline-flex items-center gap-0.5 font-medium text-violet-200 underline-offset-2 hover:text-white hover:underline"
        >
          Poradnik krok po kroku <ArrowRight className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

/** Wspólna, wąska ramka treści zakładek hostingu — bez poziomego scrolla. */
export function HostingTabShell({
  title,
  description,
  icon,
  actions,
  help,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  help?: HostingTabHelp;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] p-3 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 border-b border-white/5 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-white">{icon}</div>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white sm:text-lg">{title}</h2>
            {description ? (
              <p className="mt-1 max-w-prose text-xs leading-relaxed text-neutral-400">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">{actions}</div>
        ) : null}
      </div>
      {help ? <HostingHelpHint help={help} /> : null}
      <div className="min-w-0">{children}</div>
    </div>
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
      ? 'inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2.5 text-xs font-semibold text-black hover:bg-neutral-200 sm:w-auto'
      : 'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 text-xs font-medium text-white hover:bg-white/10 sm:w-auto';
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
    </a>
  );
}
