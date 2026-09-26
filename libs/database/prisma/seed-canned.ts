/**
 * Seed startowych szablonów odpowiedzi supportu (SUP-V2).
 *
 * Zmienne podstawiane w panelu staff: {{imie}}, {{nazwisko}}, {{email}},
 * {{firma}}, {{nr}} (numer sprawy), {{temat}}.
 *
 * Idempotentny: wstawia tylko szablony o tytule, którego jeszcze nie ma.
 *
 * USAGE:  ts-node libs/database/prisma/seed-canned.ts
 */
import { PrismaClient } from '@verris/database';
import { PrismaPg } from '@prisma/adapter-pg';

// X-20 — Prisma 7: połączenie przez driver adapter (adres z DATABASE_URL).
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

interface Seed {
  title: string;
  topic: string | null;
  shortcut: string;
  content: string;
  /** PB-37 — sytuacja w rozmowie (blok „Podpowiedzi”). */
  category?: 'POWITANIE' | 'DIAGNOZA' | 'OPOZNIENIE' | 'ZALECENIA' | 'ZAMKNIECIE';
}

const SIGN = '\n\nPozdrawiamy,\nZespół Verris';

const TEMPLATES: Seed[] = [
  {
    title: 'Powitanie — ogólne',
    category: 'POWITANIE',
    topic: null,
    shortcut: 'powitanie',
    content:
      'Cześć {{imie}},\n\nDziękujemy za kontakt z zespołem Verris. Przyjęliśmy zgłoszenie #{{nr}} i już się nim zajmujemy. Odezwiemy się z aktualizacją najszybciej, jak to możliwe.' +
      SIGN,
  },
  {
    title: 'Prośba o dane do diagnozy',
    category: 'DIAGNOZA',
    topic: 'HOSTING',
    shortcut: 'dane-diag',
    content:
      'Cześć {{imie}},\n\nŻeby szybciej namierzyć przyczynę, poprosimy o kilka szczegółów:\n• adres domeny/usługi, której dotyczy sprawa,\n• dokładny czas wystąpienia problemu (data i godzina),\n• treść komunikatu błędu lub zrzut ekranu,\n• kroki, które prowadzą do błędu.\n\nDzięki temu przejdziemy od razu do rozwiązania.' +
      SIGN,
  },
  {
    title: 'DNS — propagacja zmian',
    topic: 'DNS',
    shortcut: 'dns-propagacja',
    content:
      'Cześć {{imie}},\n\nSprawa dotyczy propagacji DNS. Zmiana serwerów nazw (NS) lub rekordów A/MX rozchodzi się w globalnej sieci do 24 godzin. Po naszej stronie konfiguracja jest poprawna.\n\nDaj proszę znać, jeśli po tym czasie coś nadal nie działa — sprawdzimy dalej.' +
      SIGN,
  },
  {
    title: 'Domena — zmiana NS na Verris',
    topic: 'DOMAIN',
    shortcut: 'ns-verris',
    content:
      'Cześć {{imie}},\n\nAby domena działała na hostingu Verris, ustaw u swojego rejestratora nasze serwery nazw:\n• ns1.verris.pl\n• ns2.verris.pl\n\nPo zapisaniu zmian propagacja może potrwać do 24 godzin. Kiedy się zakończy, strona i poczta zaczną działać z naszego serwera.' +
      SIGN,
  },
  {
    title: 'Poczta — konfiguracja programu pocztowego',
    topic: 'EMAIL',
    shortcut: 'poczta-config',
    content:
      'Cześć {{imie}},\n\nDane do konfiguracji konta e-mail:\n• Serwer poczty przychodzącej (IMAP): mail.twojadomena.pl, port 993 (SSL/TLS)\n• Serwer poczty wychodzącej (SMTP): mail.twojadomena.pl, port 465 (SSL/TLS)\n• Nazwa użytkownika: pełny adres e-mail\n• Hasło: hasło skrzynki\n\nDaj znać, jeśli chcesz, żebyśmy przeszli przez konfigurację razem.' +
      SIGN,
  },
  {
    title: 'Poczta — wiadomości trafiają do spamu',
    topic: 'EMAIL',
    shortcut: 'spam',
    content:
      'Cześć {{imie}},\n\nDoręczalność poprawiają poprawnie ustawione rekordy uwierzytelniające. Sprawdzimy i uzupełnimy dla Twojej domeny:\n• SPF,\n• DKIM,\n• DMARC.\n\nZajmiemy się tym po naszej stronie i damy znać, gdy będzie gotowe. To zwykle wyraźnie ogranicza trafianie do spamu.' +
      SIGN,
  },
  {
    title: 'SSL — certyfikat Let’s Encrypt',
    topic: 'SSL',
    shortcut: 'ssl',
    content:
      'Cześć {{imie}},\n\nCertyfikat SSL (Let’s Encrypt) wystawiamy i odnawiamy automatycznie, gdy domena wskazuje na nasz serwer. Sprawdziliśmy sprawę #{{nr}} — certyfikat jest już aktywny/odnowiony.\n\nJeśli w przeglądarce nadal widzisz ostrzeżenie, odśwież stronę z pominięciem pamięci podręcznej (Ctrl+F5).' +
      SIGN,
  },
  {
    title: 'Hosting — wysokie zużycie zasobów',
    topic: 'HOSTING',
    shortcut: 'zasoby',
    content:
      'Cześć {{imie}},\n\nZauważyliśmy podwyższone zużycie zasobów na Twojej usłudze. Najczęstsze przyczyny to wtyczki/skrypty w pętli, brak cache lub wzmożony ruch/boty.\n\nPomożemy zdiagnozować źródło i zaproponujemy optymalizację lub — jeśli to zasadne — wyższy pakiet. Damy znać z rekomendacją.' +
      SIGN,
  },
  {
    title: 'Migracja — status przeniesienia',
    topic: 'HOSTING',
    shortcut: 'migracja',
    content:
      'Cześć {{imie}},\n\nPrzeniesienie Twojej strony jest w toku. Kopiujemy pliki i bazy danych, a na końcu przełączymy ruch bez przerwy w działaniu. Odezwiemy się, gdy migracja się zakończy, z instrukcją finalnego przełączenia domeny.' +
      SIGN,
  },
  {
    title: 'Rozliczenia — faktura i płatność',
    topic: 'BILLING',
    shortcut: 'faktura',
    content:
      'Cześć {{imie}},\n\nSprawdziliśmy rozliczenie w sprawie #{{nr}}. Fakturę i historię płatności znajdziesz w panelu w zakładce „Rozliczenia”. Ze względów bezpieczeństwa nie prosimy i nie podajemy danych karty w treści zgłoszenia.\n\nDaj znać, jeśli potrzebujesz korekty danych na fakturze.' +
      SIGN,
  },
  {
    title: 'Aktualizacja — pracujemy nad sprawą',
    category: 'OPOZNIENIE',
    topic: null,
    shortcut: 'w-toku',
    content:
      'Cześć {{imie}},\n\nChcemy tylko dać znać, że sprawa #{{nr}} jest w toku — pracujemy nad nią i wrócimy z konkretną aktualizacją. Dziękujemy za cierpliwość.' +
      SIGN,
  },
  {
    title: 'Zamknięcie zgłoszenia',
    category: 'ZAMKNIECIE',
    topic: null,
    shortcut: 'zamkniecie',
    content:
      'Cześć {{imie}},\n\nUznajemy sprawę #{{nr}} za rozwiązaną i zamykamy zgłoszenie. Jeśli coś jeszcze się pojawi, po prostu odpowiedz w tym wątku — zgłoszenie otworzy się ponownie.' +
      SIGN,
  },
  {
    title: 'Diagnoza — przyczyna znaleziona',
    topic: null,
    shortcut: 'diag',
    category: 'DIAGNOZA',
    content:
      'Cześć {{imie}},\n\nsprawdziliśmy logi i znaleźliśmy przyczynę: [PRZYCZYNA]. [CO ZROBILIŚMY / CO ZROBIMY]. Daj znać, jeśli coś nadal nie działa tak, jak powinno.' +
      SIGN,
  },
  {
    title: 'Dłużej niż zwykle — informacja o terminie',
    topic: null,
    shortcut: 'dluzej',
    category: 'OPOZNIENIE',
    content:
      'Cześć {{imie}},\n\nnaprawa w zgłoszeniu #{{nr}} potrwa dłużej niż zwykle, bo [POWÓD]. Pracujemy nad tym i kolejną informację wyślemy najpóźniej [TERMIN] — nawet jeśli jeszcze nie skończymy. Nie musisz nic robić.' +
      SIGN,
  },
  {
    title: 'Zalecenia po naprawie',
    topic: null,
    shortcut: 'zalec',
    category: 'ZALECENIA',
    content:
      'Żeby sytuacja się nie powtórzyła, zalecamy:\n• [ZALECENIE 1],\n• [ZALECENIE 2].\n\nChętnie pomożemy w każdym z tych kroków — wystarczy odpisać na tę wiadomość.',
  },
];

async function main() {
  const existing = await prisma.cannedResponse.findMany({ select: { title: true } });
  const have = new Set(existing.map((r) => r.title));
  const toCreate = TEMPLATES.filter((t) => !have.has(t.title));
  // PB-37 — kategorie dla szablonów dodanych wcześniej (bez nadpisywania zmian admina)
  for (const t of TEMPLATES.filter((x) => x.category && have.has(x.title))) {
    await prisma.cannedResponse.updateMany({ where: { title: t.title, category: null }, data: { category: t.category } });
  }
  if (toCreate.length === 0) {
    console.log('Szablony już istnieją — nic do dodania.');
    return;
  }
  await prisma.cannedResponse.createMany({
    data: toCreate.map((t) => ({
      title: t.title,
      content: t.content,
      topic: t.topic,
      shortcut: t.shortcut,
      category: t.category ?? null,
      isActive: true,
    })),
  });
  console.log(`Dodano ${toCreate.length} szablonów odpowiedzi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
