import { cx } from './cx';

/**
 * Skeleton loader — animated placeholder that mirrors final content shape.
 * Use instead of bare spinners for perceived-performance during data loads.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        'animate-pulse rounded-md bg-white/[0.06] border border-white/[0.04]',
        className,
      )}
      aria-hidden
    />
  );
}

/** A few text-line skeletons, decreasing widths for a natural look. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ['w-3/4', 'w-full', 'w-5/6', 'w-2/3', 'w-1/2'];
  return (
    <div className={cx('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cx('h-3.5', widths[i % widths.length])} />
      ))}
    </div>
  );
}

/** Repeated card/row skeletons for list placeholders. */
export function SkeletonList({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx('space-y-2', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
        >
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
