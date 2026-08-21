'use client';

import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';

export type MobileTabItem<T extends string> = {
  id: T;
  label: string;
  icon?: LucideIcon;
};

/** Poziomy pasek zakładek na telefonie — bez wychodzenia poza viewport. */
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
          'sticky top-mobile-header z-30 -mx-3 border-b border-white/5 bg-black/95 px-3 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6',
        className,
      )}
    >
      <div
        className="flex w-full max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 scrollbar-none snap-x snap-mandatory touch-pan-x"
        role="tablist"
        aria-label="Zakładki"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cx(
                'snap-start shrink-0 inline-flex max-w-[85vw] items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'border-white bg-white text-black'
                  : 'border-white/10 bg-white/5 text-neutral-400 hover:text-white',
              )}
            >
              {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
