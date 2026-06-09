import { cx } from "@/components/panel/cx";

type LogoSize = "sm" | "md" | "lg";

const markSize: Record<LogoSize, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
  lg: "h-10 w-10",
};

const wordSize: Record<LogoSize, string> = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl",
};

export function VerrisMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Verris"
    >
      <path
        d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z"
        fill="currentColor"
        fillRule="evenodd"
      />
      <path
        d="M44 55 L56 55 L50 69 Z"
        fill="none"
        stroke="#34E5A0"
        strokeWidth="1.6"
      />
    </svg>
  );
}

type VerrisLockupProps = {
  size?: LogoSize;
  showTagline?: boolean;
  className?: string;
};

/** Znak P3 + wordmark jako żywy tekst (Schibsted Grotesk). */
export function VerrisLockup({
  size = "md",
  showTagline = false,
  className,
}: VerrisLockupProps) {
  return (
    <div className={cx("inline-flex flex-col items-start gap-1", className)}>
      <span className="inline-flex items-center gap-2">
        <VerrisMark className={cx(markSize[size], "shrink-0 text-verris-paper")} />
        <span
          className={cx(
            "font-display font-extrabold lowercase tracking-[-0.045em] text-verris-paper",
            wordSize[size],
          )}
        >
          verris
        </span>
      </span>
      {showTagline ? (
        <p className="text-[13px] text-muted-foreground">Skaluj świadomie.</p>
      ) : null}
    </div>
  );
}
