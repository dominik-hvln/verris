import { POMOC } from "@/lib/pomoc";
import { AKCJE_FAKTURY } from "./faktura";
import { AKCJE_KLIENTA } from "./klient";
import { AKCJE_USLUGI } from "./usluga";

/**
 * Fala 1B — działania dodane w patchach 9–11 porządków (usługa, faktura, klient) mają hasło w słowniku „?”
 * (libs/contracts/src/pomoc-admina.ts): pokazuje się w sekcji „Działania”, w Cmd+K i trafia do asystenta.
 */
const OCZEKIWANE: [string, string, string, readonly { id: string; pomocId?: string }[]][] = [
  ["usługa", "zakladanie", "zakladanie", AKCJE_USLUGI],
  ["usługa", "migracje", "zlecenia-migracji", AKCJE_USLUGI],
  ["faktura", "korekta", "korekta", AKCJE_FAKTURY],
  ["faktura", "anuluj", "anuluj-fakture", AKCJE_FAKTURY],
  ["faktura", "ksef", "ksef-ponow", AKCJE_FAKTURY],
  ["klient", "blokada-poczty", "blokada-poczty", AKCJE_KLIENTA],
  ["klient", "reseller", "reseller", AKCJE_KLIENTA],
  ["klient", "partner", "program-partnerski", AKCJE_KLIENTA],
];

it.each(OCZEKIWANE)("%s, działanie %s → hasło „%s” w słowniku, opis i „kiedy” po jednym zdaniu", (_obiekt, id, pomocId, rejestr) => {
  expect(rejestr.find((a) => a.id === id)?.pomocId).toBe(pomocId);
  const wpis = (POMOC as Record<string, { tytul: string; opis: string; kiedy?: string }>)[pomocId];
  expect(wpis).toBeDefined();
  for (const zdanie of [wpis.opis, wpis.kiedy ?? ""]) {
    expect(zdanie.length).toBeGreaterThan(0);
    // Jedno zdanie: kropka tylko na końcu (decyzja właściciela: teksty krótkie).
    expect(zdanie.replace(/\.$/, "")).not.toMatch(/\.\s/);
  }
});

it("każde pomocId w rejestrach usługi, faktury i klienta istnieje w słowniku", () => {
  for (const a of [...AKCJE_USLUGI, ...AKCJE_FAKTURY, ...AKCJE_KLIENTA]) {
    if (a.pomocId) expect(Object.keys(POMOC)).toContain(a.pomocId);
  }
});
