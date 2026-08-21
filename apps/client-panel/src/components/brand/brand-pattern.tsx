import { cx } from "@/components/panel/cx";

type VerrisPatternLayerProps = {
  className?: string;
  /** UI: 0.05–0.08 (handoff §7) */
  opacity?: number;
};

/** Seamless pattern P3 — login i empty states. */
export function VerrisPatternLayer({
  className,
  opacity = 0.07,
}: VerrisPatternLayerProps) {
  return (
    <div
      aria-hidden
      className={cx("verris-pattern-bg pointer-events-none absolute inset-0", className)}
      style={{ opacity }}
    />
  );
}
