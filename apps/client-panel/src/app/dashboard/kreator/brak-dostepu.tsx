import Link from 'next/link';
import { LayoutTemplate } from 'lucide-react';
import { klasaPrzyciskuGlownego, klasaPrzyciskuDrugiego } from './wspolne';

/** Ekran „kreator niedostępny” – czytelny powód z API (kreator w testach, brak hostingu), bez błędu strony. */
export function BrakDostepu({ powod, zamowHosting = false }: { powod: string | null; zamowHosting?: boolean }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-[10px] border border-line bg-card px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-data-soft text-data-hi" aria-hidden>
        <LayoutTemplate className="h-6 w-6" />
      </span>
      <h2 className="m-0 font-display text-[18px] font-bold text-foreground">Kreator stron jest niedostępny na tym koncie</h2>
      <p className="max-w-lg text-[13.5px] text-muted-foreground">{powod ?? 'Kreator nie jest jeszcze dostępny na tym koncie.'}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {zamowHosting ? (
          <Link href="/dashboard/services/new" className={klasaPrzyciskuGlownego}>
            Zamów hosting
          </Link>
        ) : null}
        <Link href="/dashboard" className={klasaPrzyciskuDrugiego}>
          Wróć na pulpit
        </Link>
      </div>
    </section>
  );
}
