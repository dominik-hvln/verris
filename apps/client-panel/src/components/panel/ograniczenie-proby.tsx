import { Gift } from 'lucide-react';
import { ConvertTrialButton } from '@/app/dashboard/services/convert-trial-button';

/**
 * 1.11 — ograniczenie okresu próbnego pokazane, zanim klient trafi na odmowę z API (domeny, autoskalowanie, poczta).
 * Gdy znamy usługę próbną, od razu dajemy przycisk konwersji (ten sam co na liście usług).
 */
export function OgraniczenieProby({
  tytul,
  tresc,
  uslugaProbnaId,
}: {
  tytul: string;
  tresc: string;
  uslugaProbnaId?: string | null;
}) {
  return (
    <section
      role="note"
      aria-label={tytul}
      className="rounded-[14px] border border-amber-400/30 bg-amber-400/[0.06] px-5 py-4"
      data-ograniczenie-proby=""
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-200">
          <Gift className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[15px] font-bold text-white">{tytul}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-neutral-300">{tresc}</p>
          {uslugaProbnaId ? (
            <div className="mt-3 max-w-md">
              <ConvertTrialButton serviceId={uslugaProbnaId} etykieta="Opłać hosting" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
