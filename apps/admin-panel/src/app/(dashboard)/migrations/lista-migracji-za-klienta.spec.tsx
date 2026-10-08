import { renderToStaticMarkup } from "react-dom/server";

/** ADMIN-MIGR — lista migracji w adminie: wejście „Migracja za klienta” i filtr/etykieta oczekiwania na zgodę po polsku. */
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock("./migration-row-actions", () => ({ MigrationRowActions: () => null }));
jest.mock("@/lib/api", () => ({ adminApi: jest.fn() }));

import { adminApi } from "@/lib/api";
import MigrationsCockpitPage from "./page";

const api = adminApi as jest.Mock;

it("przycisk „Migracja za klienta”, filtr i odznaka „Czeka na zgodę klienta” zamiast DRAFT", async () => {
  api.mockResolvedValue({
    attentionCount: 0,
    rows: [
      {
        id: "m1",
        subscriptionId: "s1",
        status: "DRAFT",
        currentStep: null,
        targetDomain: "firma.pl",
        sourcePanelType: "manual",
        needsAttention: false,
        attentionReason: null,
        attentionAt: null,
        cutoverMode: null,
        cutoverAt: null,
        ticketId: null,
        lastError: null,
        createdAt: "2026-10-08T10:00:00.000Z",
        updatedAt: "2026-10-08T10:00:00.000Z",
        userEmail: "jan@firma.pl",
        serviceTag: "H-1",
        planName: "Hosting",
        jobs: [],
      },
    ],
  });
  const html = renderToStaticMarkup(await MigrationsCockpitPage({ searchParams: Promise.resolve({ status: "DRAFT" }) }));
  expect(api).toHaveBeenCalledWith("/admin/migrations?status=DRAFT");
  expect(html).toContain('href="/migrations/za-klienta"');
  expect(html).toContain('href="/migrations?status=DRAFT"');
  expect(html.match(/Czeka na zgodę klienta/g)?.length).toBeGreaterThanOrEqual(2);
  expect(html).not.toMatch(/>DRAFT</);
});
