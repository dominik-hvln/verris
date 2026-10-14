'use client';

import { useState } from 'react';
import { Folder } from 'lucide-react';

/**
 * 14.10 (uwagi Dominika po e2e PB-45) — wspólne dla kreatora klienta, panelu obsługi i admina:
 *  - „Test połączenia” źródła plików: API próbuje SFTP → FTPS → FTP (bez wybierania protokołu) i mówi, czym
 *    skopiujemy (SFTP + rsync to najszybsza droga);
 *  - „Wybierz z serwera…” przy katalogu strony: przeglądanie katalogów starego serwera (tylko odczyt), znacznik
 *    „wygląda na stronę” i — gdy jest plik konfiguracyjny CMS-a — „Podstaw dane bazy”.
 * Pola formularza zostają w aplikacjach (różne style); tu tylko narzędzia obok nich. Wywołania API przychodzą
 * jako akcje serwera danej aplikacji (`testuj`, `listuj`), więc komponent nie zna tras ani sesji.
 */

export type ProtokolPlikow = 'sftp' | 'ftps' | 'ftp';

export interface WynikTestuPlikow {
  ok: boolean;
  protocol: ProtokolPlikow | null;
  port: number | null;
  rsync: boolean;
  metoda: string;
  nieszyfrowane: boolean;
  proby: Array<{ protocol: ProtokolPlikow; port: number; status: 'ok' | 'auth_failed' | 'unreachable'; message: string }>;
}

export interface DaneBazyZKatalogu {
  host: string;
  port: number | null;
  nazwa: string;
  uzytkownik: string;
  haslo?: string;
  hasloZPliku: boolean;
}

export interface WynikKatalogow {
  sciezka: string;
  katalogi: string[];
  uciete: boolean;
  strona: boolean;
  cms: { cms: string; nazwa: string; plik: string } | null;
  baza: DaneBazyZKatalogu | null;
}

export interface DostepZrodla {
  host: string;
  /** null = automatycznie (22 dla SFTP, 21 dla FTP/FTPS). */
  port: number | null;
  username: string;
  password: string;
  /** 'auto' = SFTP → FTPS → FTP. */
  protocol: 'auto' | ProtokolPlikow;
}

type Wynik<T> = { ok: true; wynik: T } | { error: string };

export interface NarzedziaZrodlaPlikowProps {
  dostep: DostepZrodla;
  wykryty: WynikTestuPlikow | null;
  onWykryty: (w: WynikTestuPlikow | null) => void;
  sciezka: string;
  onSciezka: (s: string) => void;
  testuj: (d: { host: string; port?: number; username: string; password: string; protocol?: ProtokolPlikow }) => Promise<Wynik<WynikTestuPlikow>>;
  listuj: (d: { host: string; port: number; username: string; password: string; protocol: ProtokolPlikow; sciezka: string }) => Promise<Wynik<WynikKatalogow>>;
  /** Gdy podane — przycisk „Podstaw dane bazy” przy wykrytym pliku konfiguracyjnym. */
  onDaneBazy?: (b: DaneBazyZKatalogu) => void;
  /** Katalog, od którego zaczyna się przeglądanie, gdy pole ścieżki jest puste. */
  startowy?: string;
}

const przycisk =
  'inline-flex items-center justify-center rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:border-white/30 disabled:opacity-50';

/** Parametry połączenia do podglądu: protokół i port wykryte testem albo wybrane ręcznie. */
export function polaczenieDoPodgladu(d: DostepZrodla, w: WynikTestuPlikow | null): { protocol: ProtokolPlikow; port: number } | null {
  if (d.protocol !== 'auto') return { protocol: d.protocol, port: d.port ?? (d.protocol === 'sftp' ? 22 : 21) };
  return w?.ok && w.protocol && w.port ? { protocol: w.protocol, port: w.port } : null;
}

