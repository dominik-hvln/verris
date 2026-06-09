type SpinBorderVariant = "mint" | "emerald" | "white";

type SpinBorderProps = {
  /** Kolor akcentu na obwodzie — domyślnie mint (marka Verris). */
  variant?: SpinBorderVariant;
  className?: string;
};

/** Wolno obracająca się poświata wokół karty / przycisku (`--spin-duration`, domyślnie 10s). */
export function SpinBorder({ variant = "mint", className = "" }: SpinBorderProps) {
  const variantClass =
    variant === "white" ? "spin-border-glow--white" : "spin-border-glow--mint";

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute -inset-full spin-border-glow ${variantClass} ${className}`.trim()}
    />
  );
}
