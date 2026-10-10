"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Fala 1B (audyt OP-11) — komunikat zamiast pustej listy, gdy API nie odpowiedziało. Wcześniej
 * `.catch(() => [])` pokazywało „Brak …”, czyli nieprawdę. „Spróbuj ponownie” odświeża stronę
 * (router.refresh — komponenty serwerowe pobierają dane jeszcze raz) albo woła `onPonow` z komponentu
 * klienckiego, który sam pobiera dane.
 */
export function NieWczytano({ co, onPonow }: { /** dopełniacz: „listy ról”, „zadań węzła” */ co?: string; onPonow?: () => void }) {
  const router = useRouter();
  const [trwa, start] = useTransition();
  return (
    <div role="alert" data-nie-wczytano="" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <span>Nie udało się wczytać{co ? ` ${co}` : ""}.</span>
      <button
        type="button"
        disabled={trwa}
        onClick={() => (onPonow ? onPonow() : start(() => router.refresh()))}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-500/20 disabled:opacity-60"
      >
        {trwa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Spróbuj ponownie
      </button>
    </div>
  );
}
