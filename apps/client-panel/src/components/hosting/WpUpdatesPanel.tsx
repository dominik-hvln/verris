'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SectionHead, StatusPill, Switch } from '@/components/panel/v2';
import { Select } from '@/components/panel/select';
import { potwierdz } from '@/components/panel/potwierdz';
import {
  checkWpUpdates,
  fetchWpUpdates,
  runWpUpdates,
  setWpAutoUpdates,
  type WpPozycja,
  type WpStatus,
} from '@/app/dashboard/services/[id]/hosting-wp-update-actions';

/**
 * I-04/I-05 — WordPress domeny: dostępne aktualizacje rdzenia, wtyczek i motywów, aktualizacja
 * z panelu i automatyczne aktualizacje. Każdą aktualizację poprzedza kopia plików i bazy, a gdy
 * strona po niej przestaje odpowiadać — serwer sam przywraca stan sprzed aktualizacji.
 */
const TH = 'border-b border-line px-3 py-2 text-left';
const TD = 'border-t border-line px-3 py-2 align-top text-[13px]';
const BTN =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';
const BTN_MAIN =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-primary bg-primary px-[13px] py-2 text-sm font-semibold text-primary-foreground hover:bg-data-hi disabled:opacity-50';

const ZAKRES_AUTO = [
  { value: 'none', label: 'Wyłączone' },
  { value: 'minor', label: 'Tylko poprawki bezpieczeństwa (zalecane)' },
  { value: 'all', label: 'Wszystkie wersje, także główne' },
];

