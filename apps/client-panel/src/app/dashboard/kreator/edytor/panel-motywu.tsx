'use client';

import { useId } from 'react';
import { AlertTriangle, Wand2 } from 'lucide-react';
import {
  KATALOG_EFEKTOW,
  KATALOG_FONTOW,
  KATALOG_STYLOW,
  kontrast,
  korygujPalete,
  MIN_KONTRAST_AA,
  PARY_KONTRASTU,
  EFEKTY_ZAWSZE,
  type Motyw,
  type Paleta,
  type Strona,
} from '@verris/kreator/klient';
import { Select } from '@/components/panel/select';
import { Switch } from '@/components/panel/v2';
import { Kafelki, Komunikat, klasaPrzyciskuDrugiego, ZnakPro } from '../wspolne';

export const NAZWY_KOLOROW: Record<keyof Paleta, string> = {
  tlo: 'Tło strony',
  powierzchnia: 'Powierzchnia (karty, pasy)',
  tekst: 'Tekst',
  tekstPrzygaszony: 'Tekst przygaszony',
  akcent: 'Akcent (przyciski)',
  naAkcencie: 'Tekst na akcencie',
  akcentTekst: 'Akcent w tekście (linki)',
  linia: 'Linie podziału',
  ciemne: 'Ciemne tło',
  naCiemnym: 'Tekst na ciemnym tle',
};

/** Pary kolorów poniżej WCAG AA (4,5:1) jako zdania dla klienta. */
export function ostrzezeniaKontrastu(p: Paleta): string[] {
  const wynik: string[] = [];
  for (const { tekst, tla } of PARY_KONTRASTU) {
    for (const t of tla) {
      const k = kontrast(p[tekst], p[t]);
      if (k < MIN_KONTRAST_AA) {
        wynik.push(`${NAZWY_KOLOROW[tekst]} na „${NAZWY_KOLOROW[t].toLocaleLowerCase('pl-PL')}”: ${k.toFixed(1).replace('.', ',')}:1 (potrzeba ${String(MIN_KONTRAST_AA).replace('.', ',')}:1)`);
      }
    }
  }
  return wynik;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function PoleKoloru({ klucz, wartosc, onZmiana }: { klucz: keyof Paleta; wartosc: string; onZmiana: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`${NAZWY_KOLOROW[klucz]} – próbnik`}
        value={HEX.test(wartosc) ? wartosc.toLowerCase() : '#000000'}
        onChange={(e) => onZmiana(e.target.value.toUpperCase())}
        className="h-8 w-9 flex-none cursor-pointer rounded-[6px] border border-line-strong bg-transparent p-0.5"
      />
      <label htmlFor={id} className="min-w-0 flex-1 text-[12.5px] text-foreground">
        {NAZWY_KOLOROW[klucz]}
      </label>
      <input
        id={id}
        className="w-[92px] flex-none rounded-[7px] border border-line-strong bg-background px-2 py-1 font-mono text-[12px] uppercase text-foreground outline-none focus:border-data aria-[invalid=true]:border-crit"
        value={wartosc}
        maxLength={7}
        aria-invalid={!HEX.test(wartosc)}
        onChange={(e) => onZmiana(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)}
      />
    </div>
  );
}

