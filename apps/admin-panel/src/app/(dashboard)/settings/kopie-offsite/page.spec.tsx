import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/lib/staff-access", () => ({ fetchStaffAccess: jest.fn() }));
jest.mock("@/components/kopie-offsite-formularz", () => ({ KopieOffsiteFormularz: () => <form data-formularz="offsite" /> }));

import { fetchStaffAccess } from "@/lib/staff-access";
import KopieOffsitePage from "./page";

/** 10.10 — kopie offsite (warunek Onboard LIVE) były tylko w kreatorze węzła. */
describe("Ustawienia → Kopie offsite", () => {
  it("administrator widzi formularz", async () => {
    (fetchStaffAccess as jest.Mock).mockResolvedValueOnce({ role: "ADMIN", isAdmin: true, permissions: [] });
    const html = renderToStaticMarkup(await KopieOffsitePage());
    expect(html).toContain('data-formularz="offsite"');
  });

  it("operator (także gdy API uprawnień nie odpowiada) — bez formularza", async () => {
    (fetchStaffAccess as jest.Mock).mockResolvedValueOnce({ role: "STAFF", isAdmin: false, permissions: [], niedostepne: true });
    const html = renderToStaticMarkup(await KopieOffsitePage());
    expect(html).not.toContain("data-formularz");
    expect(html).toContain("Tylko administrator");
  });
});