function data(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Pole({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border p-0 disabled:opacity-50 ${
        checked ? 'border-data bg-data text-primary-foreground' : 'border-line-strong bg-raised'
      }`}
    >
      {checked ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null}
    </button>
  );
}

export function WpUpdatesPanel({ serviceId, domain }: { serviceId: string; domain: string }) {
  const [stan, setStan] = useState<WpStatus | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [wybraneWt, setWybraneWt] = useState<Set<string> | null>(null);
  const [wybraneMo, setWybraneMo] = useState<Set<string> | null>(null);
  const [rdzen, setRdzen] = useState<string | null>(null);
  const [auto, setAuto] = useState<{ core: string; plugins: boolean; themes: boolean } | null>(null);
  // Ustawienia automatu wypełniamy raz po wczytaniu — potem należą do klienta, aż zapisze.
  const autoWypelnione = useRef(false);

  const przyjmij = useCallback((s: WpStatus) => {
    setStan(s);
    setBlad(null);
    if (!autoWypelnione.current) {
      autoWypelnione.current = true;
      setAuto(s.automat ? { core: s.automat.core, plugins: s.automat.plugins, themes: s.automat.themes } : { core: 'none', plugins: false, themes: false });
    }
  }, []);

  const odswiez = useCallback(
    () =>
      fetchWpUpdates(serviceId, domain).then((r) => {
        if (r.ok) przyjmij(r.status);
        else setBlad(r.error);
      }),
    [serviceId, domain, przyjmij],
  );

  useEffect(() => {
    void odswiez();
  }, [odswiez]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 8_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);

  const wp = stan?.stan ?? null;
  const doAktWt = (wp?.plugins ?? []).filter((p) => p.update === 'available');
  const doAktMo = (wp?.themes ?? []).filter((p) => p.update === 'available');
  const minor = wp?.core.find((c) => c.update_type === 'minor') ?? null;
  const major = wp?.core.find((c) => c.update_type === 'major') ?? null;
  // Domyślnie zaznaczone wszystko, co ma aktualizację; rdzeń — poprawka, jeśli jest, inaczej pełna.
  const selWt = wybraneWt ?? new Set(doAktWt.map((p) => p.name));
  const selMo = wybraneMo ?? new Set(doAktMo.map((p) => p.name));
  const selRdzen = rdzen ?? (minor ? 'minor' : major ? 'all' : 'none');
  const cosWybrane = selRdzen !== 'none' || selWt.size > 0 || selMo.size > 0;
  const zajete = pending || !stan || stan.wToku;

  const sprawdz = () =>
    start(async () => {
      const r = await checkWpUpdates(serviceId, domain);
      if (r.ok) {
        przyjmij(r.status);
        toast.success('Sprawdzamy WordPressa — wynik w ciągu minuty.');
      } else toast.error(r.error);
    });

  const aktualizuj = async () => {
    const ok = await potwierdz(
      'Przed aktualizacją zrobimy kopię plików strony i bazy (w katalogu backups). Jeśli po aktualizacji strona przestanie odpowiadać, przywrócimy ją automatycznie.',
      { akcja: 'Aktualizuj' },
    );
    if (!ok) return;
    start(async () => {
      const r = await runWpUpdates(serviceId, {
        domain,
        core: selRdzen,
        plugins: [...selWt],
        themes: [...selMo],
      });
      if (r.ok) {
        przyjmij(r.status);
        setWybraneWt(null);
        setWybraneMo(null);
        setRdzen(null);
        toast.success('Aktualizacja zlecona — potrwa kilka minut.');
      } else toast.error(r.error);
    });
  };

  const zapiszAuto = () =>
    auto &&
    start(async () => {
      const r = await setWpAutoUpdates(serviceId, { domain, ...auto });
      if (r.ok) {
        setStan(r.status);
        toast.success(auto.core === 'none' && !auto.plugins && !auto.themes ? 'Automatyczne aktualizacje wyłączone.' : 'Automatyczne aktualizacje zapisane.');
      } else toast.error(r.error);
    });

  const przelacz = (zbior: Set<string>, ustaw: (s: Set<string>) => void, nazwa: string) => {
    const n = new Set(zbior);
    if (n.has(nazwa)) n.delete(nazwa);
    else n.add(nazwa);
    ustaw(n);
  };

  const tabela = (tytul: string, lista: WpPozycja[], sel: Set<string>, ustaw: (s: Set<string>) => void) => (
    <div className="overflow-hidden rounded-[10px] border border-line bg-card">
      <table className="v2-stack w-full border-collapse">
        <thead>
          <tr>
            <th className={`${TH} w-9`}>
              <span className="sr-only">Wybór</span>
            </th>
            <th className={TH}>{tytul}</th>
            <th className={TH}>Stan</th>
            <th className={TH}>Wersja</th>
            <th className={TH}>Aktualizacja</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((p) => {
            const jest = p.update === 'available';
            return (
              <tr key={p.name}>
                <td className={TD} data-label="Wybór">
                  {jest ? <Pole checked={sel.has(p.name)} onChange={() => przelacz(sel, ustaw, p.name)} label={`Aktualizuj ${p.title || p.name}`} disabled={zajete} /> : null}
                </td>
                <td className={TD} data-label={tytul}>
                  <b className="font-semibold text-foreground">{p.title || p.name}</b>
                  <span className="block font-mono text-[11.5px] text-muted-foreground">{p.name}</span>
                </td>
                <td className={TD} data-label="Stan">
                  {p.status === 'active' || p.status === 'parent' ? 'włączony' : p.status === 'must-use' ? 'zawsze włączony' : 'wyłączony'}
                </td>
                <td className={`${TD} font-mono`} data-label="Wersja">{p.version || '—'}</td>
                <td className={TD} data-label="Aktualizacja">
                  {jest ? (
                    <StatusPill tone="warn">do {p.update_version}</StatusPill>
                  ) : p.update === 'unavailable' ? (
                    <span className="text-muted-foreground">poza katalogiem WordPress.org</span>
                  ) : (
                    <span className="text-muted-foreground">aktualna</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="flex flex-col gap-6">
      <div>
        <SectionHead
          title={wp ? `WordPress ${wp.version}` : 'WordPress'}
          desc={
            stan?.sprawdzono
              ? `Sprawdzono ${data(stan.sprawdzono)}. Katalog /domains/${domain}/public_html.`
              : `Katalog /domains/${domain}/public_html.`
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={sprawdz} disabled={zajete} className={BTN}>
            {stan?.wToku ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {stan?.wToku ? 'Serwer pracuje…' : 'Sprawdź aktualizacje'}
          </button>
          {wp && cosWybrane ? (
            <button type="button" onClick={() => void aktualizuj()} disabled={zajete} className={BTN_MAIN}>
              Aktualizuj wybrane
            </button>
          ) : null}
        </div>
        {blad ? <p className="mt-2 text-[13px] text-crit">{blad}</p> : null}
      </div>

      {!stan && !blad ? (
        <p className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </p>
      ) : null}

      {stan?.brakWordpressa ? (
        <div className="rounded-[10px] border border-line bg-card px-4 py-3 text-[13.5px] text-verris-body">
          W katalogu tej domeny nie ma WordPressa. Możesz go zainstalować w{' '}
          <Link href={`/dashboard/services/${serviceId}?tab=apps`} className="font-semibold text-data underline-offset-2 hover:underline">
            Aplikacjach 1-click
          </Link>
          . WordPress w podkatalogu aktualizuj z jego kokpitu.
        </div>
      ) : null}

      {stan && !stan.brakWordpressa && !wp && !stan.wToku ? (
        <div className="rounded-[10px] border border-line bg-card px-4 py-3 text-[13.5px] text-verris-body">
          Kliknij <b className="text-foreground">Sprawdź aktualizacje</b> — serwer odczyta wersję WordPressa, wtyczki i motywy (ok. minuty).
        </div>
      ) : null}

      {wp ? (
        <>
          <div className="rounded-[10px] border border-line bg-card px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <b className="text-sm font-semibold text-foreground">Rdzeń WordPress</b>
                <p className="m-0 text-[12.5px] text-muted-foreground">
                  {minor || major ? `Zainstalowana ${wp.version}; dostępna ${[minor?.version, major?.version].filter(Boolean).join(' lub ')}.` : `Wersja ${wp.version} jest aktualna.`}
                </p>
              </div>
              {minor || major ? (
                <Select
                  aria-label="Aktualizacja rdzenia"
                  value={selRdzen}
                  onChange={setRdzen}
                  disabled={zajete}
                  options={[
                    { value: 'none', label: 'Bez aktualizacji rdzenia' },
                    ...(minor ? [{ value: 'minor', label: `Poprawka ${minor.version}` }] : []),
                    ...(major ? [{ value: 'all', label: `Pełna do ${major.version}` }] : []),
                  ]}
                  className="w-full sm:w-64"
                />
              ) : (
                <StatusPill tone="data">aktualny</StatusPill>
              )}
            </div>
          </div>
          {wp.plugins.length ? tabela('Wtyczka', wp.plugins, selWt, setWybraneWt) : null}
          {wp.themes.length ? tabela('Motyw', wp.themes, selMo, setWybraneMo) : null}
          {!minor && !major && doAktWt.length === 0 && doAktMo.length === 0 ? (
            <p className="m-0 text-[13px] text-muted-foreground">Wszystko jest aktualne.</p>
          ) : null}
          <p className="m-0 text-[12px] text-muted-foreground">
            Wtyczki spoza katalogu WordPress.org (np. płatne) aktualizuj z kokpitu WordPressa — ich aktualizacje wymagają licencji.
          </p>
        </>
      ) : null}

      {stan && !stan.brakWordpressa && auto ? (
        <div className="rounded-[10px] border border-line bg-card">
          <header className="border-b border-line px-4 py-3">
            <h3 className="m-0 text-[15px] font-bold text-foreground">Automatyczne aktualizacje</h3>
            <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
              Codziennie ok. 3:20 w nocy, zawsze z kopią i automatycznym przywróceniem, gdy strona przestanie odpowiadać.
              {stan.automat?.ostatnio ? ` Ostatnio: ${data(stan.automat.ostatnio)}.` : ''}
            </p>
          </header>
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
            <div className="min-w-0">
              <label htmlFor="wp-auto-core" className="mb-1 block text-[13px] font-medium text-foreground">
                Rdzeń WordPress
              </label>
              <Select id="wp-auto-core" value={auto.core} onChange={(v) => setAuto({ ...auto, core: v })} options={ZAKRES_AUTO} disabled={pending} className="w-full" />
            </div>
            <div className="flex items-center gap-2 text-[13px] text-foreground">
              <Switch checked={auto.plugins} onChange={(v) => setAuto({ ...auto, plugins: v })} label="Wtyczki" disabled={pending} /> Wtyczki
            </div>
            <div className="flex items-center gap-2 text-[13px] text-foreground">
              <Switch checked={auto.themes} onChange={(v) => setAuto({ ...auto, themes: v })} label="Motywy" disabled={pending} /> Motywy
            </div>
          </div>
          <div className="flex justify-end border-t border-line px-4 py-3">
            <button type="button" onClick={zapiszAuto} disabled={pending} className={BTN_MAIN}>
              Zapisz
            </button>
          </div>
        </div>
      ) : null}

      {stan?.aktualizacje.length ? (
        <div>
          <SectionHead title="Ostatnie aktualizacje" />
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {stan.aktualizacje.map((a) => (
              <li key={a.id} className="rounded-[10px] border border-line bg-card px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="font-semibold text-foreground">{data(a.utworzone)}</b>
                  <span className="text-muted-foreground">{a.automatyczna ? 'automatyczna' : 'z panelu'}</span>
                  <StatusPill tone={a.status === 'COMPLETED' ? 'data' : a.status === 'FAILED' ? 'warn' : 'muted'}>
                    {a.status === 'COMPLETED' ? 'gotowe' : a.status === 'FAILED' ? (a.wycofano ? 'przywrócono stan sprzed' : 'nie powiodła się') : 'w toku'}
                  </StatusPill>
                </div>
                {a.zmiany.length ? (
                  <p className="m-0 mt-1 text-verris-body">{a.zmiany.map((z) => `${z.nazwa} ${z.z} → ${z.na}`).join(', ')}</p>
                ) : a.status === 'COMPLETED' ? (
                  <p className="m-0 mt-1 text-muted-foreground">Bez zmian wersji.</p>
                ) : null}
                {a.blad ? <p className="m-0 mt-1 text-crit">{a.blad}</p> : null}
                {a.kopia ? <p className="m-0 mt-1 text-[12px] text-muted-foreground">Kopia: <span className="font-mono">~/backups/{a.kopia}</span></p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
