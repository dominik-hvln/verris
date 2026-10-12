'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { PROFORMA_STATUS_PL, type ProformaDto } from '@verris/contracts';
import { SectionHead } from '@/components/panel/v2';
import { plForm } from '@/lib/pl';
import { zaplacProformeAction } from './actions';

const zl = (v: string) => `${Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
const data = (iso: string) => new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
const TON: Record<ProformaDto['status'], string> = {
  WYSTAWIONA: 'bg-warn-soft text-warn',
  OPLACONA: 'bg-data-soft text-data-hi',
  ANULOWANA: 'bg-raised text-muted-foreground',
};

/**
 * K4 — proformy wystawione przez obsługę: PDF i „Zapłać” (płatność online na kwotę proformy). Link z e-maila prowadzi
 * tutaj (`?proforma=<id>#proformy`) — wskazana proforma jest wyróżniona.
 */
export function Proformy({ proformy, wskazana }: { proformy: ProformaDto[]; wskazana?: string | null }) {
  const [pending, start] = useTransition();
  const [placona, setPlacona] = useState<string | null>(null);
  const [blad, setBlad] = useState<{ id: string; tekst: string } | null>(null);
  const doZaplaty = proformy.filter((p) => p.status === 'WYSTAWIONA').length;

  const zaplac = (id: string) => {
    setBlad(null);
    setPlacona(id);
    start(async () => {
      const r = await zaplacProformeAction(id).catch(() => ({ ok: false, error: 'Nie udało się połączyć z panelem.' }));
      if (r && !r.ok) setBlad({ id, tekst: r.error ?? 'Nie udało się przygotować płatności.' });
      setPlacona(null);
    });
  };

  return (
    <section id="proformy" className="scroll-mt-24" data-proformy="">
      <SectionHead
        title="Proformy"
        desc={doZaplaty > 0 ? `${doZaplaty} ${plForm(doZaplaty, 'proforma', 'proformy', 'proform')} do zapłaty.` : 'Proformy od obsługi Verris.'}
      />
      <ul className="m-0 list-none divide-y divide-line rounded-[10px] border border-line bg-card p-0">
        {proformy.map((p) => (
          <li
            key={p.id}
            data-proforma={p.status}
            className={`flex flex-wrap items-center gap-3 px-4 py-3 ${p.id === wskazana ? 'bg-raised/60' : ''}`}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="font-mono text-sm font-semibold text-foreground">{p.numer}</b>
              <span className="text-[12.5px] text-muted-foreground">
                {p.pozycje.map((x) => x.nazwa).join(' · ')}
              </span>
              <span className="text-[12.5px] text-muted-foreground">
                wystawiona {data(p.wystawiono)}
                {p.status === 'WYSTAWIONA' ? ` · termin ${data(p.termin)}` : ''}
                {p.status === 'OPLACONA' && p.oplacono ? ` · opłacona ${data(p.oplacono)}` : ''}
                {p.faktura ? ` · dokument ${p.faktura.number}` : ''}
              </span>
              {blad?.id === p.id ? <span role="alert" className="text-[12.5px] text-crit">{blad.tekst}</span> : null}
            </span>
            <span className="font-display text-[15px] font-semibold tabular-nums">{zl(p.kwota)}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TON[p.status]}`}>{PROFORMA_STATUS_PL[p.status]}</span>
            <a
              href={`/api/billing/proformy/${p.id}/pdf`}
              className="rounded-lg border border-line bg-card px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-raised"
            >
              PDF
            </a>
            {p.status === 'WYSTAWIONA' ? (
              <button
                type="button"
                data-akcja="zaplac-proforme"
                disabled={pending}
                onClick={() => zaplac(p.id)}
                className="inline-flex items-center gap-2 rounded-[7px] border border-primary bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-data-hi disabled:cursor-not-allowed disabled:opacity-50"
              >
                {placona === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Zapłać
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
