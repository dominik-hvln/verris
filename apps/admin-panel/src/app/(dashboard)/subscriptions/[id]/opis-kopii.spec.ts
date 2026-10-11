import { readFileSync } from "fs";
import { join } from "path";
import { opisKopii, rozmiarKopii } from "@verris/contracts";

/**
 * Weryfikacja 11.10 — „Kopia do odtworzenia” pokazywała same nazwy, a te się powtarzają (user.admin.<login>.tar.zst):
 * operator nie wiedział, którą wersję odtwarza. Pozycja ma datę zapisu i rozmiar z API (GET hosting-backups).
 */
describe("Kopia do odtworzenia — data i rozmiar przy pozycji", () => {
  it("nazwa · data (czas polski) · rozmiar; bez metadanych — sama nazwa", () => {
    expect(opisKopii({ id: "list0", fileName: "user.admin.d3.tar.zst", utworzono: "2026-10-11T14:19:00Z", rozmiarBajty: 385001672 })).toBe(
      "user.admin.d3.tar.zst · 11.10.2026, 16:19 · 367,2 MB",
    );
    expect(opisKopii({ id: "list0", fileName: "a.tar.zst", utworzono: null, rozmiarBajty: null })).toBe("a.tar.zst");
    expect(opisKopii({ id: "list0", fileName: "a.tar.zst" })).toBe("a.tar.zst");
  });

  it("rozmiar po polsku (jednostki po 1024 B)", () => {
    expect(rozmiarKopii(512)).toBe("512 B");
    expect(rozmiarKopii(1536)).toBe("1,5 KB");
    expect(rozmiarKopii(5 * 1024 ** 3)).toBe("5 GB");
  });

  it("lista w panelu operatora i w panelu obsługi używa opisu z datą, nie samej nazwy", () => {
    const admin = readFileSync(join(__dirname, "restore-panel.tsx"), "utf-8");
    expect(admin).toContain("label: opisKopii(b)");
    const obsluga = readFileSync(
      join(__dirname, "../../../../../../staff-panel/src/app/(dashboard)/crm/[userId]/subscriptions/[subscriptionId]/kopie-panel.tsx"),
      "utf-8",
    );
    expect(obsluga).toContain("label: opisKopii(b)");
  });
});
