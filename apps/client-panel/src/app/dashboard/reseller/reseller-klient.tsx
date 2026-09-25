'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, KeyRound, Loader2, Pause, Play, Unlink } from 'lucide-react';
import { potwierdz } from '@/components/panel';
import { StatusPill, type Tone } from '@/components/panel/v2';
import { liczba } from '@/lib/liczba';
import {
  fetchKlient,
  linkHaslaKlienta,
  odepnijKlienta,
  wstrzymajUsluge,
  type KlientSzczegoly,
  type ResellerClient,
  type UslugaKlienta,
} from './actions';

const STATUS: Record<string, [string, Tone]> = {
  ACTIVE: ['działa', 'data'],
  SUSPENDED: ['wstrzymana', 'warn'],
  PAST_DUE: ['zaległa płatność', 'warn'],
  PENDING: ['zakładanie', 'muted'],
};
const ZDROWIE: Record<UslugaKlienta['zdrowie'], string> = {
  healthy: 'zdrowa',
  attention: 'wymaga uwagi',
  critical: 'krytyczna',
  pending: 'bez pomiaru',
};

const btn =
  'inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-xs text-foreground hover:bg-raised disabled:opacity-50';

/**
 * O-05 — wiersz klienta resellera z rozwijanymi szczegółami. Widać wyłącznie usługi i ich stan
 * (API nie zwraca salda ani danych rozliczeniowych); działania: link „ustaw hasło”,
 * wstrzymanie/wznowienie usługi, odpięcie klienta.
 */
export function KlientResellera({ klient, aktywny, onOdpiety }: { klient: ResellerClient; aktywny: boolean; onOdpiety: () => void }) {
  const [otwarty, setOtwarty] = useState(false);
  const [dane, setDane] = useState<KlientSzczegoly | null>(null);
  const [zajety, setZajety] = useState<string | null>(null);

  const przelacz = async () => {
    const nowy = !otwarty;
    setOtwarty(nowy);
    if (nowy && !dane) {
      const r = await fetchKlient(klient.id);
      if (r.ok) setDane(r.data);
      else toast.error(r.error);
    }
  };

  const wstrzymaj = async (u: UslugaKlienta) => {
    const wznow = u.status === 'SUSPENDED';
    const ok = await potwierdz(
      wznow
        ? `Wznowić usługę ${u.domena ?? u.plan ?? ''}? Klient dostanie e-mail, że usługa znów działa.`
        : `Wstrzymać usługę ${u.domena ?? u.plan ?? ''}? Strona i poczta przestaną działać do czasu wznowienia. Klient dostanie e-mail z Twoją nazwą i zobaczy baner w panelu. Odnowienie nalicza się jak zwykle.`,
      { akcja: wznow ? 'Wznów' : 'Wstrzymaj', niebezpieczne: !wznow, tytul: wznow ? 'Wznowienie usługi' : 'Wstrzymanie usługi' },
    );
    if (!ok) return;
    setZajety(u.id);
    const r = await wstrzymajUsluge(klient.id, u.id, wznow);
    setZajety(null);
    if (r.ok) {
      setDane(r.data);
      toast.success(wznow ? 'Usługa wznowiona.' : 'Usługa wstrzymana — klient dostał e-mail.');
    } else toast.error(r.error);
  };

  const link = async () => {
    setZajety('link');
    const r = await linkHaslaKlienta(klient.id);
    setZajety(null);
    if (r.ok) toast.success(r.data.mailWyslany ? `Link wysłany na ${klient.email}.` : 'Link przygotowany, ale mail nie wyszedł — napisz do nas.');
    else toast.error(r.error);
  };

  const odepnij = async () => {
    const ok = await potwierdz(
      `Odpiąć ${klient.email} od Twojego programu? Klient zostanie bezpośrednim klientem Verris — konto, usługi i dane zostają bez zmian, a on dostanie e-mail. Tej operacji nie cofniesz sam.`,
      { akcja: 'Odepnij', niebezpieczne: true, tytul: 'Odpięcie klienta' },
    );
    if (!ok) return;
    setZajety('odepnij');
    const r = await odepnijKlienta(klient.id);
    setZajety(null);
    if (r.ok) {
      toast.success('Klient odpięty.');
      onOdpiety();
    } else toast.error(r.error);
  };

  return (
    <div className="rounded-[10px] border border-line bg-card">
      <button
        type="button"
        onClick={() => void przelacz()}
        aria-expanded={otwarty}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-raised"
      >
        <span className="min-w-0">
          <span className="font-semibold text-foreground">{klient.name ?? klient.email}</span>
          <span className="ml-2 break-all text-xs text-muted-foreground">{klient.email}</span>
        </span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          {klient.services.length} {klient.services.length === 1 ? 'usługa' : 'usług'} · od {new Date(klient.createdAt).toLocaleDateString('pl-PL')}
          <ChevronDown className={`h-4 w-4 transition-transform ${otwarty ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </button>

      {otwarty ? (
        <div className="border-t border-line px-4 py-3">
          {!dane ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Wczytuję usługi…</p>
          ) : dane.uslugi.length === 0 ? (
            <p className="text-sm text-muted-foreground">Klient nie ma jeszcze usług.</p>
          ) : (
            <ul className="divide-y divide-line">
              {dane.uslugi.map((u) => {
                const [slowo, ton] = STATUS[u.status] ?? [u.status.toLowerCase(), 'muted' as Tone];
                const mozeWznowic = u.status === 'SUSPENDED' && u.wstrzymanaPrzezCiebie;
                const mozeWstrzymac = u.status === 'ACTIVE' || u.status === 'PAST_DUE';
                return (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{u.domena ?? u.plan ?? 'Usługa'}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.plan ?? '—'} · stan: {ZDROWIE[u.zdrowie]}
                        {u.odnowienie ? ` · odnowienie ${new Date(u.odnowienie).toLocaleDateString('pl-PL')}` : ''}
                        {` · ${liczba(u.cenaDetaliczna, 2)} ${u.waluta === 'PLN' ? 'K' : u.waluta} detal`}
                      </p>
                      {u.status === 'SUSPENDED' && !u.wstrzymanaPrzezCiebie ? (
                        <p className="mt-0.5 text-xs text-warn">Wstrzymana przez Verris (płatność albo decyzja obsługi) — wznawia klient albo nasza obsługa.</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill tone={ton}>{slowo}</StatusPill>
                      {aktywny && (mozeWznowic || mozeWstrzymac) ? (
                        <button type="button" className={btn} disabled={zajety !== null} onClick={() => void wstrzymaj(u)}>
                          {zajety === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mozeWznowic ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                          {mozeWznowic ? 'Wznów' : 'Wstrzymaj'}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
            {aktywny ? (
              <button type="button" className={btn} disabled={zajety !== null} onClick={() => void link()}>
                {zajety === 'link' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Wyślij link „ustaw hasło”
              </button>
            ) : null}
            <button type="button" className={btn} disabled={zajety !== null} onClick={() => void odepnij()}>
              {zajety === 'odepnij' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />} Odepnij klienta
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Widzisz tylko usługi i ich stan — bez plików, poczty, faktur i salda klienta. Jeśli masz pracować przy stronie, poproś klienta o dostęp w jego panelu (Dostęp dla współpracowników).
          </p>
        </div>
      ) : null}
    </div>
  );
}
