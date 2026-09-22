'use client';

import type { ReactNode } from 'react';
import { cx } from './cx';

export function PanelModal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="panel-modal-title"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cx(
          'relative z-50 w-full max-w-lg rounded-t-[10px] border border-line-strong bg-card p-6 pb-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]',
          'animate-in slide-in-from-bottom-4 fade-in-0 duration-200 sm:rounded-[10px] sm:pb-6',
          className,
        )}
      >
        <div className="mb-6 flex flex-col gap-2">
          <h2 id="panel-modal-title" className="m-0 font-display text-[17px] font-bold leading-tight tracking-[-0.01em] text-foreground">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
