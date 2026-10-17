/** 17.10 (PB-31): wynik „Wycofaj węzeł na stałe” (kroki DNS) znikał tuż po kliknięciu — revalidatePath przerysowywał kartę. */
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {}
  return { AdminApiError, adminApi: jest.fn(async () => ({ usunieteKonta: [], dns: [{ step: "ns1 A", status: "deleted" }] })) };
});

import { revalidatePath } from "next/cache";
import { wycofajMartwyWezelAction } from "./actions";

it("wycofanie zwraca kroki DNS i nie przerysowuje karty węzła", async () => {
  const r = await wycofajMartwyWezelAction("w1", "t2");
  expect(r.data?.dns).toHaveLength(1);
  expect(revalidatePath).not.toHaveBeenCalled();
});
