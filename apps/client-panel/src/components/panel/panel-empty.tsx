import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
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
        'flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-8 text-center text-muted-foreground',
        className,
      )}
    >
      {Icon ? <Icon className="h-8 w-8 opacity-30" aria-hidden /> : null}
      <p className="font-medium text-neutral-300">{title}</p>
      {description ? <p className="max-w-md text-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
