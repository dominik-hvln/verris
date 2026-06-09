import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { VerrisPatternLayer } from '@/components/brand/brand-pattern';
import { cx } from './cx';

export function PanelEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border border-border bg-card/40 p-8 text-center text-muted-foreground',
        className,
      )}
    >
      <VerrisPatternLayer opacity={0.05} className="rounded-xl" />
      {Icon ? <Icon className="relative z-10 h-8 w-8 opacity-40 text-accent" aria-hidden /> : null}
      <p className="relative z-10 font-medium text-foreground">{title}</p>
      {description ? <p className="relative z-10 max-w-md text-sm">{description}</p> : null}
      {action ? <div className="relative z-10 mt-2">{action}</div> : null}
    </div>
  );
}
