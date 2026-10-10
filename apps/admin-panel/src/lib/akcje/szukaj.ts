import { bezOgonkow, ocenaTrafienia, slowaZapytania } from "@/lib/dopasowanie";
import { AKCJE_FAKTURY } from "./faktura";
import { AKCJE_GLOBALNE } from "./globalne";
import { AKCJE_KLIENTA } from "./klient";
import { dzialaniaObiektu } from "./rejestr";
import { AKCJE_USLUGI } from "./usluga";
import { AKCJE_WEZLA, akcjeWezla, brakUprawnienia, type DostepDoAkcji, type DzialanieNaKarcie, type WezelDlaAkcji } from "./wezel";

/** Pozycja „działanie” w Cmd+K: prowadzi do miejsca na karcie/stronie; wyszarzona bez uprawnień. */
export interface AkcjaWPalecie {
  id: string;
  nazwa: string;
  opis: string;
  href: string;
  zablokowane: string | null;
  /** Wyszarzone, ale prowadzi do formularza z „Wyślij wniosek” (decyzja 10.10). */
  wniosek?: boolean;
  /** Bezpieczne działanie uruchamiane od razu z palety (np. SSO do DA węzła); tylko gdy nie jest zablokowane. */
  uruchom?: DzialanieNaKarcie["uruchom"];
}

const doPalety = (d: DzialanieNaKarcie, przyrostek = ""): AkcjaWPalecie => ({
  id: d.id,
  nazwa: `${d.nazwa}${przyrostek}`,
  opis: d.opis,
  href: d.href,
  zablokowane: d.zablokowane,
  ...(d.zablokowane && d.wniosek ? { wniosek: true } : {}),
  ...(!d.zablokowane && d.uruchom ? { uruchom: d.uruchom } : {}),
});

/** Działania pasujące do zapytania (puste — wszystkie), w kolejności trafienia, potem rejestru. */
function dopasuj(dzialania: DzialanieNaKarcie[], q: string): AkcjaWPalecie[] {
  const slowa = slowaZapytania(q);
  return dzialania
    .map((d, i) => ({ d, i, o: slowa.length ? ocenaTrafienia(d.nazwa, `${d.grupa} ${d.slowa}`, slowa) : 0 }))
    .filter((x): x is { d: DzialanieNaKarcie; i: number; o: number } => x.o !== null)
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => doPalety(x.d));
}

/** Działania węzła pasujące do zapytania (puste — wszystkie dostępne w jego stanie). */
export function akcjeWezlaDlaZapytania(w: WezelDlaAkcji, q: string, dostep: DostepDoAkcji): AkcjaWPalecie[] {
  return dopasuj(akcjeWezla(w, dostep), q);
}

/** Wynik wyszukiwarki, dla którego paleta ma tryb obiekt → działanie (Tab albo →). */
export interface ObiektPalety {
  type: string;
  id: string;
  status?: string;
  userId?: string | null;
  ksefStatus?: string;
  zakladanieNieudane?: boolean;
}

/** Typy wyników z rejestrem działań; nazwa do chipa w polu („Klient jan@firma.pl”). */
export const OBIEKTY_Z_DZIALANIAMI: Record<string, string> = { node: "Węzeł", user: "Klient", service: "Usługa", invoice: "Faktura" };

/**
 * Działania obiektu z wyszukiwarki (plan E, patche 9–11). Stan znany tylko częściowo (status, właściciel) —
 * rejestr pokazuje to, czego nie da się wykluczyć; operator widzi resztę na karcie. W palecie nie ma linków
 * zewnętrznych: „Odpowiedz na zgłoszenie” prowadzi do zakładki zgłoszeń klienta.
 */
export function akcjeObiektuDlaZapytania(o: ObiektPalety, q: string, dostep: DostepDoAkcji): AkcjaWPalecie[] {
  switch (o.type) {
    case "node":
      return akcjeWezlaDlaZapytania({ id: o.id, status: o.status ?? "" }, q, dostep);
    case "user":
      return dopasuj(dzialaniaObiektu(AKCJE_KLIENTA, { id: o.id }, dostep), q);
    case "service":
      return dopasuj(dzialaniaObiektu(AKCJE_USLUGI, { id: o.id, status: o.status, zakladanieNieudane: o.zakladanieNieudane, klientId: o.userId ?? null }, dostep), q);
    case "invoice":
      return dopasuj(dzialaniaObiektu(AKCJE_FAKTURY, { id: o.id, status: o.status, ksefStatus: o.ksefStatus, klientId: o.userId ?? null }, dostep), q);
    default:
      return [];
  }
}

/** Działania globalne pasujące do zapytania. */
export function szukajAkcjiGlobalnych(q: string, dostep: DostepDoAkcji, max = 4): AkcjaWPalecie[] {
  const slowa = slowaZapytania(q);
  if (!slowa.length) return [];
  return AKCJE_GLOBALNE.map((a, i) => ({ a, i, o: ocenaTrafienia(a.nazwa, a.slowa, slowa) }))
    .filter((x) => x.o !== null)
    .sort((x, y) => (x.o as number) - (y.o as number) || x.i - y.i)
    .slice(0, max)
    .map(({ a }) => ({ id: a.id, nazwa: a.nazwa, opis: a.opis, href: a.href, zablokowane: brakUprawnienia(a.perm, dostep) }));
}

/** Słowa nazw i słów kluczowych działań węzła (bez polskich znaków) — do rozpoznania „onboard” w „onboard t1”. */
const SLOWA_DZIALAN = AKCJE_WEZLA.flatMap((a) => bezOgonkow(`${typeof a.nazwa === "string" ? a.nazwa : ""} ${a.slowa}`).split(/[^a-z0-9]+/)).filter((t) => t.length > 1);
// Od 3 znaków: „t1”, „pl” itp. to raczej węzeł niż początek działania.
const pasujeDoAkcjiWezla = (w: string) => w.length >= 3 && SLOWA_DZIALAN.some((t) => t.startsWith(w));

/**
 * „onboard t1” → słowa działania („onboard”) i reszta do wyszukania węzła („t1”). Słowo jest słowem działania,
 * gdy od niego zaczyna się słowo nazwy albo słowo kluczowe któregoś działania węzła. null — brak słowa
 * działania albo brak reszty.
 */
export function rozbierzZapytanie(q: string): { dzialanie: string; obiekt: string } | null {
  const slowa = q.trim().split(/\s+/).filter(Boolean);
  const dzialanie = slowa.filter((w) => pasujeDoAkcjiWezla(bezOgonkow(w)));
  const obiekt = slowa.filter((w) => !dzialanie.includes(w));
  if (!dzialanie.length || !obiekt.length) return null;
  return { dzialanie: dzialanie.join(" "), obiekt: obiekt.join(" ") };
}

/** Wyniki „działanie · węzeł” dla zapytania rozbitego przez rozbierzZapytanie. */
export function akcjeDlaWezlow(
  wezly: { id: string; title: string; status?: string }[],
  dzialanie: string,
  dostep: DostepDoAkcji,
): AkcjaWPalecie[] {
  return wezly.flatMap((n) =>
    akcjeWezlaDlaZapytania({ id: n.id, status: n.status ?? "" }, dzialanie, dostep).map((a) => ({ ...a, id: `${n.id}:${a.id}`, nazwa: `${a.nazwa} · ${n.title}` })),
  );
}
