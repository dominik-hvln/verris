import { renderToStaticMarkup } from "react-dom/server";
import { ZgodnoscKontKarta } from "./zgodnosc-kont";

describe("ZgodnoscKontKarta (H-16)", () => {
  it("pokazuje sierotę po przeniesieniu z linkiem do nowego węzła i konto panelu bez DA", () => {
    const html = renderToStaticMarkup(
      <ZgodnoscKontKarta
        dane={{
          sieroty: [{ daUsername: "rdeetgju", gdzieIndziej: { serverId: "t1", serverName: "TEST-NRB-01" } }],
          brakujace: [{ daUsername: "zgubione", domain: "z.pl", accountId: "a2" }],
          sprawdzono: "2026-10-13T21:00:00Z",
        }}
      />,
    );
    expect(html).toContain("rdeetgju");
    expect(html).toContain('href="/nodes/t1"');
    expect(html).toContain("pozostałość po przeniesieniu");
    expect(html).toContain("zgubione");
  });

  it("brak rozbieżności → jeden zielony komunikat", () => {
    const html = renderToStaticMarkup(<ZgodnoscKontKarta dane={{ sieroty: [], brakujace: [], sprawdzono: "2026-10-13T21:00:00Z" }} />);
    expect(html).toContain("zgadzają się z panelem");
  });
});
