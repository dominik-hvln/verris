type SpinBorderVariant = 'emerald' | 'white';

type SpinBorderProps = {
  /** Kolor akcentu na obwodzie — domyślnie emerald (brand). */
  variant?: SpinBorderVariant;
  className?: string;
};

/** Wolno obracająca się poświata wokół karty / przycisku (`--spin-duration`, domyślnie 10s). */
export function SpinBorder({ variant = 'emerald', className = '' }: SpinBorderProps) {
  const variantClass =
    variant === 'white' ? 'spin-border-glow--white' : 'spin-border-glow--emerald';

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute -inset-full spin-border-glow ${variantClass} ${className}`.trim()}
    />
  );
}
