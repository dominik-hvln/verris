'use client';

import { useState } from 'react';
import { Loader2, Sparkles, Undo2 } from 'lucide-react';
import { zmianAi } from '@/lib/kreator';
import { Kafelki, Komunikat, Pole, klasaPola, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from '../wspolne';

export const PODPOWIEDZI_AI = ['Krócej', 'Bardziej konkretnie', 'Dodaj sekcję FAQ', 'Zmień ton na bardziej formalny'] as const;
const MIN = 3;
const MAX = 1000;

export function PanelAi({
  nazwaSekcji,
  pozostalo,
  pracuje,
  moznaCofnac,
  onWyslij,
  onCofnij,
}: {
  /** Nazwa zaznaczonej sekcji; null = nic nie zaznaczono (zmiana całej strony). */
  nazwaSekcji: string | null;
  pozostalo: number;
  pracuje: boolean;
  moznaCofnac: boolean;
  onWyslij: (polecenie: string, calaStrona: boolean) => Promise<boolean>;
  onCofnij: () => void;
}) {
  const [polecenie, setPolecenie] = useState('');
  const [zakres, setZakres] = useState<'sekcja' | 'strona'>(nazwaSekcji ? 'sekcja' : 'strona');
  const [bladPola, setBladPola] = useState<string | null>(null);
  const efektywny = nazwaSekcji ? zakres : 'strona';
  const brakLimitu = pozostalo <= 0;

  const wyslij = async () => {
    const t = polecenie.trim();
    if (t.length < MIN) {
      setBladPola('Napisz, co zmienić – co najmniej kilka słów.');
      return;
    }
    setBladPola(null);
    if (await onWyslij(t, efektywny === 'strona')) setPolecenie('');
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-muted-foreground">
        Napisz, co zmienić – AI przepisze teksty albo układ. Każda zmiana zapisuje się jako nowa wersja w historii, więc zawsze możesz wrócić.
      </p>
      {nazwaSekcji ? (
        <Kafelki
          etykieta="Co zmieniamy?"
          wartosc={zakres}
          kolumny="grid-cols-2"
          opcje={[
            { wartosc: 'sekcja', nazwa: 'Zaznaczoną sekcję', opis: nazwaSekcji },
            { wartosc: 'strona', nazwa: 'Całą stronę', opis: 'Wszystkie podstrony' },
          ]}
          onZmiana={setZakres}
        />
      ) : (
        <p className="rounded-[8px] bg-raised px-3 py-2 text-[12.5px] text-muted-foreground">Zmiana dotyczy całej strony. Zaznacz sekcję, żeby zmienić tylko ją.</p>
      )}
      <Pole etykieta="Co zmienić?" blad={bladPola} licznik={{ ile: polecenie.length, max: MAX }}>
        {(a) => (
          <textarea
            {...a}
            className={`${klasaPola} min-h-[96px] resize-y`}
            value={polecenie}
            maxLength={MAX}
            disabled={pracuje || brakLimitu}
            placeholder="Np. dopisz, że dojeżdżamy do klienta w promieniu 30 km"
            onChange={(e) => setPolecenie(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void wyslij();
              }
            }}
          />
        )}
      </Pole>
      <div className="flex flex-wrap gap-1.5" aria-label="Podpowiedzi poleceń" role="group">
        {PODPOWIEDZI_AI.map((p) => (
          <button
            key={p}
            type="button"
            disabled={pracuje || brakLimitu}
            onClick={() => setPolecenie((x) => (x.trim() ? `${x.trim()}. ${p}` : p))}
            className="rounded-full border border-line-strong bg-card px-2.5 py-1 text-[12px] text-foreground hover:bg-raised disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={klasaPrzyciskuGlownego} onClick={() => void wyslij()} disabled={pracuje || brakLimitu}>
          {pracuje ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {pracuje ? 'AI wprowadza zmianę…' : 'Zmień z AI'}
        </button>
        {moznaCofnac ? (
          <button type="button" className={klasaPrzyciskuDrugiego} onClick={onCofnij} disabled={pracuje}>
            <Undo2 className="h-4 w-4" aria-hidden /> Cofnij zmianę AI
          </button>
        ) : null}
      </div>
      <p className="text-[12px] text-muted-foreground" aria-live="polite">
        {pracuje ? 'To potrwa do minuty – możesz w tym czasie oglądać podgląd.' : `W tym miesiącu zostało ${zmianAi(pozostalo)}.`}
      </p>
      {brakLimitu ? (
        <Komunikat rodzaj="ostrzezenie" tytul="Limit zmian AI wykorzystany">
          Odnowi się 1. dnia miesiąca. Do tego czasu zmieniaj stronę ręcznie – bez limitu.
        </Komunikat>
      ) : null}
    </div>
  );
}
