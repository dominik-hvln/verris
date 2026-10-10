import type { PomocId } from "@/lib/pomoc";
import { brakUprawnienia, type DostepDoAkcji, type DzialanieNaKarcie } from "./wezel";

/**
 * Wspólny kształt rejestru działań karty (klient, usługa, faktura — propozycja 10.10, sekcja B). Jedno źródło
 * dla sekcji „Działania” na karcie i dla Cmd+K (tryb obiekt → działanie). Działanie prowadzi do miejsca na
 * karcie (href); uruchamia się tam, z potwierdzeniem.
 *
 * Pola stanu obiektu są opcjonalne: na karcie znamy je wszystkie, w Cmd+K tylko to, co zwróciła wyszukiwarka.
 * `kiedy` traktuje brak wiedzy jako „pokaż” — operator zobaczy stan na karcie.
 */
export interface AkcjaObiektu<T> {
  id: string;
  grupa: string;
  nazwa: string | ((o: T) => string);
  opis: string;
  /** Uprawnienie jak w API; lista — wystarcza którekolwiek; „ADMIN” — tylko administrator. */
  perm: string | readonly string[];
  kiedy: (o: T) => boolean;
  href: (o: T) => string;
  slowa: string;
  pomocId?: PomocId;
  /** Bezpieczne do uruchomienia od razu (Cmd+K): otwarcie karty, odświeżenie. */
  bezpieczna?: boolean;
  /** Bez uprawnień można wysłać wniosek (API: @WniosekMozliwy) z miejsca, do którego prowadzi href. */
  wniosek?: boolean;
  /** Prowadzi poza panel admina (panel obsługi). */
  zewnetrzna?: (o: T) => boolean;
}

/** Działania obiektu w jego stanie; bez uprawnień — wyszarzone, nie ukryte (decyzja 10.10). */
export function dzialaniaObiektu<T>(rejestr: readonly AkcjaObiektu<T>[], o: T, dostep: DostepDoAkcji): DzialanieNaKarcie[] {
  return rejestr
    .filter((a) => a.kiedy(o))
    .map((a) => ({
      id: a.id,
      grupa: a.grupa,
      nazwa: typeof a.nazwa === "function" ? a.nazwa(o) : a.nazwa,
      opis: a.opis,
      href: a.href(o),
      pomocId: a.pomocId,
      slowa: a.slowa,
      zablokowane: brakUprawnienia(a.perm, dostep),
      ...(a.wniosek ? { wniosek: true } : {}),
      ...(a.zewnetrzna?.(o) ? { zewnetrzny: true } : {}),
    }));
}
