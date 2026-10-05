'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { potwierdz } from '@/components/panel/potwierdz';
import { liczba } from '@/lib/liczba';
import { plForm } from '@/lib/pl';
import { ukrycieWhoisAction } from '../actions';

/** Rozpoczęte lata do końca ważności (min. 1) — tak samo liczy API (`rozpoczeteLata`). */
function lataDoKonca(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 1;
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (365.25 * 24 * 3600_000)));
}

/** A-14 — ukrycie danych abonenta w WHOIS. Bez ceny w ustawieniach platformy usługa nie jest oferowana. */
export function DomainWhoisPrivacy({
  domainId, enabled, pricePerYear, expiresAt,
}: { domainId: string; enabled: boolean; pricePerYear: string | null | undefined; expiresAt?: string | null }) {
  const router = useRouter();
  const [wlaczone, setWlaczone] = useState(enabled);
  const [busy, setBusy] = useState(false);
  if (!pricePerYear && !wlaczone) return null;

  const lata = lataDoKonca(expiresAt);
  const cena = Number(pricePerYear ?? 0);
  const okres = `${lata} ${plForm(lata, 'rok', 'lata', 'lat')}`;

  const przelacz = async () => {
    const nowe = !wlaczone;
    const ok = await potwierdz(
      nowe
        ? `Z portfela pobierzemy ${liczba(cena * lata, 2)} K (${okres} do końca ważności domeny). Przy odnowieniu domeny opłata za ukrycie danych doliczy się do ceny odnowienia.`
        : 'Dane abonenta znów będą widoczne w WHOIS. Wyłączenie nie zwraca opłaty za pozostały okres.',
      { tytul: nowe ? 'Włączyć ukrycie danych w WHOIS?' : 'Wyłączyć ukrycie danych w WHOIS?', akcja: nowe ? 'Włącz i zapłać' : 'Wyłącz' },
    );
    if (!ok) return;
    setBusy(true);
    const r = await ukrycieWhoisAction(domainId, nowe);
    setBusy(false);
    if (!r.ok) return toast.error('Nie udało się zmienić ukrycia danych', { description: r.error });
    setWlaczone(nowe);
    toast.success(nowe ? 'Dane w WHOIS ukryte' : 'Ukrycie danych wyłączone');
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-6 text-sm">
      <div>
        <p className="text-white">Ukrycie danych w WHOIS: {wlaczone ? 'włączone' : 'wyłączone'}</p>
        <p className="text-neutral-500">
          {wlaczone
            ? 'W publicznym WHOIS zamiast Twoich danych widać dane zastępcze.'
            : `Twoje dane abonenta nie będą widoczne publicznie. ${liczba(cena, 2)} K za rok.`}
        </p>
        <p className="text-neutral-500">Niektóre rejestry (np. .pl) nie pozwalają ukryć danych — dane osób prywatnych i tak nie są tam publikowane.</p>
      </div>
      <button
        type="button"
        onClick={przelacz}
        disabled={busy}
        className="rounded-lg border border-white/15 px-3 py-1.5 text-white hover:bg-white/10 disabled:opacity-50"
      >
        {wlaczone ? 'Wyłącz' : 'Włącz'}
      </button>
    </div>
  );
}
