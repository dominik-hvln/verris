'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, RotateCcw, Shuffle } from 'lucide-react';
import { potwierdz } from '@/components/panel/potwierdz';
import { dataGodzinaPl } from '@/lib/data-pl';
import { Komunikat, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from '../wspolne';
import { cofnijWordpress, stanCms, zainstalujPodgladWordpress, zamienNaWordpress } from './akcje';
import { W_TOKU, type StanPrzejsciaCms, type WidokCms, type WynikPodgladu } from './typy';

/** Co ile sekund panel pyta o stan zadania na serwerze (instalacja, zamiana, cofnięcie). */
export const ODSTEP_ODPYTYWANIA_MS = 5000;

const dataKrotka = (iso: string) => dataGodzinaPl(iso, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const POSTEP: Record<string, string> = {
  PODGLAD_W_TOKU: 'Instalujemy WordPressa obok Twojej strony i przenosimy do niego sekcje, zdjęcia i menu. Zwykle trwa to kilka minut – możesz zamknąć to okno.',
  ZAMIANA_W_TOKU: 'Zamieniamy stronę na WordPressa: strona z kreatora trafia do kopii, WordPress przejmuje domenę.',
  COFANIE_W_TOKU: 'Przywracamy stronę z kreatora. WordPress trafi do kopii na koncie.',
};

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all font-semibold text-data-hi underline-offset-2 hover:underline">
      {children} <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">(otwiera się w nowej karcie)</span>
    </a>
  );
}

/**
 * Sekcja „Przejdź na CMS” w oknie publikacji (paczka 124). Lista celów pochodzi z API (dziś WordPress), kroki:
 * instalacja podglądu z postępem → link podglądu i dane logowania → „Zamień stronę na WordPressa” → wynik;
 * „Cofnij” w okresie kopii. Gdy API nie ma jeszcze tych tras (404) – sekcja się nie pokazuje.
 */
