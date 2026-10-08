"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { zlozWniosekAction, type TypWniosku } from "@/lib/wnioski-actions";

/**
 * PB-48 — „Wyślij wniosek” zamiast martwego przycisku: pracownik bez uprawnienia opisuje, dlaczego operacja
 * jest potrzebna, a wniosek trafia do osób, które mogą go zaakceptować (dzwonek). Parametry operacji podaje
 * wywołujący (te same pola co przy wykonaniu bezpośrednim).
 */
export function WyslijWniosek({
  typ,
  userId,
  payload,
  gotowe = true,
  podpowiedz,
}: {
  typ: TypWniosku;
  userId: string;
  payload: Record<string, unknown>;
  /** false — parametry operacji jeszcze niekompletne (przycisk nieaktywny). */
  gotowe?: boolean;
  podpowiedz?: string;
}) {
  const [otwarty, setOtwarty] = useState(false);
  const [uzasadnienie, setUzasadnienie] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [wyslany, setWyslany] = useState(false);
  const [pending, start] = useTransition();

  if (wyslany) {
    return (
      <p className="text-xs text-emerald-300" data-wniosek="wyslany">
        Wniosek wysłany. Dostaniesz powiadomienie o decyzji — status w panelu obsługi: „Wnioski → Moje”.
      </p>
    );
  }

  const wyslij = () => {
    setBlad(null);
    if (uzasadnienie.trim().length < 5) {
      setBlad("Napisz uzasadnienie (min. 5 znaków).");
      return;
    }
    start(async () => {
      const r = await zlozWniosekAction({ typ, userId, payload, uzasadnienie });
      if (r.ok) setWyslany(true);
      else setBlad(r.error);
    });
  };

  return (
    <div className="space-y-2" data-wniosek={typ}>
      {podpowiedz ? <p className="text-xs text-amber-200">{podpowiedz}</p> : null}
      {!otwarty ? (
        <button
          type="button"
          disabled={!gotowe}
          onClick={() => setOtwarty(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/20 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          Wyślij wniosek
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Uzasadnienie (widzi akceptujący i dziennik)</span>
            <textarea
              rows={2}
              value={uzasadnienie}
              maxLength={1000}
              onChange={(e) => setUzasadnienie(e.target.value)}
              className="mt-1.5 w-full resize-y rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={wyslij}
              disabled={pending || !gotowe}
              className="rounded-lg border border-amber-400/40 bg-amber-400/15 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/25 disabled:opacity-50"
            >
              {pending ? "Wysyłam…" : "Wyślij wniosek"}
            </button>
            <button type="button" onClick={() => setOtwarty(false)} className="text-xs text-muted-foreground hover:text-white">
              Anuluj
            </button>
          </div>
        </div>
      )}
      {blad ? <p className="text-xs text-rose-300">{blad}</p> : null}
    </div>
  );
}
