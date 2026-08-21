import type { ReactNode } from 'react';
import { SpinBorder } from '@/components/spin-border';
import { cx } from './cx';

/** Spójna karta panelu klienta (emerald / dark). */
export function PanelCard({
  children,
  className,
  accent = false,
  spinBorder = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
  spinBorder?: boolean;
}) {
  if (spinBorder) {
    return (
      <div className={cx('relative overflow-hidden rounded-[24px] p-px', className)}>
        <SpinBorder variant="emerald" className="opacity-25" />
        <div className="relative z-10 rounded-[calc(24px-1px)] bg-[#0a0a0a]">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cx(
        'rounded-2xl border bg-[#0a0a0a]/80 p-6',
        accent ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-white/10',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelPageHeader({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx('space-y-2', className)}>
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
        {icon}
        {title}
      </h1>
      {description ? (
        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{description}</p>
      ) : null}
    </header>
  );
}
