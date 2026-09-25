/**
 * PROD-02 (E) — jeden wskaźnik kroków dla kreatorów (migracja, zakup domeny). Aktualny krok ma
 * aria-current="step", więc czytnik ekranu mówi, gdzie jesteśmy; na telefonie zostają same numery.
 */
export function Stepper({ kroki, aktualny }: { kroki: readonly string[]; aktualny: number }) {
  return (
    <ol className="flex items-center gap-1 text-xs" aria-label="Kroki">
      {kroki.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-1" aria-current={i === aktualny ? 'step' : undefined}>
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
              i < aktualny
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                : i === aktualny
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-100'
                  : 'border-white/15 bg-white/5 text-neutral-500'
            }`}
          >
            {i < aktualny ? '✓' : i + 1}
            <span className="sr-only">{i < aktualny ? ' — zrobione' : ''}</span>
          </span>
          <span className={`hidden break-words sm:inline ${i === aktualny ? 'text-white' : 'text-neutral-500'}`}>{label}</span>
          {i < kroki.length - 1 ? <span className="mx-1 h-px flex-1 bg-white/10" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}
