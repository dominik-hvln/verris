/**
 * Czyszczenie panelu przed otwartą betą — konta testowych klientów i wszystko, co do nich należy.
 * Logika i blokady: czyszczenie-przed-beta.plan.ts.
 *
 * DOMYŚLNIE TYLKO PODGLĄD (nic nie zmienia). Usunięcie wymaga `--wykonaj --potwierdz=<liczba klientów z podglądu>`.
 *
 * UŻYCIE (w kontenerze API, z katalogu apps/api):
 *   pnpm cli:czyszczenie-przed-beta -- --zachowaj=klient1@firma.pl,klient2@firma.pl
 *   pnpm cli:czyszczenie-przed-beta -- --zachowaj=… --wykonaj --potwierdz=37 [--zeruj-numeracje]
 *
 * PRZED `--wykonaj`: kopia bazy (prod-db backup), usunięte w panelu usługi z kontami na węzłach (blokada to
 * wymusza), zwroty prawdziwych wpłat testowych, decyzja księgowej o numeracji (`--zeruj-numeracje` ustawia
 * liczniki na najwyższy numer, który po czyszczeniu zostaje; serie i miesiące bez dokumentów zaczną od 0001).
 * Argumenty tylko w postaci `--nazwa=wartość`; nieznany albo powtórzony argument zatrzymuje skrypt.
 */
import { PrismaClient } from '@verris/database';
import { opisPlanu, planCzyszczenia, sprawdzArgumenty, wykonajCzyszczenie } from './czyszczenie-przed-beta.plan.js';

async function main() {
  const ARGUMENTY = sprawdzArgumenty(process.argv.slice(2));
  const argument = (nazwa: string): string | undefined => ARGUMENTY.get(nazwa);
  const zachowaj = (argument('zachowaj') ?? '').split(',').filter(Boolean);
  const wykonaj = argument('wykonaj') !== undefined;
  const prisma = new PrismaClient();
  try {
    const plan = await planCzyszczenia(prisma, zachowaj);
    console.log(opisPlanu(plan));
    if (!wykonaj) {
      console.log(`\nPODGLĄD — nic nie zmieniono. Usunięcie: --wykonaj --potwierdz=${plan.doUsuniecia.length}`);
      return;
    }
    const potwierdz = Number(argument('potwierdz'));
    if (!Number.isInteger(potwierdz)) throw new Error('Brak --potwierdz=<liczba klientów do usunięcia z podglądu>.');
    const wynik = await wykonajCzyszczenie(prisma, zachowaj, {
      potwierdzenie: potwierdz,
      zerujNumeracje: argument('zeruj-numeracje') !== undefined,
    });
    console.log(`\nUsunięto klientów: ${wynik.usunieto}${wynik.wyzerowanoNumeracje ? '; numeracja dopasowana do dokumentów, które zostały' : ''}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[czyszczenie-przed-beta]', err instanceof Error ? err.message : err);
  process.exit(1);
});
