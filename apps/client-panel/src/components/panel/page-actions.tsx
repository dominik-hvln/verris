import type { ReactNode } from 'react';
import { cx } from './cx';

/** Przyciski nagłówka: kolumna na mobile, rząd na desktop. */
export function PageActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end', className)}>
      {children}
    </div>
  );
}
