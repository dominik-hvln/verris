'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Loader2, Play, Plus, RefreshCw, RotateCw, Square, Trash2, Package, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { SectionHead, StatusPill } from '@/components/panel/v2';
import { Select } from '@/components/panel/select';
import { potwierdz } from '@/components/panel/potwierdz';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import {
  akcjaAplikacji,
  fetchAplikacje,
  odswiezAplikacje,
  zapiszAplikacje,
  type AkcjaAplikacji,
  type AplikacjaKonta,
  type AplikacjeStatus,
  type Interpreter,
} from '@/app/dashboard/services/[id]/hosting-app-selector-actions';

const INPUT = 'w-full rounded-[7px] border border-line bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-data';
const BTN = 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[11px] py-1.5 text-[13px] font-medium text-foreground hover:bg-raised disabled:opacity-50';
const JEZYK: Record<Interpreter, string> = { nodejs: 'Node.js', python: 'Python' };
const START: Record<Interpreter, string> = { nodejs: 'app.js', python: 'passenger_wsgi.py' };

type Formularz = {
  nowa: boolean;
  interpreter: Interpreter;
  version: string;
  domain: string;
  uri: string;
  root: string;
  startup: string;
  entry: string;
  env: string;
};

const envNaTekst = (env: Record<string, string>) => Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
function tekstNaEnv(t: string): Record<string, string> | string {
  const env: Record<string, string> = {};
  for (const [i, l] of t.split('\n').entries()) {
    const linia = l.trim();
    if (!linia || linia.startsWith('#')) continue;
    const eq = linia.indexOf('=');
    const k = eq > 0 ? linia.slice(0, eq).trim() : '';
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k)) return `Linia ${i + 1}: zapisz jako NAZWA=wartość (nazwa z liter, cyfr i _).`;
    env[k] = linia.slice(eq + 1);
  }
  return Object.keys(env).length > 30 ? 'Najwyżej 30 zmiennych.' : env;
}

/**
 * B-08/B-09 — aplikacje Node.js i Python (CloudLinux Selector). Kod aplikacji leży w katalogu poza
 * public_html (nie da się go pobrać przez WWW), serwer podaje go pod wybraną domeną i ścieżką.
 */
