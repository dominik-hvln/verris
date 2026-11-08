import { formatPln } from '@/lib/credits';
import { JAK_ODSTAPIC, ZASADA_FAKTUR, ZASADA_KREDYTOW_Z_KODU } from '@/app/dashboard/billing/zasady-dokumentow';
import { netto } from './ceny-zamowienia';
import { okresWaznosci, zlKredytu, ZASADA_KREDYTOW_AUTOSKALOWANIA } from '@/lib/kredyty-autoskalowania';

/**
 * Dane sprzedawcy (decyzja 10 Dominika, 3.11.2026): bez numeru telefonu, kontakt e-mailem; prośba o telefon na /kontakt.
 */
export const SPRZEDAWCA = {
  nazwa: 'HVLN Dominik Kowalski',
  adres: 'Zacisze 2A, 65-775 Zielona Góra',
  nip: '9292069367',
  regon: '521024260',
  email: 'kontakt@verris.pl',
} as const;

/**
 * A2-08 (beta 3.11) — informacje przed zawarciem umowy w samym zamówieniu (art. 12 ust. 1 ustawy o prawach
 * konsumenta): kto sprzedaje, co, za ile łącznie, na jaki okres, że odnawia się automatycznie i jak to wyłączyć,
 * jak liczona jest dodatkowa moc i jak odstąpić. Treść zgodna z Regulaminem (§7 ust. 2 — odnowienie, §21 — odstąpienie).
 */
export function InformacjePrzedumowne({
  nazwaUslugi,
  okres,
  doZaplaty,
  odnowienie,
  zKarty,
  autoskalowanie,
  rejestracjaDomeny,
  kredytAutoskalowania = 0,
  waznoscKredytowMiesiecy = 12,
  gdzieWylaczyc = 'w ustawieniach usługi',
}: {
  nazwaUslugi: string;
  okres: 'MONTH' | 'YEAR';
  doZaplaty: string | number;
  odnowienie: string | number;
  zKarty: boolean;
  /** null = wyłączone; liczba = limit w zł na 30 dni; 0 = bez limitu. */
  autoskalowanie: number | null;
  rejestracjaDomeny: boolean;
  /** Decyzja 6.11.2026 — kredyty na autoskalowanie przy pierwszym zakupie hostingu (zł); 0 = nie przysługują. */
  kredytAutoskalowania?: number;
  waznoscKredytowMiesiecy?: number;
  /** Gdzie w panelu klient wyłącza odnowienie (paczka 121: Kreator Pro – na stronie Kreator stron). */
  gdzieWylaczyc?: string;
}) {
  const coOkres = okres === 'YEAR' ? 'co rok' : 'co miesiąc';
  const zaOkres = okres === 'YEAR' ? 'za rok' : 'za miesiąc';
  return (
    <section aria-labelledby="przedumowne-tytul" className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-relaxed text-neutral-300">
      <h3 id="przedumowne-tytul" className="text-sm font-semibold text-white">Zanim zamówisz</h3>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <dt className="text-neutral-400">Sprzedawca</dt>
        <dd>
          {SPRZEDAWCA.nazwa}, {SPRZEDAWCA.adres}, NIP {SPRZEDAWCA.nip}, REGON {SPRZEDAWCA.regon},{' '}
          <a href={`mailto:${SPRZEDAWCA.email}`} className="underline hover:text-white">{SPRZEDAWCA.email}</a>
        </dd>
        <dt className="text-neutral-400">Usługa i okres</dt>
        <dd>{nazwaUslugi}, umowa na {okres === 'YEAR' ? 'rok' : 'miesiąc'}</dd>
        <dt className="text-neutral-400">Cena łączna</dt>
        <dd>
          {formatPln(doZaplaty)} brutto {zaOkres} ({formatPln(netto(doZaplaty))} netto)
        </dd>
        <dt className="text-neutral-400">Odnowienie</dt>
        <dd>
          Automatycznie {coOkres}, kwotą {formatPln(odnowienie)} brutto według cennika z dnia odnowienia,{' '}
          {zKarty ? 'z Twojej karty' : 'z portfela'}. Przypomnimy o nim e-mailem. Wyłączysz je w panelu, {gdzieWylaczyc},
          przed końcem okresu.
        </dd>
        {autoskalowanie !== null ? (
          <>
            <dt className="text-neutral-400">Dodatkowa moc</dt>
            <dd>
              Według stawek z cennika, w blokach po 15 minut, z portfela
              {kredytAutoskalowania > 0 ? ' (najpierw z kredytów na autoskalowanie)' : ''}.{' '}
              {autoskalowanie > 0
                ? `Twój limit: ${formatPln(autoskalowanie)} w ciągu 30 dni.`
                : 'Bez limitu kosztu – płacisz za faktyczne użycie. Limit ustawisz też później w panelu.'}
            </dd>
          </>
        ) : null}
        {kredytAutoskalowania > 0 ? (
          <>
            <dt className="text-neutral-400">Kredyty na start</dt>
            <dd>
              {zlKredytu(kredytAutoskalowania)} na autoskalowanie przy pierwszym zakupie, ważne{' '}
              {okresWaznosci(waznoscKredytowMiesiecy)} od przyznania. {ZASADA_KREDYTOW_AUTOSKALOWANIA} Cena za pakiet
              się nie zmienia: pierwszy okres kosztuje tyle co odnowienie.
            </dd>
          </>
        ) : null}
        <dt className="text-neutral-400">Faktury</dt>
        <dd>
          {ZASADA_FAKTUR} {ZASADA_KREDYTOW_Z_KODU}
        </dd>
        <dt className="text-neutral-400">Odstąpienie</dt>
        <dd>
          {JAK_ODSTAPIC}
          {rejestracjaDomeny ? ' Przy rejestracji domeny prawo odstąpienia w tej części wygasa z chwilą jej zarejestrowania.' : ''}
        </dd>
      </dl>
    </section>
  );
}
