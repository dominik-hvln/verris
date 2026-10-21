'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Select } from '@/components/panel/select';
import { CopyValue, StatusPill } from '@/components/panel/v2';
import { potwierdz } from '@/components/panel/potwierdz';
import {
  createGitWebhook,
  deleteGitWebhook,
  fetchGit,
  gitOp,
  zapiszKonfiguracjeGit,
  type GitStatus,
  type PresetBudowania,
} from '@/app/dashboard/services/[id]/hosting-git-actions';
import { plForm } from '@/lib/pl';

/**
 * C-25/C-26 — repozytorium strony z panelu: klucz wdrożeniowy (do dodania w GitHub/GitLab),
 * klonowanie do katalogu strony i „Pobierz zmiany teraz”. Harmonogram jest niżej (cron git pull).
 */
const INPUT = 'w-full rounded-[7px] border border-line bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-data';
const BTN = 'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';

/** Budowanie po każdym klonowaniu i pobraniu zmian (także z webhooka). `Select` nie przyjmuje pustej wartości — '' to „brak”. */
const PRESETY: { value: string; label: string; opis: string }[] = [
  { value: 'brak', label: 'Bez budowania', opis: 'Pliki z repozytorium trafiają na stronę tak, jak są (PHP, HTML).' },
  { value: 'npm-build', label: 'npm ci, potem npm run build', opis: 'Next.js, Astro, Vue i inne strony budowane z Node.js. Wymaga pliku package-lock.json.' },
  { value: 'npm-ci', label: 'npm ci bez zależności deweloperskich', opis: 'Aplikacja Node.js bez kroku build. Wymaga pliku package-lock.json.' },
  { value: 'composer', label: 'composer install --no-dev', opis: 'Laravel, Symfony i inne projekty PHP z composer.json.' },
];
const doPresetu = (v: string): PresetBudowania => (v === 'npm-build' || v === 'npm-ci' || v === 'composer' ? v : '');
const NAZWA_ZMIENNEJ = /^[A-Z_][A-Z0-9_]{0,63}$/;
const MAKS_ZMIENNYCH = 50;
const MAKS_WARTOSC = 4096;

export function czasTrwania(s: number): string {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}

