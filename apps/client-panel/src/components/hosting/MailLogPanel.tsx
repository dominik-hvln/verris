'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SectionHead, StatusPill } from '@/components/panel/v2';
import { fetchMailLog, loadMailLog, type MailLogStatus } from '@/app/dashboard/services/[id]/hosting-mail-log-actions';

/**
 * E-19 — „gdzie jest mój mail”: ostatnie zdarzenia serwera poczty dla domen tej usługi
 * (przyjęta, dostarczona, odrzucona z powodem, opóźniona). Wiersze jednej wiadomości obok siebie.
 */
const ZNAK: Record<MailLogStatus['wpisy'][number]['znak'], { tekst: string; ton: 'data' | 'warn' | 'muted' }> = {
  '<=': { tekst: 'przyjęta', ton: 'muted' },
  '=>': { tekst: 'dostarczona', ton: 'data' },
  '->': { tekst: 'dostarczona', ton: 'data' },
  '**': { tekst: 'odrzucona', ton: 'warn' },
  '==': { tekst: 'opóźniona', ton: 'warn' },
};
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function MailLogPanel({ serviceId }: { serviceId: string }) {
  const [stan, setStan] = useState<MailLogStatus | null>(null);
  const [adres, setAdres] = useState('');
  const [pending, start] = useTransition();

  const odswiez = useCallback(
    () =>
      fetchMailLog(serviceId).then((r) => {
        if (r.ok) setStan(r.status);
      }),
    [serviceId],
  );
  useEffect(() => {
    void odswiez();
  }, [odswiez]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 4_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);

  const pokaz = () =>
    start(async () => {
      const a = adres.trim();
      if (a && !EMAIL_RE.test(a)) {
        toast.error('Wpisz pełny adres e-mail albo zostaw pole puste.');
        return;
      }
      const r = await loadMailLog(serviceId, a || undefined);
      if (r.ok) setStan(r.status);
      else toast.error(r.error);
    });

  const wpisy = [...(stan?.wpisy ?? [])].reverse();

  return (
    <section className="mt-6">
      <SectionHead
        title="Dziennik dostarczania"
        desc={
          stan?.wczytano
            ? `Stan z ${new Date(stan.wczytano).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${stan.adres ? ` · adres ${stan.adres}` : ''}. Najnowsze na górze.`
            : 'Sprawdź, czy wiadomość przyszła albo wyszła, a jeśli nie — dlaczego. Pokazujemy tylko pocztę domen tej usługi.'
        }
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="Adres e-mail (opcjonalnie)"
          value={adres}
          onChange={(e) => setAdres(e.target.value)}
          placeholder="adres nadawcy lub odbiorcy (opcjonalnie)"
          className="w-full rounded-[7px] border border-line bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-data sm:max-w-sm"
        />
        <button
          type="button"
          onClick={pokaz}
          disabled={pending || stan?.wToku}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50"
        >
          {stan?.wToku ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {stan?.wToku ? 'Wczytuję…' : 'Pokaż'}
        </button>
      </div>
      {stan?.blad ? <p className="mb-2 text-[13px] text-crit">{stan.blad}</p> : null}
      {stan?.wczytano && !wpisy.length ? <p className="m-0 text-[13px] text-muted-foreground">Brak zdarzeń w bieżącym logu serwera poczty.</p> : null}
      {wpisy.length ? (
        <ul className="m-0 max-h-[480px] list-none overflow-y-auto rounded-[10px] border border-line bg-card p-0">
          {wpisy.map((w, i) => (
            <li key={`${w.id}-${i}`} className="border-t border-line px-4 py-2 text-[13px] first:border-t-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={ZNAK[w.znak].ton}>{ZNAK[w.znak].tekst}</StatusPill>
                <b className="break-all font-semibold text-foreground">{w.adres}</b>
                <span className="font-mono text-[12px] text-muted-foreground">{w.czas}</span>
              </div>
              {w.szczegoly ? <p className="m-0 mt-1 break-all font-mono text-[12px] text-verris-body">{w.szczegoly}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
