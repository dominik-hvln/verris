import { renderToStaticMarkup } from "react-dom/server";

const adminApi = jest.fn();
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {}
  return { AdminApiError, adminApi: (...a: unknown[]) => adminApi(...a) };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }), usePathname: () => "/settings/team-mail" }));

import { AdminApiError } from "@/lib/api";
import { resumeTeamMailboxAction, suspendTeamMailboxAction, type ControlPlaneMailboxRow } from "./actions";
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

  // Przegląd 1B: „Zawieś” stał też przy skrzynkach systemowych (ich aliasy abuse@/postmaster@ znikają z map),
  // a zawieszonej skrzynki nie dało się w panelu wznowić.
  it("„Zawieś” tylko przy skrzynce pracownika; systemowa i aliasowa bez przycisku", () => {
    const html = renderToStaticMarkup(
      <TeamMailClient initial={[skrzynka({ id: "s1", email: "bok@verris.pl", kind: "SYSTEM" }), skrzynka({ id: "a1", email: "abuse@verris.pl", kind: "ALIAS_ONLY" })]} systemAddresses={[]} />,
    );
    expect(html).not.toContain('data-akcja="zawies-skrzynke"');
  });

  it("zawieszona skrzynka pracownika ma „Wznów” → PATCH status ACTIVE", async () => {
    const html = renderToStaticMarkup(<TeamMailClient initial={[skrzynka({ status: "SUSPENDED" })]} systemAddresses={[]} />);
    expect(html.match(/data-akcja="wznow-skrzynke"/g)).toHaveLength(1);
    adminApi.mockResolvedValue({});
    expect(await resumeTeamMailboxAction("m1")).toEqual({ ok: true });
    expect(adminApi).toHaveBeenCalledWith("/admin/mailboxes/m1", { method: "PATCH", body: { status: "ACTIVE" } });
  });
});
