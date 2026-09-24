'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Select, type SelectOption } from '@/components/panel/select';
import { fetchPhpIni, savePhpIni, type PhpIniStatus } from '@/app/dashboard/php/php-actions';

/**
 * B-05 — ustawienia PHP dla jednej domeny. Zapis trafia do bloku panelu w `.user.ini` katalogu
 * domeny; dyrektywy dopisane przez klienta ręcznie zostają. „Domyślna” = bez wpisu (wartość serwera).
 */
const DOMYSLNA = '';
const opcje = (wartosci: string[], jednostka = ''): SelectOption[] => [
  { value: DOMYSLNA, label: 'Domyślna serwera' },
  ...wartosci.map((v) => ({ value: v, label: `${v}${jednostka}` })),
];

const POLA: Array<{ klucz: string; etykieta: string; opis: string; opcje: SelectOption[] }> = [
  { klucz: 'memory_limit', etykieta: 'Limit pamięci skryptu', opis: 'memory_limit — i tak nie więcej niż RAM planu.', opcje: opcje(['128M', '256M', '512M', '768M', '1024M']) },
  { klucz: 'upload_max_filesize', etykieta: 'Maks. rozmiar wysyłanego pliku', opis: 'upload_max_filesize', opcje: opcje(['16M', '32M', '64M', '128M', '256M', '512M']) },
  { klucz: 'post_max_size', etykieta: 'Maks. rozmiar formularza', opis: 'post_max_size — co najmniej tyle, co rozmiar pliku.', opcje: opcje(['16M', '32M', '64M', '128M', '256M', '512M']) },
  { klucz: 'max_execution_time', etykieta: 'Czas wykonania skryptu', opis: 'max_execution_time', opcje: opcje(['30', '60', '120', '300', '600'], ' s') },
  { klucz: 'max_input_vars', etykieta: 'Liczba pól formularza', opis: 'max_input_vars — przydatne przy dużych menu WordPressa.', opcje: opcje(['1000', '3000', '5000', '10000']) },
  { klucz: 'display_errors', etykieta: 'Pokazywanie błędów', opis: 'display_errors — na produkcji zostaw wyłączone.', opcje: [{ value: DOMYSLNA, label: 'Domyślna serwera' }, { value: 'Off', label: 'Wyłączone' }, { value: 'On', label: 'Włączone' }] },
  { klucz: 'date.timezone', etykieta: 'Strefa czasowa', opis: 'date.timezone', opcje: opcje(['Europe/Warsaw', 'UTC', 'Europe/London', 'Europe/Berlin']) },
];

export function PhpIniForm({ serviceId, domain }: { serviceId: string; domain: string }) {
  const [stan, setStan] = useState<PhpIniStatus | { error: string } | null>(null);
  const [wartosci, setWartosci] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    let aktywny = true;
    void fetchPhpIni(serviceId, domain).then((r) => {
      if (!aktywny) return;
      setStan(r);
      if (!('error' in r)) setWartosci(r.values);
    });
    return () => {
      aktywny = false;
    };
  }, [serviceId, domain]);

  const zapisz = () =>
    start(async () => {
      const r = await savePhpIni(serviceId, domain, wartosci);
      if (r.ok) toast.success('Ustawienia PHP zapisane. Zaczną działać w ciągu kilku minut.');
      else toast.error(r.error);
    });

  if (stan === null) return <p className="m-0 text-sm text-muted-foreground">Wczytywanie ustawień PHP…</p>;
  if ('error' in stan) {
    return <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-[18px] text-sm text-muted-foreground">Nie udało się odczytać ustawień PHP: {stan.error}</p>;
  }

  return (
    <div className="rounded-[10px] border border-line bg-card">
      <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
        {POLA.map((p) => (
          <div key={p.klucz} className="min-w-0">
            <label htmlFor={`php-${p.klucz}`} className="mb-1 block text-[13px] font-medium text-foreground">
              {p.etykieta}
            </label>
            <Select
              id={`php-${p.klucz}`}
              value={wartosci[p.klucz] ?? DOMYSLNA}
              onChange={(v) => setWartosci((w) => ({ ...w, [p.klucz]: v }))}
              options={
                wartosci[p.klucz] && !p.opcje.some((o) => o.value === wartosci[p.klucz])
                  ? [...p.opcje, { value: wartosci[p.klucz], label: wartosci[p.klucz] }]
                  : p.opcje
              }
              disabled={pending}
              className="w-full"
            />
            <p className="mt-1 text-[12px] text-muted-foreground">{p.opis}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        <p className="m-0 text-[12.5px] text-muted-foreground">
          Zapis w pliku <span className="font-mono">.user.ini</span> tej domeny
          {stan.wlasneDyrektywy > 0 ? ` — Twoich własnych wpisów (${stan.wlasneDyrektywy}) nie zmieniamy` : ''}.
        </p>
        <button
          type="button"
          onClick={zapisz}
          disabled={pending}
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-primary bg-primary px-[13px] py-2 text-sm font-semibold text-primary-foreground hover:bg-data-hi disabled:opacity-50"
        >
          {pending ? 'Zapisuję…' : 'Zapisz ustawienia PHP'}
        </button>
      </div>
    </div>
  );
}
