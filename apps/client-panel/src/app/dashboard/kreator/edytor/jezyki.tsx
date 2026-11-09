'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Languages, Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import {
  JEZYKI_DODATKOWE,
  jezykGlowny,
  jezykiStrony,
  jezykPodstrony,
  kluczPodstrony,
  NAZWY_JEZYKOW_PL,
  oryginalPodstrony,
  podstronaWJezyku,
  podstronyWJezyku,
  SKROTY_JEZYKOW,
  tlumaczenieNieaktualne,
  wstawWersjeJezykowa,
  type Jezyk,
  type JezykDodatkowy,
  type Podstrona,
  type Strona,
} from '@verris/kreator/klient';
import { PanelModal } from '@/components/panel/panel-modal';
import { cx } from '@/components/panel/cx';
import { Kafelki, Komunikat, ZnakPro, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego, klasaPrzyciskuIkony } from '../wspolne';

/**
 * Wersje językowe w edytorze (paczka 124, Kreator Pro): przełącznik języka nad listą podstron, „Dodaj wersję językową”
 * (tłumaczenie AI albo kopia bez tłumaczenia) i ostrzeżenie o nieaktualnym tłumaczeniu. Logika modelu – @verris/kreator
 * (jezyki.ts); tu tylko widok. Bez Pro opcja jest widoczna z kłódką i opisem (jak inne elementy Pro).
 */

export type TrybWersji = 'ai' | 'kopia';

/** Przymiotnik wersji do komunikatów („wersja angielska”). */
export const WERSJA_JEZYKA: Record<Jezyk, string> = { pl: 'polska', en: 'angielska', de: 'niemiecka', uk: 'ukraińska' };
/** To samo w bierniku („usuń wersję angielską”). */
export const WERSJE_JEZYKA: Record<Jezyk, string> = { pl: 'polską', en: 'angielską', de: 'niemiecką', uk: 'ukraińską' };

/** Języki, które można jeszcze dodać (bez języka głównego i już dodanych). */
export function jezykiDoDodania(model: Partial<Pick<Strona, 'jezyk' | 'jezykiDodatkowe'>>): JezykDodatkowy[] {
  return JEZYKI_DODATKOWE.filter((j) => j !== jezykGlowny(model) && !(model.jezykiDodatkowe ?? []).includes(j));
}

/**
 * Wersja językowa skopiowana bez tłumaczenia: każda podstrona języka głównego z prefiksem języka, wspólnym kluczem
 * i skrótem treści oryginału (zmiana oryginału oznaczy kopię jako nieaktualną). Istniejące podstrony tego języka zostają.
 */
export function kopiaWersjiJezykowej(model: Strona, jezyk: JezykDodatkowy): Strona {
  const istniejace = new Set(podstronyWJezyku(model, jezyk).map((p) => kluczPodstrony(model, p)));
  const nowe = podstronyWJezyku(model, jezykGlowny(model))
    .filter((p) => !istniejace.has(kluczPodstrony(model, p)))
    .map((p) => podstronaWJezyku(model, p, jezyk));
  return wstawWersjeJezykowa(model, jezyk, nowe);
}

/** Klucze podstron języka głównego bez wersji w `jezyk` (do „Przetłumacz brakujące”). */
export function brakujacePodstrony(model: Strona, jezyk: JezykDodatkowy): string[] {
  const jest = new Set(podstronyWJezyku(model, jezyk).map((p) => kluczPodstrony(model, p)));
  return podstronyWJezyku(model, jezykGlowny(model))
    .map((p) => kluczPodstrony(model, p))
    .filter((k) => !jest.has(k));
}

