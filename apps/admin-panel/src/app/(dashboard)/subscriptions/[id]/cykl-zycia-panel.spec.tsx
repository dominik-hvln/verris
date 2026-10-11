/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** F3.5 — cykl życia usługi na karcie: uprawnienia jak w API, powód obowiązkowy, potwierdzenie, wnioski poniżej L4. */
const cykl = jest.fn();
const dodatki = jest.fn();
const dodaj = jest.fn();
jest.mock("./cykl-zycia-actions", () => ({
  cyklZyciaAction: (...a: unknown[]) => cykl(...a),
  dodatkiUslugiAction: (...a: unknown[]) => dodatki(...a),
  dodajDodatekAction: (...a: unknown[]) => dodaj(...a),
}));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));
jest.mock("@/components/select", () => ({
  Select: (p: { value: string; onChange: (v: string) => void; "aria-label"?: string }) => (
    <input aria-label={p["aria-label"]} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  ),
}));
jest.mock("@/components/pole-daty", () => ({
  PoleDaty: (p: { value: string; onChange: (v: string) => void; "aria-label"?: string }) => (
    <input aria-label={p["aria-label"]} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  ),
}));
jest.mock("@/components/wniosek-operacji", () => ({
  WyslijWniosek: (p: { typ: string; payload: unknown; gotowe?: boolean }) => (
    <div data-wniosek={p.typ} data-gotowe={String(p.gotowe ?? true)} data-payload={JSON.stringify(p.payload)} />
  ),
}));

import { CyklZyciaPanel, nowyKoniec, type UslugaCyklu } from "./cykl-zycia-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const KONIEC = "2026-11-20T09:30:00.000Z";
const AKTYWNA: UslugaCyklu = { id: "s1", userId: "u1", status: "ACTIVE", currentPeriodEnd: KONIEC, cancelAt: null, paymentPromiseUntil: null, kartaCykliczna: false };
const L2 = { isAdmin: false, permissions: ["SUBSCRIPTIONS_MANAGE", "CUSTOMERS_VIEW"] };
const L3 = { isAdmin: false, permissions: ["SUBSCRIPTIONS_MANAGE", "CUSTOMERS_VIEW", "SUBSCRIPTIONS_SUSPEND"] };
const L4 = { isAdmin: false, permissions: ["SUBSCRIPTIONS_MANAGE", "CUSTOMERS_VIEW", "SUBSCRIPTIONS_SUSPEND", "BILLING_MANAGE"] };
const POWOD = "Klient prosi w zgłoszeniu o rezygnację.";

let root: Root | undefined;
let k: HTMLElement;
const render = async (u: UslugaCyklu, dostep: { isAdmin: boolean; permissions: string[] }) => {
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root!.render(<CyklZyciaPanel u={u} dostep={dostep as never} />));
};
const przycisk = (a: string) => k.querySelector<HTMLButtonElement>(`[data-akcja="${a}"]`)!;
const wpisz = async (pole: HTMLInputElement, tekst: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pole, tekst);
    pole.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const klik = (b: HTMLElement) => act(async () => b.click());

beforeEach(() => {
  cykl.mockReset().mockResolvedValue({ ok: true, komunikat: "Zapisano." });
  dodatki.mockReset().mockResolvedValue({ ok: true, wynik: { catalog: [{ slug: "dedicated_ip", name: "Dedykowane IP", description: "", price: "25.00", currency: "PLN" }], purchased: [] } });
  dodaj.mockReset().mockResolvedValue({ ok: true, komunikat: "Dodano." });
  potwierdz.mockClear();
});
afterEach(() => act(() => root?.unmount()));

it("nowy koniec okresu: dzień z kalendarza, godzina jak w obecnym końcu", () => {
  expect(nowyKoniec("2026-11-27", KONIEC)?.toISOString()).toBe("2026-11-27T09:30:00.000Z");
  expect(nowyKoniec("27.11.2026", KONIEC)).toBeNull();
  expect(nowyKoniec("2026-11-27", null)).toBeNull();
});

it("L2: anulacja wymaga powodu, potwierdzenia; wysyła powód i zgłoszenie; data odnowienia i dodatek — tylko wniosek", async () => {
  await render(AKTYWNA, L2);
  expect(przycisk("anuluj").disabled).toBe(true);
  await wpisz(k.querySelector('[data-pole="powod"]')!, POWOD);
  await wpisz(k.querySelector('[data-pole="zgloszenie"]')!, "#ab12cd34");
  await klik(przycisk("anuluj"));
  expect(potwierdz).toHaveBeenCalledTimes(1);
  expect(cykl).toHaveBeenCalledWith("s1", "anulacja", { powod: POWOD, zgloszenie: "#ab12cd34" });
  expect(k.textContent).toContain("Zapisano.");
  expect(k.querySelector('[data-akcja="zmien-date"]')).toBeNull();
  expect(k.querySelector('[data-wniosek="SUBSCRIPTION_RENEWAL_DATE"]')?.getAttribute("data-gotowe")).toBe("false");
  expect(k.querySelector('[data-wniosek="ADDON_ADD"]')).not.toBeNull();
  // Obietnica — tylko przy zaległości.
  expect(k.querySelector('[data-sekcja="obietnica"]')).toBeNull();
});

