'use client';

import { useState } from 'react';
import { Firma, type Strona } from '@verris/kreator/klient';
import { FormularzPol, type KontekstFormularza } from './formularz-sekcji';
import { opiszSchemat, type PoleObiektu } from './schemat';
import { Pole, klasaPola } from '../wspolne';

/** Zalecane długości w wynikach Google (schemat dopuszcza 70 i 170 – licznik ostrzega wcześniej). */
export const ZALECANY_TYTUL = 60;
export const ZALECANY_OPIS = 160;

const POLA_FIRMY: PoleObiektu[] = (() => {
  const o = opiszSchemat(Firma as unknown as Parameters<typeof opiszSchemat>[0]);
  return o.rodzaj === 'obiekt' ? o.pola : [];
})();

/** Słowa kluczowe: tekst rozdzielony przecinkami → lista (bez pustych, bez powtórzeń, do 12 po 60 znaków). */
export function slowaZTekstu(t: string): string[] {
  return [...new Set(t.split(',').map((s) => s.trim().slice(0, 60)).filter(Boolean))].slice(0, 12);
}

export function PanelSeo({ model, podstrona, k }: { model: Strona; podstrona: number; k: KontekstFormularza }) {
  const [slowa, setSlowa] = useState(model.seo.slowaKluczowe.join(', '));
  const biezaca = model.strony[podstrona];
  const blad = (s: (string | number)[]) => k.bledy.get(s.join('.')) ?? null;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4" aria-labelledby="kr-seo">
        <h3 id="kr-seo" className="m-0 text-[13px] font-semibold text-foreground">
          Wyniki wyszukiwania (cała strona)
        </h3>
        <Pole
          etykieta="Tytuł strony"
          blad={blad(['seo', 'tytul'])}
          licznik={{ ile: model.seo.tytul.length, max: 70, zalecane: ZALECANY_TYTUL }}
          podpowiedz="Google pokazuje zwykle ok. 60 znaków. Zacznij od tego, czym się zajmujesz, i miasta."
        >
          {(a) => <input {...a} className={klasaPola} value={model.seo.tytul} maxLength={70} onChange={(e) => k.onZmiana(['seo', 'tytul'], e.target.value)} />}
        </Pole>
        <Pole
          etykieta="Opis strony"
          blad={blad(['seo', 'opis'])}
          licznik={{ ile: model.seo.opis.length, max: 170, zalecane: ZALECANY_OPIS }}
          podpowiedz="Do ok. 160 znaków – zachęta do kliknięcia w wynikach wyszukiwania."
        >
          {(a) => <textarea {...a} className={`${klasaPola} min-h-[84px] resize-y`} value={model.seo.opis} maxLength={170} onChange={(e) => k.onZmiana(['seo', 'opis'], e.target.value)} />}
        </Pole>
        <Pole etykieta="Słowa kluczowe (opcjonalnie)" podpowiedz="Rozdziel przecinkami, najwyżej 12 – np. fryzjer Poznań, koloryzacja.">
          {(a) => (
            <input
              {...a}
              className={klasaPola}
              value={slowa}
              onChange={(e) => setSlowa(e.target.value)}
              onBlur={() => {
                const lista = slowaZTekstu(slowa);
                setSlowa(lista.join(', '));
                k.onZmiana(['seo', 'slowaKluczowe'], lista);
              }}
            />
          )}
        </Pole>
      </section>

      {biezaca ? (
        <section className="flex flex-col gap-4 border-t border-line pt-5" aria-labelledby="kr-seo-podstrony">
          <h3 id="kr-seo-podstrony" className="m-0 text-[13px] font-semibold text-foreground">
            Podstrona „{biezaca.tytul}” (opcjonalnie)
          </h3>
          <Pole etykieta="Tytuł podstrony w Google" blad={blad(['strony', podstrona, 'seo', 'tytul'])} licznik={{ ile: (biezaca.seo.tytul ?? '').length, max: 70, zalecane: ZALECANY_TYTUL }} podpowiedz="Puste = tytuł podstrony i nazwa firmy.">
            {(a) => <input {...a} className={klasaPola} value={biezaca.seo.tytul ?? ''} maxLength={70} onChange={(e) => k.onZmiana(['strony', podstrona, 'seo', 'tytul'], e.target.value || undefined)} />}
          </Pole>
          <Pole etykieta="Opis podstrony w Google" blad={blad(['strony', podstrona, 'seo', 'opis'])} licznik={{ ile: (biezaca.seo.opis ?? '').length, max: 170, zalecane: ZALECANY_OPIS }}>
            {(a) => <textarea {...a} className={`${klasaPola} min-h-[72px] resize-y`} value={biezaca.seo.opis ?? ''} maxLength={170} onChange={(e) => k.onZmiana(['strony', podstrona, 'seo', 'opis'], e.target.value || undefined)} />}
          </Pole>
        </section>
      ) : null}

      <section className="flex flex-col gap-4 border-t border-line pt-5" aria-labelledby="kr-firma">
        <div>
          <h3 id="kr-firma" className="m-0 text-[13px] font-semibold text-foreground">
            Dane firmy
          </h3>
          <p className="mt-1 text-[12px] text-muted-foreground">Trafiają do stopki, kontaktu i danych dla Google. AI nigdy ich nie zgaduje – wpisz tylko prawdziwe.</p>
        </div>
        <FormularzPol pola={POLA_FIRMY} sciezka={['firma']} k={k} />
      </section>
    </div>
  );
}
