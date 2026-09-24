'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Download, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Select } from '@/components/panel/select';
import { potwierdz } from '@/components/panel/potwierdz';
import { fmDownload } from '@/app/dashboard/file-manager/data';
import {
  exportDb,
  fetchDbTransfer,
  importDb,
  type DbTransferStatus,
} from '@/app/dashboard/services/[id]/hosting-db-transfer-actions';

/**
 * D-12 — eksport i import bazy. Pracę wykonuje węzeł; plik wyniku (albo kopia sprzed importu)
 * ląduje w katalogu `verris-bazy` na koncie. Stąd też bierzemy plik do importu — wgrasz go
 * menedżerem plików albo przez FTP (duże bazy).
 */
const STATUS: Record<string, string> = {
  QUEUED: 'w kolejce',
  RUNNING: 'w toku',
  COMPLETED: 'gotowe',
  FAILED: 'nie powiodło się',
  CANCELLED: 'anulowane',
};
const rozmiar = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function DbTransferPanel({ serviceId, databases }: { serviceId: string; databases: string[] }) {
  const [stan, setStan] = useState<DbTransferStatus | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [wybrana, setBaza] = useState('');
  // Bez efektu: gdy wybranej bazy nie ma (jeszcze nic nie wybrano albo lista się zmieniła) — pierwsza z listy.
  const baza = wybrana && databases.includes(wybrana) ? wybrana : (databases[0] ?? '');
  const [plik, setPlik] = useState('');
  const [pending, start] = useTransition();
  const [pobierany, setPobierany] = useState<string | null>(null);

  const odswiez = useCallback(
    () =>
      fetchDbTransfer(serviceId).then((r) => {
        if (r.ok) {
          setStan(r.status);
          setBlad(null);
        } else setBlad(r.error);
      }),
    [serviceId],
  );

  useEffect(() => {
    void odswiez();
  }, [odswiez]);

  // Zadanie w toku — odświeżamy co 10 s, aż węzeł skończy.
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 10_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);


  const eksportuj = () =>
    start(async () => {
      const r = await exportDb(serviceId, baza);
      if (r.ok) {
        setStan(r.status);
        toast.success('Eksport zlecony — plik pojawi się poniżej.');
      } else toast.error(r.error);
    });

  const importuj = async () => {
    const tak = await potwierdz(
      `Zaimportować „${plik}” do bazy „${baza}”? Tabele z pliku zastąpią obecne. Przed importem zrobimy kopię bazy w katalogu ${stan?.katalog ?? 'verris-bazy'}.`,
      { akcja: 'Importuj', niebezpieczne: true, tytul: 'Import bazy' },
    );
    if (!tak) return;
    start(async () => {
      const r = await importDb(serviceId, baza, plik);
      if (r.ok) {
        setStan(r.status);
        toast.success('Import zlecony.');
      } else toast.error(r.error);
    });
  };

  const pobierz = async (sciezka: string) => {
    setPobierany(sciezka);
    try {
      const r = await fmDownload(serviceId, sciezka);
      if ('error' in r) {
        toast.error(r.error);
        return;
      }
      const bin = atob(r.base64);
      const bajty = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bajty]));
      const a = document.createElement('a');
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPobierany(null);
    }
  };

  if (!databases.length) return null;
  const opcjeBaz = databases.map((d) => ({ value: d, label: d }));
  const opcjePlikow = (stan?.pliki ?? []).map((p) => ({ value: p.nazwa, label: `${p.nazwa} (${rozmiar(p.rozmiar)})` }));

  return (
    <section className="mt-6 rounded-[10px] border border-line bg-card">
      <header className="border-b border-line px-4 py-3">
        <h3 className="m-0 text-[15px] font-bold text-foreground">Eksport i import bazy</h3>
        <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
          Pliki trafiają do katalogu <span className="font-mono">{stan?.katalog ?? 'verris-bazy'}</span> na koncie. Plik do importu (.sql
          albo .sql.gz) wgrasz tam menedżerem plików, a duży — przez FTP.
        </p>
      </header>

      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          <label htmlFor="dbt-baza" className="mb-1 block text-[13px] font-medium text-foreground">Baza</label>
          <Select id="dbt-baza" value={baza} onChange={setBaza} options={opcjeBaz} disabled={pending} className="w-full" />
        </div>
        <button type="button" onClick={eksportuj} disabled={pending || !baza || stan?.wToku} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50">
          <Download className="h-4 w-4" /> Eksportuj bazę
        </button>
        <div className="min-w-0">
          <label htmlFor="dbt-plik" className="mb-1 block text-[13px] font-medium text-foreground">Plik do importu</label>
          <Select id="dbt-plik" value={plik} onChange={setPlik} options={opcjePlikow} placeholder={opcjePlikow.length ? 'Wybierz plik…' : 'Brak plików .sql w katalogu'} disabled={pending || !opcjePlikow.length} className="w-full" />
        </div>
        <button type="button" onClick={() => void importuj()} disabled={pending || !baza || !plik || stan?.wToku} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50">
          <Upload className="h-4 w-4" /> Importuj do bazy
        </button>
      </div>

      {blad ? <p className="m-0 border-t border-line px-4 py-3 text-sm text-crit">{blad}</p> : null}
      {stan?.bladPlikow ? <p className="m-0 border-t border-line px-4 py-3 text-sm text-muted-foreground">{stan.bladPlikow}</p> : null}

      {stan?.pliki.length ? (
        <div className="border-t border-line">
          <h4 className="m-0 px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Pliki</h4>
          <ul className="m-0 list-none p-0">
            {stan.pliki.map((p) => (
              <li key={p.sciezka} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0 break-all font-mono text-[13px] text-foreground">{p.nazwa}</span>
                <span className="flex items-center gap-3 text-[12.5px] text-muted-foreground">
                  {rozmiar(p.rozmiar)}
                  <button type="button" onClick={() => void pobierz(p.sciezka)} disabled={pobierany === p.sciezka} className="text-foreground underline disabled:opacity-50">
                    {pobierany === p.sciezka ? 'Pobieranie…' : 'Pobierz'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stan?.zadania.length ? (
        <div className="border-t border-line">
          <h4 className="m-0 px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Ostatnie operacje</h4>
          <ul className="m-0 list-none p-0">
            {stan.zadania.map((z) => (
              <li key={z.id} className="px-4 py-2 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-foreground">
                    {z.tryb === 'export' ? 'Eksport' : 'Import'} <span className="font-mono">{z.baza}</span>
                    {z.plik ? <> z <span className="font-mono">{z.plik}</span></> : null}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    {z.status === 'QUEUED' || z.status === 'RUNNING' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {STATUS[z.status] ?? z.status} · {new Date(z.utworzone).toLocaleString('pl-PL')}
                  </span>
                </div>
                {z.blad ? <p className="m-0 mt-1 text-[12.5px] text-crit">{z.blad}</p> : null}
                {z.status === 'COMPLETED' && z.wynik ? (
                  <p className="m-0 mt-1 text-[12.5px] text-muted-foreground">
                    {z.tryb === 'import' ? 'Kopia sprzed importu: ' : 'Plik: '}
                    <span className="font-mono">{z.wynik}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
