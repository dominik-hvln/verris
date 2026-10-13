jest.mock("@/lib/api", () => ({ adminApi: jest.fn() }));

import { doKorekty } from "./data";

/**
 * Przegląd 13.10 — kolejna korekta startuje od stanu po ostatniej korekcie (od niego liczy API), nie od faktury
 * pierwotnej. Inaczej podgląd pokazywał zwrot −80, a API wystawiało +20 i przywracało pozycję zdjętą wcześniej.
 */
const faktura = {
  id: "f1", number: "VFV/2026/10/0002", status: "PAID", amount: "200.00", netAmount: "162.60", vatAmount: "37.40",
  currency: "PLN", issuedAt: null,
  lineItems: [{ name: "A", quantity: 1, totalGross: "100.00" }, { name: "B", quantity: 1, totalGross: "100.00" }],
  buyerSnapshot: { name: "Stary" },
};

it("faktura z korektami: pozycje, kwoty i nabywca po ostatniej korekcie", () => {
  const stan = { amount: "100.00", netAmount: "81.30", vatAmount: "18.70", lineItems: [{ name: "B", quantity: 1, totalGross: "100.00" }], buyerSnapshot: { name: "Nowy" } };
  const f = doKorekty({ ...faktura, stanPoKorektach: stan });
  expect(f).toMatchObject({ number: "VFV/2026/10/0002", ...stan });
  expect(f).not.toHaveProperty("stanPoKorektach");
});

it("bez korekt (albo starsze API bez pola): faktura pierwotna", () => {
  expect(doKorekty({ ...faktura, stanPoKorektach: null })).toEqual(faktura);
  expect(doKorekty(faktura)).toEqual(faktura);
});
