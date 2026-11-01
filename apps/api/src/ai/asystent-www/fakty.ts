/**
 * „Fakty o działaniu” — jedyna wiedza asystenta www spoza cennika, specyfikacji i bazy wiedzy (1.11.2026).
 * Każdy fakt jest językiem klienta i ma w komentarzu źródło w kodzie albo na verris.pl, gdzie go potwierdzono.
 * Zasada: nic, czego nie ma w kodzie albo na stronie. Zmiana faktu = zmiana kodu (przegląd w PR), nie ustawienie.
 * NIGDY: nazwy oprogramowania serwera spoza strony, dostawcy i lokalizacje serwerów, adresy węzłów, kod.
 */
export interface Fakt {
  id: string;
  tytul: string;
  tresc: string;
  /** Adres publiczny, na który asystent może odesłać po szczegóły. */
  url: string;
}

export const FAKTY: Fakt[] = [
  // apps/www/src/app/(frontend)/przenies-strone/page.tsx, apps/api/src/subscriptions/migration-orchestrator.service.ts
  {
    id: 'fakt-przeniesienie',
    tytul: 'Przeniesienie strony',
    tresc:
      'Przeniesienie strony, baz danych i poczty jest w cenie hostingu (0 zł). Klient podaje dostęp do starego hostingu (panel cPanel, panel Plesk albo samo FTP), a kopiowanie plików, baz i skrzynek odbywa się za niego; postęp każdego etapu widać w panelu. Hasła do starego hostingu są szyfrowane i kasowane po przeniesieniu. Stara strona działa przez cały czas, a domenę klient przełącza sam, dopiero gdy sprawdzi nową stronę na adresie testowym. Tuż przed przełączeniem można dograć zmiany, które zaszły w trakcie. Orientacyjnie: udział klienta to ok. 5 minut; strona firmowa do 1 GB kopiuje się zwykle 15–30 minut, sklep 1–10 GB 30–90 minut — zależy od rozmiaru i szybkości starego serwera. Przerwy w działaniu strony nie ma. Przeniesienie z samego pliku kopii (bez dostępu do starego hostingu) nie jest obsługiwane automatycznie — wtedy trzeba napisać do zespołu.',
    url: 'https://verris.pl/przenies-strone',
  },
  // apps/www/src/lib/specyfikacja.ts (Zasoby), apps/api/src/autoscaling/*, /hosting
  {
    id: 'fakt-autoskalowanie',
    tytul: 'Autoskalowanie',
    tresc:
      'Pakiet ma 50 GB dysku NVMe oraz limit do 8 GB RAM i do 2 vCPU (to sufity, z których konto korzysta w miarę potrzeby, nie zasoby zarezerwowane na stałe). Gdy na stronie rośnie ruch (np. promocja, kampania), konto dostaje automatycznie więcej mocy — w szczycie do 24 vCPU, 64 GB RAM i 1000 GB dysku — a po szczycie wraca do zasobów pakietu. Dodatkową moc rozlicza się tylko za czas użycia, w blokach po 15 minut, według stawek z cennika. Klient sam włącza autoskalowanie i ustawia w panelu miesięczny limit kosztu; po jego osiągnięciu moc już nie rośnie, a strona działa na zasobach pakietu.',
    url: 'https://verris.pl/hosting',
  },
  // apps/www/src/lib/specyfikacja.ts (Kopie), apps/api/src/subscriptions/hosting-restore.service.ts
  {
    id: 'fakt-kopie',
    tytul: 'Kopie zapasowe',
    tresc:
      'Kopia powstaje codziennie na serwerze (7 ostatnich) oraz poza serwerem, szyfrowana, z każdego z ostatnich 30 dni. Klient sam przywraca w panelu pliki, bazy danych albo pocztę z wybranego dnia, bez zgłoszenia; przed przywróceniem zapisywana jest kopia bezpieczeństwa obecnego stanu.',
    url: 'https://verris.pl/funkcje/kopie-zapasowe',
  },
  // apps/www/src/app/(frontend)/poczta/page.tsx, apps/api/src/cli/seed-knowledge-base.ts (konfiguracja poczty)
  {
    id: 'fakt-poczta',
    tytul: 'Poczta w domenie',
    tresc:
      'Poczta jest w cenie hostingu. Liczba skrzynek nie jest ograniczona — granicą jest 50 GB miejsca konta, wspólne dla stron i poczty. Skrzynka ma domyślnie 1 GB, można ją powiększyć do 100 GB. Z konta można wysłać do 1000 wiadomości na dobę; poczta nie służy do masowych newsletterów. Są aliasy, przekierowania, autoresponder, filtr antyspamowy, kalendarz i kontakty (CalDAV, CardDAV), webmail z logowaniem z panelu oraz kreator rekordów SPF, DKIM i DMARC. Programy pocztowe: IMAP port 993 i SMTP port 465 (SSL/TLS) albo 587 (STARTTLS); adres serwera jest w panelu przy usłudze. Skrzynki z innego hostingu przenosimy za darmo, razem z folderami. Jest też osobna usługa samej poczty, bez hostingu strony — jej cena jest w cenniku.',
    url: 'https://verris.pl/poczta',
  },
  // apps/api/prisma: Domain.autoRenew @default(false); apps/api/src/domains/domain-expiry-reminder.scheduler.ts
  {
    id: 'fakt-domeny',
    tytul: 'Domeny',
    tresc:
      'Domeny nie odnawiają się automatycznie — klient odnawia je sam w panelu, kiedy chce. Przypomnienie o końcu okresu przychodzi 30, 14 i 7 dni przed terminem. W panelu są ustawienia DNS, DNSSEC, ukrycie danych w WHOIS i kod transferu na żądanie. Ceny rejestracji i odnowienia domen są w cenniku domen w panelu. W czasie okresu próbnego rejestracja i transfer domen są niedostępne.',
    url: 'https://verris.pl/domeny',
  },
  // Regulamin 1.0.0 §15 (opublikowany), apps/www/src/lib/specyfikacja.ts (Kopie i gwarancje)
  {
    id: 'fakt-sla',
    tytul: 'Dostępność i rekompensata (SLA)',
    tresc:
      'Gwarantowana dostępność to 99,5% w miesiącu kalendarzowym. Gdy jest niższa, rekompensata przysługuje na wniosek, według regulaminu: 5% opłaty poniżej 99,5%, 25% poniżej 99%, 50% poniżej 95% i 100% poniżej 90%. Każde zakłócenie widać publicznie na stronie statusu.',
    url: 'https://status.verris.pl',
  },
  // apps/www/src/app/(frontend)/cennik/page.tsx, regulamin §7
  {
    id: 'fakt-ceny-zasady',
    tytul: 'Zasady cen i płatności',
    tresc:
      'Jest jeden pakiet hostingu, bez wyboru wersji. Cena przy odnowieniu jest taka sama jak przy zakupie — nie ma taniego pierwszego roku. Rozliczenie miesięczne albo roczne; przed odnowieniem przychodzi przypomnienie e-mailem, a z odnowienia można zrezygnować w panelu. Płatność: karta, BLIK, szybki przelew albo Kredyty Verris z portfela. Fakturę VAT po każdej płatności klient znajduje w panelu.',
    url: 'https://verris.pl/cennik',
  },
  // apps/www/src/app/(frontend)/funkcje/statystyki/page.tsx
  {
    id: 'fakt-statystyki',
    tytul: 'Statystyki bez cookies',
    tresc:
      'W cenie hostingu są statystyki odwiedzin: odwiedzający, odsłony, najczęściej czytane strony, źródła wejść i urządzenia. Działają bez plików cookies na stronie klienta.',
    url: 'https://verris.pl/funkcje/statystyki',
  },
  // apps/www/src/app/(frontend)/dokumenty/page.tsx, docs/legal (DPA)
  {
    id: 'fakt-rodo',
    tytul: 'RODO i dane',
    tresc:
      'Dane są przechowywane w Unii Europejskiej. Umowę powierzenia przetwarzania danych (DPA) klient akceptuje w panelu; regulamin, polityka prywatności i lista podprocesorów są publiczne. Usługę świadczy HVLN Dominik Kowalski, Zielona Góra, NIP 9292069367.',
    url: 'https://verris.pl/dokumenty',
  },
  // apps/www/src/app/(frontend)/kontakt/page.tsx, PasRozmowy
  {
    id: 'fakt-kontakt',
    tytul: 'Kontakt z człowiekiem',
    tresc:
      'Odpisuje człowiek, nie bot: formularz kontaktowy i e-mail kontakt@verris.pl. Można też zostawić numer w „Poproś o telefon” — oddzwaniamy w dni robocze 9–17, zwykle tego samego dnia. Pomoc i poradniki są na pomoc.verris.pl.',
    url: 'https://verris.pl/kontakt',
  },
];

