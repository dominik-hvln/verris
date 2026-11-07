import { renderToStaticMarkup } from "react-dom/server";

const adminApi = jest.fn();
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {}
  return { AdminApiError, adminApi: (...a: unknown[]) => adminApi(...a) };
});

import { AdminApiError } from "@/lib/api";
import { usunCertyfikatKsef, wgrajCertyfikatKsef, type KsefSettings } from "./actions";
import { KsefPoswiadczenia } from "./ksef-poswiadczenia";

/** KSeF 07.11 — certyfikaty KSeF (uwierzytelnienie i Offline) w Ustawienia → Firma → KSeF. */
describe("KSeF – certyfikaty w adminie", () => {
  beforeEach(() => adminApi.mockReset());

  it("akcje: POST /admin/platform-settings/ksef/certyfikat z rodzajem, plikami i hasłem; DELETE po rodzaju; błąd API → komunikat", async () => {
    adminApi.mockResolvedValue({ ustawienia: {}, ostrzezenia: [] });
    await wgrajCertyfikatKsef({ rodzaj: "offline", certyfikat: "C", klucz: "K", haslo: "h" });
    expect(adminApi).toHaveBeenCalledWith("/admin/platform-settings/ksef/certyfikat", { method: "POST", body: { rodzaj: "offline", certyfikat: "C", klucz: "K", haslo: "h" } });
    await usunCertyfikatKsef("uwierzytelnianie");
    expect(adminApi).toHaveBeenLastCalledWith("/admin/platform-settings/ksef/certyfikat/uwierzytelnianie", { method: "DELETE" });
    adminApi.mockRejectedValue(new AdminApiError("KSeF: Klucz prywatny nie pasuje do certyfikatu."));
    expect(await wgrajCertyfikatKsef({ rodzaj: "uwierzytelnianie", certyfikat: "C", klucz: "K" })).toEqual({ error: "KSeF: Klucz prywatny nie pasuje do certyfikatu." });
  });

  it("widok: dane jawne certyfikatu i ważność; wygasły oznaczony; brak certyfikatu Offline widoczny", () => {
    const cfg = {
      enabled: true, env: "prod", nip: "9292069367", tokenSet: false, metoda: "certyfikat",
      certyfikatUwierzytelniania: { podmiot: "CN=Dominik", wystawca: "CN=KSeF", numerSeryjny: "01F2", waznyOd: "2026-01-01T00:00:00Z", waznyDo: "2026-11-01T00:00:00Z", odciskSha256: "ab", algorytm: "EC", dniDoWygasniecia: -6, typIdentyfikatora: "certificateSubject" },
      certyfikatOffline: null,
    } as KsefSettings;
    const html = renderToStaticMarkup(<KsefPoswiadczenia cfg={cfg} onZmiana={() => undefined} />);
    expect(html).toContain("01F2");
    expect(html).toContain("(wygasł)");
    expect(html).toContain("Nie wgrano certyfikatu.");
    expect(html).toContain("Hasło do klucza");
  });
});
