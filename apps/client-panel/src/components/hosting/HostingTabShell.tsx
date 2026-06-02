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
