jest.mock("./actions", () => ({ createCanned: jest.fn(), updateCanned: jest.fn(), deleteCanned: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

import { opisAkcjiMakra } from "./canned-client";

/** F3.7 — szablon z akcjami to makro; lista szablonów mówi, co zrobi po odpowiedzi. */
it("bez akcji — zwykły szablon; z akcjami — stan, tagi, przypisanie", () => {
  expect(opisAkcjiMakra({ makroStan: null, makroTagi: [], makroPrzypisz: null })).toBeNull();
  expect(opisAkcjiMakra({ makroStan: "CLOSED", makroTagi: ["dns", "rozwiazane"], makroPrzypisz: "JA" })).toBe(
    "zamknięte (podziękowanie i ocena) · tagi: dns, rozwiazane · przypisz do stosującego",
  );
  expect(opisAkcjiMakra({ makroStan: null, makroTagi: [], makroPrzypisz: "NIKT" })).toBe("zdejmij opiekuna");
});
