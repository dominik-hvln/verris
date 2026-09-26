"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Star } from "lucide-react";
import { reopenTicketAction, submitCsatAction } from "../actions";

function Gwiazdki({ etykieta, wartosc, onZmiana }: { etykieta: string; wartosc: number; onZmiana?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex flex-col gap-1" role="radiogroup" aria-label={etykieta}>
      <b className="text-sm">{etykieta}</b>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((v) => {
          const pelna = (hover || wartosc) >= v;
          return onZmiana ? (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={wartosc === v}
              aria-label={`${v} z 5`}
              onMouseEnter={() => setHover(v)}
              onMouseLeave={() => setHover(0)}
              onClick={() => onZmiana(v)}
              className="p-0.5"
            >
              <Star className={`h-6 w-6 ${pelna ? "fill-warn text-warn" : "text-line-strong"}`} />
            </button>
          ) : (
            <Star key={v} aria-hidden className={`h-5 w-5 ${pelna ? "fill-warn text-warn" : "text-line-strong"}`} />
          );
        })}
      </div>
    </div>
  );
}

/** SUP-4 / PB-37 — ocena opiekuna i obsługi ogólnie, „czy rozwiązane” i ponowne otwarcie (do 7 dni). */
export function TicketCsat({
  ticketId,
  opiekun,
  existingRating,
  existingAgentRating,
  existingResolved,
  moznaOtworzyc,
}: {
  ticketId: string;
  opiekun: string | null;
  existingRating?: number | null;
  existingAgentRating?: number | null;
  existingResolved?: boolean | null;
  moznaOtworzyc: boolean;
}) {
  const router = useRouter();
  const [support, setSupport] = useState(0);
  const [agent, setAgent] = useState(0);
  const [rozwiazane, setRozwiazane] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  const otworz = () =>
    startTransition(async () => {
      const res = await reopenTicketAction(ticketId);
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success("Zgłoszenie jest znów otwarte — opiekun już o tym wie.");
        router.refresh();
      }
    });

  const przyciskOtworz = moznaOtworzyc ? (
    <button
      type="button"
      onClick={otworz}
      disabled={pending}
      className="inline-flex h-[38px] items-center rounded-[9px] border border-line-strong bg-card px-3.5 text-sm font-semibold text-foreground hover:border-primary disabled:opacity-50"
    >
      Otwórz ponownie
    </button>
  ) : null;

  if (existingRating) {
    return (
      <section id="ocena" className="flex flex-col gap-3 rounded-[10px] border border-line bg-card p-[18px]">
        <h2 className="font-display text-lg font-bold">Dziękujemy za ocenę</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {existingAgentRating ? <Gwiazdki etykieta={opiekun ? `${opiekun} — opiekun` : "Opiekun zgłoszenia"} wartosc={existingAgentRating} /> : null}
          <Gwiazdki etykieta="Obsługa Verris ogólnie" wartosc={existingRating} />
        </div>
        {existingResolved != null ? <p className="text-sm text-muted-foreground">Problem rozwiązany: {existingResolved ? "tak" : "nie"}</p> : null}
        {przyciskOtworz ? (
          <div className="flex items-center gap-2.5">
            {przyciskOtworz}
            <span className="text-[12.5px] text-muted-foreground">możliwe przez 7 dni od zamknięcia</span>
          </div>
        ) : null}
      </section>
    );
  }

  const wyslij = () => {
    if (support < 1 || (opiekun && agent < 1)) {
      toast.error(opiekun ? "Oceń opiekuna i obsługę (1–5 gwiazdek)." : "Wybierz ocenę (1–5 gwiazdek).");
      return;
    }
    startTransition(async () => {
      const res = await submitCsatAction(ticketId, support, comment.trim() || undefined, {
        agentRating: agent || undefined,
        resolved: rozwiazane ?? undefined,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Dziękujemy za ocenę!");
      router.refresh();
    });
  };

  return (
    <section id="ocena" className="flex flex-col gap-3.5 rounded-[10px] border border-data/35 bg-card p-[18px]" aria-labelledby="oc">
      <h2 id="oc" className="font-display text-lg font-bold">
        Jak nam poszło?
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {opiekun ? <Gwiazdki etykieta={`${opiekun} — opiekun zgłoszenia`} wartosc={agent} onZmiana={setAgent} /> : null}
        <Gwiazdki etykieta="Obsługa Verris ogólnie" wartosc={support} onZmiana={setSupport} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Czy problem został rozwiązany?</span>
        <span className="inline-flex overflow-hidden rounded-[9px] border border-line-strong" role="radiogroup" aria-label="Czy problem został rozwiązany?">
          {[
            [true, "Tak"],
            [false, "Nie"],
          ].map(([v, n]) => (
            <button
              key={String(n)}
              type="button"
              role="radio"
              aria-checked={rozwiazane === v}
              onClick={() => setRozwiazane(v as boolean)}
              className={`px-4 py-[7px] text-[13.5px] font-semibold ${rozwiazane === v ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
            >
              {n as string}
            </button>
          ))}
        </span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        aria-label="Komentarz"
        placeholder="Co możemy zrobić lepiej? (opcjonalnie)"
        rows={2}
        className="rounded-[9px] border border-line-strong bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-data"
      />
      <div className="flex flex-wrap items-center gap-2.5">
        {przyciskOtworz}
        {przyciskOtworz ? <span className="text-[12.5px] text-muted-foreground">możliwe przez 7 dni</span> : null}
        <button
          type="button"
          onClick={wyslij}
          disabled={pending}
          className="ml-auto inline-flex h-[38px] items-center gap-2 rounded-[9px] border border-primary bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-data-hi disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Wyślij ocenę
        </button>
      </div>
    </section>
  );
}