it("L2: +7 dni → wniosek o datę z nowym końcem okresu i zgłoszeniem", async () => {
  await render(AKTYWNA, L2);
  await wpisz(k.querySelector('[data-pole="zgloszenie"]')!, "#ab12cd34");
  await klik(przycisk("plus-7"));
  const w = k.querySelector('[data-wniosek="SUBSCRIPTION_RENEWAL_DATE"]')!;
  expect(w.getAttribute("data-gotowe")).toBe("true");
  expect(JSON.parse(w.getAttribute("data-payload")!)).toEqual({ subscriptionId: "s1", nowaData: "2026-11-27T09:30:00.000Z", przed: KONIEC, zgloszenie: "#ab12cd34" });
  expect(k.querySelector("[data-roznica]")?.textContent).toContain("Przedłużenie gratis o 7 dni");
});

it("L4: zmienia datę bezpośrednio (po powodzie i potwierdzeniu)", async () => {
  await render(AKTYWNA, L4);
  await klik(przycisk("plus-14"));
  expect(przycisk("zmien-date").disabled).toBe(true);
  await wpisz(k.querySelector('[data-pole="powod"]')!, POWOD);
  await klik(przycisk("zmien-date"));
  expect(cykl).toHaveBeenCalledWith("s1", "data-odnowienia", { powod: POWOD, zgloszenie: undefined, nowaData: "2026-12-04T09:30:00.000Z", przed: KONIEC });
});

it("anulowana: stan „działa do” i cofnięcie; bez zmiany daty", async () => {
  await render({ ...AKTYWNA, cancelAt: KONIEC }, L2);
  expect(k.textContent).toContain("Anulowana — działa do");
  expect(k.querySelector('[data-sekcja="data-odnowienia"]')).toBeNull();
  await wpisz(k.querySelector('[data-pole="powod"]')!, POWOD);
  await klik(przycisk("cofnij-anulacje"));
  expect(cykl).toHaveBeenCalledWith("s1", "anulacja/cofnij", { powod: POWOD, zgloszenie: undefined });
});

it("karta cykliczna: data odnowienia niedostępna (do decyzji właściciela)", async () => {
  await render({ ...AKTYWNA, kartaCykliczna: true }, L4);
  expect(k.querySelector('[data-sekcja="data-odnowienia"]')?.textContent).toContain("opłacana kartą cyklicznie");
  expect(k.querySelector('[data-akcja="zmien-date"]')).toBeNull();
});

it("zaległa: obietnica zapłaty od L3 (dni z listy); L2 widzi brak uprawnienia", async () => {
  const zalegla = { ...AKTYWNA, status: "PAST_DUE" };
  await render(zalegla, L2);
  expect(k.querySelector('[data-akcja="obietnica"]')).toBeNull();
  expect(k.querySelector('[data-sekcja="obietnica"]')?.textContent).toContain("SUBSCRIPTIONS_SUSPEND");
  await act(() => root?.unmount());
  await render(zalegla, L3);
  await wpisz(k.querySelector('[data-pole="powod"]')!, POWOD);
  await wpisz(k.querySelector('input[aria-label="Na ile dni"]')!, "5");
  await klik(przycisk("obietnica"));
  expect(cykl).toHaveBeenCalledWith("s1", "obietnica-zaplaty", { powod: POWOD, zgloszenie: undefined, dni: 5 });
});

it("przegląd F3.5: zespół abuse (samo SUBSCRIPTIONS_SUSPEND) nie daje obietnicy zapłaty — jak w API", async () => {
  await render({ ...AKTYWNA, status: "PAST_DUE" }, { isAdmin: false, permissions: ["CUSTOMERS_VIEW", "SUBSCRIPTIONS_SUSPEND"] });
  expect(k.querySelector('[data-akcja="obietnica"]')).toBeNull();
});

it("L4: dodatek z portfela klienta tylko ze zgłoszeniem; gratis — od razu", async () => {
  await render(AKTYWNA, L4);
  await wpisz(k.querySelector('[data-pole="powod"]')!, POWOD);
  await wpisz(k.querySelector('input[aria-label="Dodatek"]')!, "dedicated_ip");
  await wpisz(k.querySelector('input[aria-label="Kto płaci"]')!, "PORTFEL");
  expect(przycisk("dodaj-dodatek").disabled).toBe(true);
  expect(k.textContent).toContain("wpisz numer zgłoszenia");
  await wpisz(k.querySelector('input[aria-label="Kto płaci"]')!, "GRATIS");
  await klik(przycisk("dodaj-dodatek"));
  expect(dodaj).toHaveBeenCalledWith("s1", expect.objectContaining({ slug: "dedicated_ip", platnosc: "GRATIS", powod: POWOD }));
  expect(k.textContent).toContain("Dodano.");
});

it("L1 (bez uprawnień do usług): tylko informacja, bez przycisków", async () => {
  await render(AKTYWNA, { isAdmin: false, permissions: ["CUSTOMERS_VIEW"] });
  expect(k.querySelector("[data-akcja]")).toBeNull();
  expect(k.querySelector('[data-cykl="brak-uprawnien"]')).not.toBeNull();
});
