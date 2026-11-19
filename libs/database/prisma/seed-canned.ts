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
  /** Paczka 130 – false: szablon funkcji, której nie ma jeszcze w sprzedaży (admin włącza go przy starcie). */
  isActive?: boolean;
}

const SIGN = '\n\nPozdrawiamy,\nZespół Verris';

const TEMPLATES: Seed[] = [
  {
    title: 'Powitanie – ogólne',
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
    title: 'DNS – propagacja zmian',
    topic: 'DNS',
    shortcut: 'dns-propagacja',
    content:
      'Cześć {{imie}},\n\nSprawa dotyczy propagacji DNS. Zmiana serwerów nazw (NS) lub rekordów A/MX rozchodzi się w globalnej sieci do 24 godzin. Po naszej stronie konfiguracja jest poprawna.\n\nDaj proszę znać, jeśli po tym czasie coś nadal nie działa – sprawdzimy dalej.' +
      SIGN,
  },
  {
    title: 'Domena – zmiana NS na Verris',
    topic: 'DOMAIN',
    shortcut: 'ns-verris',
    content:
      'Cześć {{imie}},\n\nAby domena działała na hostingu Verris, ustaw u swojego rejestratora nasze serwery nazw:\n• ns1.verris.pl\n• ns2.verris.pl\n\nPo zapisaniu zmian propagacja może potrwać do 24 godzin. Kiedy się zakończy, strona i poczta zaczną działać z naszego serwera.' +
      SIGN,
  },
  {
    title: 'Poczta – konfiguracja programu pocztowego',
    topic: 'EMAIL',
    shortcut: 'poczta-config',
    content:
      'Cześć {{imie}},\n\nDane do konfiguracji konta e-mail:\n• Serwer poczty przychodzącej (IMAP): mail.twojadomena.pl, port 993 (SSL/TLS)\n• Serwer poczty wychodzącej (SMTP): mail.twojadomena.pl, port 465 (SSL/TLS)\n• Nazwa użytkownika: pełny adres e-mail\n• Hasło: hasło skrzynki\n\nDaj znać, jeśli chcesz, żebyśmy przeszli przez konfigurację razem.' +
      SIGN,
  },
  {
    title: 'Poczta – wiadomości trafiają do spamu',
    topic: 'EMAIL',
    shortcut: 'spam',
    content:
      'Cześć {{imie}},\n\nDoręczalność poprawiają poprawnie ustawione rekordy uwierzytelniające. Sprawdzimy i uzupełnimy dla Twojej domeny:\n• SPF,\n• DKIM,\n• DMARC.\n\nZajmiemy się tym po naszej stronie i damy znać, gdy będzie gotowe. To zwykle wyraźnie ogranicza trafianie do spamu.' +
      SIGN,
  },
  {
    title: 'SSL – certyfikat Let’s Encrypt',
    topic: 'SSL',
    shortcut: 'ssl',
    content:
      'Cześć {{imie}},\n\nCertyfikat SSL (Let’s Encrypt) wystawiamy i odnawiamy automatycznie, gdy domena wskazuje na nasz serwer. Sprawdziliśmy sprawę #{{nr}} – certyfikat jest już aktywny/odnowiony.\n\nJeśli w przeglądarce nadal widzisz ostrzeżenie, odśwież stronę z pominięciem pamięci podręcznej (Ctrl+F5).' +
      SIGN,
  },
  {
    title: 'Hosting – wysokie zużycie zasobów',
    topic: 'HOSTING',
    shortcut: 'zasoby',
    content:
      'Cześć {{imie}},\n\nZauważyliśmy podwyższone zużycie zasobów na Twojej usłudze. Najczęstsze przyczyny to wtyczki/skrypty w pętli, brak cache lub wzmożony ruch/boty.\n\nPomożemy zdiagnozować źródło i zaproponujemy optymalizację lub – jeśli to zasadne – wyższy pakiet. Damy znać z rekomendacją.' +
      SIGN,
  },
  {
    title: 'Migracja – status przeniesienia',
    topic: 'HOSTING',
    shortcut: 'migracja',
    content:
      'Cześć {{imie}},\n\nPrzeniesienie Twojej strony jest w toku. Kopiujemy pliki i bazy danych, a na końcu przełączymy ruch bez przerwy w działaniu. Odezwiemy się, gdy migracja się zakończy, z instrukcją finalnego przełączenia domeny.' +
      SIGN,
  },
  {
    title: 'Rozliczenia – faktura i płatność',
    topic: 'BILLING',
    shortcut: 'faktura',
    content:
      'Cześć {{imie}},\n\nSprawdziliśmy rozliczenie w sprawie #{{nr}}. Fakturę i historię płatności znajdziesz w panelu w zakładce „Rozliczenia”. Ze względów bezpieczeństwa nie prosimy i nie podajemy danych karty w treści zgłoszenia.\n\nDaj znać, jeśli potrzebujesz korekty danych na fakturze.' +
      SIGN,
  },
  {
    title: 'Aktualizacja – pracujemy nad sprawą',
    category: 'OPOZNIENIE',
    topic: null,
    shortcut: 'w-toku',
    content:
      'Cześć {{imie}},\n\nChcemy tylko dać znać, że sprawa #{{nr}} jest w toku – pracujemy nad nią i wrócimy z konkretną aktualizacją. Dziękujemy za cierpliwość.' +
      SIGN,
  },
  {
    title: 'Zamknięcie zgłoszenia',
    category: 'ZAMKNIECIE',
    topic: null,
    shortcut: 'zamkniecie',
    content:
      'Cześć {{imie}},\n\nUznajemy sprawę #{{nr}} za rozwiązaną i zamykamy zgłoszenie. Jeśli coś jeszcze się pojawi, po prostu odpowiedz w tym wątku – zgłoszenie otworzy się ponownie.' +
      SIGN,
  },
  {
    title: 'Diagnoza – przyczyna znaleziona',
    topic: null,
    shortcut: 'diag',
    category: 'DIAGNOZA',
    content:
      'Cześć {{imie}},\n\nsprawdziliśmy logi i znaleźliśmy przyczynę: [PRZYCZYNA]. [CO ZROBILIŚMY / CO ZROBIMY]. Daj znać, jeśli coś nadal nie działa tak, jak powinno.' +
      SIGN,
  },
  {
    title: 'Dłużej niż zwykle – informacja o terminie',
    topic: null,
    shortcut: 'dluzej',
    category: 'OPOZNIENIE',
    content:
      'Cześć {{imie}},\n\nnaprawa w zgłoszeniu #{{nr}} potrwa dłużej niż zwykle, bo [POWÓD]. Pracujemy nad tym i kolejną informację wyślemy najpóźniej [TERMIN] – nawet jeśli jeszcze nie skończymy. Nie musisz nic robić.' +
      SIGN,
  },
  {
    title: 'Zalecenia po naprawie',
    topic: null,
    shortcut: 'zalec',
    category: 'ZALECENIA',
    content:
      'Żeby sytuacja się nie powtórzyła, zalecamy:\n• [ZALECENIE 1],\n• [ZALECENIE 2].\n\nChętnie pomożemy w każdym z tych kroków – wystarczy odpisać na tę wiadomość.',
  },
  // Paczka 130 – Kreator marki (moduł domyślnie wyłączony): szablony NIEAKTYWNE, admin włącza je przy starcie modułu
  // (Ustawienia → Szablony odpowiedzi). Zasady: bez usługi „poprawi grafik”, bez naśladowania marek, druk – RGB
  // z odpowiednikami CMYK i proof w drukarni. Artykuły pomocy: seed-kb-cms.ts (szkice kategorii „Kreator stron”).
  {
    title: 'Kreator marki – prośba o zmianę logo przez nas',
    topic: 'HOSTING',
    shortcut: 'marka-zmiana',
    category: 'ZALECENIA',
    isActive: false,
    content:
      'Cześć {{imie}},\n\ndziękujemy za wiadomość. Nie projektujemy ani nie poprawiamy logo ręcznie – Kreator marki pozwala jednak zmienić je samodzielnie:\n• kolor, krój i układ zmienisz w panelu „Dopasuj” bez limitu (bez AI),\n• nowy zestaw kierunków dostaniesz, zmieniając opis w briefie i prosząc o nową serię propozycji,\n• jeśli limit serii w tym miesiącu się skończył, odnowi się 1. dnia miesiąca albo możesz kupić Pakiet marki z dodatkowymi seriami.\n\nInstrukcja krok po kroku: artykuł „Jak stworzyć logo w Kreatorze marki” w bazie wiedzy. Jeśli coś w kreatorze nie działa tak, jak opisaliśmy, odpisz – sprawdzimy to.' +
      SIGN,
  },
  {
    title: 'Kreator marki – logo „jak znana marka”',
    topic: 'HOSTING',
    shortcut: 'marka-jak-znana',
    category: 'ZALECENIA',
    isActive: false,
    content:
      'Cześć {{imie}},\n\nrozumiemy, że podoba Ci się styl tej marki. Kreator marki nie przygotuje jednak logo na wzór cudzego znaku – podobieństwo do zarejestrowanego znaku dla podobnych usług może skończyć się żądaniem zmiany logo, a nawet sporem.\n\nZamiast nazwy marki opisz w briefie, co Ci się w niej podoba: np. „prosty znak geometryczny”, „grube litery”, „dwa kolory, granat i pomarańcz”, „charakter: nowoczesny, pewny siebie”. Kreator zaproponuje kierunki w tym duchu.\n\nPrzed użyciem logo sprawdź też podobne znaki w TMview – instrukcja w artykule „Logo a znak towarowy – TMview krok po kroku”.' +
      SIGN,
  },
  {
    title: 'Kreator marki – drukarnia nie przyjmuje pliku / CMYK',
    topic: 'HOSTING',
    shortcut: 'marka-druk',
    category: 'ZALECENIA',
    isActive: false,
    content:
      'Cześć {{imie}},\n\npliki do druku z Kreatora marki (wizytówka, papier firmowy, logo w PDF) są wektorowe, a kolory są zapisane w RGB. Odpowiedniki CMYK każdego koloru znajdziesz w zasadach marki (w paczce ZIP i w księdze znaku).\n\nCo zrobić:\n• przekaż drukarni plik PDF i odpowiedniki CMYK z zasad marki – większość drukarni sama konwertuje plik,\n• poproś o wydruk próbny (proof) przed całym nakładem – kolory na papierze mogą wyjść inaczej niż na ekranie,\n• jeśli drukarnia wymaga pliku PDF/X w CMYK, poproś ją o konwersję – Kreator marki nie tworzy dziś takich plików.\n\nWizytówka ma spad 3 mm i linie cięcia. Więcej: artykuł „Druk: wizytówka i CMYK” w bazie wiedzy.' +
      SIGN,
  },
];

async function main() {
  const existing = await prisma.cannedResponse.findMany({ select: { title: true } });
  // 6.11.2026: pauza w tytułach zamieniona na półpauzę — szablon zapisany wcześniej z pauzą to ten sam szablon.
  const bezPauzy = (t: string) => t.replaceAll('\u2014', '\u2013');
  const have = new Map(existing.map((r) => [bezPauzy(r.title), r.title]));
  const toCreate = TEMPLATES.filter((t) => !have.has(bezPauzy(t.title)));
  // PB-37 — kategorie dla szablonów dodanych wcześniej (bez nadpisywania zmian admina)
  for (const t of TEMPLATES.filter((x) => x.category && have.has(bezPauzy(x.title)))) {
    await prisma.cannedResponse.updateMany({ where: { title: have.get(bezPauzy(t.title)), category: null }, data: { category: t.category } });
  }
  if (toCreate.length === 0) {
    console.log('Szablony już istnieją – nic do dodania.');
    return;
  }
  await prisma.cannedResponse.createMany({
    data: toCreate.map((t) => ({
      title: t.title,
      content: t.content,
      topic: t.topic,
      shortcut: t.shortcut,
      category: t.category ?? null,
      isActive: t.isActive ?? true,
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
