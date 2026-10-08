/**
 * @jest-environment jsdom
 */
/**
 * PB-46 — notatkę wewnętrzną i blokadę zapisuje teraz także obsługa (panel obsługi, CUSTOMERS_MANAGE).
 * Formularz admina wysyłał przy każdym „Zapisz” wszystkie cztery pola ze stanu z chwili wczytania strony,
 * więc samo przełączenie blokady kasowało notatkę dopisaną w międzyczasie w panelu obsługi i zostawiało
 * w dzienniku fałszywy wpis „zmiana notatki”. Teraz idą tylko pola zmienione względem danych z serwera.
 */
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
// PB-47: przełącznik „konto wewnętrzne” pyta o uprawnienie — tu administrator (dozwolone).
jest.mock("./konto-wewnetrzne-actions", () => ({ mozeOznaczacKontoWewnetrzne: jest.fn(async () => true) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
jest.mock("../actions", () => ({
  patchCustomerOperationalAction: jest.fn(async () => ({ ok: true })),
  changeCustomerEmailAction: jest.fn(),
  resetCustomerPasswordAction: jest.fn(),
  forceAnonymizeCustomerAction: jest.fn(),
}));

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { patchCustomerOperationalAction } from "../actions";
import type { AdminCustomerOperationalDetail } from "../data";
import { CustomerOperationalForms } from "./operational-forms";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const zapis = patchCustomerOperationalAction as jest.Mock;
const UID = "00000000-0000-4000-8000-0000000000ee";
const DETAIL: AdminCustomerOperationalDetail = {
  id: UID,
  email: "anna@test.pl",
  firstName: "Anna",
  lastName: null,
  role: "USER",
  walletBalance: "0.00",
  walletCurrency: "PLN",
  stripeCustomerId: null,
  isTwoFactorEnabled: false,
  loginBlocked: false,
  loginBlockedReason: null,
  adminInternalNote: "Notatka A",
  isInternal: false,
  createdAt: "2026-01-10T00:00:00Z",
  deletionRequestedAt: null,
  subscriptionsCount: 1,
};

let root: Root;
let k: HTMLElement;

beforeEach(async () => {
  zapis.mockClear();
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root.render(<CustomerOperationalForms detail={DETAIL} />));
});
afterEach(() => {
  act(() => root.unmount());
  k.remove();
});

const sekcja = () => k.querySelector('[data-karta="blokada"]')!;
const pola = () => [...sekcja().querySelectorAll("input")].filter((i) => i.type === "checkbox");
const obszary = () => [...sekcja().querySelectorAll("textarea")];
const zapisz = async () => {
  const przycisk = [...sekcja().querySelectorAll("button")].find((b) => b.textContent?.includes("Zapisz"))!;
  await act(async () => przycisk.click());
};
function wpisz(el: HTMLTextAreaElement, v: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("PB-46 formularz admina — zapis tylko zmienionych pól", () => {
  it("samo przełączenie blokady nie wysyła notatki ani flagi konta wewnętrznego", async () => {
    act(() => pola()[0].click());
    await zapisz();
    expect(zapis).toHaveBeenCalledTimes(1);
    expect(zapis).toHaveBeenCalledWith(UID, { loginBlocked: true, loginBlockedReason: null });
  });

  it("zmiana samej notatki wysyła tylko notatkę", async () => {
    act(() => wpisz(obszary()[1], "  Notatka B  "));
    await zapisz();
    expect(zapis).toHaveBeenCalledWith(UID, { adminInternalNote: "Notatka B" });
  });

  it("zmiana flagi konta wewnętrznego wysyła tylko flagę", async () => {
    act(() => pola()[1].click());
    await zapisz();
    expect(zapis).toHaveBeenCalledWith(UID, { isInternal: true });
  });

  it("bez zmian — nic nie idzie do API, komunikat zamiast pustego zapisu", async () => {
    await zapisz();
    expect(zapis).not.toHaveBeenCalled();
    expect(sekcja().textContent).toContain("Brak zmian do zapisania.");
  });

  it("opis blokady mówi prawdę: wejście na konto zablokowanego klienta też nie zadziała", () => {
    expect(sekcja().textContent).not.toContain("nadal działa");
    expect(sekcja().textContent).toContain("wejście na jego konto z panelu też nie zadziała");
  });
});
