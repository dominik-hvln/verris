import { renderToStaticMarkup } from "react-dom/server";

/** F3.7 (OE-32) — raporty obsługi: okres do API, kafle SLA/CSAT, priorytety i tabela osób z czasem po ludzku. */
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: async () => null }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => "/tickets/raporty" }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));

import { adminApi } from "@/lib/api";
import RaportyObslugi from "./page";

const api = adminApi as jest.Mock;
const tekst = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const T = (d: number, p: number, w = 0) => ({ dotrzymane: d, przekroczone: p, wToku: w, bez: 0 });

beforeEach(() => {
  api.mockReset().mockResolvedValue({
    okres: { dni: 7, od: "2026-10-04T00:00:00Z", do: "2026-10-11T00:00:00Z" },
    sla: {
      zgloszen: 12,
      odpowiedz: { ...T(9, 3), procent: 75 },
      rozwiazanie: { ...T(4, 1, 7), procent: 80 },
      wgPriorytetu: { URGENT: { odpowiedz: T(1, 1), rozwiazanie: T(0, 0, 2) }, NORMAL: { odpowiedz: T(8, 2), rozwiazanie: T(4, 1, 5) } },
      medianaPierwszejMin: 135,
    },
    csat: { ocen: 5, obsluga: 4.4, opiekun: 4.6, rozwiazanePct: 80 },
    osoby: [{ agentId: "s1", nazwa: "Anna Nowak", odpowiedzi: 21, odpowiedziNaKlienta: 15, medianaMin: 3000, zamkniete: 6, ocen: 3, ocenaOpiekuna: 4.7 }],
  });
});

it("okres z adresu idzie do API (nieznany → 30 dni); kafle, priorytety i osoby", async () => {
  const t = tekst(renderToStaticMarkup(await RaportyObslugi({ searchParams: Promise.resolve({ dni: "7" }) })));
  expect(api).toHaveBeenCalledWith("/admin/support/raporty?dni=7");
  expect(t).toContain("Pierwsza odpowiedź w terminie 75%");
  expect(t).toContain("3 po terminie · 0 w toku");
  expect(t).toContain("Mediana 1. odpowiedzi 2 h 15 min");
  expect(t).toContain("12 zgłoszeń w okresie");
  expect(t).toContain("4,4/5");
  expect(t).toContain("Pilny 50% (1/2) —");
  expect(t).toContain("Anna Nowak 21 2 dni 2 h 6 4,7/5 (3)");
  await RaportyObslugi({ searchParams: Promise.resolve({ dni: "365" }) });
  expect(api).toHaveBeenLastCalledWith("/admin/support/raporty?dni=30");
});
