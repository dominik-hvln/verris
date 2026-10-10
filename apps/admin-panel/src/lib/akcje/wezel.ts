import { krokKreatoraDla } from "@/app/(dashboard)/nodes/wizard/wizard-content";
import type { PomocId } from "@/lib/pomoc";

/**
 * Rejestr działań na węźle (propozycja 10.10, sekcja B) — jedno źródło dla sekcji „Działania” na karcie,
 * a dalej dla Cmd+K i treści pod „?”. Działanie tylko prowadzi do miejsca na karcie (href); uruchamia się
 * tam, z potwierdzeniem.
 *
 * `perm` odpowiada egzekucji w API (apps/api/src/servers/*.admin.controller.ts): metody bez własnego
 * @Roles w `admin/servers` i `admin/waf` są tylko dla ADMIN-a, reszta — @StaffPerm.
 */
export type UprawnienieAkcji = "NODES_VIEW" | "NODES_MANAGE" | "ADMIN";

export type GrupaAkcji = "Instalacja" | "Aktualizacje" | "Audyt i naprawa" | "Dostępność" | "Konfiguracja" | "Dostęp i historia";

export interface WezelDlaAkcji {
  id: string;
  status: string;
}

export interface AkcjaWezla {
  id: string;
  grupa: GrupaAkcji;
  nazwa: string | ((w: WezelDlaAkcji) => string);
  opis: string;
  perm: UprawnienieAkcji | ((w: WezelDlaAkcji) => UprawnienieAkcji);
  kiedy: (w: WezelDlaAkcji) => boolean;
  href: (w: WezelDlaAkcji) => string;
  /** Hasło w słowniku pomocy „?” (lib/pomoc.ts). */
  pomocId?: PomocId;
  /** Bezpieczne do uruchomienia od razu (Cmd+K): otwarcie, SSO, odświeżenie. */
  bezpieczna?: boolean;
  /**
   * Cmd+K uruchamia działanie od razu zamiast prowadzić do karty (decyzja 10.10: tylko bezpieczne).
   * „sso-da” — jednorazowy link logowania do DirectAdmina węzła, ta sama akcja serwera co przycisk na karcie.
   */
  uruchom?: RodzajUruchomienia;
  /** Słowa dla Cmd+K (także angielskie nazwy z runbooków: drain, cordon). */
  slowa: string;
}

export type RodzajUruchomienia = "sso-da";

const dziala = (w: WezelDlaAkcji) => w.status === "ACTIVE" || w.status === "MAINTENANCE";
const zawsze = () => true;
const karta = (w: WezelDlaAkcji, reszta = "") => `/nodes/${w.id}${reszta}`;

