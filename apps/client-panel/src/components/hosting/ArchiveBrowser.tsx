'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { File, Folder, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchFileRestore,
  listArchive,
  restoreFromArchive,
  type FileRestoreStatus,
} from '@/app/dashboard/services/[id]/hosting-file-restore-actions';
import { liczba } from '@/lib/liczba';

/**
 * H-10/H-11 — przeglądanie zawartości archiwum kopii i odtworzenie pojedynczego pliku lub katalogu.
 * Listę czyta węzeł (do 2000 wpisów naraz — przy większych katalogach wczytujemy głębszy poziom).
 * Odtworzenie niczego nie nadpisuje: pliki trafiają do nowego katalogu verris-odtworzone.
 */
const START = 'domains';
const rozmiar = (b: number) => (b >= 1048576 ? `${liczba(b / 1048576, 1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);

export function ArchiveBrowser({ serviceId, archive }: { serviceId: string; archive: string }) {
  const [stan, setStan] = useState<FileRestoreStatus | null>(null);
  const [biezacy, setBiezacy] = useState(START);
  const [pending, start] = useTransition();

  const zastosuj = (r: Awaited<ReturnType<typeof fetchFileRestore>>) => {
    if (r.ok) setStan(r.status);
    else toast.error(r.error);
  };
  const odswiez = useCallback(() => fetchFileRestore(serviceId).then(zastosuj), [serviceId]);

  useEffect(() => {
    void odswiez();
  }, [odswiez]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 8_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);

  const lista = stan?.lista && stan.lista.archiwum === archive ? stan.lista : null;
  // Wczytana lista obejmuje bieżący katalog, jeśli zaczyna się od jej prefiksu (i nie jest ucięta).
  const pokrywa = Boolean(lista && lista.status === 'COMPLETED' && (biezacy === lista.prefiks || biezacy.startsWith(`${lista.prefiks}/`)) && (!lista.obciete || biezacy === lista.prefiks));
  const dzieci = useMemo(() => {
    if (!lista || !pokrywa) return [];
    const p = `${biezacy}/`;
    return lista.wpisy.filter((w) => w.sciezka.startsWith(p) && !w.sciezka.slice(p.length).includes('/')).sort((a, b) => (a.typ === 'd' ? 0 : 1) - (b.typ === 'd' ? 0 : 1) || a.sciezka.localeCompare(b.sciezka));
  }, [lista, pokrywa, biezacy]);

  const wczytaj = (path: string) =>
    start(async () => {
      zastosuj(await listArchive(serviceId, archive, path));
    });
  const odtworz = (path: string) =>
    start(async () => {
      const r = await restoreFromArchive(serviceId, archive, path);
      zastosuj(r);
      if (r.ok) toast.success('Odtwarzanie zlecone — pliki pojawią się w katalogu verris-odtworzone.');
    });

  const segmenty = biezacy.split('/');
  const odtworzenia = (stan?.odtworzenia ?? []).filter((o) => o.archiwum === archive).slice(0, 5);

  return (
    <div className="mt-2 rounded-[10px] border border-line bg-card text-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2 text-[13px]">
        {segmenty.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 ? <span className="text-muted-foreground">/</span> : null}
            <button type="button" className="font-mono text-foreground underline-offset-2 hover:underline" onClick={() => setBiezacy(segmenty.slice(0, i + 1).join('/'))}>
              {s}
            </button>
          </span>
        ))}
        {stan?.wToku ? <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {!pokrywa ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
          <p className="m-0 text-[13px] text-muted-foreground">
            {lista?.status === 'FAILED' && lista.blad ? lista.blad : 'Zawartość tego katalogu w archiwum nie jest jeszcze wczytana (odczyt trwa zwykle do minuty).'}
          </p>
          <button type="button" onClick={() => wczytaj(biezacy)} disabled={pending || stan?.wToku} className="inline-flex items-center gap-2 rounded-[7px] border border-line-strong bg-card px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-raised disabled:opacity-50">
            Wczytaj zawartość
          </button>
        </div>
      ) : dzieci.length === 0 ? (
        <p className="m-0 px-3 py-3 text-[13px] text-muted-foreground">Pusty katalog.</p>
      ) : (
        <ul className="m-0 max-h-80 list-none overflow-y-auto p-0">
          {dzieci.map((w) => {
            const nazwa = w.sciezka.slice(biezacy.length + 1);
            return (
              <li key={w.sciezka} className="flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-0">
                {w.typ === 'd' ? <Folder className="h-4 w-4 shrink-0 text-muted-foreground" /> : w.typ === 'l' ? <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" /> : <File className="h-4 w-4 shrink-0 text-muted-foreground" />}
                {w.typ === 'd' ? (
                  <button type="button" onClick={() => setBiezacy(w.sciezka)} className="min-w-0 flex-1 break-all text-left font-mono text-[13px] text-foreground hover:underline">
                    {nazwa}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 break-all font-mono text-[13px] text-foreground">{nazwa}</span>
                )}
                <span className="text-[12px] text-muted-foreground">{w.typ === 'f' ? rozmiar(w.rozmiar) : ''}</span>
                <button type="button" onClick={() => odtworz(w.sciezka)} disabled={pending || stan?.wToku} className="text-[12.5px] text-foreground underline disabled:opacity-50">
                  Odtwórz
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {odtworzenia.length ? (
        <div className="border-t border-line px-3 py-2">
          {odtworzenia.map((o) => (
            <p key={o.id} className="m-0 py-0.5 text-[12.5px] text-muted-foreground">
              <span className="font-mono text-foreground">{o.sciezka}</span> —{' '}
              {o.status === 'COMPLETED' && o.katalog ? (
                <>odtworzone do <span className="font-mono text-foreground">{o.katalog}</span> (przenieś menedżerem plików)</>
              ) : o.status === 'FAILED' ? (
                <span className="text-crit">{o.blad}</span>
              ) : (
                'w toku…'
              )}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
