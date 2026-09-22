import type { ReactNode } from 'react';
import { cx } from './cx';

/** Karta panelu wg wzorca: cienka linia, powierzchnia `card`, promień 10 px. `spinBorder` = obwód jak na pulpicie. */
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
  return (
    <div
      className={cx(
        'rounded-[10px] border bg-card p-5',
        accent ? 'border-primary/30' : 'border-line',
        spinBorder && 'v2-comet',
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
  className,
}: {
  title: string;
  description?: string;
  /** Zachowane dla zgodności — wzorzec nie pokazuje ikon w nagłówku strony. */
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx('space-y-2', className)}>
      <h1 className="m-0 font-display text-[clamp(28px,4vw,40px)] font-extrabold leading-none tracking-[-0.03em] text-foreground">
        {title}
      </h1>
      {description ? <p className="max-w-[60ch] text-[13.5px] text-muted-foreground">{description}</p> : null}
    </header>
  );
}