export const AKCJE_WEZLA: AkcjaWezla[] = [
  {
    id: "kreator",
    slowa: "kreator dokończ instalację",
    grupa: "Instalacja",
    nazwa: (w) => {
      const k = krokKreatoraDla(w.status);
      return k ? `Dokończ w kreatorze: krok ${k.numer}` : "Kreator węzła";
    },
    opis: "Kreator prowadzi dalej: akceptacja, kopie offsite, Onboard LIVE i profil.",
    // Instalacja (INIT) — NODES_MANAGE; akceptacja i konfiguracja DA (PENDING_APPROVAL) — w API tylko ADMIN.
    perm: (w) => (w.status === "INIT" ? "NODES_MANAGE" : "ADMIN"),
    kiedy: (w) => krokKreatoraDla(w.status) !== null,
    href: (w) => `/nodes/wizard?server=${encodeURIComponent(w.id)}&step=${krokKreatoraDla(w.status)?.id ?? "bootstrap"}`,
    pomocId: "kreator",
  },
  {
    id: "instalacja",
    slowa: "bootstrap skrypt instalacyjny licencja one-liner",
    grupa: "Instalacja",
    nazwa: "Instalacja węzła",
    opis: "Skrypt instalacyjny, klucze licencji i postęp instalacji.",
    perm: "NODES_MANAGE",
    kiedy: (w) => krokKreatoraDla(w.status) !== null,
    href: (w) => karta(w, "#bootstrap"),
  },
  {
    id: "onboard-live",
    slowa: "onboard live skrypty hardening guard",
    grupa: "Aktualizacje",
    nazwa: "Onboard LIVE",
    opis: "Wgrywa aktualne skrypty Verris, hardening i blokadę ruchu wychodzącego.",
    perm: "NODES_MANAGE",
    kiedy: dziala,
    href: (w) => karta(w, "?sekcja=aktualizacje#onboard-live"),
    pomocId: "onboard-live",
  },
  {
    id: "stos",
    slowa: "aktualizuj stos update directadmin cloudlinux litespeed",
    grupa: "Aktualizacje",
    nazwa: "Aktualizuj stos serwera",
    opis: "DirectAdmin, CloudLinux i LiteSpeed do najnowszych stabilnych wersji.",
    perm: "NODES_MANAGE",
    kiedy: dziala,
    href: (w) => karta(w, "?sekcja=aktualizacje#stos"),
    pomocId: "stos",
  },
  {
    id: "baza-danych",
    slowa: "mariadb mysql upgrade db",
    grupa: "Aktualizacje",
    nazwa: "Aktualizacja bazy danych",
    opis: "MariaDB do wersji docelowej floty.",
    perm: "ADMIN",
    kiedy: dziala,
    href: (w) => karta(w, "?sekcja=aktualizacje#baza-danych"),
    pomocId: "baza-danych",
  },
  {
    id: "profil",
    slowa: "profil hostingu poczta ftp cagefs php",
    grupa: "Aktualizacje",
    nazwa: "Profil hostingu",
    opis: "Poczta, FTP, bazy, CageFS i PHP — ponowne zastosowanie ustawień.",
    perm: "ADMIN",
    kiedy: dziala,
    href: (w) => karta(w, "?sekcja=aktualizacje#profil"),
    pomocId: "profil",
  },
  {
    id: "audyt",
    slowa: "audyt zgodność napraw",
    grupa: "Audyt i naprawa",
    nazwa: "Audyt zgodności",
    opis: "Sprawdza węzeł z planem i dokumentacją; naprawy wykrytych różnic.",
    perm: "NODES_VIEW",
    kiedy: dziala,
    href: (w) => karta(w, "?sekcja=audyt"),
    pomocId: "audyt",
  },
  {
    id: "uslugi",
    slowa: "usługi pakiety da napraw",
    grupa: "Audyt i naprawa",
    nazwa: "Usługi hostingowe i pakiety DA",
    opis: "Instaluje brakujące usługi i naprawia limity pakietów DA.",
    perm: "ADMIN",
    kiedy: dziala,
    href: (w) => karta(w, "?sekcja=audyt#uslugi"),
    pomocId: "uslugi",
  },
  {
    id: "sonda-da",
    slowa: "sonda api da",
    grupa: "Audyt i naprawa",
    nazwa: "Sonda API DirectAdmina",
    opis: "Czy odpowiedzi API DA mają kształt, którego używa panel.",
    perm: "ADMIN",
    kiedy: dziala,
    href: (w) => karta(w, "?sekcja=audyt#sonda-da"),
    pomocId: "sonda-da",
  },
  {
    id: "nowe-konta",
    slowa: "cordon wstrzymaj nowe konta limity nadsubskrypcja pojemność",
    grupa: "Dostępność",
    nazwa: "Przyjmuje nowe konta",
    opis: "Wstrzymanie nowych kont na tym węźle, limity i nadsubskrypcja.",
    perm: "NODES_MANAGE",
    kiedy: dziala,
    href: (w) => karta(w, "?sekcja=konfiguracja#pojemnosc"),
    pomocId: "nowe-konta",
  },
  {
    id: "serwis",
    slowa: "tryb serwisowy maintenance",
    grupa: "Dostępność",
    nazwa: "Tryb serwisowy",
    opis: "Wstrzymuje zakładanie kont na czas prac, z komunikatem dla klienta.",
    perm: "NODES_MANAGE",
    kiedy: dziala,
    href: (w) => karta(w, "?sekcja=konfiguracja#serwis"),
    pomocId: "serwis",
  },
  {
    id: "offline",
    slowa: "offline wyłącz",
    grupa: "Dostępność",
    nazwa: "Offline",
    opis: "Wyłącza węzeł z użycia, gdy serwera już nie ma.",
    perm: "ADMIN",
    kiedy: (w) => dziala(w) || w.status === "OFFLINE",
    href: (w) => karta(w, "?sekcja=konfiguracja#status"),
    pomocId: "offline",
  },
  {
    id: "wycofanie",
    slowa: "drain wycofaj opróżnij",
    grupa: "Dostępność",
    nazwa: "Wycofanie węzła",
    opis: "Zamyka węzeł dla nowych kont i pokazuje plan przeniesienia kont.",
    perm: "NODES_MANAGE",
    kiedy: dziala,
    href: (w) => karta(w, "?sekcja=wycofanie"),
    pomocId: "wycofanie",
  },
  {
    id: "directadmin",
    slowa: "directadmin da api login",
    grupa: "Konfiguracja",
    nazwa: "DirectAdmin API",
    opis: "Adres, login i test połączenia z API panelu.",
    perm: "ADMIN",
    kiedy: zawsze,
    href: (w) => karta(w, "?sekcja=konfiguracja#directadmin"),
    pomocId: "directadmin",
  },
  {
    id: "nameservers",
    slowa: "ns dns ovh",
    grupa: "Konfiguracja",
    nazwa: "Serwery nazw i OVH",
    opis: "NS dla kont zakładanych na węźle i podpięcie w OVH.",
    perm: "ADMIN",
    kiedy: zawsze,
    href: (w) => karta(w, "?sekcja=konfiguracja#nameservers"),
  },
  {
    id: "region",
    slowa: "region centrum danych",
    grupa: "Konfiguracja",
    nazwa: "Lokalizacja danych",
    opis: "Centrum danych, które widzą klienci tego węzła.",
    perm: "ADMIN",
    kiedy: zawsze,
    href: (w) => karta(w, "?sekcja=konfiguracja#region"),
  },
  {
    id: "waf",
    slowa: "waf zapora modsecurity",
    grupa: "Konfiguracja",
    nazwa: "WAF",
    opis: "Tryb zapory aplikacji dla kont na węźle.",
    perm: "ADMIN",
    kiedy: dziala,
    href: (w) => karta(w, "?sekcja=konfiguracja#waf"),
  },
  {
    id: "sso",
    slowa: "sso ssh zaloguj directadmin",
    grupa: "Dostęp i historia",
    nazwa: "Zaloguj do DA węzła (SSO)",
    opis: "Jednorazowy link logowania do panelu DA (2 minuty); SSH — w nagłówku karty.",
    // POST admin/servers/:id/sso-url — tylko ADMIN, tworzenie linku trafia do dziennika (NODE_ADMIN_SSO_URL_CREATED).
    perm: "ADMIN",
    kiedy: zawsze,
    href: (w) => karta(w, "#dostep"),
    bezpieczna: true,
    uruchom: "sso-da",
  },
  {
    id: "zadania",
    slowa: "zadania historia log agent",
    grupa: "Dostęp i historia",
    nazwa: "Historia zadań",
    opis: "Co agent wykonał na węźle i z jakim wynikiem.",
    perm: "NODES_VIEW",
    kiedy: zawsze,
    href: (w) => karta(w, "?sekcja=zadania"),
    bezpieczna: true,
  },
];