export function PrzelacznikJezyka({
  model,
  jezyk,
  funkcjePro,
  pracuje,
  onJezyk,
  onDodaj,
  onUsun,
}: {
  model: Strona;
  jezyk: Jezyk;
  funkcjePro: boolean;
  pracuje: boolean;
  onJezyk: (j: Jezyk) => void;
  onDodaj: (j: JezykDodatkowy, tryb: TrybWersji) => void;
  onUsun: (j: JezykDodatkowy) => void;
}) {
  const [okno, setOkno] = useState(false);
  const jezyki = jezykiStrony(model).filter((j) => j === jezykGlowny(model) || model.strony.some((p) => jezykPodstrony(model, p) === j));
  const doDodania = jezykiDoDodania(model);
  return (
    <div className="flex flex-col gap-2">
      {jezyki.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Wersja językowa w edytorze">
          {jezyki.map((j) => (
            <button
              key={j}
              type="button"
              aria-pressed={j === jezyk}
              aria-label={`Wersja ${WERSJA_JEZYKA[j]}`}
              onClick={() => onJezyk(j)}
              className={cx(
                'min-w-[44px] rounded-[6px] border px-2 py-1 font-mono text-[12px] font-semibold tracking-[0.06em] max-md:min-h-11',
                j === jezyk ? 'border-data bg-data-soft text-foreground' : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground',
              )}
            >
              {SKROTY_JEZYKOW[j]}
            </button>
          ))}
          {jezyk !== jezykGlowny(model) ? (
            <button
              type="button"
              className={cx(klasaPrzyciskuIkony, 'ml-auto max-md:h-11 max-md:w-11')}
              aria-label={`Usuń wersję ${WERSJE_JEZYKA[jezyk]}`}
              disabled={pracuje}
              onClick={() => onUsun(jezyk as JezykDodatkowy)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
      {doDodania.length ? (
        <button type="button" className={`${klasaPrzyciskuDrugiego} w-full max-md:min-h-11`} onClick={() => setOkno(true)} disabled={pracuje}>
          {pracuje ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Languages className="h-3.5 w-3.5" aria-hidden />}
          Dodaj wersję językową
          {!funkcjePro ? <ZnakPro className="ml-1" /> : null}
        </button>
      ) : null}
      <OknoWersjiJezykowej
        open={okno}
        jezyki={doDodania}
        funkcjePro={funkcjePro}
        onZamknij={() => setOkno(false)}
        onDodaj={(j, t) => {
          setOkno(false);
          onDodaj(j, t);
        }}
      />
    </div>
  );
}

export function OknoWersjiJezykowej({
  open,
  jezyki,
  funkcjePro,
  onZamknij,
  onDodaj,
}: {
  open: boolean;
  jezyki: JezykDodatkowy[];
  funkcjePro: boolean;
  onZamknij: () => void;
  onDodaj: (j: JezykDodatkowy, tryb: TrybWersji) => void;
}) {
  const [jezyk, setJezyk] = useState<JezykDodatkowy | null>(jezyki[0] ?? null);
  const [tryb, setTryb] = useState<TrybWersji>('ai');
  const wybrany = jezyk && jezyki.includes(jezyk) ? jezyk : (jezyki[0] ?? null);
  return (
    <PanelModal
      open={open}
      onClose={onZamknij}
      title="Dodaj wersję językową"
      description="Strona dostanie podstrony w wybranym języku pod adresem z prefiksem języka (np. /en/), przełącznik języka i oznaczenia dla wyszukiwarek."
      className="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        {!funkcjePro ? (
          <Komunikat rodzaj="info" tytul={<span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" aria-hidden /> Funkcja Kreatora Pro</span>}>
            Wersje językowe są w Kreatorze Pro: do 3 dodatkowych języków (angielski, niemiecki, ukraiński), tłumaczenie AI i przełącznik języka na stronie.{' '}
            <Link href="/dashboard/kreator" className="underline">
              Zobacz Kreator Pro
            </Link>
          </Komunikat>
        ) : null}
        <Kafelki
          etykieta="Język"
          wartosc={wybrany}
          kolumny="grid-cols-1 sm:grid-cols-3"
          opcje={jezyki.map((j) => ({ wartosc: j, nazwa: `${NAZWY_JEZYKOW_PL[j][0]!.toUpperCase()}${NAZWY_JEZYKOW_PL[j].slice(1)}`, opis: SKROTY_JEZYKOW[j], wylaczona: !funkcjePro }))}
          onZmiana={setJezyk}
        />
        <Kafelki
          etykieta="Treść"
          wartosc={tryb}
          opcje={[
            { wartosc: 'ai', nazwa: 'Przetłumacz przez AI', opis: 'Każda podstrona to jedna zmiana AI. Nazwa firmy, ceny i dane kontaktowe zostają bez zmian.', wylaczona: !funkcjePro },
            { wartosc: 'kopia', nazwa: 'Skopiuj bez tłumaczenia', opis: 'Kopia polskich podstron – przetłumaczysz je sam w edytorze.', wylaczona: !funkcjePro },
          ]}
          onZmiana={setTryb}
        />
        <div className="flex justify-end gap-2">
          <button type="button" className={klasaPrzyciskuDrugiego} onClick={onZamknij}>
            Anuluj
          </button>
          <button type="button" className={klasaPrzyciskuGlownego} disabled={!funkcjePro || !wybrany} onClick={() => wybrany && onDodaj(wybrany, tryb)}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Dodaj wersję
          </button>
        </div>
      </div>
    </PanelModal>
  );
}

/** „Wersja EN może być nieaktualna – przetłumacz ponownie” nad sekcjami podstrony w języku dodatkowym. */
export function StatusTlumaczenia({
  model,
  podstrona,
  funkcjePro,
  pracuje,
  onPrzetlumacz,
}: {
  model: Strona;
  podstrona: Podstrona;
  funkcjePro: boolean;
  pracuje: boolean;
  onPrzetlumacz: () => void;
}) {
  if (!tlumaczenieNieaktualne(model, podstrona)) return null;
  const j = jezykPodstrony(model, podstrona);
  const oryginal = oryginalPodstrony(model, podstrona);
  return (
    <div role="status" className="flex flex-col gap-2 rounded-[8px] border border-warn/40 bg-warn-soft px-3 py-2.5 text-[12.5px] text-foreground">
      <p className="m-0 flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-warn" aria-hidden />
        <span>
          Wersja {SKROTY_JEZYKOW[j]} może być nieaktualna – {oryginal ? `podstrona „${oryginal.tytul}” zmieniła się od tłumaczenia` : 'oryginał zmienił się od tłumaczenia'}.
        </span>
      </p>
      <button type="button" className={`${klasaPrzyciskuDrugiego} self-start max-md:min-h-11`} disabled={pracuje || !funkcjePro} onClick={onPrzetlumacz}>
        {pracuje ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Languages className="h-3.5 w-3.5" aria-hidden />}
        Przetłumacz ponownie
        {!funkcjePro ? <ZnakPro className="ml-1" /> : null}
      </button>
    </div>
  );
}
