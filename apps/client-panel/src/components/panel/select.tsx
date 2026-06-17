'use client';

import { ChevronDown } from 'lucide-react';
import { cx } from './cx';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Styled select — wraps the native <select> (full keyboard/a11y support) with
 * a consistent dark theme, focus ring and a custom chevron. Prefer this over
 * raw <select> for visual consistency across the panel.
 */
export function Select({
  value,
  onChange,
  options,
  children,
  className,
  disabled,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  return (
    <div className={cx('relative', className)}>
      <select
        data-styled
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cx(
          'w-full appearance-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 pr-9',
          'text-sm text-white outline-none transition-colors',
          'focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'hover:border-white/20 cursor-pointer',
        )}
      >
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} className="bg-[#0e1f17] text-white">
                {o.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
    </div>
  );
}
