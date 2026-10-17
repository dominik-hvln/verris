import { poczatkowaKonfiguracjaDa } from "./konfiguracja-da";

describe("poczatkowaKonfiguracjaDa", () => {
  it("nowy węzeł: Host = nazwa hosta (certyfikat panelu), login admin", () => {
    expect(poczatkowaKonfiguracjaDa({ daHost: null, hostname: "t2.verris.pl", daUsername: null, daUseTls: true, daPasswordSet: false })).toMatchObject({
      daHost: "t2.verris.pl",
      daUsername: "admin",
      daPort: 2222,
    });
  });
  it("zapisana konfiguracja ma pierwszeństwo", () => {
    expect(poczatkowaKonfiguracjaDa({ daHost: "x.verris.pl", hostname: "t2.verris.pl", daUsername: "ops", daPort: 2223, daUseTls: true, daPasswordSet: true })).toMatchObject({
      daHost: "x.verris.pl",
      daUsername: "ops",
      daPort: 2223,
    });
  });
});
