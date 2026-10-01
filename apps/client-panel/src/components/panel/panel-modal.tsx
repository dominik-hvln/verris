'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from './cx';
import { trzymajFokusWOknie } from './fokus-okna';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function PanelModal({ open, ...props }: Props) {
  if (!open) return null;
  return <Okno {...props} />;
}

/**
 * P-12 (WCAG 2.1.2, 2.4.3) — po otwarciu fokus wchodzi do okna, Tab z niego nie wychodzi, Esc zamyka,
 * a po zamknięciu fokus wraca na element, który okno otworzył. Tytuł ma id z `useId` (wcześniej
 * stałe „panel-modal-title” — dwa okna na stronie wskazywały ten sam nagłówek).
 */
function Okno({ onClose, title, description, children, className }: Omit<Props, 'open'>) {
  const idTytulu = useId();
  const idOpisu = useId();
  const okno = useRef<HTMLDivElement>(null);
  const zamknij = useRef(onClose);
  useEffect(() => {
    zamknij.current = onClose;
  });

  useEffect(() => {
    const poprzedniFokus = document.activeElement as HTMLElement | null;
    okno.current?.focus();
    const klawisz = (e: KeyboardEvent) => {
      if (e.key === 'Escape') zamknij.current();
      else trzymajFokusWOknie(e, okno.current);
    };
    window.addEventListener('keydown', klawisz);
    return () => {
      window.removeEventListener('keydown', klawisz);
      poprzedniFokus?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={okno}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTytulu}
        aria-describedby={description ? idOpisu : undefined}
        tabIndex={-1}
        className={cx(
          'relative z-50 w-full max-w-lg rounded-t-[10px] border border-line-strong bg-card p-6 pb-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] outline-none',
          'animate-in slide-in-from-bottom-4 fade-in-0 duration-200 sm:rounded-[10px] sm:pb-6',
          className,
        )}
      >
        <div className="mb-6 flex flex-col gap-2">
          <h2 id={idTytulu} className="m-0 font-display text-[17px] font-bold leading-tight tracking-[-0.01em] text-foreground">
            {title}
          </h2>
          {description ? (
            <p id={idOpisu} className="text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
