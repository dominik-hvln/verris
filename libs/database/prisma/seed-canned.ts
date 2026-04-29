import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.cannedResponse.createMany({
    data: [
      {
        title: 'Powitanie - Ogólne',
        content: 'Witaj [IMIE_KLIENTA],\n\nDziękuję za kontakt z administracją EkoHost. Przyjęliśmy Twoje zgłoszenie i właśnie zaczynamy nad nim pracować. Odezwiemy się najszybciej, jak to możliwe.\n\nPozdrawiam,\nZespół EkoHost',
      },
      {
        title: 'Problem z DNS',
        content: 'Cześć [IMIE_KLIENTA],\n\nZauważyliśmy, że problem dotyczy propagacji rekordów DNS. Pamiętaj, że zmiana serwerów nazw (NS) lub rekordów A/MX może zająć do 24 godzin w globalnej sieci.\nZ naszej strony konfiguracja wygląda poprawnie.\n\nDaj nam znać, jeśli problem nadal występuje po upływie tego czasu.',
      },
      {
        title: 'Zamknięcie zgłoszenia',
        content: 'Witaj [IMIE_KLIENTA],\n\nProblem został przez nas pomyślnie rozwiązany i zamykamy to zgłoszenie. Jeśli pojawią się jakiekolwiek inne pytania lub trudności, prosimy o otwarcie nowego zgłoszenia lub odpowiedź w tym wątku.\n\nPozdrawiamy,\nEkoHost Support',
      }
    ],
    skipDuplicates: true
  });
  console.log('Seeded canned responses!');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
