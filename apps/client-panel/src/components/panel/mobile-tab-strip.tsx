'use client';

import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';
import { Select } from './select';

export type MobileTabItem<T extends string> = {
  id: T;
  label: string;
  icon?: LucideIcon;
};

/**
 * Wybór sekcji usługi na telefonie. Dawniej poziomy pasek z ukrytym przewijaniem i uciętymi etykietami —
 * przy ~20 sekcjach większość była poza ekranem („nic nie może się ukrywać przed klientem”).
 * Teraz jedna lista (własny Select): bieżąca sekcja widoczna, wszystkie pozostałe pełnymi nazwami.
 */
export function MobileTabStrip<T extends string>({
  tabs,
  active,
  onChange,
  className,
  stickyBelowHeader = false,
}: {
  tabs: readonly MobileTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
  /** Przyklej pod fixed nagłówkiem dashboardu podczas scrolla treści usługi. */
  stickyBelowHeader?: boolean;
}) {
  return (
    <div
      className={cx(
        'lg:hidden w-full min-w-0',
        stickyBelowHeader &&
          'sticky top-mobile-header z-30 -mx-3 border-b border-line bg-background/95 px-3 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6',
        className,
      )}
    >
      <Select
        aria-label="Sekcja usługi"
        value={active}
        onChange={(v) => onChange(v as T)}
        options={tabs.map((t) => ({ value: t.id, label: t.label }))}
        className="w-full"
      />
    </div>
  );
}
