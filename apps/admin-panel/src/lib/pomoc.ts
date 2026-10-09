/**
 * Słownik pomocy „?” panelu admina (propozycja 10.10, sekcja D). Jedno źródło opisu dla ikonki „?”,
 * listy „Działania” i (dalej) Cmd+K oraz asystenta AI pracowników. Treści krótkie: opis i „kiedy” po
 * jednym zdaniu. Bez sekretów, adresów IP i danych klientów — słownik trafi do indeksu asystenta.
 */
export interface WpisPomocy {
  tytul: string;
  opis: string;
  kiedy?: string;
  rozniSieOd?: string;
}

export const POMOC = {
  kreator: {
    tytul: "Kreator węzła",
    opis: "Prowadzi krok po kroku przez zakładanie nowego węzła.",
    kiedy: "Tylko dla nowego węzła — operacje na działającym są na jego karcie.",
  },
  "onboard-live": {
    tytul: "Onboard LIVE",
    opis: "Wgrywa aktualne skrypty Verris (worker migracji, guard, agent), hardening i blokadę ruchu wychodzącego, a na końcu robi raport gotowości.",
    kiedy: "Po deployu zmian w skryptach węzła albo gdy raport gotowości jest czerwony.",
    rozniSieOd: "Aktualizacja stosu zmienia wersje DirectAdmina, CloudLinuksa i LiteSpeeda; Onboard LIVE — skrypty i zabezpieczenia Verris.",
  },
  stos: {
    tytul: "Aktualizacja stosu",
    opis: "Aktualizuje DirectAdmin, CloudLinux i LiteSpeed do najnowszych stabilnych wersji.",
    kiedy: "Po zmianie manifestu stosu albo poprawce bezpieczeństwa producenta.",
    rozniSieOd: "Nie wgrywa skryptów Verris — od tego jest Onboard LIVE.",
  },
  "baza-danych": {
    tytul: "Aktualizacja bazy danych",
    opis: "Zleca agentowi upgrade MariaDB do wersji docelowej floty.",
    kiedy: "Gdy wersja na węźle jest niższa niż docelowa — najlepiej po godzinach.",
  },
  profil: {
    tytul: "Profil hostingu",
    opis: "Ponownie stosuje ustawienia hostingu: poczta, FTP, bazy, CageFS, PHP i strony błędów.",
    kiedy: "Po zmianie profilu albo gdy audyt pokazuje różnice w usługach.",
    rozniSieOd: "Nie zmienia pakietów DA — do tego „Napraw pakiety DA” w Audycie.",
  },
  audyt: {
    tytul: "Audyt zgodności",
    opis: "Porównuje węzeł z planem i dokumentacją DirectAdmina i CloudLinuksa, a przy różnicach proponuje naprawę.",
    kiedy: "Po instalacji, po aktualizacji i przy problemach z kontami.",
  },
  uslugi: {
    tytul: "Usługi hostingowe i pakiety DA",
    opis: "Instaluje i uruchamia brakujące usługi (poczta, FTP, baza, WWW) oraz przywraca limity pakietów DA z planów Verris.",
    kiedy: "Gdy brakuje usługi albo pakiet w DA pokazuje „Bez ograniczeń”.",
  },
  "sonda-da": {
    tytul: "Sonda API DirectAdmina",
    opis: "Sprawdza na jednym koncie, czy odpowiedzi API DirectAdmina mają kształt, którego używa panel. Niczego nie zmienia.",
    kiedy: "Po aktualizacji DirectAdmina.",
  },
  "nowe-konta": {
    tytul: "Przyjmuje nowe konta",
    opis: "Wyłączone — na tym węźle nie powstają nowe konta; istniejące działają bez zmian.",
    kiedy: "Gdy węzeł się zapełnia albo przed pracami.",
    rozniSieOd: "Tryb serwisowy dodatkowo pokazuje klientom powód; wycofanie kończy się przeniesieniem kont.",
  },
  serwis: {
    tytul: "Tryb serwisowy",
    opis: "Blokuje zakładanie kont na czas prac i pokazuje klientom powód zamiast błędu.",
    kiedy: "Na czas planowanych prac na węźle.",
    rozniSieOd: "„Komunikaty o pracach” w Product Ops to zapowiedzi dla klientów (zapowiedziane 48 h wcześniej nie liczą się do SLA) — węzła nie zmieniają.",
  },
  offline: {
    tytul: "Offline",
    opis: "Wyłącza węzeł z użycia: nie dostaje kont i nie liczy się do gotowości startu.",
    kiedy: "Gdy serwera fizycznie nie ma albo jest wyłączony na dłużej.",
  },
  wycofanie: {
    tytul: "Wycofanie",
    opis: "Zamyka węzeł dla nowych kont i pokazuje plan przeniesienia kont. Danych nie przenosi.",
    kiedy: "Przed wymianą albo likwidacją serwera.",
    rozniSieOd: "Wstrzymanie nowych kont jest chwilowe; wycofanie prowadzi do opróżnienia węzła.",
  },
  directadmin: {
    tytul: "DirectAdmin API",
    opis: "Adres, login i klucz API DirectAdmina węzła; test sprawdza połączenie.",
    kiedy: "Po akceptacji nowego węzła albo zmianie klucza.",
  },
  "kopie-offsite": {
    tytul: "Kopie offsite",
    opis: "Jedna konfiguracja Storage Boxa i szyfrowania dla całej floty — bez niej Onboard LIVE się zatrzymuje.",
    kiedy: "Raz przed pierwszym węzłem; zmiana hasła lub soli odcina dostęp do starszych kopii.",
  },
} satisfies Record<string, WpisPomocy>;

export type PomocId = keyof typeof POMOC;
