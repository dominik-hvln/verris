'use client';

import { useEffect, useId, useState } from 'react';
import { Download, ExternalLink, Globe, Loader2, Rocket } from 'lucide-react';
import { PanelModal } from '@/components/panel/panel-modal';
import { Select } from '@/components/panel/select';
import { Checkbox } from '@/components/panel/checkbox';
import { potwierdz } from '@/components/panel/potwierdz';
import { dataGodzinaPl } from '@/lib/data-pl';
import { files } from '@/lib/pl';
import type { StanDomenyPublikacji, StanPublikacji, WynikPublikacji } from '@/lib/kreator';
import { opublikuj, stanPublikacji, wycofajPublikacje } from '../akcje';
import { Komunikat, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from '../wspolne';

const OPIS_STANU: Record<StanDomenyPublikacji, string> = {
  pusta: 'katalog pusty',
  zajeta: 'są już inne pliki',
  kreator: 'strona z kreatora',
  nieznany: 'stan nieznany',
};

type Faza =
  | { f: 'ladowanie' }
  | { f: 'wkrotce' }
  | { f: 'blad'; tekst: string }
  | { f: 'gotowe'; stan: StanPublikacji };

const dataKrotka = (iso: string) => dataGodzinaPl(iso, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

interface PropsPublikacji {
  id: string;
  otwarta: boolean;
  onZamknij: () => void;
  /** Zapisuje niezapisane zmiany; false = model ma błędy albo zapis się nie udał. */
  przedPublikacja: () => Promise<boolean>;
  onOpublikowano: (w: WynikPublikacji) => void;
}

/** Okno montuje się przy każdym otwarciu – stan publikacji pobierany od nowa, bez resztek z poprzedniego razu. */
export function Publikacja(p: PropsPublikacji) {
  return p.otwarta ? <OknoPublikacji {...p} /> : null;
}

function OknoPublikacji({ id, otwarta, onZamknij, przedPublikacja, onOpublikowano }: PropsPublikacji) {
  const idDomeny = useId();
  const [faza, setFaza] = useState<Faza>({ f: 'ladowanie' });
  const [domena, setDomena] = useState('');
  const [zajete, setZajete] = useState<string[] | null>(null);
  const [zgoda, setZgoda] = useState(false);
  const [wysylanie, setWysylanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [wynik, setWynik] = useState<WynikPublikacji | null>(null);

  useEffect(() => {
    let aktualne = true;
    void stanPublikacji(id).then((r) => {
      if (!aktualne) return;
      if (r.ok) {
        setFaza({ f: 'gotowe', stan: r.dane });
        setDomena(r.dane.opublikowana?.domena ?? r.dane.domeny.find((d) => d.stan !== 'zajeta')?.domena ?? r.dane.domeny[0]?.domena ?? '');
      } else if (r.status === 404 || r.status === 405) setFaza({ f: 'wkrotce' });
      else setFaza({ f: 'blad', tekst: r.blad });
    });
    return () => {
      aktualne = false;
    };
  }, [id]);

  const publikuj = async (proba: boolean, zastap = false) => {
    setBlad(null);
    setWysylanie(true);
    if (!(await przedPublikacja())) {
      setWysylanie(false);
      setBlad('Strona ma pola do poprawienia albo nie udało się jej zapisać – popraw je i spróbuj ponownie.');
      return;
    }
    const r = await opublikuj(id, proba ? {} : { domena, zastap });
    setWysylanie(false);
    if (r.ok) {
      setWynik(r.dane);
      setZajete(null);
      onOpublikowano(r.dane);
      return;
    }
    if (r.status === 409 && r.kod === 'KATALOG_ZAJETY') {
      setZajete(r.pliki ?? []);
      return;
    }
    setBlad(r.status === 404 ? 'Publikacja będzie dostępna wkrótce.' : r.blad);
  };

  const wycofaj = async () => {
    if (!(await potwierdz('Wycofać publikację? Przywrócimy pliki sprzed pierwszej publikacji (jeśli były) albo usuniemy pliki strony z domeny.', { akcja: 'Wycofaj', niebezpieczne: true, tytul: 'Wycofać publikację?' }))) return;
    setWysylanie(true);
    const r = await wycofajPublikacje(id);
    setWysylanie(false);
    if (!r.ok) setBlad(r.status === 404 ? 'Wycofanie publikacji będzie dostępne wkrótce.' : r.blad);
    else onZamknij();
  };

  const tytul = faza.f === 'gotowe' && faza.stan.wersja === 'proba' ? 'Opublikuj podgląd' : 'Opublikuj stronę';

  return (
    <PanelModal open={otwarta} onClose={onZamknij} title={tytul} className="max-w-xl">
      <div className="flex flex-col gap-4" aria-live="polite">
        {faza.f === 'ladowanie' ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sprawdzamy, gdzie możesz opublikować stronę…
          </p>
        ) : null}
        {faza.f === 'wkrotce' ? (
          <Komunikat rodzaj="info" tytul="Publikacja będzie dostępna wkrótce">
            Stronę możesz już budować i zapisywać – publikację na domenie, link podglądu i ZIP włączymy w najbliższej aktualizacji panelu.
          </Komunikat>
        ) : null}
        {faza.f === 'blad' ? <Komunikat rodzaj="blad">{faza.tekst}</Komunikat> : null}

        {faza.f === 'gotowe' && !wynik ? trescPublikacji() : null}

        {wynik ? (
          <Komunikat rodzaj="sukces" tytul={wynik.tryb === 'podglad' ? 'Podgląd opublikowany' : 'Strona opublikowana'}>
            <a href={wynik.adres} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-data-hi underline-offset-2 hover:underline">
              {wynik.adres} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(otwiera się w nowej karcie)</span>
            </a>
            {wynik.tryb === 'podglad' ? (
              <p className="mt-1">Link działa do {dataKrotka(wynik.wazneDo)} i nie jest indeksowany przez wyszukiwarki. Możesz go odnowić po wygaśnięciu.</p>
            ) : (
              <>
                <p className="mt-1">Wysłaliśmy {files(wynik.pliki)} na hosting.{wynik.kopia ? ' Poprzednie pliki domeny są w kopii.' : ''}</p>
                {wynik.ostrzezenia.length ? (
                  <ul className="mt-1 list-disc pl-4">
                    {wynik.ostrzezenia.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </Komunikat>
        ) : null}

        {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}
        {faza.f !== 'gotowe' || wynik ? (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {wynik?.tryb === 'domena' ? (
              <a href={`/api/kreator/zip/${id}`} className={klasaPrzyciskuDrugiego} download>
                <Download className="h-4 w-4" aria-hidden /> Pobierz ZIP
              </a>
            ) : null}
            <button type="button" className={`${klasaPrzyciskuDrugiego} ml-auto`} onClick={onZamknij}>
              Zamknij
            </button>
          </div>
        ) : null}
      </div>
    </PanelModal>
  );

  function trescPublikacji() {
    if (faza.f !== 'gotowe') return null;
    const s = faza.stan;
    const proba = s.wersja === 'proba';
    const wybrana = s.domeny.find((d) => d.domena === domena);
    const zmianyPlanu = [...new Set(s.zmianyPlanu)];
    return (
      <>
        {s.opublikowana ? (
          <p className="text-[13px] text-muted-foreground">
            Ostatnia publikacja: {dataKrotka(s.opublikowana.at)} –{' '}
            <a href={s.opublikowana.adres} target="_blank" rel="noopener noreferrer" className="text-data-hi hover:underline">
              {s.opublikowana.adres}
            </a>
          </p>
        ) : null}

        {proba ? (
          <>
            <p className="text-[13.5px] text-foreground">
              W okresie próbnym publikujesz stronę jako podgląd: dostaniesz link ważny 7 dni (do odnowienia), niewidoczny dla wyszukiwarek.
            </p>
            <Komunikat rodzaj="info">Własna domena, pobranie ZIP i przejście na WordPressa włączą się po opłaceniu hostingu.</Komunikat>
            {s.linkPodgladu ? (
              <p className="text-[13px] text-muted-foreground">
                Obecny link:{' '}
                <a href={s.linkPodgladu.adres} target="_blank" rel="noopener noreferrer" className="text-data-hi hover:underline">
                  {s.linkPodgladu.adres}
                </a>{' '}
                (ważny do {dataKrotka(s.linkPodgladu.wazneDo)}).
              </p>
            ) : null}
          </>
        ) : (
          <>
            {s.domeny.length ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={idDomeny} className="text-[13px] font-medium text-foreground">
                  Domena
                </label>
                <Select
                  id={idDomeny}
                  value={domena}
                  onChange={(v) => {
                    setDomena(v);
                    setZajete(null);
                    setZgoda(false);
                  }}
                  options={s.domeny.map((d) => ({ value: d.domena, label: `${d.domena} – ${OPIS_STANU[d.stan]}` }))}
                />
                {wybrana?.stan === 'zajeta' && !zajete ? (
                  <p className="text-[12px] text-warn">W katalogu tej domeny są już pliki innej strony – przed publikacją zapytamy, czy je zastąpić.</p>
                ) : null}
              </div>
            ) : (
              <Komunikat rodzaj="ostrzezenie" tytul="Brak domeny na hostingu">
                Dodaj domenę do usługi hostingowej, a potem wróć tutaj.
              </Komunikat>
            )}
          </>
        )}

        {!s.mozliwa && s.powod ? <Komunikat rodzaj="ostrzezenie">{s.powod}</Komunikat> : null}

        {zmianyPlanu.length ? (
          <Komunikat rodzaj="ostrzezenie" tytul="Bez Kreatora Pro na opublikowanej stronie:">
            <ul className="m-0 list-disc pl-4">
              {zmianyPlanu.map((z) => (
                <li key={z}>{z}</li>
              ))}
            </ul>
          </Komunikat>
        ) : null}

        {zajete ? (
          <Komunikat rodzaj="ostrzezenie" tytul="W katalogu domeny są inne pliki">
            {zajete.length ? (
              <ul className="m-0 max-h-32 list-disc overflow-y-auto pl-4 font-mono text-[12px]">
                {zajete.map((p) => (
                  <li key={p} className="break-all">
                    {p}
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="mt-2 flex items-start gap-2 text-[13px] text-foreground">
              <Checkbox className="mt-0.5" checked={zgoda} onChange={(e) => setZgoda(e.target.checked)} />
              Zastąp – obecne pliki trafią do kopii
            </label>
          </Komunikat>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {proba ? (
            <button type="button" className={klasaPrzyciskuGlownego} disabled={wysylanie || !s.mozliwa} onClick={() => void publikuj(true)}>
              {wysylanie ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Rocket className="h-4 w-4" aria-hidden />}
              {s.linkPodgladu ? 'Odnów link podglądu' : 'Opublikuj podgląd (wersja próbna)'}
            </button>
          ) : (
            <button
              type="button"
              className={klasaPrzyciskuGlownego}
              disabled={wysylanie || !s.mozliwa || !domena || (!!zajete && !zgoda)}
              onClick={() => void publikuj(false, !!zajete && zgoda)}
            >
              {wysylanie ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Globe className="h-4 w-4" aria-hidden />}
              {zajete ? 'Zastąp i opublikuj' : domena ? `Opublikuj na ${domena}` : 'Opublikuj'}
            </button>
          )}
          {!proba ? (
            <a href={`/api/kreator/zip/${id}`} className={klasaPrzyciskuDrugiego} download>
              <Download className="h-4 w-4" aria-hidden /> Pobierz ZIP
            </a>
          ) : null}
          {s.opublikowana && !proba ? (
            <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => void wycofaj()} disabled={wysylanie}>
              Wycofaj publikację
            </button>
          ) : null}
          <button type="button" className={`${klasaPrzyciskuDrugiego} ml-auto`} onClick={onZamknij} disabled={wysylanie}>
            Anuluj
          </button>
        </div>
      </>
    );
  }
}