/** `odswiezNr` — zmiana = ponowne wczytanie (przycisk „Odśwież” zakładki; webhook dzieje się poza panelem). */
export function GitRepoPanel({ serviceId, domains, odswiezNr = 0 }: { serviceId: string; domains: string[]; odswiezNr?: number }) {
  const [domena, setDomena] = useState('');
  const d = domena || domains[0] || '';
  const [stan, setStan] = useState<GitStatus | null>(null);
  const [bladWczytania, setBladWczytania] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [galaz, setGalaz] = useState('');
  const [katalog, setKatalog] = useState('');
  const [pending, start] = useTransition();
  const [nowyWebhook, setNowyWebhook] = useState<string | null>(null);
  const [logOtwarty, setLogOtwarty] = useState<string | null>(null);

  const odswiez = useCallback(
    () =>
      d
        ? fetchGit(serviceId, d).then((r) => {
            if (r.ok) {
              setStan(r.status);
              setBladWczytania(null);
            } else setBladWczytania(r.error);
          })
        : Promise.resolve(),
    [serviceId, d],
  );
  useEffect(() => {
    void odswiez();
  }, [odswiez, odswiezNr]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 5_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);

  const op = (tryb: 'key' | 'clone' | 'pull', ok: string) =>
    start(async () => {
      const r = await gitOp(serviceId, tryb, { domain: d, dir: katalog.trim() || undefined, ...(tryb === 'clone' ? { url: url.trim(), branch: galaz.trim() || undefined } : {}) });
      if (r.ok) {
        setStan(r.status);
        toast.success(ok);
      } else toast.error(r.error);
    });

  const webhook = () =>
    start(async () => {
      const r = await createGitWebhook(serviceId, { domain: d, dir: katalog.trim() || undefined });
      if (r.ok) {
        setStan(r.status);
        setNowyWebhook(r.url);
      } else toast.error(r.error);
    });
  const usunWebhook = async (dir: string) => {
    if (!(await potwierdz('Usunąć webhook? Pushe przestaną wdrażać zmiany automatycznie.', { akcja: 'Usuń', niebezpieczne: true }))) return;
    start(async () => {
      const r = await deleteGitWebhook(serviceId, { domain: d, dir: dir || undefined });
      if (r.ok) setStan(r.status);
      else toast.error(r.error);
    });
  };

  if (!domains.length) return null;
  const zajete = pending || !stan || stan.wToku;

  return (
    <section className="mb-5 rounded-[10px] border border-line bg-card">
      <header className="border-b border-line px-4 py-3">
        <h3 className="m-0 text-[15px] font-bold text-foreground">Repozytorium strony</h3>
        <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
          Sklonuj repozytorium do katalogu strony i pobieraj zmiany jednym kliknięciem. Dla prywatnych repozytoriów dodaj klucz wdrożeniowy w GitHub/GitLab (tylko odczyt).
        </p>
      </header>
      {bladWczytania && !stan ? <p role="alert" className="m-0 my-2 rounded-[8px] border border-line px-3 py-2 text-[13px] text-crit">Nie udało się wczytać: {bladWczytania}</p> : null}
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor="git-domena" className="mb-1 block text-[13px] font-medium text-foreground">Domena</label>
          <Select id="git-domena" value={d} onChange={setDomena} options={domains.map((x) => ({ value: x, label: x }))} className="w-full" />
        </div>
        <label className="block min-w-0 text-[13px] font-medium text-foreground">
          Podkatalog w public_html (opcjonalnie)
          <input value={katalog} onChange={(e) => setKatalog(e.target.value)} placeholder="np. app" className={`mt-1 ${INPUT} font-mono`} />
        </label>
      </div>

      <div className="border-t border-line px-4 py-3">
        <span className="mb-1 block text-[13px] font-medium text-foreground">Klucz wdrożeniowy konta</span>
        {stan?.klucz ? (
          <CopyValue value={stan.klucz} />
        ) : (
          <button type="button" onClick={() => op('key', 'Tworzę klucz — pojawi się za chwilę.')} disabled={zajete} className={BTN}>
            Utwórz klucz
          </button>
        )}
      </div>

      <div className="grid gap-3 border-t border-line px-4 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="block min-w-0 text-[13px] font-medium text-foreground">
          Adres repozytorium
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="git@github.com:firma/strona.git" className={`mt-1 ${INPUT} font-mono`} />
        </label>
        <label className="block min-w-0 text-[13px] font-medium text-foreground">
          Gałąź (opcjonalnie)
          <input value={galaz} onChange={(e) => setGalaz(e.target.value)} placeholder="main" className={`mt-1 ${INPUT} font-mono`} />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => op('clone', 'Klonowanie zlecone.')} disabled={zajete || !url.trim()} className={BTN}>
            Sklonuj
          </button>
          <button type="button" onClick={() => op('pull', 'Pobieranie zmian zlecone.')} disabled={zajete} className={BTN}>
            {stan?.wToku ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Pobierz zmiany teraz
          </button>
        </div>
      </div>
      <div className="border-t border-line px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-foreground">Webhook — wdrożenie po każdym pushu</span>
          <button type="button" onClick={webhook} disabled={zajete} className={BTN}>
            {stan?.webhooki.some((w) => w.katalog === katalog.trim()) ? 'Nowy adres (stary przestanie działać)' : 'Utwórz adres webhooka'}
          </button>
        </div>
        {nowyWebhook ? (
          <div className="mt-2">
            <CopyValue value={nowyWebhook} />
            <p className="m-0 mt-1 text-[12px] text-muted-foreground">
              Skopiuj teraz — pokazujemy go tylko raz. GitHub: Settings → Webhooks → Add webhook → Payload URL, zdarzenie „push”. GitLab: Settings → Webhooks → Push events.
            </p>
          </div>
        ) : null}
        {stan?.webhooki.length ? (
          <ul className="m-0 mt-2 list-none p-0 text-[12.5px]">
            {stan.webhooki.map((w) => (
              <li key={w.katalog} className="flex flex-wrap items-center justify-between gap-2 py-1">
                <span className="text-verris-body">
                  {w.katalog ? <span className="font-mono">{w.katalog}</span> : 'public_html'} · {w.ostatnio ? `ostatnio ${new Date(w.ostatnio).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'jeszcze nie wywołany'}
                </span>
                <button type="button" onClick={() => void usunWebhook(w.katalog)} disabled={zajete} className="text-[12px] font-semibold text-crit hover:underline disabled:opacity-50">
                  Usuń
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {stan ? (
        <BudowanieIZmienne
          key={`${d}|${katalog.trim()}|${stan.konfiguracje?.find((k) => k.katalog === katalog.trim())?.zmieniono ?? ''}`}
          serviceId={serviceId}
          domena={d}
          katalog={katalog.trim()}
          stan={stan}
          zajete={zajete}
          onZapisano={setStan}
        />
      ) : null}
      <p className="m-0 border-t border-line px-4 py-2 text-[12px] text-muted-foreground">
        Jeśli katalog nie jest pusty, dotychczasowe pliki przeniesiemy obok (nazwa z dopiskiem „verris-przed-git”) — nic nie znika.
      </p>

      {stan?.operacje.length ? (
        <ul className="m-0 list-none border-t border-line p-0 text-[13px]">
          {stan.operacje.map((o) => (
            <li key={o.id} className="border-t border-line px-4 py-2 first:border-t-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={o.status === 'COMPLETED' ? 'data' : o.status === 'FAILED' ? 'warn' : 'muted'}>
                  {o.tryb === 'clone' ? 'klonowanie' : o.webhook ? 'pobranie zmian (webhook)' : 'pobranie zmian'} · {o.status === 'COMPLETED' ? 'gotowe' : o.status === 'FAILED' ? 'błąd' : 'w toku'}
                </StatusPill>
                <span className="font-mono text-[12px] text-muted-foreground">
                  {new Date(o.utworzone).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {o.katalog ? ` · ${o.katalog}` : ''}
                </span>
              </div>
              {o.head ? <p className="m-0 mt-1 font-mono text-[12px] text-verris-body">HEAD: {o.head}</p> : null}
              {o.kopia ? <p className="m-0 mt-1 text-[12px] text-muted-foreground">Poprzednie pliki: <span className="font-mono">~/{o.kopia}</span></p> : null}
              {o.budowanie || o.zmienne != null || o.trwaloS != null ? (
                <p className="m-0 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                  {o.budowanie === 'ok' ? <span data-budowanie="ok">Budowanie: gotowe</span> : null}
                  {o.budowanie === 'blad' ? <span data-budowanie="blad" className="font-semibold text-crit">Budowanie: błąd — szczegóły w logu</span> : null}
                  {o.budowanie === 'brak' ? <span data-budowanie="brak">Bez budowania</span> : null}
                  {o.zmienne != null && o.zmienne > 0 ? (
                    <span>
                      Zapisano {o.zmienne} {plForm(o.zmienne, 'zmienną', 'zmienne', 'zmiennych')} do .env
                    </span>
                  ) : null}
                  {o.trwaloS != null ? <span>Trwało {czasTrwania(o.trwaloS)}</span> : null}
                </p>
              ) : null}
              {o.blad ? <p className="m-0 mt-1 text-[12px] text-crit">{o.blad}</p> : null}
              {o.log ? (
                <div className="mt-1">
                  <button
                    type="button"
                    data-pokaz-log={o.id}
                    aria-expanded={logOtwarty === o.id}
                    onClick={() => setLogOtwarty((x) => (x === o.id ? null : o.id))}
                    className="text-[12px] font-semibold text-data hover:underline"
                  >
                    {logOtwarty === o.id ? 'Ukryj log' : 'Pokaż log'}
                  </button>
                  {logOtwarty === o.id ? (
                    <pre data-log={o.id} className="m-0 mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-[7px] border border-line bg-raised px-3 py-2 font-mono text-[11.5px] text-verris-body">
                      {o.log}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Ustawienia wdrożeń wybranego katalogu: budowanie po klonowaniu/pobraniu zmian i zmienne zapisywane do pliku .env
 * w katalogu repozytorium. Wartości zmiennych nigdy nie wracają z serwera — widać tylko nazwy. Zmiany czekają na
 * „Zapisz ustawienia” i działają od następnego wdrożenia.
 */
function BudowanieIZmienne({
  serviceId,
  domena,
  katalog,
  stan,
  zajete,
  onZapisano,
}: {
  serviceId: string;
  domena: string;
  katalog: string;
  stan: GitStatus;
  zajete: boolean;
  onZapisano: (s: GitStatus) => void;
}) {
  const konf = stan.konfiguracje?.find((k) => k.katalog === katalog) ?? null;
  const [preset, setPreset] = useState(konf?.budowanie || 'brak');
  const [ustaw, setUstaw] = useState<Record<string, string>>({});
  const [usun, setUsun] = useState<string[]>([]);
  const [nazwa, setNazwa] = useState('');
  const [wartosc, setWartosc] = useState('');
  const [pokaz, setPokaz] = useState(false);
  const [pending, start] = useTransition();

  const zapisane = (konf?.zmienne ?? []).filter((n) => !usun.includes(n));
  const nowe = Object.keys(ustaw).filter((n) => !zapisane.includes(n));
  const wszystkie = [...zapisane, ...nowe];
  const zmiany = doPresetu(preset) !== (konf?.budowanie ?? '') || Object.keys(ustaw).length > 0 || usun.length > 0;
  const opisPresetu = PRESETY.find((p) => p.value === preset)?.opis;

  const dodaj = () => {
    const n = nazwa.trim().toUpperCase();
    if (!NAZWA_ZMIENNEJ.test(n)) return toast.error('Nazwa: wielkie litery, cyfry i _, nie może zaczynać się od cyfry (np. API_KEY).');
    if (/[\r\n]/.test(wartosc)) return toast.error('Wartość nie może zawierać nowej linii.');
    if (wartosc.length > MAKS_WARTOSC) return toast.error(`Wartość może mieć najwyżej ${MAKS_WARTOSC} znaków.`);
    if (!wszystkie.includes(n) && wszystkie.length >= MAKS_ZMIENNYCH) return toast.error(`Najwyżej ${MAKS_ZMIENNYCH} zmiennych.`);
    setUstaw((u) => ({ ...u, [n]: wartosc }));
    setUsun((u) => u.filter((x) => x !== n));
    setNazwa('');
    setWartosc('');
    setPokaz(false);
  };
  const zmien = (n: string) => {
    setNazwa(n);
    setWartosc('');
  };
  const usunZmienna = async (n: string) => {
    if (!(await potwierdz(`Usunąć zmienną ${n}? Zniknie z pliku .env przy następnym wdrożeniu.`, { akcja: 'Usuń', niebezpieczne: true }))) return;
    setUstaw((u) => {
      const kopia = { ...u };
      delete kopia[n];
      return kopia;
    });
    if (konf?.zmienne.includes(n)) setUsun((u) => (u.includes(n) ? u : [...u, n]));
  };
  const zapisz = () =>
    start(async () => {
      const zm = Object.keys(ustaw).length || usun.length ? { zmienne: { ...(Object.keys(ustaw).length ? { ustaw } : {}), ...(usun.length ? { usun } : {}) } } : {};
      const r = await zapiszKonfiguracjeGit(serviceId, { domain: domena, dir: katalog || undefined, budowanie: doPresetu(preset), ...zm });
      if (r.ok) {
        toast.success('Zapisano — zadziała przy następnym wdrożeniu.');
        onZapisano(r.status);
      } else toast.error(r.error);
    });

  return (
    <div className="border-t border-line px-4 py-3" data-budowanie-i-zmienne>
      <span className="mb-1 block text-[13px] font-medium text-foreground">Budowanie i zmienne{katalog ? <span className="font-mono text-muted-foreground"> · {katalog}</span> : null}</span>
      <p className="m-0 mb-2 text-[12px] text-muted-foreground">Wykonujemy je po każdym klonowaniu i pobraniu zmian, także z webhooka.</p>
      <div className="max-w-md">
        <label htmlFor="git-budowanie" className="mb-1 block text-[12.5px] text-foreground">Po pobraniu zmian</label>
        <Select id="git-budowanie" value={preset} onChange={setPreset} options={PRESETY.map((p) => ({ value: p.value, label: p.label }))} className="w-full" disabled={zajete || pending} />
        {opisPresetu ? <p className="m-0 mt-1 text-[12px] text-muted-foreground">{opisPresetu}</p> : null}
      </div>

      <div className="mt-3">
        <span className="mb-1 block text-[12.5px] text-foreground">Zmienne środowiskowe (plik .env)</span>
        {wszystkie.length ? (
          <ul className="m-0 list-none p-0 text-[12.5px]" data-lista-zmiennych>
            {wszystkie.map((n) => (
              <li key={n} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-1.5 last:border-b-0">
                <span>
                  <span className="font-mono text-foreground">{n}</span> <span className="font-mono text-muted-foreground">= ••••••</span>
                  {n in ustaw ? <span className="ml-2 text-[11.5px] text-data">do zapisania</span> : null}
                </span>
                <span className="flex gap-3">
                  <button type="button" onClick={() => zmien(n)} disabled={zajete || pending} className="text-[12px] font-semibold text-foreground hover:underline disabled:opacity-50">
                    Zmień
                  </button>
                  <button type="button" onClick={() => void usunZmienna(n)} disabled={zajete || pending} className="text-[12px] font-semibold text-crit hover:underline disabled:opacity-50">
                    Usuń
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[12px] text-muted-foreground">Brak zmiennych.</p>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
          <label className="block min-w-0 text-[12.5px] text-foreground">
            Nazwa
            <input value={nazwa} onChange={(e) => setNazwa(e.target.value)} placeholder="API_KEY" className={`mt-1 ${INPUT} font-mono`} data-nazwa-zmiennej />
          </label>
          <label className="block min-w-0 text-[12.5px] text-foreground">
            Wartość
            <span className="mt-1 flex gap-2">
              <input
                type={pokaz ? 'text' : 'password'}
                value={wartosc}
                onChange={(e) => setWartosc(e.target.value)}
                autoComplete="off"
                className={`${INPUT} font-mono`}
                data-wartosc-zmiennej
              />
              <button type="button" onClick={() => setPokaz((x) => !x)} className={BTN} aria-pressed={pokaz}>
                {pokaz ? 'Ukryj' : 'Pokaż'}
              </button>
            </span>
          </label>
          <button type="button" onClick={dodaj} disabled={zajete || pending || !nazwa.trim()} className={BTN} data-dodaj-zmienna>
            {wszystkie.includes(nazwa.trim().toUpperCase()) ? 'Zmień wartość' : 'Dodaj'}
          </button>
        </div>
        <p className="m-0 mt-1 text-[12px] text-muted-foreground">
          Plik .env jest czytelny tylko dla Twojego konta. Jeśli .env jest w repozytorium, wdrożenie się zatrzyma — usuń go z repozytorium.
        </p>
      </div>

      <div className="mt-3">
        <button type="button" onClick={zapisz} disabled={zajete || pending || !zmiany} className={BTN} data-zapisz-konfiguracje>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Zapisz ustawienia
        </button>
      </div>
    </div>
  );
}
