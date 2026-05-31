'use client';

import type { ReactNode } from 'react';

/** Wspólna, wąska ramka treści zakładek hostingu — bez poziomego scrolla. */
export function HostingTabShell({
  title,
  description,
  icon,
  actions,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-4 sm:p-5 min-w-0 overflow-hidden">
      <div className="mb-4 flex flex-col gap-3 border-b border-white/5 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          {icon ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-white shrink-0">{icon}</div>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white">{title}</h2>
            {description ? (
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed max-w-prose">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
      </div>
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
      ? 'inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-neutral-200'
      : 'inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white hover:bg-white/10';
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
    </a>
  );
}
