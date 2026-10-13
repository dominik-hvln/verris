/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Migracja klientów z Pleska (12.10): administrator zakłada usługę z okresem opłaconym u poprzedniego usługodawcy —
 * formularz wysyła „opłacone do” (południe wybranego dnia), a komunikat mówi, że nic nie pobrano.
 */
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("@/components/pole-daty", () => ({
  PoleDaty: ({ onChange, "aria-label": aria }: { onChange: (v: string) => void; "aria-label": string }) => (
    <input aria-label={aria} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { WarunkiIndywidualne, type PodgladWarunkow } from "./warunki-indywidualne";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const dane: PodgladWarunkow = {
  billingOutside: false,
  plany: [{ id: "p1", nazwa: "Hosting Start", ukryty: false, miesiecznie: "45,00", rocznie: "449,00" }],
  okres: { od: "2026-10-01", do: "2026-10-13" },
  uslugi: [],
  autoskalowaniePoza: [],
};

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => act(() => root.unmount()));

const wpisz = (input: HTMLInputElement, v: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, v);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

it("„opłacone do” trafia do zlecenia jako data (południe), komunikat: bez obciążenia", async () => {
  const zaloz = jest.fn().mockResolvedValue({ ok: true });
  await act(async () => root.render(<WarunkiIndywidualne userId="u1" dane={dane} akcje={{ zaloz, ustaw: jest.fn(), poza: jest.fn() }} />));
  const pola = [...el.querySelectorAll("input")];
  const domena = pola.find((i) => i.placeholder === "np. firma-klienta.pl")!;
  const data = el.querySelector('input[aria-label="Opłacone u poprzedniego usługodawcy do"]') as HTMLInputElement;
  const powodPole = [...el.querySelectorAll("label")].filter((l) => l.textContent?.startsWith("Powód (do audytu)")).pop()!.querySelector("input")!;
  await act(async () => {
    wpisz(domena, "z-pleska.pl");
    wpisz(data, "2027-03-15");
    wpisz(powodPole, "migracja z Pleska");
  });
  expect(el.textContent).toContain("Przeniesienie klienta: bez obciążenia do wskazanej daty");
  const przycisk = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Załóż usługę"))!;
  await act(async () => void przycisk.click());
  expect(zaloz).toHaveBeenCalledWith("u1", expect.objectContaining({
    planId: "p1", domain: "z-pleska.pl", powod: "migracja z Pleska", oplaconeDo: new Date("2027-03-15T12:00:00").toISOString(),
  }));
  expect(el.textContent).toContain("okres opłacony u poprzedniego usługodawcy do 2027-03-15");
});

it("bez daty — zwykłe zlecenie (bez pola oplaconeDo)", async () => {
  const zaloz = jest.fn().mockResolvedValue({ ok: true });
  await act(async () => root.render(<WarunkiIndywidualne userId="u1" dane={dane} akcje={{ zaloz, ustaw: jest.fn(), poza: jest.fn() }} />));
  const powodPole = [...el.querySelectorAll("label")].filter((l) => l.textContent?.startsWith("Powód (do audytu)")).pop()!.querySelector("input")!;
  await act(async () => wpisz(powodPole, "zwykła usługa"));
  await act(async () => void [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Załóż usługę"))!.click());
  expect(zaloz.mock.calls[0][1]).not.toHaveProperty("oplaconeDo");
});
