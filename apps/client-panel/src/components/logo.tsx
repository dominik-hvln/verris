import { cx } from "@/components/panel/cx";

type LogoSize = "sm" | "md" | "lg";
type LogoLayout = "horizontal" | "vertical";

const markSize: Record<LogoSize, string> = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-16 w-16",
};

const wordSize: Record<LogoSize, string> = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl",
};

const lockupGap: Record<LogoLayout, Record<LogoSize, string>> = {
  horizontal: {
    sm: "gap-1.5",
    md: "gap-2",
    lg: "gap-2.5",
  },
  vertical: {
    sm: "gap-1.5",
    md: "gap-2",
    lg: "gap-2.5",
  },
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
  layout?: LogoLayout;
  showTagline?: boolean;
  className?: string;
};

/** Znak P3 + wordmark jako żywy tekst (Schibsted Grotesk). */
export function VerrisLockup({
  size = "md",
  layout = "horizontal",
  showTagline = false,
  className,
}: VerrisLockupProps) {
  const isVertical = layout === "vertical";

  return (
    <div
      className={cx(
        "inline-flex flex-col gap-1",
        isVertical ? "items-center" : "items-start",
        className,
      )}
    >
      <span
        className={cx(
          "inline-flex items-center",
          isVertical ? "flex-col" : "flex-row",
          lockupGap[layout][size],
        )}
      >
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
