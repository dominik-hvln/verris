import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error { status = 0; }, adminApi: jest.fn() }));
jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/marketing/c1",
}));

import { AdminApiError, adminApi } from "@/lib/api";
import KampaniaPage from "./page";

/** Fala 1B — szczegół kampanii (GET /admin/marketing/campaigns/:id). */
const api = adminApi as jest.Mock;
const kampania = {
  id: "c1",
  name: "Październik",
  description: null,
  subject: "Nowości w panelu",
  bodyMarkdown: "## Co nowego\n- kopie",
  ctaLabel: "Zobacz",
  ctaUrl: "https://verris.pl/nowosci",
  segment: "NEWSLETTER_OPT_IN",
  status: "SENT",
  scheduledAt: null,
  startedAt: "2026-10-01T08:00:00Z",
  completedAt: "2026-10-01T08:05:00Z",
  recipientCount: 120,
  sentCount: 118,
  suppressedCount: 2,
  failedCount: 0,
  createdAt: "2026-09-30T10:00:00Z",
};
const render = async () => renderToStaticMarkup(await KampaniaPage({ params: Promise.resolve({ id: "c1" }) }));

it("szczegół: stan, segment, treść, przycisk i liczniki wysyłki", async () => {
  api.mockResolvedValue(kampania);
  const html = await render();
  expect(api).toHaveBeenCalledWith("/admin/marketing/campaigns/c1");
  expect(html).toContain("wysłana");
  expect(html).toContain("Zgoda na newsletter");
  expect(html).toContain("## Co nowego");
  expect(html).toContain("Zobacz → https://verris.pl/nowosci");
  expect(html).toContain(">118<");
});

it("brak kampanii (404) → notFound", async () => {
  const e = new (AdminApiError as unknown as new (m: string) => Error & { status: number })("Kampania nie istnieje.");
  e.status = 404;
  api.mockRejectedValue(e);
  await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
});
