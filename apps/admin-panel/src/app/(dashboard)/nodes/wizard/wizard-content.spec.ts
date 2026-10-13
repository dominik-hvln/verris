import { przygotowanieOs } from "./wizard-content";

const wykonywalne = (t: string) => t.split("\n").filter((l) => /^\s*hostnamectl\b/.test(l));

describe("kreator węzła — krok 0 (przygotowanie OS)", () => {
  it("bez nazwy węzła nie ma gotowego polecenia zmiany hostname (13.10: skopiowany przykład ustawił złą nazwę)", () => {
    expect(wykonywalne(przygotowanieOs(""))).toEqual([]);
    expect(przygotowanieOs("")).not.toContain("example.com");
  });

  it("po wpisaniu FQDN podstawia nazwę węzła", () => {
    expect(wykonywalne(przygotowanieOs(" T2.verris.pl "))).toEqual(["hostnamectl set-hostname t2.verris.pl"]);
  });

  it("nazwa, która nie jest FQDN, nie trafia do polecenia powłoki", () => {
    for (const zla of ["t2", "t2.verris.pl; reboot", "$(id).verris.pl", "-x.verris.pl", "a b.pl"]) {
      expect(wykonywalne(przygotowanieOs(zla))).toEqual([]);
      expect(przygotowanieOs(zla)).not.toContain(zla.trim());
    }
  });
});
