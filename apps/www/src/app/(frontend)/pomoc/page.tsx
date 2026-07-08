import type { Metadata } from 'next';
import { SubHero, CTABand } from '../components/ui';
import { RevealInit } from '../components/RevealInit';

export const metadata: Metadata = {
  title: 'Pomoc i baza wiedzy | Verris',
  description:
    'Pomoc Verris: najczęstsze pytania o hosting z autoskalowaniem, migrację, płatności, domeny i serwery. Sprawdź status usług lub napisz do polskiego wsparcia.',
  alternates: { canonical: '/pomoc' },
};

const FAQ: [string, string][] = [
  ['Jak przenieść stronę do Verris?', 'Załóż konto i przekaż dostępy — zespół wykona migrację, albo użyj migratora w panelu. Oba sposoby są bezpłatne w ramach hostingu, a strona działa bez przestoju. Szczegóły na stronie migracji.'],
  ['Ile kosztuje autoskalowanie?', 'Baza jest w cenie pakietu (39 zł/mies lub 349 zł/rok brutto). Nadwyżkę ponad bazę rozliczamy godzinowo — płacisz tylko za czas faktycznego użycia. Koszt policzysz w kalkulatorze autoskalowania.'],
  ['Jak zapłacić i gdzie znajdę fakturę?', 'Kartą, BLIK-iem, Apple Pay, Google Pay, przelewem online (Stripe) lub Kredytami Verris. Faktury VAT są w panelu i w e-mailu, gotowe na KSeF.'],
  ['Gdzie stoją serwery?', 'W centrach danych w Unii Europejskiej (Hetzner, Niemcy/Finlandia). Dane pozostają w EOG, co upraszcza zgodność z RODO.'],
  ['Czy cena wzrośnie przy odnowieniu?', 'Cena z cennika obowiązuje od pierwszego dnia. Odnowienie następuje według cennika z dnia odnowienia, a przed każdym odnowieniem wyślemy przypomnienie e-mail. Odnawianie wyłączysz w panelu w każdej chwili, bez opłat.'],
  ['Jak sprawdzić dostępność usług?', 'Aktualny status serwerów i historię incydentów znajdziesz na status.verris.pl.'],
];

export default function Page() {
  return (
    <main>
      <SubHero
        eyebrow="Pomoc"
        title="Jak możemy pomóc?"
        lead="Najczęstsze pytania o hosting, migrację i płatności. Nie znalazłeś odpowiedzi? Napisz do nas — odpowiada polski zespół."
        crumbs={[{ label: 'Pomoc' }]}
        primary={{ label: 'Napisz do nas', href: '/kontakt' }}
        secondary={{ label: 'Status usług', href: 'https://status.verris.pl' }}
      />
      <section>
        <div className="wrap">
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details className="rv" key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <CTABand
        title="Nie znalazłeś odpowiedzi?"
        text="Napisz do polskiego wsparcia — pomożemy dobrać usługę i przenieść stronę."
        primaryLabel="Przejdź do kontaktu"
        primaryHref="/kontakt"
        secondary={{ label: 'Zobacz funkcje', href: '/funkcje' }}
      />
      <RevealInit />
    </main>
  );
}
