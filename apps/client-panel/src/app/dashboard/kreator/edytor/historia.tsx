'use client';

import { useEffect, useState } from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { PanelModal } from '@/components/panel/panel-modal';
import { potwierdz } from '@/components/panel/potwierdz';
import { dataGodzinaPl } from '@/lib/data-pl';
import { ETYKIETY_ZRODEL, type WersjaStronyKreatora } from '@/lib/kreator';
import { wersjeStrony } from '../akcje';
import { Komunikat, klasaPrzyciskuDrugiego } from '../wspolne';

export function Historia({
  id,
  otwarta,
  onZamknij,
  onPrzywroc,
}: {
  id: string;
  otwarta: boolean;
  onZamknij: () => void;
  onPrzywroc: (numer: number) => Promise<boolean>;
}) {
  const [wersje, setWersje] = useState<WersjaStronyKreatora[] | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [przywracana, setPrzywracana] = useState<number | null>(null);

  useEffect(() => {
    if (!otwarta) return;
    let aktualne = true;
    void wersjeStrony(id).then((r) => {
      if (!aktualne) return;
      if (r.ok) {
        setWersje(r.dane);
        setBlad(null);
      } else setBlad(r.blad);
    });
    return () => {
      aktualne = false;
    };
  }, [id, otwarta]);

  const przywroc = async (w: WersjaStronyKreatora) => {
    const ok = await potwierdz(`Przywrócić wersję ${w.numer}? Obecny stan zostanie w historii – możesz do niego wrócić.`, { akcja: 'Przywróć', tytul: 'Przywrócić wersję?' });
    if (!ok) return;
    setPrzywracana(w.numer);
    const udane = await onPrzywroc(w.numer);
    setPrzywracana(null);
    if (udane) onZamknij();
  };

  return (
    <PanelModal open={otwarta} onClose={onZamknij} title="Historia wersji" description="Każdy zapis, zmiana AI i przywrócenie to osobna wersja. Przywrócenie tworzy nową wersję – nic nie ginie." className="max-w-xl">
      {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}
      {!wersje && !blad ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Wczytywanie historii…
        </p>
      ) : null}
      {wersje ? (
        <ol className="m-0 flex max-h-[60vh] list-none flex-col gap-1.5 overflow-y-auto p-0">
          {wersje.map((w, i) => (
            <li key={w.numer} className="flex items-center gap-3 rounded-[8px] border border-line bg-card px-3 py-2.5">
              <History className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-foreground">
                  Wersja {w.numer} · {ETYKIETY_ZRODEL[w.zrodlo] ?? w.zrodlo}
                  {i === 0 ? <span className="ml-2 rounded-full bg-data-soft px-2 py-[1px] text-[11px] font-semibold text-data-hi">obecna</span> : null}
                </p>
                <p className="break-words text-[12px] text-muted-foreground">
                  {dataGodzinaPl(w.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {w.opis ? ` · ${w.opis}` : ''}
                </p>
              </div>
              {i > 0 ? (
                <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => void przywroc(w)} disabled={przywracana !== null} aria-label={`Przywróć wersję ${w.numer}`}>
                  {przywracana === w.numer ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                  Przywróć
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </PanelModal>
  );
}