export function PrzejscieNaCms({ id }: { id: string }) {
  const [stan, setStan] = useState<StanPrzejsciaCms | null>(null);
  const [ukryte, setUkryte] = useState(false);
  const [wysylanie, setWysylanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [logowanie, setLogowanie] = useState<WynikPodgladu | null>(null);
  const zegar = useRef<ReturnType<typeof setTimeout> | null>(null);

  const zastosuj = useCallback((r: Awaited<ReturnType<typeof stanCms>>) => {
    if (r.ok) setStan(r.dane);
    else if (r.status === 404 || r.status === 405) setUkryte(true);
    else setBlad(r.blad);
  }, []);

  useEffect(() => {
    let aktualne = true;
    void stanCms(id).then((r) => {
      if (aktualne) zastosuj(r);
    });
    return () => {
      aktualne = false;
    };
  }, [id, zastosuj]);

  // Odpytywanie, dopóki zadanie na serwerze trwa.
  const wToku = !!stan?.wordpress && W_TOKU.includes(stan.wordpress.stan);
  useEffect(() => {
    if (!wToku) return;
    let aktualne = true;
    zegar.current = setTimeout(() => {
      void stanCms(id).then((r) => {
        if (aktualne) zastosuj(r);
      });
    }, ODSTEP_ODPYTYWANIA_MS);
    return () => {
      aktualne = false;
      if (zegar.current) clearTimeout(zegar.current);
    };
  }, [wToku, stan, id, zastosuj]);

  if (ukryte || !stan) return null;
  const wp = stan.wordpress;
  const cel = stan.cele.find((c) => c.id === 'wordpress');
  const domena = stan.domena ?? wp?.domena ?? '';

  const ustaw = (w: WidokCms) => setStan((s) => (s ? { ...s, wordpress: w } : s));

  const zainstaluj = async () => {
    setBlad(null);
    setWysylanie(true);
    const r = await zainstalujPodgladWordpress(id, domena);
    setWysylanie(false);
    if (!r.ok) return setBlad(r.blad);
    setLogowanie(r.dane);
    ustaw(r.dane);
  };

  const zamien = async () => {
    const ok = await potwierdz(
      `Zamienić stronę na ${domena} na WordPressa? Strona z kreatora trafi do kopii na koncie, a pod adresem domeny zacznie działać WordPress z podglądu. Kreator przestanie publikować na tę domenę – zmiany wprowadzisz w panelu WordPressa. Przez 30 dni możesz to cofnąć.`,
      { akcja: 'Zamień na WordPressa', niebezpieczne: true, tytul: 'Zamienić stronę na WordPressa?' },
    );
    if (!ok) return;
    setBlad(null);
    setWysylanie(true);
    const r = await zamienNaWordpress(id, domena);
    setWysylanie(false);
    if (!r.ok) return setBlad(r.blad);
    ustaw(r.dane);
  };

  const cofnij = async () => {
    const ok = await potwierdz(
      `Wrócić do strony z kreatora na ${domena}? WordPress (pliki) trafi do kopii na koncie, a jego baza zostaje. Kreator znów będzie publikować na tę domenę.`,
      { akcja: 'Cofnij przejście', niebezpieczne: true, tytul: 'Cofnąć przejście na WordPressa?' },
    );
    if (!ok) return;
    setBlad(null);
    setWysylanie(true);
    const r = await cofnijWordpress(id);
    setWysylanie(false);
    if (!r.ok) return setBlad(r.blad);
    ustaw(r.dane);
  };

  const moznaInstalowac = stan.dostepny && (!wp || wp.stan === 'COFNIETA' || (wp.stan === 'BLAD' && wp.bladEtap === 'podglad'));

  return (
    <section aria-labelledby={`cms-${id}`} className="flex flex-col gap-3 border-t border-line pt-4" aria-live="polite">
      <div>
        <h3 id={`cms-${id}`} className="text-[14px] font-semibold text-foreground">
          Przejdź na CMS
        </h3>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">Gdy strona potrzebuje więcej niż kreator – przenieś ją do systemu zarządzania treścią na Twoim hostingu.</p>
      </div>

      {/* Lista celów z API – dziś jeden; kolejne CMS-y pojawią się tu jako kolejne karty. */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {stan.cele.map((c) => (
          <li key={c.id} className="rounded-lg border border-line bg-card p-3">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
              <Shuffle className="h-4 w-4 text-data-hi" aria-hidden /> {c.nazwa}
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">{c.opis}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-[12px] font-semibold text-foreground">Kiedy warto</p>
                <ul className="m-0 list-disc pl-4 text-[12px] text-muted-foreground">
                  {c.kiedyWarto.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-foreground">Co się zmienia</p>
                <ul className="m-0 list-disc pl-4 text-[12px] text-muted-foreground">
                  {c.coSieZmienia.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!stan.dostepny && stan.powod && !wp ? <Komunikat rodzaj="info">{stan.powod}</Komunikat> : null}

      {wp && W_TOKU.includes(wp.stan) ? (
        <p className="flex items-start gap-2 text-[13px] text-muted-foreground" role="status">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden /> {POSTEP[wp.stan]}
        </p>
      ) : null}

      {logowanie ? (
        <Komunikat rodzaj="ostrzezenie" tytul="Dane logowania do WordPressa – zapisz je teraz">
          <p>
            Login: <span className="font-mono">{logowanie.adminLogin}</span>
            <br />
            Hasło: <span className="select-all font-mono">{logowanie.adminHaslo}</span>
          </p>
          <p className="mt-1">{logowanie.uwaga}</p>
          {logowanie.ostrzezenia.length ? (
            <ul className="mt-1 list-disc pl-4">
              {logowanie.ostrzezenia.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          ) : null}
        </Komunikat>
      ) : null}

      {wp?.stan === 'PODGLAD' && wp.adresPodgladu ? (
        <Komunikat rodzaj="sukces" tytul="Podgląd WordPressa jest gotowy">
          <p>
            Obejrzyj stronę: <Link href={wp.adresPodgladu}>{wp.adresPodgladu}</Link>
          </p>
          {wp.adresPanelu ? (
            <p className="mt-1">
              Panel WordPressa: <Link href={wp.adresPanelu}>{wp.adresPanelu}</Link>
              {wp.adminLogin && !logowanie ? ` (login: ${wp.adminLogin}, hasło pokazaliśmy przy instalacji)` : null}
            </p>
          ) : null}
          <p className="mt-1">Podgląd jest niewidoczny dla wyszukiwarek. Domena dalej pokazuje stronę z kreatora, dopóki jej nie zamienisz.</p>
        </Komunikat>
      ) : null}

      {wp?.stan === 'PRZENIESIONA' ? (
        <Komunikat rodzaj="sukces" tytul="Strona działa w WordPressie">
          <p>
            <Link href={`https://${wp.domena}/`}>{`https://${wp.domena}/`}</Link>
            {wp.adresPanelu ? (
              <>
                {' '}
                – panel: <Link href={wp.adresPanelu}>{wp.adresPanelu}</Link>
              </>
            ) : null}
          </p>
          <p className="mt-1">
            Strona z kreatora jest w kopii na koncie{wp.kopia ? ` (${wp.kopia})` : ''}. Aktualizacje WordPressa, motywu i wtyczek są teraz po Twojej stronie.
            {wp.cofnijDo ? ` Możesz cofnąć przejście do ${dataKrotka(wp.cofnijDo)}.` : ''}
          </p>
        </Komunikat>
      ) : null}

      {wp?.stan === 'COFNIETA' ? (
        <Komunikat rodzaj="info" tytul="Wróciliśmy do strony z kreatora">
          WordPress jest w kopii na koncie{wp.kopiaWp ? ` (${wp.kopiaWp})` : ''}. Kreator znów publikuje na {wp.domena}.
        </Komunikat>
      ) : null}

      {wp?.blad ? <Komunikat rodzaj="blad">{wp.blad}</Komunikat> : null}
      {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}

      <div className="flex flex-wrap gap-2">
        {moznaInstalowac && cel ? (
          <button type="button" className={klasaPrzyciskuDrugiego} disabled={wysylanie || !domena} onClick={() => void zainstaluj()}>
            {wysylanie ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Shuffle className="h-4 w-4" aria-hidden />}
            {wysylanie ? 'Przygotowujemy WordPressa…' : `Zainstaluj podgląd: ${cel.nazwa}`}
          </button>
        ) : null}
        {wp?.stan === 'PODGLAD' ? (
          <button type="button" className={klasaPrzyciskuGlownego} disabled={wysylanie} onClick={() => void zamien()}>
            {wysylanie ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Shuffle className="h-4 w-4" aria-hidden />}
            Zamień stronę na WordPressa
          </button>
        ) : null}
        {wp?.stan === 'PRZENIESIONA' && wp.cofnijDo ? (
          <button type="button" className={klasaPrzyciskuDrugiego} disabled={wysylanie} onClick={() => void cofnij()}>
            {wysylanie ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
            Cofnij – wróć do strony z kreatora
          </button>
        ) : null}
      </div>
    </section>
  );
}
