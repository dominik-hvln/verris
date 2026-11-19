'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import type { PozycjaListyMarek } from '@verris/kreator/klient';
import { potwierdz } from '@/components/panel/potwierdz';
import { KOMUNIKAT_PO_AKTUALIZACJI } from '@/lib/akcja';
import { adresLogo } from '@/lib/kreator-marki';
import { klasaPrzyciskuIkony } from '../kreator/klasy';
import { usunMarke } from './akcje';

const ETAPY: Record<PozycjaListyMarek['etap'], string> = {
  brief: 'Brief – bez propozycji',
  kierunki: 'Propozycje do wyboru',
  projekt: 'Marka gotowa',
};
const ZRODLA: Record<PozycjaListyMarek['zrodlo'], string> = {
  nowa: 'Nowa marka',
  odswiezenie: 'Odświeżenie logo',
  wgrane: 'Key Visual do logo',
};

/** Tekst potwierdzenia usunięcia – co znika, a co zostaje (strony z Kreatora stron mają własną kopię logo). */
export function trescUsuniecia(nazwa: string): string {
  return `Marka „${nazwa}” zniknie z konta razem z propozycjami, wgranymi plikami i materiałami. Strony, które już jej używają, zachowają obecne logo i kolory. Tego nie da się cofnąć.`;
}

/**
 * Paczka 131 – marki konta: miniatura logo (GET …/logo.svg z napisem na krzywych przez trasę panelu, <img> – bez
 * skryptów), etap, data, przejście do marki i usunięcie z potwierdzeniem (`potwierdz`, nie okno systemowe).
 */
export function ListaMarek({ marki }: { marki: PozycjaListyMarek[] }) {
  const router = useRouter();
  const [usuwana, setUsuwana] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  const usun = async (m: PozycjaListyMarek) => {
    if (!(await potwierdz(trescUsuniecia(m.nazwa), { tytul: 'Usunąć markę?', akcja: 'Usuń markę', niebezpieczne: true }))) return;
    setBlad(null);
    setUsuwana(m.id);
    try {
      const w = await usunMarke(m.id);
      if (!w.ok) setBlad(w.blad);
      else router.refresh();
    } catch {
      setBlad(KOMUNIKAT_PO_AKTUALIZACJI);
    } finally {
      setUsuwana(null);
    }
  };

  if (!marki.length) {
    return (
      <p className="rounded-[10px] border border-dashed border-line-strong bg-card px-4 py-8 text-center text-[13.5px] text-muted-foreground">
        Nie masz jeszcze marki. Wybierz jedną ze ścieżek powyżej – pierwsza marka jest w cenie hostingu.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {blad ? (
        <p role="alert" className="rounded-[8px] border border-crit/40 bg-crit/10 px-3.5 py-2.5 text-[13px] text-foreground">
          {blad}
        </p>
      ) : null}
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {marki.map((m) => (
          <li key={m.id} className="flex flex-col overflow-hidden rounded-[10px] border border-line bg-card">
            <Link href={`/dashboard/kreator-marki/${encodeURIComponent(m.id)}`} className="group flex flex-col">
              <span className="flex h-28 items-center justify-center bg-[#ffffff] px-4">
                {m.miniaturaSvg ? (
                  // eslint-disable-next-line @next/next/no-img-element -- SVG z trasy panelu (proxy API), bez optymalizacji obrazów
                  <img src={adresLogo(m.id, 'poziomy', 'kolor', m.wersja)} alt={`Logo: ${m.nazwa}`} className="max-h-16 w-auto max-w-full" loading="lazy" />
                ) : (
                  <span className="text-[13px]" style={{ color: "#4B5A53" }}>Logo pojawi się po wyborze propozycji</span>
                )}
              </span>
              <span className="flex flex-col gap-0.5 px-3.5 pb-1 pt-3">
                <span className="break-words font-display text-[15px] font-bold text-foreground group-hover:underline">{m.nazwa}</span>
                <span className="text-[12px] text-muted-foreground">
                  {ZRODLA[m.zrodlo]} · {ETAPY[m.etap]}
                </span>
              </span>
            </Link>
            <div className="mt-auto flex items-center justify-between gap-2 px-3.5 pb-2.5">
              <span className="text-[11.5px] text-muted-foreground">
                Zmieniona {new Date(m.zaktualizowano).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <button
                type="button"
                className={klasaPrzyciskuIkony}
                aria-label={`Usuń markę ${m.nazwa}`}
                disabled={usuwana !== null}
                onClick={() => void usun(m)}
              >
                {usuwana === m.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