export function AplikacjeSelektorPanel({ serviceId }: { serviceId: string }) {
  const [stan, setStan] = useState<AplikacjeStatus | null>(null);
  const [domeny, setDomeny] = useState<string[]>([]);
  const [form, setForm] = useState<Formularz | null>(null);
  const [pending, start] = useTransition();
  const odczytZlecony = useRef(false);

  const przyjmij = useCallback((r: Awaited<ReturnType<typeof fetchAplikacje>>) => {
    if (r.ok) setStan(r.status);
    else toast.error(r.error);
    return r;
  }, []);
  const odswiez = useCallback(() => fetchAplikacje(serviceId).then(przyjmij), [serviceId, przyjmij]);

  useEffect(() => {
    void odswiez().then((r) => {
      // pierwsze wejście: jeszcze nic nie odczytano z serwera — zleć odczyt raz
      if (r.ok && !r.status.odczytano && !r.status.wToku && !odczytZlecony.current) {
        odczytZlecony.current = true;
        void odswiezAplikacje(serviceId).then(przyjmij);
      }
    });
    void fetchHostingDomainsAction(serviceId)
      .then((d) => setDomeny(d.domains.map((x) => x.name)))
      .catch(() => setDomeny([]));
  }, [serviceId, odswiez, przyjmij]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 5_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);

  const zajete = pending || !stan || stan.wToku;

  const akcja = async (a: AplikacjaKonta, co: AkcjaAplikacji) => {
    if (co === 'destroy' && !(await potwierdz(`Usunąć aplikację ${a.root}? Serwer przestanie ją uruchamiać; pliki w katalogu ${a.root} zostają.`, { akcja: 'Usuń' }))) return;
    start(async () => {
      const r = przyjmij(await akcjaAplikacji(serviceId, a.interpreter, a.root, co));
      if (r.ok) toast.success('Zlecone — wynik pojawi się za chwilę.');
    });
  };

  const nowa = (interpreter: Interpreter = 'nodejs'): Formularz => ({
    nowa: true,
    interpreter,
    version: stan?.wersje[interpreter][0] ?? '',
    domain: domeny[0] ?? '',
    uri: '',
    root: 'apps/moja-aplikacja',
    startup: START[interpreter],
    entry: interpreter === 'python' ? 'application' : '',
    env: '',
  });

  const zapisz = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const env = tekstNaEnv(form.env);
    if (typeof env === 'string') return void toast.error(env);
    start(async () => {
      const r = przyjmij(
        await zapiszAplikacje(
          serviceId,
          { interpreter: form.interpreter, root: form.root, domain: form.domain, uri: form.uri, version: form.version, startup: form.startup, entry: form.entry, env },
          form.nowa,
        ),
      );
      if (r.ok) {
        toast.success(form.nowa ? 'Tworzenie aplikacji zlecone.' : 'Zmiana ustawień zlecona.');
        setForm(null);
      }
    });
  };

  const ustaw = (z: Partial<Formularz>) => setForm((f) => (f ? { ...f, ...z } : f));
  const apps = stan?.aplikacje ?? [];

  return (
    <section className="mt-8">
      <SectionHead
        title="Aplikacje Node.js i Python"
        desc="Własna aplikacja (np. Express, Next.js, Django, Flask) pod wybraną domeną. Kod trzymasz w katalogu poza public_html — wgrasz go menedżerem plików, FTP albo z Gita."
        action={
          <div className="flex gap-2">
            <button type="button" className={BTN} disabled={zajete} onClick={() => start(async () => void przyjmij(await odswiezAplikacje(serviceId)))}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Odśwież
            </button>
            <button type="button" className={BTN} disabled={zajete || Boolean(form)} onClick={() => setForm(nowa())}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Nowa aplikacja
            </button>
          </div>
        }
      />
      <div className="rounded-[10px] border border-line bg-card">
        {stan?.wToku ? (
          <p className="m-0 flex items-center gap-2 border-b border-line px-4 py-2 text-[13px] text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Serwer wykonuje operację…
          </p>
        ) : null}
        {stan?.blad ? <p role="alert" className="m-0 border-b border-line px-4 py-2 text-[13px] text-crit">{stan.blad}</p> : null}

        {form ? (
          <form onSubmit={zapisz} className="grid gap-3 border-b border-line px-4 py-4 sm:grid-cols-2">
            <div className="text-[13px] font-medium text-foreground">
              <label htmlFor="app-jezyk">Język</label>
              <Select
                id="app-jezyk"
                value={form.interpreter}
                disabled={!form.nowa}
                options={[{ value: 'nodejs', label: 'Node.js' }, { value: 'python', label: 'Python' }]}
                onChange={(v) => setForm({ ...nowa(v as Interpreter), root: form.root, domain: form.domain, uri: form.uri, env: form.env })}
              />
            </div>
            <div className="text-[13px] font-medium text-foreground">
              <label htmlFor="app-wersja">Wersja</label>
              <Select
                id="app-wersja"
                value={form.version}
                options={(stan?.wersje[form.interpreter] ?? []).map((v) => ({ value: v, label: `${JEZYK[form.interpreter]} ${v}` }))}
                onChange={(v) => ustaw({ version: v })}
                placeholder="Brak dostępnych wersji"
              />
            </div>
            <div className="text-[13px] font-medium text-foreground">
              <label htmlFor="app-domena">Domena</label>
              <Select id="app-domena" value={form.domain} disabled={!form.nowa} options={domeny.map((d) => ({ value: d, label: d }))} onChange={(v) => ustaw({ domain: v })} />
            </div>
            <label className="block text-[13px] font-medium text-foreground">
              Ścieżka pod domeną <span className="font-normal text-muted-foreground">(puste = cała domena)</span>
              <input value={form.uri} disabled={!form.nowa} onChange={(e) => ustaw({ uri: e.target.value })} maxLength={200} placeholder="np. api" className={`mt-1 ${INPUT} font-mono`} />
            </label>
            <label className="block text-[13px] font-medium text-foreground">
              Katalog aplikacji <span className="font-normal text-muted-foreground">(w katalogu domowym)</span>
              <input value={form.root} disabled={!form.nowa} onChange={(e) => ustaw({ root: e.target.value })} maxLength={200} className={`mt-1 ${INPUT} font-mono`} />
            </label>
            <label className="block text-[13px] font-medium text-foreground">
              Plik startowy
              <input value={form.startup} onChange={(e) => ustaw({ startup: e.target.value })} maxLength={200} className={`mt-1 ${INPUT} font-mono`} />
            </label>
            {form.interpreter === 'python' ? (
              <label className="block text-[13px] font-medium text-foreground">
                Obiekt aplikacji WSGI
                <input value={form.entry} disabled={!form.nowa} onChange={(e) => ustaw({ entry: e.target.value })} maxLength={64} className={`mt-1 ${INPUT} font-mono`} />
              </label>
            ) : null}
            <label className="block text-[13px] font-medium text-foreground sm:col-span-2">
              Zmienne środowiskowe <span className="font-normal text-muted-foreground">(NAZWA=wartość, jedna na linię)</span>
              <textarea value={form.env} onChange={(e) => ustaw({ env: e.target.value })} rows={4} placeholder={'NODE_ENV=production\nDB_HOST=localhost'} className={`mt-1 ${INPUT} font-mono`} />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className={BTN} disabled={zajete || !form.version || !form.domain}>
                {form.nowa ? 'Utwórz aplikację' : 'Zapisz zmiany'}
              </button>
              <button type="button" className={BTN} onClick={() => setForm(null)}>Anuluj</button>
            </div>
          </form>
        ) : null}

        {stan && stan.aplikacje === null && !stan.wToku ? (
          <p className="m-0 px-4 py-3 text-[13px] text-muted-foreground">Nie odczytano jeszcze aplikacji z serwera — kliknij „Odśwież”.</p>
        ) : apps.length === 0 && stan?.aplikacje ? (
          <p className="m-0 px-4 py-3 text-[13px] text-muted-foreground">Nie masz jeszcze aplikacji Node.js ani Python.</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-line p-0">
            {apps.map((a) => (
              <li key={`${a.interpreter}:${a.root}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-foreground">{JEZYK[a.interpreter]} {a.version}</span>
                    <StatusPill tone={a.status === 'started' ? 'data' : 'muted'}>{a.status === 'started' ? 'działa' : 'zatrzymana'}</StatusPill>
                  </div>
                  <p className="m-0 mt-0.5 break-all text-[12.5px] text-muted-foreground">
                    <a href={`https://${a.domain}/${a.uri}`} target="_blank" rel="noopener noreferrer" className="text-data-hi underline">{a.domain}/{a.uri}</a>
                    {' · '}katalog <span className="font-mono">{a.root}</span> · start <span className="font-mono">{a.startup}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {a.status === 'started' ? (
                    <button type="button" className={BTN} disabled={zajete} onClick={() => void akcja(a, 'stop')} aria-label={`Zatrzymaj ${a.root}`}>
                      <Square className="h-3.5 w-3.5" aria-hidden /> Zatrzymaj
                    </button>
                  ) : (
                    <button type="button" className={BTN} disabled={zajete} onClick={() => void akcja(a, 'start')} aria-label={`Uruchom ${a.root}`}>
                      <Play className="h-3.5 w-3.5" aria-hidden /> Uruchom
                    </button>
                  )}
                  <button type="button" className={BTN} disabled={zajete} onClick={() => void akcja(a, 'restart')} aria-label={`Restartuj ${a.root}`}>
                    <RotateCw className="h-3.5 w-3.5" aria-hidden /> Restart
                  </button>
                  <button type="button" className={BTN} disabled={zajete} onClick={() => void akcja(a, 'install')} aria-label={`Zainstaluj zależności ${a.root}`} title={a.interpreter === 'nodejs' ? 'npm install z package.json' : 'pip install -r requirements.txt'}>
                    <Package className="h-3.5 w-3.5" aria-hidden /> Zależności
                  </button>
                  <button
                    type="button"
                    className={BTN}
                    disabled={zajete || Boolean(form)}
                    aria-label={`Edytuj ${a.root}`}
                    onClick={() => setForm({ nowa: false, interpreter: a.interpreter, version: a.version, domain: a.domain, uri: a.uri, root: a.root, startup: a.startup, entry: a.entry, env: envNaTekst(a.env) })}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Edytuj
                  </button>
                  <button type="button" className={BTN} disabled={zajete} onClick={() => void akcja(a, 'destroy')} aria-label={`Usuń ${a.root}`}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Usuń
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
