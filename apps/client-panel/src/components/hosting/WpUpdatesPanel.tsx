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
  wpCache,
  wpHarden,
  type WpPozycja,
  type WpOperacja,
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

  const lsc = wp?.plugins.find((x) => x.name === 'litespeed-cache') ?? null;
  const redisWp = wp?.plugins.find((x) => x.name === 'redis-cache')?.status === 'active';
  const cacheWl = lsc?.status === 'active';
  const ostatniCache = stan?.cache[0] ?? null;
  const operacjaCache = async (akcja: 'on' | 'off' | 'purge' | 'redis-on' | 'redis-off') => {
    if (akcja === 'off' && !(await potwierdz('Wyłączyć pamięć podręczną? Strona będzie generowana przy każdym wejściu — wolniej.', { akcja: 'Wyłącz' }))) return;
    start(async () => {
      const r = await wpCache(serviceId, domain, akcja);
      if (r.ok) {
        przyjmij(r.status);
        toast.success(akcja === 'purge' ? 'Czyszczenie cache zlecone.' : akcja.endsWith('on') ? 'Włączanie zlecone — potrwa chwilę.' : 'Wyłączanie zlecone.');
      } else toast.error(r.error);
    });
  };

  const zab = stan?.zabezpieczenia ?? null;
  const popraw = async (akcja: WpOperacja) => {
    if (akcja === 'maintenance-on' && !(await potwierdz('Włączyć tryb konserwacji? Odwiedzający zobaczą komunikat o przerwie technicznej zamiast strony, dopóki go nie wyłączysz.', { akcja: 'Włącz' }))) return;
    start(async () => {
      const r = await wpHarden(serviceId, domain, akcja);
      if (r.ok) {
        przyjmij(r.status);
        toast.success(
          akcja === 'maintenance-on'
            ? 'Włączanie trybu konserwacji zlecone — odwiedzający zobaczą komunikat o przerwie.'
            : akcja === 'maintenance-off'
              ? 'Wyłączanie trybu konserwacji zlecone.'
              : 'Zmiana zlecona — gotowe w ciągu minuty.',
        );
      } else toast.error(r.error);
    });
  };
  const zapisywalnyDlaWszystkich = (m: string) => /[2367]$/.test(m);

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
          <Link href={`/dashboard/services/${serviceId}?tab=apps`} className="font-semibold text-data-hi underline-offset-2 hover:underline">
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

      {wp && stan?.podatnosci ? (
        <div
          role={stan.podatnosci.length ? 'alert' : undefined}
          className={`rounded-[10px] border px-4 py-3 text-[13.5px] ${stan.podatnosci.length ? 'border-warn/30 bg-warn-soft' : 'border-line bg-card'}`}
        >
          {stan.podatnosci.length ? (
            <>
              <b className="text-foreground">Znane podatności: {stan.podatnosci.length}</b>
              <p className="m-0 mt-0.5 text-[12.5px] text-verris-body">
                Zaktualizuj poniższe elementy (zaznacz je w tabelach i kliknij „Aktualizuj wybrane”). Gdy poprawki nie ma — wyłącz wtyczkę lub motyw do czasu jej wydania.
              </p>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                {stan.podatnosci.map((v) => (
                  <li key={`${v.typ}:${v.slug}:${v.link}`} className="text-[13px] text-foreground">
                    <b className="font-semibold">{v.nazwa}</b> <span className="font-mono text-[12px]">{v.wersja}</span> — {v.tytul}.{' '}
                    <span className="text-verris-body">{v.poprawione.length ? `Poprawka: ${v.poprawione.join(', ')}.` : 'Brak poprawki.'}</span>{' '}
                    <a href={v.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-data-hi underline-offset-2 hover:underline">
                      Szczegóły
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <span className="text-verris-body">Brak znanych podatności w zainstalowanych wersjach.</span>
          )}
          {stan.zrodloPodatnosci ? (
            <p className="m-0 mt-2 text-[11.5px] text-muted-foreground">
              {stan.zrodloPodatnosci.nota} ·{' '}
              <a href={stan.zrodloPodatnosci.licencja} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                licencja
              </a>
            </p>
          ) : null}
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

      {wp ? (
        <div className="rounded-[10px] border border-line bg-card px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <b className="text-sm font-semibold text-foreground">Pamięć podręczna stron (LiteSpeed Cache)</b>
              <p className="m-0 text-[12.5px] text-muted-foreground">
                {cacheWl
                  ? 'Włączona — strony podawane są z pamięci podręcznej serwera, bez uruchamiania PHP przy każdym wejściu.'
                  : 'Wyłączona. Włączenie instaluje i uruchamia oficjalną wtyczkę LiteSpeed Cache; gdy strona po tym przestanie odpowiadać, wyłączymy ją z powrotem.'}
              </p>
              {ostatniCache?.blad ? <p className="m-0 mt-1 text-[12.5px] text-crit">{ostatniCache.blad}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {cacheWl ? (
                <>
                  <button type="button" onClick={() => void operacjaCache('purge')} disabled={zajete} className={BTN}>
                    Wyczyść cache
                  </button>
                  <button type="button" onClick={() => void operacjaCache('off')} disabled={zajete} className={BTN}>
                    Wyłącz
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => void operacjaCache('on')} disabled={zajete} className={BTN_MAIN}>
                  Włącz cache
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {wp ? (
        <div className="rounded-[10px] border border-line bg-card px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <b className="text-sm font-semibold text-foreground">Cache obiektowy (Redis)</b>
              <p className="m-0 text-[12.5px] text-muted-foreground">
                {redisWp
                  ? 'Włączony — WordPress trzyma wyniki zapytań do bazy w Redisie konta.'
                  : 'Wymaga włączonego Redisa konta (zakładka PHP i serwer usługi). Włączenie instaluje wtyczkę Redis Object Cache i łączy ją z Redisem konta.'}
              </p>
            </div>
            {redisWp ? (
              <button type="button" onClick={() => void operacjaCache('redis-off')} disabled={zajete} className={BTN}>
                Wyłącz
              </button>
            ) : (
              <button type="button" onClick={() => void operacjaCache('redis-on')} disabled={zajete} className={BTN_MAIN}>
                Włącz Redis dla WordPressa
              </button>
            )}
          </div>
        </div>
      ) : null}

      {wp && zab ? (
        <div className="rounded-[10px] border border-line bg-card">
          <header className="border-b border-line px-4 py-3">
            <h3 className="m-0 text-[15px] font-bold text-foreground">Zabezpieczenia WordPressa</h3>
            <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">Przegląd z ostatniego sprawdzenia. Odśwież przyciskiem „Sprawdź aktualizacje”.</p>
          </header>
          <ul className="m-0 list-none p-0 text-[13px]">
            {(
              [
                [
                  !zab.edytorPlikow,
                  'Edytor plików w kokpicie',
                  zab.edytorPlikow
                    ? 'Włączony — kto przejmie konto administratora, może zmienić kod PHP strony z przeglądarki.'
                    : 'Wyłączony (DISALLOW_FILE_EDIT).',
                  zab.edytorPlikow ? { label: 'Wyłącz edytor', akcja: 'file-edit' as const } : null,
                ],
                [
                  !zab.debug,
                  'Tryb debugowania (WP_DEBUG)',
                  zab.debug ? 'Włączony na stronie produkcyjnej — błędy mogą pokazywać ścieżki i fragmenty kodu odwiedzającym.' : 'Wyłączony.',
                  zab.debug ? { label: 'Wyłącz debugowanie', akcja: 'debug-off' as const } : null,
                ],
                [
                  !zab.uzytkownikAdmin,
                  'Konto o loginie „admin”',
                  zab.uzytkownikAdmin
                    ? 'Istnieje — to pierwszy login, który zgadują boty. Utwórz administratora z innym loginem, zaloguj się na niego i usuń „admin”, przepisując treści.'
                    : 'Brak.',
                  null,
                ],
                [
                  zab.sumyRdzenia === 'ok',
                  'Pliki rdzenia WordPressa',
                  zab.sumyRdzenia === 'ok'
                    ? 'Zgodne z oryginałem z WordPress.org.'
                    : 'Część plików rdzenia różni się od oryginału — to może być ręczna zmiana albo infekcja. Uruchom skaner w zakładce Bezpieczeństwo usługi.',
                  null,
                ],
                [
                  !zapisywalnyDlaWszystkich(zab.uprawnieniaConfig),
                  'Uprawnienia wp-config.php',
                  zab.uprawnieniaConfig ? `${zab.uprawnieniaConfig}${zapisywalnyDlaWszystkich(zab.uprawnieniaConfig) ? ' — plik zapisywalny dla wszystkich; ustaw 640 w menedżerze plików.' : ' — w porządku.'}` : 'Nie udało się odczytać.',
                  null,
                ],
              ] as [boolean, string, string, { label: string; akcja: WpOperacja } | null][]
            ).map(([ok, tytul, opis, fix]) => (
              <li key={tytul} className="flex flex-wrap items-start justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusPill tone={ok ? 'data' : 'warn'}>{ok ? 'w porządku' : 'do poprawy'}</StatusPill>
                    <b className="font-semibold text-foreground">{tytul}</b>
                  </div>
                  <p className="m-0 mt-1 text-verris-body">{opis}</p>
                </div>
                {fix ? (
                  <button type="button" onClick={() => void popraw(fix.akcja)} disabled={zajete} className={BTN}>
                    {fix.label}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {wp && zab ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-[10px] border border-line bg-card px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <StatusPill tone={zab.konserwacja ? 'warn' : 'data'}>{zab.konserwacja ? 'włączony' : 'wyłączony'}</StatusPill>
              <h3 className="m-0 text-[15px] font-bold text-foreground">Tryb konserwacji</h3>
            </div>
            <p className="m-0 mt-1 text-[13px] text-verris-body">
              {zab.konserwacja
                ? 'Odwiedzający widzą komunikat o przerwie technicznej zamiast strony. Aktualizacje (także automatyczne) czekają, aż go wyłączysz.'
                : 'Na czas większych zmian możesz pokazać odwiedzającym komunikat o przerwie technicznej. Kokpit WordPressa działa dalej.'}
            </p>
          </div>
          <button type="button" onClick={() => void popraw(zab.konserwacja ? 'maintenance-off' : 'maintenance-on')} disabled={zajete} className={BTN}>
            {zab.konserwacja ? 'Wyłącz tryb konserwacji' : 'Włącz tryb konserwacji'}
          </button>
        </div>
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
