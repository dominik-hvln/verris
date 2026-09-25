'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Select } from '@/components/panel/select';
import { renewDomainAction, renewQuoteAction } from '../actions';
import { liczba } from '@/lib/liczba';

/** A-10 — odnowienie domeny z panelu: wybór okresu, cena, potwierdzenie (obciąża portfel). */
export function DomainRenewBox({ domainId, expiresAt }: { domainId: string; expiresAt: string }) {
  const router = useRouter();
  const [years, setYears] = useState(1);
  const [quote, setQuote] = useState<{ priceAmount: string; currency: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    const r = await renewQuoteAction(domainId, years);
    setBusy(false);
    if (!r.ok) return toast.error('Nie udało się pobrać ceny', { description: r.error });
    setQuote({ priceAmount: r.priceAmount, currency: r.currency });
  };

  const renew = async () => {
    if (!quote) return;
    setBusy(true);
    const r = await renewDomainAction(domainId, years);
    setBusy(false);
    if (!r.ok) return toast.error('Odnowienie nie powiodło się', { description: r.error });
    toast.success('Domena odnowiona');
    setQuote(null);
    router.refresh();
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm">
      <h2 className="text-lg font-semibold text-white">Odnowienie domeny</h2>
      <p className="mt-1 text-neutral-400">
        Ważna do <span className="text-white">{new Date(expiresAt).toLocaleDateString('pl-PL')}</span>. Odnowienie
        przedłuża ją o wybrany okres, a opłata schodzi z portfela.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-neutral-300">
          <label htmlFor="renew-years">Okres</label>
          <Select
            id="renew-years"
            value={String(years)}
            onChange={(v) => {
              setYears(Number(v));
              setQuote(null);
            }}
            disabled={busy}
            className="w-28"
            options={[1, 2, 3, 5].map((y) => ({ value: String(y), label: `${y} ${y === 1 ? 'rok' : y < 5 ? 'lata' : 'lat'}` }))}
          />
        </div>
        {!quote ? (
          <button type="button" onClick={check} disabled={busy} className="rounded-lg border border-white/15 px-3 py-1.5 text-white hover:bg-white/10 disabled:opacity-50">
            Sprawdź cenę
          </button>
        ) : (
          <button type="button" onClick={renew} disabled={busy} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-black hover:bg-neutral-200 disabled:opacity-50">
            Odnów za {liczba(Number(quote.priceAmount), 2)} {quote.currency === 'PLN' ? 'K' : quote.currency}
          </button>
        )}
      </div>
    </div>
  );
}
