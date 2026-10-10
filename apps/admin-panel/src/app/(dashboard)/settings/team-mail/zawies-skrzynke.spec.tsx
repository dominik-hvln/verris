import { renderToStaticMarkup } from "react-dom/server";

const adminApi = jest.fn();
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {}
  return { AdminApiError, adminApi: (...a: unknown[]) => adminApi(...a) };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }), usePathname: () => "/settings/team-mail" }));

import { AdminApiError } from "@/lib/api";
import { suspendTeamMailboxAction, type ControlPlaneMailboxRow } from "./actions";
import { TeamMailClient } from "./team-mail-client";

/** Fala 1B — System → Poczta zespołu: „Zawieś skrzynkę” (POST /admin/mailboxes/:id/suspend). */
const skrzynka = (o: Partial<ControlPlaneMailboxRow>): ControlPlaneMailboxRow => ({
  id: "m1",
  email: "ola@verris.pl",
  kind: "STAFF",
  status: "ACTIVE",
  displayName: null,
  quotaMb: 1024,
  user: null,
  _count: { aliases: 0, forwards: 0 },
  ...o,
});

describe("zawieszenie skrzynki zespołu", () => {
  beforeEach(() => adminApi.mockReset());

  it("akcja woła POST …/suspend; błąd API → komunikat API", async () => {
    adminApi.mockResolvedValue({});
    expect(await suspendTeamMailboxAction("m1")).toEqual({ ok: true });
    expect(adminApi).toHaveBeenCalledWith("/admin/mailboxes/m1/suspend", { method: "POST" });
    adminApi.mockRejectedValue(new AdminApiError("Nie ma takiej skrzynki."));
    expect(await suspendTeamMailboxAction("m1")).toEqual({ ok: false, error: "Nie ma takiej skrzynki." });
  });

  it("„Zawieś” tylko przy aktywnej skrzynce", () => {
    const html = renderToStaticMarkup(<TeamMailClient initial={[skrzynka({}), skrzynka({ id: "m2", email: "stary@verris.pl", status: "SUSPENDED" })]} systemAddresses={[]} />);
    expect(html.match(/data-akcja="zawies-skrzynke"/g)).toHaveLength(1);
  });
});
