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
 * wymusza), zwroty prawdziwych wpłat testowych, decyzja księgowej o numeracji (`--zeruj-numeracje` zeruje
 * liczniki wszystkich serii — nowe dokumenty zaczną od 0001).
 */
import { PrismaClient } from '@verris/database';
import { opisPlanu, planCzyszczenia, wykonajCzyszczenie } from './czyszczenie-przed-beta.plan.js';

function argument(nazwa: string): string | undefined {
  const a = process.argv.find((x) => x === `--${nazwa}` || x.startsWith(`--${nazwa}=`));
  if (!a) return undefined;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : '';
}

async function main() {
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
    console.log(`\nUsunięto klientów: ${wynik.usunieto}${wynik.wyzerowanoNumeracje ? '; numeracja wyzerowana' : ''}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[czyszczenie-przed-beta]', err instanceof Error ? err.message : err);
  process.exit(1);
});
