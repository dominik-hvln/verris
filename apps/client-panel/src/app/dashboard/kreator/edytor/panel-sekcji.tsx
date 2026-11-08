'use client';

import { useId } from 'react';
import { MousePointerClick } from 'lucide-react';
import { KATALOG_WARIANTOW, SEKCJE_PRO, TLA_SEKCJI, type Sekcja } from '@verris/kreator/klient';
import { Select } from '@/components/panel/select';
import { FormularzPol, type KontekstFormularza } from './formularz-sekcji';
import { NAZWY_SEKCJI, OPISY_SEKCJI, polaSekcji, type Sciezka } from './schemat';
import { Kafelki, Komunikat, Pole, klasaPola } from '../wspolne';

const NAZWY_TLA: Record<(typeof TLA_SEKCJI)[number], string> = {
  domyslne: 'Tło strony',
  powierzchnia: 'Jasna powierzchnia',
  ciemne: 'Ciemne',
  akcent: 'Kolor akcentu',
};

/** Czytelna nazwa wariantu z identyfikatora („hero-podzielony” → „Podzielony”). */
export function nazwaWariantu(id: string): string {
  const reszta = id.replace(/^[a-z]+-/, '').replace(/-/g, ' ');
  return reszta.charAt(0).toUpperCase() + reszta.slice(1);
}

export function PanelSekcji({
  sekcja,
  sciezka,
  k,
  funkcjePro,
  onWybranoPro,
}: {
  sekcja: Sekcja | null;
  sciezka: Sciezka;
  k: KontekstFormularza;
  funkcjePro: boolean;
  /** Wybrano element Pro w wersji bez Pro – edytor włącza podgląd funkcji Pro. */
  onWybranoPro: () => void;
}) {
  const idTla = useId();
  if (!sekcja) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-muted-foreground">
        <MousePointerClick className="h-6 w-6" aria-hidden />
        Zaznacz sekcję na liście albo kliknij ją w podglądzie, żeby zmienić teksty i układ.
      </div>
    );
  }
  const warianty = KATALOG_WARIANTOW[sekcja.typ] ?? [];
  const typPro = SEKCJE_PRO.includes(sekcja.typ);
  const wybrany = warianty.find((w) => w.id === sekcja.wariant);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="m-0 font-display text-[16px] font-bold text-foreground">{NAZWY_SEKCJI[sekcja.typ]}</h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground">{OPISY_SEKCJI[sekcja.typ]}</p>
      </div>
      {typPro && !funkcjePro ? (
        <Komunikat rodzaj="ostrzezenie" tytul="Sekcja Kreatora Pro">
          Widzisz ją w podglądzie z oznaczeniem „Pro”. Bez Kreatora Pro nie trafi na opublikowaną stronę.
        </Komunikat>
      ) : null}
      {sekcja.typ === 'opinie' && Array.isArray((sekcja.dane as { wpisy?: unknown[] }).wpisy) && !(sekcja.dane as { wpisy: unknown[] }).wpisy.length ? (
        <Komunikat rodzaj="info" tytul="Opinie wpisujesz Ty">
          AI nie pisze opinii za klientów. Wklej prawdziwe opinie poniżej – pusta sekcja nie pokaże się na stronie.
        </Komunikat>
      ) : null}

      <Kafelki
        etykieta="Układ sekcji"
        wartosc={sekcja.wariant}
        kolumny="grid-cols-1"
        proZablokowane={!funkcjePro}
        opcje={warianty.map((w) => ({
          wartosc: w.id,
          nazwa: nazwaWariantu(w.id),
          opis: w.pro && !funkcjePro && w.zastepczy ? `${w.opis}. Bez Pro na stronie: „${nazwaWariantu(w.zastepczy)}”.` : w.opis,
          pro: !!w.pro,
        }))}
        onZmiana={(id) => {
          k.onZmiana([...sciezka, 'wariant'], id);
          if (!funkcjePro && warianty.find((w) => w.id === id)?.pro) onWybranoPro();
        }}
      />
      {wybrany?.pro && !funkcjePro ? <p className="-mt-3 text-[12px] text-warn">Ten układ zobaczysz w podglądzie z oznaczeniem „Pro”.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idTla} className="text-[13px] font-medium text-foreground">
            Tło sekcji
          </label>
          <Select id={idTla} value={sekcja.tlo} onChange={(v) => k.onZmiana([...sciezka, 'tlo'], v)} options={TLA_SEKCJI.map((t) => ({ value: t, label: NAZWY_TLA[t] }))} />
        </div>
        <Pole etykieta="Nazwa w menu (opcjonalnie)" podpowiedz="Puste = sekcji nie ma w menu." blad={k.bledy.get([...sciezka, 'wMenu'].join('.'))}>
          {(a) => (
            <input {...a} data-sciezka={[...sciezka, 'wMenu'].join('.')} className={klasaPola} value={sekcja.wMenu ?? ''} maxLength={30} onChange={(e) => k.onZmiana([...sciezka, 'wMenu'], e.target.value || undefined)} />
          )}
        </Pole>
      </div>

      <div className="border-t border-line pt-4">
        <FormularzPol pola={polaSekcji(sekcja.typ)} sciezka={[...sciezka, 'dane']} k={k} />
      </div>
    </div>
  );
}
