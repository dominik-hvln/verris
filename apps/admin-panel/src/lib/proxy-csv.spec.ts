/** F2.4 — pobranie CSV przez panel: tylko filtry z białej listy, token operatora, odmowa API jako tekst. */
jest.mock("@/lib/auth", () => ({ getAdminAuthToken: jest.fn(async () => "tok") }));
jest.mock("@/lib/api", () => ({ API_URL: "http://api" }));

import { getAdminAuthToken } from "@/lib/auth";
import { FILTRY_KLIENTOW, proxyCsv } from "./proxy-csv";

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

it("przekazuje tylko dozwolone filtry z tokenem; plik z datą", async () => {
  fetchMock.mockResolvedValue(new Response("﻿id,email\r\n", { status: 200 }));
  const r = await proxyCsv(new URLSearchParams("status=zalegle&userId=obcy&search=+x+&page=4"), "/admin/users/export.csv", FILTRY_KLIENTOW, "verris-klienci");
  expect(fetchMock).toHaveBeenCalledWith("http://api/admin/users/export.csv?search=x&status=zalegle", expect.objectContaining({ headers: { Authorization: "Bearer tok" } }));
  expect(r.headers.get("Content-Disposition")).toMatch(/^attachment; filename="verris-klienci-\d{4}-\d{2}-\d{2}\.csv"$/);
});

it("403 z API (bez EXPORT_DATA) — ten sam kod i komunikat; bez sesji — 401 bez wołania API", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "Twoja rola nie ma uprawnień do tej operacji." }), { status: 403 }));
  const r = await proxyCsv(new URLSearchParams(), "/admin/users/export.csv", FILTRY_KLIENTOW, "verris-klienci");
  expect(r.status).toBe(403);
  expect(await r.text()).toBe("Twoja rola nie ma uprawnień do tej operacji.");
  (getAdminAuthToken as jest.Mock).mockResolvedValueOnce(null);
  fetchMock.mockClear();
  expect((await proxyCsv(new URLSearchParams(), "/admin/users/export.csv", FILTRY_KLIENTOW, "x")).status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});
