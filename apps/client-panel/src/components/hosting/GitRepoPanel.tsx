'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Select } from '@/components/panel/select';
import { CopyValue, StatusPill } from '@/components/panel/v2';
import { potwierdz } from '@/components/panel/potwierdz';
import { createGitWebhook, deleteGitWebhook, fetchGit, gitOp, type GitStatus } from '@/app/dashboard/services/[id]/hosting-git-actions';

/**
 * C-25/C-26 — repozytorium strony z panelu: klucz wdrożeniowy (do dodania w GitHub/GitLab),
 * klonowanie do katalogu strony i „Pobierz zmiany teraz”. Harmonogram jest niżej (cron git pull).
 */
const INPUT = 'w-full rounded-[7px] border border-line bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-data';
const BTN = 'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';

export function GitRepoPanel({ serviceId, domains }: { serviceId: string; domains: string[] }) {
  const [domena, setDomena] = useState('');
  const d = domena || domains[0] || '';
  const [stan, setStan] = useState<GitStatus | null>(null);
  const [bladWczytania, setBladWczytania] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [galaz, setGalaz] = useState('');
  const [katalog, setKatalog] = useState('');
  const [pending, start] = useTransition();
  const [nowyWebhook, setNowyWebhook] = useState<string | null>(null);

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
  }, [odswiez]);
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
          <span className="mb-1 block text-[13px] font-medium text-foreground">Domena</span>
          <Select aria-label="Domena" value={d} onChange={setDomena} options={domains.map((x) => ({ value: x, label: x }))} className="w-full" />
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
              {o.blad ? <p className="m-0 mt-1 text-[12px] text-crit">{o.blad}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