export function PanelMotywu({
  model,
  funkcjePro,
  onMotyw,
  onZnak,
  onWybranoPro,
}: {
  model: Strona;
  funkcjePro: boolean;
  onMotyw: (fn: (m: Motyw) => Motyw) => void;
  onZnak: (z: Strona['stopka']['znakKreatora']) => void;
  onWybranoPro: () => void;
}) {
  const motyw = model.motyw;
  const idStylu = useId();
  const idNagl = useId();
  const idTekstu = useId();
  const ostrzezenia = ostrzezeniaKontrastu(motyw.paleta);
  const opcjeFontow = KATALOG_FONTOW.map((f) => ({ value: f.rodzina, label: `${f.rodzina} · ${f.kategoria}` }));
  const kategoria = (r: string) => (KATALOG_FONTOW.find((f) => f.rodzina === r)?.kategoria === 'szeryfowy' ? 'serif' : 'sans-serif');
  const styl = KATALOG_STYLOW.find((s) => s.id === motyw.styl);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <label htmlFor={idStylu} className="text-[13px] font-medium text-foreground">
          Styl projektu
        </label>
        <Select
          id={idStylu}
          value={motyw.styl}
          options={KATALOG_STYLOW.map((s) => ({ value: s.id, label: s.pro && !funkcjePro ? `${s.nazwa} (Pro)` : s.nazwa }))}
          onChange={(id) => {
            const s = KATALOG_STYLOW.find((x) => x.id === id);
            if (!s) return;
            // Styl ustawia fonty, zaokrąglenia i rytm; kolory i treść zostają.
            onMotyw((m) => ({
              ...m,
              styl: s.id,
              fonty: { ...m.fonty, naglowki: s.pary[0]!.naglowki, tekst: s.pary[0]!.tekst },
              zaokraglenie: s.zaokraglenie,
              gestosc: s.gestosc,
              skalaTypografii: s.skalaTypografii,
              animacje: !funkcjePro && s.animacje === 'wyraziste' ? 'subtelne' : s.animacje,
            }));
            if (s.pro && !funkcjePro) onWybranoPro();
          }}
        />
        {styl ? <p className="text-[12px] leading-snug text-muted-foreground">{styl.opis}</p> : null}
        {styl?.pro && !funkcjePro ? <p className="text-[12px] text-warn">Styl Kreatora Pro – bez Pro na stronie zamieni się na najbliższy styl darmowy.</p> : null}
        <p className="text-[12px] text-muted-foreground">Zmiana stylu ustawia fonty, zaokrąglenia i rytm. Kolory i treść zostają.</p>
      </section>

      <section className="flex flex-col gap-2.5" aria-labelledby={`${idStylu}-kolory`}>
        <h3 id={`${idStylu}-kolory`} className="m-0 text-[13px] font-medium text-foreground">
          Kolory
        </h3>
        <div className="flex h-8 overflow-hidden rounded-[6px] border border-line" aria-hidden>
          {(['tlo', 'powierzchnia', 'akcent', 'akcentTekst', 'tekst', 'ciemne'] as const).map((k) => (
            <span key={k} className="flex-1" style={{ background: motyw.paleta[k] }} />
          ))}
        </div>
        {(Object.keys(NAZWY_KOLOROW) as (keyof Paleta)[]).map((k) => (
          <PoleKoloru key={k} klucz={k} wartosc={motyw.paleta[k]} onZmiana={(v) => onMotyw((m) => ({ ...m, paleta: { ...m.paleta, [k]: v } }))} />
        ))}
        {ostrzezenia.length ? (
          <Komunikat rodzaj="ostrzezenie" tytul={<span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Za mały kontrast</span>}>
            <ul className="m-0 list-disc pl-4">
              {ostrzezenia.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
            <p className="mt-1.5">Na stronie tekst zostanie automatycznie przyciemniony albo rozjaśniony. Możesz to poprawić od razu:</p>
            <button type="button" className={`${klasaPrzyciskuDrugiego} mt-2`} onClick={() => onMotyw((m) => ({ ...m, paleta: korygujPalete(m.paleta).paleta }))}>
              <Wand2 className="h-3.5 w-3.5" aria-hidden /> Popraw kontrast
            </button>
          </Komunikat>
        ) : (
          <p className="text-[12px] text-data-hi">Kontrast tekstu spełnia WCAG AA.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="m-0 text-[13px] font-medium text-foreground">Fonty</h3>
        {(
          [
            ['naglowki', idNagl, 'Nagłówki', 'Zażółć gęślą jaźń'],
            ['tekst', idTekstu, 'Tekst', 'Pchnąć w tę łódź jeża lub ośm skrzyń fig.'],
          ] as const
        ).map(([klucz, id, nazwa, probka]) => (
          <div key={klucz} className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-[12.5px] text-foreground">
              {nazwa}
            </label>
            <Select id={id} value={motyw.fonty[klucz]} options={opcjeFontow} onChange={(v) => onMotyw((m) => ({ ...m, fonty: { ...m.fonty, [klucz]: v } }))} />
            <p
              className="rounded-[6px] bg-raised px-2.5 py-1.5 text-foreground"
              style={{ fontFamily: `"${motyw.fonty[klucz]}", ${kategoria(motyw.fonty[klucz])}`, fontSize: klucz === 'naglowki' ? 18 : 13.5 }}
            >
              {probka}
            </p>
          </div>
        ))}
        <p className="text-[12px] text-muted-foreground">Dokładny krój widać w podglądzie – fonty kopiujemy na Twój hosting, bez łączenia z Google.</p>
      </section>

      <Kafelki
        etykieta="Zaokrąglenia"
        wartosc={motyw.zaokraglenie}
        kolumny="grid-cols-4"
        opcje={[
          { wartosc: 'ostre', nazwa: 'Ostre' },
          { wartosc: 'lekkie', nazwa: 'Lekkie' },
          { wartosc: 'miekkie', nazwa: 'Miękkie' },
          { wartosc: 'pelne', nazwa: 'Pełne' },
        ]}
        onZmiana={(v) => onMotyw((m) => ({ ...m, zaokraglenie: v }))}
      />
      <Kafelki
        etykieta="Gęstość"
        wartosc={motyw.gestosc}
        kolumny="grid-cols-3"
        opcje={[
          { wartosc: 'zwarta', nazwa: 'Zwarta' },
          { wartosc: 'normalna', nazwa: 'Normalna' },
          { wartosc: 'przestronna', nazwa: 'Przestronna' },
        ]}
        onZmiana={(v) => onMotyw((m) => ({ ...m, gestosc: v }))}
      />
      <Kafelki
        etykieta="Typografia"
        wartosc={motyw.skalaTypografii}
        kolumny="grid-cols-3"
        opcje={[
          { wartosc: 'spokojna', nazwa: 'Spokojna' },
          { wartosc: 'wyrazista', nazwa: 'Wyrazista' },
          { wartosc: 'monumentalna', nazwa: 'Duża' },
        ]}
        onZmiana={(v) => onMotyw((m) => ({ ...m, skalaTypografii: v }))}
      />
      <Kafelki
        etykieta="Animacje"
        wartosc={motyw.animacje}
        kolumny="grid-cols-3"
        proZablokowane={!funkcjePro}
        opcje={[
          { wartosc: 'brak', nazwa: 'Brak' },
          { wartosc: 'subtelne', nazwa: 'Subtelne' },
          { wartosc: 'wyraziste', nazwa: 'Wyraziste', pro: true },
        ]}
        onZmiana={(v) => {
          onMotyw((m) => ({ ...m, animacje: v }));
          if (v === 'wyraziste' && !funkcjePro) onWybranoPro();
        }}
      />

      <section className="flex flex-col gap-2" aria-labelledby={`${idStylu}-efekty`}>
        <h3 id={`${idStylu}-efekty`} className="m-0 text-[13px] font-medium text-foreground">
          Efekty
        </h3>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {KATALOG_EFEKTOW.map((e) => {
            const zawsze = EFEKTY_ZAWSZE.includes(e.id);
            const wl = zawsze || motyw.efekty.includes(e.id);
            return (
              <li key={e.id} className="flex items-start gap-3 rounded-[6px] px-1 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                    {e.nazwa} {e.pro ? <ZnakPro zablokowane={!funkcjePro} /> : null}
                  </p>
                  <p className="text-[12px] leading-snug text-muted-foreground">{e.opis}</p>
                </div>
                <Switch
                  label={e.nazwa}
                  checked={wl}
                  disabled={zawsze}
                  onChange={(v) => {
                    onMotyw((m) => ({ ...m, efekty: v ? [...new Set([...m.efekty, e.id])].slice(0, 12) : m.efekty.filter((x) => x !== e.id) }));
                    if (v && e.pro && !funkcjePro) onWybranoPro();
                  }}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <Kafelki
        etykieta="Znak „Stworzone w Verris Kreator” w stopce"
        wartosc={model.stopka.znakKreatora}
        kolumny="grid-cols-3"
        proZablokowane={!funkcjePro}
        opcje={[
          { wartosc: 'jasny', nazwa: 'Jasny' },
          { wartosc: 'ciemny', nazwa: 'Ciemny' },
          { wartosc: 'minimalny', nazwa: 'Dyskretny', pro: true },
        ]}
        onZmiana={(v) => {
          onZnak(v);
          if (v === 'minimalny' && !funkcjePro) onWybranoPro();
        }}
      />
    </div>
  );
}
