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
}

const dziala = (w: WezelDlaAkcji) => w.status === "ACTIVE" || w.status === "MAINTENANCE";
const zawsze = () => true;
const karta = (w: WezelDlaAkcji, reszta = "") => `/nodes/${w.id}${reszta}`;

export const AKCJE_WEZLA: AkcjaWezla[] = [
  {
    id: "kreator",
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
    grupa: "Instalacja",
    nazwa: "Instalacja węzła",
    opis: "Skrypt instalacyjny, klucze licencji i postęp instalacji.",
    perm: "NODES_MANAGE",
    kiedy: (w) => krokKreatoraDla(w.status) !== null,
    href: (w) => karta(w, "#bootstrap"),
  },
  {
    id: "onboard-live",
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
    grupa: "Konfiguracja",
    nazwa: "Serwery nazw i OVH",
    opis: "NS dla kont zakładanych na węźle i podpięcie w OVH.",
    perm: "ADMIN",
    kiedy: zawsze,
    href: (w) => karta(w, "?sekcja=konfiguracja#nameservers"),
  },
  {
    id: "region",
    grupa: "Konfiguracja",
    nazwa: "Lokalizacja danych",
    opis: "Centrum danych, które widzą klienci tego węzła.",
    perm: "ADMIN",
    kiedy: zawsze,
    href: (w) => karta(w, "?sekcja=konfiguracja#region"),
  },
  {
    id: "waf",
    grupa: "Konfiguracja",
    nazwa: "WAF",
    opis: "Tryb zapory aplikacji dla kont na węźle.",
    perm: "ADMIN",
    kiedy: dziala,
    href: (w) => karta(w, "?sekcja=konfiguracja#waf"),
  },
  {
    id: "sso",
    grupa: "Dostęp i historia",
    nazwa: "DirectAdmin (SSO) i SSH",
    opis: "Jednorazowe logowanie do panelu DA i komenda SSH — w nagłówku karty.",
    perm: "ADMIN",
    kiedy: zawsze,
    href: (w) => karta(w, "#dostep"),
    bezpieczna: true,
  },
  {
    id: "zadania",
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

/** Tekst dymka przy wyszarzonym działaniu; null — operator może je wykonać. */
export function brakUprawnienia(perm: UprawnienieAkcji, dostep: DostepDoAkcji): string | null {
  if (dostep.isAdmin) return null;
  if (perm === "ADMIN") return "Wymaga roli administratora";
  return dostep.permissions.includes(perm) ? null : `Wymaga ${perm}`;
}

export interface DzialanieNaKarcie {
  id: string;
  grupa: GrupaAkcji;
  nazwa: string;
  opis: string;
  href: string;
  pomocId?: PomocId;
  /** Działanie wyszarzone — powód (dymek); null, gdy dostępne. */
  zablokowane: string | null;
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
    zablokowane: brakUprawnienia(typeof a.perm === "function" ? a.perm(w) : a.perm, dostep),
  }));
}
