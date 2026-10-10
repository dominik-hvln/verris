import { renderToStaticMarkup } from "react-dom/server";

// D1 — bramka strony ma własne testy (uprawnienia-stron.spec.tsx); tu zapis wg KB_MANAGE.
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: async () => null }));
jest.mock("@/lib/staff-access", () => ({ fetchStaffAccess: jest.fn() }));
jest.mock("@/components/staff-assistant", () => ({ StaffAssistant: () => null }));
jest.mock("@/components/potwierdz", () => ({ potwierdz: async () => true }));
jest.mock("./data", () => ({
  listKnowledgeDocs: async () => [
    { id: "d1", title: "Rekordy DNS", audience: "CLIENT", status: "ACTIVE", chunkCount: 1, charCount: 120, createdByEmail: null, createdAt: "2026-10-01T00:00:00Z" },
  ],
  fetchAiStatus: async () => ({ configured: false, embeddings: false }),
  createKnowledgeDoc: jest.fn(),
  updateKnowledgeDoc: jest.fn(),
  deleteKnowledgeDoc: jest.fn(),
}));

import { fetchStaffAccess } from "@/lib/staff-access";
import AiKnowledgePage from "./page";

/**
 * Przegląd Fali 2A — dokumenty „Wiedzy AI” czyta chatbot w panelu klienta. Strona jest dla DASHBOARD_VIEW (L1, audytor,
 * NOC), a dodawanie, archiwizacja i usuwanie wymagają KB_MANAGE (API: ai-knowledge.admin.controller.ts).
 */
describe("Wiedza AI — zapis tylko z KB_MANAGE", () => {
  const strona = async (dostep: unknown) => {
    (fetchStaffAccess as jest.Mock).mockResolvedValueOnce(dostep);
    return renderToStaticMarkup(await AiKnowledgePage());
  };

  it("operator z samym pulpitem: lista bez przycisków, zamiast formularza „Tylko podgląd”", async () => {
    const html = await strona({ role: "STAFF", isAdmin: false, permissions: ["DASHBOARD_VIEW"] });
    expect(html).toContain("Rekordy DNS");
    expect(html).toContain("data-bez-zapisu");
    expect(html).toContain("Wymaga KB_MANAGE");
    expect(html).not.toContain("Dodaj dokument");
    expect(html).not.toContain('title="Usuń"');
    expect(html).not.toContain('title="Archiwizuj"');
  });

  it("operator z KB_MANAGE i administrator: formularz i działania na dokumentach", async () => {
    for (const d of [
      { role: "STAFF", isAdmin: false, permissions: ["DASHBOARD_VIEW", "KB_MANAGE"] },
      { role: "ADMIN", isAdmin: true, permissions: [] },
    ]) {
      const html = await strona(d);
      expect(html).not.toContain("data-bez-zapisu");
      expect(html).toContain("Dodaj dokument");
      expect(html).toContain('title="Usuń"');
    }
  });
});
