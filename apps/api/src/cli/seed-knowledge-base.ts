/**
 * Seed startowej Bazy Wiedzy (KB) — generyczne artykuły hostingowe (PL).
 * Zasila podpowiedzi KB dla klienta i sugestie AI dla supportu. Bez embeddingów
 * (retrieve ma keyword-fallback), więc działa od razu nawet bez dostawcy AI.
 *
 * Idempotentny: pomija artykuły o istniejącym tytule.
 *
 * USAGE:  pnpm --filter api cli:seed-kb
 */

import { PrismaClient, AiKnowledgeAudience } from '@verris/database';

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 150;

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length <= CHUNK_SIZE) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(start, end);
      const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
      if (lastBreak > CHUNK_SIZE * 0.5) end = start + lastBreak + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.length > 0);
}

interface Article {
  title: string;
  audience: AiKnowledgeAudience;
  content: string;
}

const ARTICLES: Article[] = [
  {
    title: 'Jak skierować domenę na hosting (NS / rekord A)',
    audience: AiKnowledgeAudience.ALL,
    content: `Aby domena działała na hostingu Verris, skieruj ją na nasz serwer na jeden z dwóch sposobów.

Wariant A (zalecany): w panelu rejestratora domeny ustaw nameservery na ns1.verris.pl oraz ns2.verris.pl. Daje to pełną obsługę DNS i poczty z poziomu panelu Verris.

Wariant B: zostaw obecne nameservery i ręcznie ustaw rekord A dla domeny (@) na adres IP serwera hostingu (widoczny w panelu w sekcji „Skieruj domenę"). Opcjonalnie dodaj rekord A lub CNAME dla www.

Propagacja zmian DNS trwa zwykle od kilku minut do 24 godzin. Status możesz sprawdzić w panelu (Usługa → Domeny & DNS → „Sprawdź teraz").`,
  },
  {
    title: 'Konfiguracja poczty e-mail (IMAP/SMTP, porty)',
    audience: AiKnowledgeAudience.ALL,
    content: `Skrzynki tworzysz w panelu: Usługa → Poczta → „Nowa skrzynka".

Ustawienia w programie pocztowym (Outlook, Thunderbird, telefon):
- Serwer poczty przychodzącej (IMAP): host node Twojej usługi (widoczny w zakładce Poczta), port 993, szyfrowanie SSL/TLS.
- Serwer poczty wychodzącej (SMTP): ten sam host, port 587 ze STARTTLS (lub 465 z SSL).
- Login: pełny adres skrzynki (np. kontakt@twojadomena.pl).
- Hasło: ustawione przy tworzeniu skrzynki.

Jeśli poczta nie wysyła/odbiera, sprawdź czy domena ma poprawne rekordy MX oraz SPF/DKIM/DMARC (zakładka Deliverability).`,
  },
  {
    title: 'Certyfikat SSL (Let’s Encrypt) — wystawianie i wymagania',
    audience: AiKnowledgeAudience.ALL,
    content: `Darmowy certyfikat Let’s Encrypt wystawisz w panelu: Usługa → SSL → „Wystaw certyfikat LE".

WAŻNE: certyfikat jest wydawany w tle (walidacja HTTP-01), więc domena musi już wskazywać na nasz serwer (poprawny rekord A). Jeśli DNS nie jest jeszcze skierowany, walidacja się nie powiedzie i certyfikat nie powstanie. Po poprawnym skierowaniu DNS ponów wystawienie — status zaktualizuje się zwykle w kilka minut.

Możesz też wgrać własny certyfikat (PEM): certyfikat, klucz prywatny i opcjonalny łańcuch CA.`,
  },
  {
    title: 'Instalacja WordPress jednym kliknięciem',
    audience: AiKnowledgeAudience.ALL,
    content: `WordPressa zainstalujesz w panelu: Usługa → Aplikacje → „Zainstaluj WordPress". Tworzymy bazę danych, konfigurujemy stronę i wtyczkę cache (LiteSpeed). Instalacja trwa około minuty.

Po instalacji link do panelu administracyjnego (wp-admin) pojawi się w tej samej zakładce. Ponowna instalacja nadpisuje konfigurację tylko jeśli WordPress nie jest jeszcze skonfigurowany — istniejąca instalacja nie jest ruszana (bez utraty danych).

W zakładce „Aplikacje" dostępne są też inne aplikacje 1-click (np. Nextcloud, PrestaShop) instalowane na pustym katalogu domeny.`,
  },
  {
    title: 'Tworzenie bazy danych MySQL',
    audience: AiKnowledgeAudience.ALL,
    content: `Bazę MySQL utworzysz w panelu: Usługa → Bazy MySQL → formularz „Nowa baza danych" (nazwa, użytkownik, hasło). DirectAdmin doda prefiks konta do nazwy bazy i użytkownika (np. user_sklep).

Do połączenia z aplikacji użyj:
- Host: localhost (dla aplikacji na tym samym koncie hostingowym),
- Nazwa bazy, użytkownik i hasło z formularza (z prefiksem konta).

Zaawansowane zarządzanie (tabele, importy SQL) dostępne jest przez phpMyAdmin (link w tej samej zakładce). Bazę możesz usunąć przyciskiem kosza.`,
  },
  {
    title: 'Konta FTP — tworzenie i połączenie',
    audience: AiKnowledgeAudience.ALL,
    content: `Dodatkowe konto FTP utworzysz w panelu: Usługa → Konta FTP (użytkownik, hasło, opcjonalny katalog).

Połączenie w kliencie FTP (np. FileZilla):
- Host: serwer FTP Twojej usługi (widoczny w panelu, np. node-pl-01.verris.pl),
- Użytkownik i hasło: z formularza,
- Port: 21 (FTP z TLS) lub zgodnie z danymi w panelu.

Dla bezpieczeństwa używaj połączenia szyfrowanego (FTPS). Konto FTP możesz usunąć przyciskiem kosza.`,
  },
  {
    title: 'Zmiana wersji PHP',
    audience: AiKnowledgeAudience.ALL,
    content: `Wersję PHP dla konta zmienisz w panelu: Usługa → Wersja PHP → wybierz wersję → „Zastosuj". Zmiana jest wykonywana na serwerze (CloudLinux PHP Selector) i trwa zwykle kilkadziesiąt sekund. Skrypty i plik .htaccess pozostają bez zmian.

Jeśli aplikacja przestała działać po zmianie, sprawdź wymagania wersji PHP danej aplikacji i w razie potrzeby wróć do poprzedniej wersji.`,
  },
  {
    title: 'Zadania cron — jak dodać',
    audience: AiKnowledgeAudience.ALL,
    content: `Zadania cykliczne dodasz w panelu: Usługa → Cron. Ustaw harmonogram (minuta, godzina, dzień miesiąca, miesiąc, dzień tygodnia) lub użyj gotowych presetów (np. „Codziennie 3:00") i wpisz komendę.

Przykład komendy uruchamiającej skrypt PHP:
php /home/UŻYTKOWNIK/domains/twojadomena.pl/public_html/cron.php

Zadanie możesz usunąć przyciskiem kosza. Zbyt częste, ciężkie zadania mogą obciążać konto — ustawiaj rozsądne interwały.`,
  },
  {
    title: 'Kopie zapasowe i przywracanie',
    audience: AiKnowledgeAudience.ALL,
    content: `Kopię zapasową konta utworzysz w panelu: Usługa → Kopie zapasowe → „Utwórz kopię teraz". Lista dostępnych kopii pojawia się poniżej. Dodatkowo wykonujemy kopie off-node (poza serwerem) dla bezpieczeństwa.

Przy przywracaniu zwróć uwagę, że operacja nadpisuje bieżące dane przywracanymi. W razie wątpliwości skontaktuj się z pomocą techniczną przed przywróceniem produkcyjnej strony.`,
  },
  {
    title: 'Poddomeny — jak dodać',
    audience: AiKnowledgeAudience.ALL,
    content: `Poddomenę (np. sklep.twojadomena.pl) dodasz w panelu: Usługa → Domeny & DNS → sekcja „Poddomeny" (nazwa + wybór domeny → „Dodaj"). Poddomena otrzymuje własny katalog na pliki.

Usunięcie poddomeny przyciskiem kosza kasuje również jej zawartość. Aby na poddomenie działała strona po HTTPS, wystaw dla niej certyfikat SSL (zakładka SSL).`,
  },
  {
    title: 'Portfel, kredyty i rozliczenia',
    audience: AiKnowledgeAudience.ALL,
    content: `Rozliczenia działają w oparciu o portfel (1 zł = 1 kredyt). Saldo doładujesz w panelu: Płatności → wybierz kwotę → „Doładuj" (karta, BLIK, Przelewy24 przez Stripe). Środki trafiają do portfela natychmiast po zaksięgowaniu.

Z portfela pobierane są opłaty cykliczne za usługi oraz autoskalowanie (dodatkowa moc dokupywana godzinowo, jeśli włączone). Możesz ustawić auto-doładowanie i bezpiecznik kosztów autoskalowania, aby kontrolować wydatki. Faktury i historię znajdziesz w sekcji Płatności.`,
  },
  {
    title: 'Bezpieczeństwo konta: 2FA, passkey, silne hasła',
    audience: AiKnowledgeAudience.ALL,
    content: `Zadbaj o bezpieczeństwo konta Verris:
- Używaj silnego, unikalnego hasła.
- Włącz logowanie passkey (bez hasła, oparte o urządzenie) lub 2FA w ustawieniach konta.
- Nie udostępniaj danych logowania; pracownik Verris nigdy nie poprosi o Twoje hasło.

W razie podejrzenia naruszenia zmień hasło i skontaktuj się z pomocą techniczną. Operacje wrażliwe w panelu są rejestrowane w dzienniku audytu.`,
  },
  {
    title: 'Diagnostyka: „strona nie działa" (DNS / SSL / serwer WWW)',
    audience: AiKnowledgeAudience.STAFF,
    content: `Checklista BOK przy zgłoszeniu „strona nie działa":
1. DNS: czy rekord A domeny wskazuje na IP węzła klienta? (dig +short A domena). Brak/zły A → strona nie odpowiada i Let’s Encrypt nie zwaliduje.
2. HTTP/HTTPS: czy serwer odpowiada na :80/:443? Brak odpowiedzi → sprawdź vhost w DirectAdmin oraz status serwera WWW (LiteSpeed) na węźle (ważna licencja!).
3. SSL: status „NONE" zwykle oznacza brak wydanego certu (najczęściej z powodu nieskierowanego DNS). Po poprawnym A ponów wystawienie LE.
4. Konto: czy konto/domena istnieją w DirectAdmin i konto jest ACTIVE (nie zawieszone/za provisioningu).
5. PHP/aplikacja: błąd 500 po zmianie PHP → sprawdź wymagania wersji i logi błędów w public_html.`,
  },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    const createdById = admin?.id ?? null;

    let created = 0;
    let skipped = 0;
    for (const art of ARTICLES) {
      const exists = await prisma.aiKnowledgeDoc.findFirst({
        where: { title: art.title },
        select: { id: true },
      });
      if (exists) {
        skipped++;
        continue;
      }
      const content = art.content.trim();
      const doc = await prisma.aiKnowledgeDoc.create({
        data: {
          title: art.title,
          audience: art.audience,
          sourceType: 'TEXT',
          status: 'ACTIVE',
          charCount: content.length,
          createdById,
        },
      });
      const parts = chunkText(content);
      await prisma.aiKnowledgeChunk.createMany({
        data: parts.map((c, i) => ({
          docId: doc.id,
          ordinal: i,
          content: c,
          embedding: [],
          tokens: Math.ceil(c.length / 4),
        })),
      });
      created++;
      // eslint-disable-next-line no-console
      console.log(`✓ KB: "${art.title}" (${parts.length} chunk(ów), audience=${art.audience})`);
    }
    // eslint-disable-next-line no-console
    console.log(`\nGotowe. Utworzono: ${created}, pominięto (już istniały): ${skipped}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seed-knowledge-base failed:', err);
  process.exit(1);
});