export interface DostepDoAkcji {
  isAdmin: boolean;
  permissions: string[];
}

/**
 * Warunek uprawnień działania, jak w API: nazwa; lista — wystarcza którekolwiek (@StaffPermAny);
 * `{ wszystkie }` — potrzebne każde z listy (np. strażnik kontrolera + sprawdzenie w serwisie);
 * „ADMIN” — tylko administrator.
 */
export type WarunekUprawnien = string | readonly string[] | { readonly wszystkie: readonly string[] };

/** Tekst dymka przy wyszarzonym działaniu; null — operator może je wykonać. */
export function brakUprawnienia(perm: WarunekUprawnien, dostep: DostepDoAkcji): string | null {
  if (dostep.isAdmin) return null;
  if (typeof perm === "object" && "wszystkie" in perm) {
    if (perm.wszystkie.includes("ADMIN")) return "Wymaga roli administratora";
    const brakuje = perm.wszystkie.filter((p) => !dostep.permissions.includes(p));
    return brakuje.length ? `Wymaga ${brakuje.join(" i ")}` : null;
  }
  const lista = typeof perm === "string" ? [perm] : perm;
  if (lista.includes("ADMIN")) return "Wymaga roli administratora";
  return lista.some((p) => dostep.permissions.includes(p)) ? null : `Wymaga ${lista.join(" lub ")}`;
}

export interface DzialanieNaKarcie {
  id: string;
  grupa: string;
  nazwa: string;
  opis: string;
  href: string;
  pomocId?: PomocId;
  slowa: string;
  /** Działanie wyszarzone — powód (dymek); null, gdy dostępne. */
  zablokowane: string | null;
  /** Bez uprawnień można wysłać wniosek (WYMAGA_WNIOSKU) — pozycja prowadzi do formularza z „Wyślij wniosek”. */
  wniosek?: boolean;
  /** Prowadzi poza panel admina (panel obsługi) — otwiera się w nowej karcie. */
  zewnetrzny?: boolean;
  /** Cmd+K uruchamia od razu (bezpieczne działanie) — rodzaj i ID obiektu. */
  uruchom?: { rodzaj: RodzajUruchomienia; id: string };
}

/** Działania dostępne dla węzła w danym stanie; bez uprawnień — wyszarzone, nie ukryte (decyzja 10.10). */
export function akcjeWezla(w: WezelDlaAkcji, dostep: DostepDoAkcji): DzialanieNaKarcie[] {
  return AKCJE_WEZLA.filter((a) => a.kiedy(w)).map((a) => ({
    id: a.id,
    grupa: a.grupa,
    nazwa: typeof a.nazwa === "function" ? a.nazwa(w) : a.nazwa,
    opis: a.opis,
    href: a.href(w),
    pomocId: a.pomocId,
    slowa: a.slowa,
    zablokowane: brakUprawnienia(typeof a.perm === "function" ? a.perm(w) : a.perm, dostep),
    ...(a.uruchom ? { uruchom: { rodzaj: a.uruchom, id: w.id } } : {}),
  }));
}
