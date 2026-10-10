import type { ReactNode } from "react";

/**
 * Fala 1B — panel z przyciskami, do którego rola nie ma uprawnienia: widać stan, a przyciski i pola są
 * wyszarzone (natywnie przez <fieldset disabled>) z powodem „Wymaga …”, jak w sekcji „Działania”.
 * API i tak odmawia (403) — to tylko wygląd. Bez powodu renderuje dzieci bez zmian.
 */
export function WymagaUprawnienia({ powod, children }: { powod: string | null; children: ReactNode }) {
  if (!powod) return <>{children}</>;
  return (
    <div data-zablokowane={powod} title={powod} className="flex cursor-not-allowed flex-col gap-1.5">
      <fieldset disabled className="contents">
        <div className="opacity-60">{children}</div>
      </fieldset>
      <p className="text-xs text-muted-foreground">{powod}.</p>
    </div>
  );
}
