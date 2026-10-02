'use client';

import { useEffect, useState, useTransition } from 'react';
import { Copy, KeyRound, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { SectionHead } from '@/components/panel/v2';
import { potwierdz } from '@/components/panel/potwierdz';
import {
  fetchPgsql,
  hasloPgsql,
  odswiezPgsql,
  usunPgsql,
  utworzPgsql,
  type StanPgsql,
} from '@/app/dashboard/services/[id]/hosting-pgsql-actions';
import { liczba } from '@/lib/liczba';

const BTN = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';
const rozmiar = (b: number) => (b >= 1024 ** 3 ? `${liczba(b / 1024 ** 3, 2)} GB` : `${liczba(b / 1024 ** 2, 1)} MB`);

/**
 * D-14 — bazy PostgreSQL konta. Baza i użytkownik mają tę samą nazwę; hasło pokazujemy raz, po utworzeniu
 * albo zmianie. Połączenie tylko z serwera (localhost) — z aplikacji na tym hostingu.
 */
export function PgsqlPanel({ serviceId }: { serviceId: string }) {
  const [stan, setStan] = useState<StanPgsql | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [nazwa, setNazwa] = useState('');
  const [nowa, setNowa] = useState<StanPgsql['nowa'] | null>(null);
  const [odczyt, setOdczyt] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    let aktualny = true;
    void fetchPgsql(serviceId).then((r) => {
      if (!aktualny) return;
      if (r.ok) setStan(r.stan);
      else setBlad(r.error);
    });
    return () => {
      aktualny = false;
    };
  }, [serviceId, odczyt]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => setOdczyt((n) => n + 1), 4000);
    return () => clearInterval(t);
  }, [stan?.wToku]);

  const wykonaj = (f: () => ReturnType<typeof fetchPgsql>) =>
    start(async () => {
      setBlad(null);
      const r = await f();
      if (!r.ok) return setBlad(r.error);
      setStan(r.stan);
      if (r.stan.nowa) setNowa(r.stan.nowa);
    });

  const login = stan?.login ?? '';
  const sufiks = (pelna: string) => pelna.slice(login.length + 1);
  const poprawna = /^[a-z0-9]{1,16}$/.test(nazwa);
  const zajete = !stan || stan.wToku || pending;

  return (
    <section className="mt-8">
      <SectionHead
        title="PostgreSQL"
        desc={`Bazy PostgreSQL 16 dla aplikacji na tym hostingu. Host ${stan?.host ?? '127.0.0.1'}, port ${stan?.port ?? 5432}. Codzienna kopia trafia do kopii zapasowej konta.`}
        action={
          <button type="button" className={BTN} disabled={zajete} onClick={() => wykonaj(() => odswiezPgsql(serviceId))}>
            {stan?.wToku ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {stan?.wToku ? 'Pracuję…' : 'Odśwież'}
          </button>
        }
      />
      {blad ? <p role="alert" className="m-0 mb-2 text-[13px] text-crit">{blad}</p> : null}
      {stan?.blad ? <p role="alert" className="m-0 mb-2 text-[13px] text-crit">{stan.blad}</p> : null}

      {nowa ? (
        <div role="status" className="mb-3 rounded-[10px] border border-line-strong bg-card px-4 py-3 text-[13.5px]">
          <p className="m-0 mb-2 font-medium text-foreground">Zapisz dane połączenia — hasła nie pokażemy ponownie.</p>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[12.5px]">
            <dt className="text-muted-foreground">Baza / użytkownik</dt>
            <dd className="m-0 break-all">{nowa.nazwa}</dd>
            <dt className="text-muted-foreground">Hasło</dt>
            <dd className="m-0 flex items-center gap-2 break-all">
              {nowa.haslo}
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Kopiuj hasło" onClick={() => void navigator.clipboard.writeText(nowa.haslo)}>
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </button>
            </dd>
            <dt className="text-muted-foreground">Adres</dt>
            <dd className="m-0 break-all">postgresql://{nowa.uzytkownik}:***@{nowa.host}:{nowa.port}/{nowa.nazwa}</dd>
          </dl>
          <p className="m-0 mt-2 text-[12px] text-muted-foreground">Baza będzie gotowa za kilka sekund — lista odświeży się sama.</p>
          <button type="button" className={`${BTN} mt-3`} onClick={() => setNowa(null)}>Zapisałem</button>
        </div>
      ) : null}

      <form
        className="mb-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!poprawna) return;
          const n = nazwa;
          setNazwa('');
          wykonaj(() => utworzPgsql(serviceId, n));
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
          Nazwa nowej bazy
          <span className="flex items-center rounded-[7px] border border-line-strong bg-card font-mono text-sm">
            <span className="pl-3 text-muted-foreground">{login}_</span>
            <input
              value={nazwa}
              onChange={(e) => setNazwa(e.target.value.toLowerCase())}
              maxLength={16}
              pattern="[a-z0-9]{1,16}"
              placeholder="sklep"
              aria-describedby="pgsql-nazwa-opis"
              className="w-40 bg-transparent py-2 pr-3 text-foreground outline-none"
            />
          </span>
        </label>
        <button type="submit" className={BTN} disabled={zajete || !poprawna || (stan?.bazy.length ?? 0) >= (stan?.limit ?? 5)}>
          <Plus className="h-4 w-4" aria-hidden /> Utwórz bazę
        </button>
        <p id="pgsql-nazwa-opis" className="m-0 basis-full text-[12px] text-muted-foreground">
          Małe litery i cyfry, do 16 znaków. {stan ? `Bazy: ${stan.bazy.length} z ${stan.limit}.` : ''}
        </p>
      </form>

      {stan && stan.odczytano === null && !stan.wToku ? (
        <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-3 text-[13.5px] text-muted-foreground">
          Brak baz PostgreSQL — utwórz pierwszą albo kliknij „Odśwież”, żeby pobrać listę z serwera.
        </p>
      ) : null}
      {stan?.bazy.length ? (
        // Lista zamiast tabeli: panel stoi też w wąskiej kolumnie — przyciski zawijają się pod nazwę, nie wychodzą poza kartę.
        <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-card p-0">
          {stan.bazy.map((b) => (
            <li key={b.nazwa} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0">
                <div className="break-all font-mono text-sm text-foreground">{b.nazwa}</div>
                <div className="text-[12px] text-muted-foreground">Rozmiar: {rozmiar(b.rozmiar)}</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={BTN}
                  disabled={zajete}
                  onClick={async () => {
                    if (!(await potwierdz(`Ustawić nowe hasło dla ${b.nazwa}? Aplikacje używające starego hasła stracą połączenie.`, { akcja: 'Zmień hasło' }))) return;
                    wykonaj(() => hasloPgsql(serviceId, sufiks(b.nazwa)));
                  }}
                >
                  <KeyRound className="h-4 w-4" aria-hidden /> Nowe hasło
                </button>
                <button
                  type="button"
                  className={BTN}
                  disabled={zajete}
                  aria-label={`Usuń bazę ${b.nazwa}`}
                  onClick={async () => {
                    if (!(await potwierdz(`Usunąć bazę ${b.nazwa} razem z danymi i jej użytkownikiem? Tego nie da się cofnąć.`, { akcja: 'Usuń', niebezpieczne: true }))) return;
                    wykonaj(() => usunPgsql(serviceId, sufiks(b.nazwa)));
                  }}
                >
                  <Trash2 className="h-4 w-4 text-crit" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