/**
 * Fakt dynamiczny: okres próbny zależy od planu (trialDays w adminie). Bez próby asystent mówi, że jej nie ma —
 * nie obiecuje. Ograniczenia próby: apps/api/src/subscriptions/okres-probny.ts.
 */
export function faktProby(trialDays: number, limitWysylki: number): Fakt {
  return trialDays > 0
    ? {
        id: 'fakt-proba',
        tytul: 'Okres próbny',
        tresc: `Hosting można wypróbować przez ${trialDays} dni za darmo, bez podawania karty. W czasie próby: wysyłka do ${limitWysylki} wiadomości na dobę, bez rejestracji i transferu domen i bez dodatkowej mocy (autoskalowania). Próba nie zamienia się sama w płatną usługę: po jej końcu usługa jest zawieszana, a jeśli klient nie opłaci jej w ciągu 14 dni, dane są usuwane.`,
        url: 'https://verris.pl/hosting',
      }
    : {
        id: 'fakt-proba',
        tytul: 'Okres próbny',
        tresc:
          'Obecnie hosting nie ma darmowego okresu próbnego. Przeniesienie strony jest w cenie, a stara strona działa do momentu przełączenia domeny, więc można spokojnie sprawdzić nową stronę przed przełączeniem.',
        url: 'https://verris.pl/hosting',
      };
}
