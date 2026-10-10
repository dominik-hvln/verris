/** F2.5 — notatka wewnętrzna: osobna trasa API, nigdy ścieżka odpowiedzi do klienta (mail). */
const mockStaffApi = jest.fn();
const mockMultipart = jest.fn();
jest.mock("./staff-api", () => {
  class StaffApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { StaffApiError, staffApi: (...a: unknown[]) => mockStaffApi(...a), staffApiMultipart: (...a: unknown[]) => mockMultipart(...a) };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { staffPostNote, staffPostReplyWithFiles } from "./ticket-actions";

beforeEach(() => {
  mockStaffApi.mockReset().mockResolvedValue({});
  mockMultipart.mockReset();
});

const formularz = (pola: Record<string, string>, plik?: File) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(pola)) fd.append(k, v);
  if (plik) fd.append("files", plik);
  return fd;
};

it("„Zapisz jako notatkę” idzie na /notatki, nie na /replies", async () => {
  await expect(staffPostReplyWithFiles("t1", formularz({ message: "Klient dzwonił, czeka na telefon.", rodzaj: "notatka" }))).resolves.toEqual({ ok: true });
  expect(mockStaffApi).toHaveBeenCalledWith("/tickets/admin/t1/notatki", { method: "POST", body: { message: "Klient dzwonił, czeka na telefon." } });
  expect(mockStaffApi.mock.calls.some(([u]) => String(u).includes("/replies"))).toBe(false);
  expect(mockMultipart).not.toHaveBeenCalled();
});

it("notatka z plikiem — odmowa bez wywołania API (plik nie pójdzie do klienta jako odpowiedź)", async () => {
  const r = await staffPostReplyWithFiles("t1", formularz({ message: "Log w załączniku", rodzaj: "notatka" }, new File(["x"], "log.txt")));
  expect(r).toEqual({ error: expect.stringMatching(/Notatka nie przyjmuje załączników/) });
  expect(mockStaffApi).not.toHaveBeenCalled();
  expect(mockMultipart).not.toHaveBeenCalled();
});

it("zwykła odpowiedź dalej idzie na /replies", async () => {
  await staffPostReplyWithFiles("t1", formularz({ message: "Dzień dobry, sprawdzamy.", rodzaj: "odpowiedz", czekaj: "tak" }));
  expect(mockStaffApi).toHaveBeenCalledWith("/tickets/admin/t1/replies", { method: "POST", body: { message: "Dzień dobry, sprawdzamy.", czekaj: "tak" } });
});

it("pusta notatka — komunikat bez wywołania API", async () => {
  await expect(staffPostNote("t1", " ")).resolves.toEqual({ error: "Notatka jest za krótka." });
  expect(mockStaffApi).not.toHaveBeenCalled();
});