export function NarzedziaZrodlaPlikow(p: NarzedziaZrodlaPlikowProps) {
  const [busy, setBusy] = useState<'test' | 'lista' | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [katalog, setKatalog] = useState<WynikKatalogow | null>(null);
  const [otwarte, setOtwarte] = useState(false);
  const kompletne = p.dostep.host.trim() && p.dostep.username.trim() && p.dostep.password;

  async function testuj(): Promise<WynikTestuPlikow | null> {
    setBusy('test');
    setBlad(null);
    const res = await p.testuj({
      host: p.dostep.host.trim(),
      username: p.dostep.username.trim(),
      password: p.dostep.password,
      ...(p.dostep.port ? { port: p.dostep.port } : {}),
      ...(p.dostep.protocol !== 'auto' ? { protocol: p.dostep.protocol } : {}),
    });
    setBusy(null);
    if ('error' in res) {
      setBlad(res.error);
      p.onWykryty(null);
      return null;
    }
    p.onWykryty(res.wynik);
    return res.wynik;
  }

  async function otworz(sciezka: string) {
    let pol = polaczenieDoPodgladu(p.dostep, p.wykryty);
    if (!pol) {
      const w = await testuj();
      pol = w ? polaczenieDoPodgladu(p.dostep, w) : null;
      if (!pol) return;
    }
    setBusy('lista');
    setBlad(null);
    const res = await p.listuj({
      host: p.dostep.host.trim(),
      username: p.dostep.username.trim(),
      password: p.dostep.password,
      protocol: pol.protocol,
      port: pol.port,
      sciezka: sciezka || '/',
    });
    setBusy(null);
    if ('error' in res) {
      setBlad(res.error);
      return;
    }
    setKatalog(res.wynik);
    setOtwarte(true);
  }

  const wyzej = (s: string) => s.replace(/\/[^/]+\/?$/, '') || '/';
  const do_ = (s: string, k: string) => `${s === '/' ? '' : s}/${k}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={przycisk} disabled={!kompletne || busy !== null} onClick={() => void testuj()}>
          {busy === 'test' ? 'Sprawdzam połączenie…' : 'Test połączenia'}
        </button>
        <button
          type="button"
          className={przycisk}
          disabled={!kompletne || busy !== null}
          onClick={() => void otworz(p.sciezka.trim() || p.startowy || '/')}
          aria-expanded={otwarte}
        >
          {busy === 'lista' ? 'Wczytuję katalogi…' : 'Wybierz katalog z serwera…'}
        </button>
      </div>

      {p.wykryty ? (
        <div
          role="status"
          className={`rounded-lg border px-3 py-2 text-xs ${
            p.wykryty.ok
              ? p.wykryty.nieszyfrowane
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-100'
          }`}
        >
          <p className="font-semibold">
            {p.wykryty.ok ? `Połączenie działa — kopiujemy: ${p.wykryty.metoda}` : p.wykryty.metoda}
            {p.wykryty.ok && p.wykryty.port ? ` (port ${p.wykryty.port})` : ''}
          </p>
          {p.wykryty.nieszyfrowane ? (
            <p>FTP bez szyfrowania: hasło idzie otwartym tekstem. Jeśli serwer ma SSH, zmień hasło po migracji.</p>
          ) : null}
          {p.wykryty.ok && p.wykryty.protocol !== 'sftp' ? (
            <p className="opacity-80">Masz dostęp SSH? Wpisz jego port — przez SFTP z rsync kopiowanie jest szybsze.</p>
          ) : null}
          {!p.wykryty.ok
            ? p.wykryty.proby.map((x) => (
                <p key={`${x.protocol}:${x.port}`} className="opacity-80">
                  {x.protocol.toUpperCase()} port {x.port}: {x.message}
                </p>
              ))
            : null}
        </div>
      ) : null}
      {blad ? (
        <p role="alert" className="text-xs text-rose-300">
          {blad}
        </p>
      ) : null}

      {otwarte && katalog ? (
        <div className="space-y-2 rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-cyan-100/90 break-all">{katalog.sciezka}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-cyan-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  p.onSciezka(katalog.sciezka);
                  setOtwarte(false);
                }}
              >
                Wybierz ten katalog
              </button>
              <button type="button" className={przycisk} onClick={() => setOtwarte(false)}>
                Zamknij
              </button>
            </div>
          </div>
          {katalog.cms ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-100">
              <span>
                Wykryto: <strong>{katalog.cms.nazwa}</strong> ({katalog.cms.plik})
                {katalog.baza ? ` — baza ${katalog.baza.nazwa}, użytkownik ${katalog.baza.uzytkownik}` : ''}
              </span>
              {katalog.baza && p.onDaneBazy ? (
                <button type="button" className={przycisk} onClick={() => p.onDaneBazy?.(katalog.baza!)}>
                  Podstaw dane bazy
                </button>
              ) : null}
            </div>
          ) : katalog.strona ? (
            <p className="text-emerald-200">Ten katalog wygląda na katalog strony.</p>
          ) : null}
          <ul className="max-h-64 space-y-0.5 overflow-y-auto" aria-label="Katalogi na serwerze">
            {katalog.sciezka !== '/' ? (
              <li>
                <button type="button" className="w-full rounded px-2 py-1 text-left hover:bg-white/10" onClick={() => void otworz(wyzej(katalog.sciezka))}>
                  ↑ wyżej
                </button>
              </li>
            ) : null}
            {katalog.katalogi.map((k) => (
              <li key={k}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
                  onClick={() => void otworz(do_(katalog.sciezka, k))}
                >
                  <Folder aria-hidden className="h-3.5 w-3.5 shrink-0 text-cyan-200/80" /> {k}
                </button>
              </li>
            ))}
            {katalog.katalogi.length === 0 ? <li className="px-2 py-1 text-white/60">Brak podkatalogów.</li> : null}
          </ul>
          {katalog.uciete ? <p className="text-white/60">Pokazujemy pierwsze 500 katalogów.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
