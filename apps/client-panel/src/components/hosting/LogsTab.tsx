'use client';

import { useEffect, useId, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { HostingDomainsResponseDto, HostingLogDto } from '@verris/contracts';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import { fetchHostingLogAction } from '@/app/dashboard/services/[id]/hosting-logs-action';
import { HostingTabShell } from '@/components/hosting/HostingTabShell';
import { Select } from '@/components/panel/select';
import { HOSTING_FETCH_UNAVAILABLE, hostingFetchErrorMessage } from '@/lib/client-hosting-messages';

const komunikat = (e: unknown) => hostingFetchErrorMessage(e instanceof Error ? e.message : String(e)) ?? HOSTING_FETCH_UNAVAILABLE;

type Rodzaj = 'access' | 'error';
const RODZAJE: { id: Rodzaj; label: string; opis: string }[] = [
  { id: 'access', label: 'Dostęp', opis: 'Kto i kiedy otwierał Twoją stronę (adres IP, adres strony, kod odpowiedzi).' },
  { id: 'error', label: 'Błędy', opis: 'Błędy serwera WWW i PHP — tu zwykle widać przyczynę „białej strony” lub błędu 500.' },
];
const ILE = [100, 500, 1000] as const;

/**
 * K-04/K-05 — logi WWW domeny: dostęp i błędy. Najnowsze wpisy na górze, bez przewijania
 * w bok (długie linie się zawijają). Awaria odczytu to komunikat, nie pusta lista.
 */
export default function LogsTab({ serviceId }: { serviceId: string }) {
  const idDomena = useId();
  const idIle = useId();
  const [domeny, setDomeny] = useState<HostingDomainsResponseDto | null>(null);
  const [domena, setDomena] = useState('');
  const [rodzaj, setRodzaj] = useState<Rodzaj>('error');
  const [ile, setIle] = useState<number>(100);
  const [log, setLog] = useState<HostingLogDto | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [laduje, setLaduje] = useState(true);

  useEffect(() => {
    fetchHostingDomainsAction(serviceId)
      .then((d) => {
        setDomeny(d);
        setDomena(d.primaryDomain ?? d.domains[0]?.name ?? '');
      })
      .catch((e) => setBlad(komunikat(e)));
  }, [serviceId]);

  // `.then` zamiast `await` — lint React Compilera nie widzi `await` i zgłasza fałszywy setState w efekcie.
  useEffect(() => {
    if (!domeny) return;
    fetchHostingLogAction(serviceId, { type: rodzaj, domain: domena || undefined, lines: ile })
      .then((l) => {
        setLog(l);
        setBlad(null);
      })
      .catch((e) => setBlad(komunikat(e)))
      .finally(() => setLaduje(false));
  }, [serviceId, domeny, domena, rodzaj, ile]);

  const odswiez = () => {
    setLaduje(true);
    fetchHostingLogAction(serviceId, { type: rodzaj, domain: domena || undefined, lines: ile })
      .then((l) => {
        setLog(l);
        setBlad(null);
      })
      .catch((e) => setBlad(komunikat(e)))
      .finally(() => setLaduje(false));
  };

  const zmien = (f: () => void) => {
    setLaduje(true);
    f();
  };

  const linie = log ? [...log.lines].reverse() : [];

  // K-06 — pobranie tego, co widać (do 1000 ostatnich linii), w kolejności chronologicznej.
  const pobierz = () => {
    if (!log?.lines.length) return;
    const url = URL.createObjectURL(new Blob([log.lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${domena || 'konto'}-${rodzaj}-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const opis = RODZAJE.find((r) => r.id === rodzaj)?.opis;

  return (
    <HostingTabShell
      title="Logi WWW"
      description={opis}
      help={{ blurb: 'Log błędów to pierwsze miejsce, do którego warto zajrzeć, gdy strona nie działa.', kbQuery: 'logi błędów' }}
      actions={
        <div className="flex gap-2">
        <button
          type="button"
          onClick={pobierz}
          disabled={laduje || !log?.lines.length}
          className="inline-flex items-center justify-center gap-2 rounded-[7px] border border-line px-3 py-2 text-sm font-semibold text-foreground hover:bg-raised disabled:opacity-50"
        >
          Pobierz
        </button>
        <button
          type="button"
          onClick={odswiez}
          disabled={laduje || !domeny}
          className="inline-flex items-center justify-center gap-2 rounded-[7px] border border-line px-3 py-2 text-sm font-semibold text-foreground hover:bg-raised disabled:opacity-50"
        >
          {laduje ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Odśwież
        </button>
        </div>
      }
    >
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div role="group" aria-label="Rodzaj logu" className="inline-flex rounded-[7px] border border-line p-0.5">
          {RODZAJE.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={rodzaj === r.id}
              onClick={() => zmien(() => setRodzaj(r.id))}
              className={`rounded-[5px] px-3 py-1.5 text-sm ${rodzaj === r.id ? 'bg-raised font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {domeny && domeny.domains.length > 1 ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={idDomena} className="text-[12.5px] text-muted-foreground">Domena</label>
            <Select
              id={idDomena}
              value={domena}
              onChange={(v) => zmien(() => setDomena(v))}
              options={domeny.domains.map((d) => ({ value: d.name, label: d.name }))}
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor={idIle} className="text-[12.5px] text-muted-foreground">Ostatnie wpisy</label>
          <Select
            id={idIle}
            value={String(ile)}
            onChange={(v) => zmien(() => setIle(Number(v)))}
            options={ILE.map((n) => ({ value: String(n), label: String(n) }))}
          />
        </div>
      </div>

      {blad || log?.fetchError ? (
        <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-3 text-sm text-warn">
          Nie udało się odczytać logu{log?.domain ? ` domeny ${log.domain}` : ''}: {blad ?? hostingFetchErrorMessage(log?.fetchError)}
        </p>
      ) : laduje && !log ? (
        <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-3 text-sm text-muted-foreground">Wczytywanie logu…</p>
      ) : log && !log.domain ? (
        <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-3 text-sm text-muted-foreground">Konto nie ma jeszcze domeny.</p>
      ) : linie.length === 0 ? (
        <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-3 text-sm text-muted-foreground">
          {rodzaj === 'error' ? 'Brak wpisów w logu błędów — serwer nie zgłosił problemów.' : 'Brak wpisów — nikt jeszcze nie otwierał strony.'}
        </p>
      ) : (
        <>
          <p className="mb-2 font-mono text-[11.5px] text-muted-foreground">
            {log?.domain} · {linie.length} {linie.length === 1 ? 'wpis' : 'wpisów'}, najnowsze na górze
            {log?.truncated ? ' · starsze pominięte' : ''}
          </p>
          <pre
             
            tabIndex={0}
            aria-label={`Log ${rodzaj === 'error' ? 'błędów' : 'dostępu'} ${log?.domain ?? ''}`}
            className="m-0 max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-all rounded-[10px] border border-line bg-card p-3 font-mono text-[12px] leading-relaxed text-foreground"
          >
            {linie.join('\n')}
          </pre>
        </>
      )}
    </HostingTabShell>
  );
}
