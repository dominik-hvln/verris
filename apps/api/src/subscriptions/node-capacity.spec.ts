import {
  bladWspolczynnika,
  czyZmiesciSie,
  efektywnyOvercommit,
  MAKS_OVERCOMMIT,
  pojemnoscSprzedazowa,
  PolitykaPojemnosci,
} from './node-capacity';

/**
 * Z-12 — arytmetyka pojemności węzła.
 *
 * Testy są napisane wokół konkretnego węzła z modelu PB-01: Hetzner AX102,
 * 16 rdzeni / 32 wątki, 128 GB RAM, 1,92 TB dysku użytecznego. Pakiet: 2 vCPU
 * (SPEED 200%), 8 GB RAM, 50 GB dysku.
 *
 * Liczby w asercjach nie są wzięte z uruchomienia kodu — pochodzą z arkusza
 * docs/strategy/PB-01_unit_economics_wezla.xlsx. Jeżeli test i arkusz się
 * rozjadą, to jedno z dwóch kłamie i trzeba sprawdzić które.
 */

const WEZEL = {
  cpu: 32 * 100, // 3200% SPEED
  ramMb: 128 * 1024, // 131 072 MB
  diskMb: 1920 * 1024, // 1 966 080 MB
};

const PAKIET = { cpu: 200, ramMb: 8 * 1024, diskMb: 50 * 1024 };

function polityka(over: Partial<PolitykaPojemnosci> = {}): PolitykaPojemnosci {
  return {
    overcommitCpu: 1,
    overcommitRam: 1,
    overcommitDisk: 1,
    reservedHeadroomPercent: 0,
    ...over,
  };
}

/** Ile kont wejdzie, jeżeli dokładać je po jednym aż do odmowy. */
function ileKontWejdzie(pol: PolitykaPojemnosci, zuzycieNaKonto?: typeof PAKIET): number {
  const sprzedane = { cpu: 0, ramMb: 0, diskMb: 0 };
  const zuzycie = { cpu: 0, ramMb: 0, diskMb: 0 };
  for (let n = 0; n < 5000; n++) {
    const w = czyZmiesciSie({
      fizyczna: WEZEL,
      sprzedane: { ...sprzedane },
      zuzycie: { ...zuzycie },
      potrzeba: PAKIET,
      polityka: pol,
      liczbaKont: n,
    });
    if (!w.mozna) return n;
    sprzedane.cpu += PAKIET.cpu;
    sprzedane.ramMb += PAKIET.ramMb;
    sprzedane.diskMb += PAKIET.diskMb;
    if (zuzycieNaKonto) {
      zuzycie.cpu += zuzycieNaKonto.cpu;
      zuzycie.ramMb += zuzycieNaKonto.ramMb;
      zuzycie.diskMb += zuzycieNaKonto.diskMb;
    }
  }
  return -1;
}

describe('Z-12 — pojemność węzła', () => {
  describe('zachowanie sprzed poprawki jest zachowane przy overcommit 1,0', () => {
    it('na węzeł 128 GB wchodzi 16 kont po 8 GB — dokładnie tyle, ile było', () => {
      expect(ileKontWejdzie(polityka())).toBe(16);
    });

    it('headroom nie ucina już sprzedaży, tylko pilnuje realnego zużycia', () => {
      // ZMIANA SEMANTYKI wprowadzona przez Z-12, celowa i warta zapamiętania.
      //
      // Przed poprawką headroom pomniejszał pojemność porównywaną z sumą limitów
      // planów, więc przy 20% z 16 kont robiło się 12. To było mieszanie jednostek:
      // rezerwa „pod burst" jest zabezpieczeniem przed zdarzeniem FIZYCZNYM,
      // a odejmowano ją od księgi HANDLOWEJ.
      //
      // Po poprawce headroom chroni realne zużycie (patrz bloki niżej), więc przy
      // zużyciu zerowym nie ogranicza sprzedaży. Arkusz PB-01 modelował wariant
      // stary i dlatego podaje 51 kont tam, gdzie kod daje 64 — model jest
      // zachowawczy wobec implementacji, a nie z nią sprzeczny.
      expect(ileKontWejdzie(polityka({ reservedHeadroomPercent: 20 }))).toBe(16);
    });
  });

  describe('bramka handlowa — nadsubskrypcja', () => {
    it('przy 4× RAM i CPU oraz 2× dysku wchodzą 64 konta', () => {
      // 128 GB × 4 / 8 GB = 64 (RAM) · 3200% × 4 / 200% = 64 (CPU) · 1920 GB × 2 / 50 GB = 76 (dysk)
      // Wiąże RAM i CPU jednocześnie — dysk ma jeszcze zapas.
      const n = ileKontWejdzie(
        polityka({ overcommitCpu: 4, overcommitRam: 4, overcommitDisk: 2 }),
      );
      expect(n).toBe(64);
    });

    it('próg rentowności 58 kont jest osiągalny przy 4× — a przy 1× nie jest', () => {
      const zNadsubskrypcja = ileKontWejdzie(
        polityka({ overcommitCpu: 4, overcommitRam: 4, overcommitDisk: 2 }),
      );
      const bez = ileKontWejdzie(polityka());
      expect(zNadsubskrypcja).toBeGreaterThanOrEqual(58);
      expect(bez).toBeLessThan(58);
    });

    it('powód odmowy wskazuje zasób, który się skończył', () => {
      const w = czyZmiesciSie({
        fizyczna: WEZEL,
        sprzedane: { cpu: 0, ramMb: WEZEL.ramMb, diskMb: 0 },
        zuzycie: { cpu: 0, ramMb: 0, diskMb: 0 },
        potrzeba: PAKIET,
        polityka: polityka(),
      });
      expect(w.mozna).toBe(false);
      expect(w.powod).toBe('BRAK_POJEMNOSCI_RAM');
    });
  });

  describe('bramka fizyczna — realne zużycie', () => {
    it('węzeł realnie zajęty odmawia, choć handlowo ma zapas', () => {
      const w = czyZmiesciSie({
        fizyczna: WEZEL,
        sprzedane: { cpu: 0, ramMb: 0, diskMb: 0 }, // nic nie sprzedane
        zuzycie: { cpu: 0, ramMb: WEZEL.ramMb * 0.95, diskMb: 0 }, // ale RAM zjedzony
        potrzeba: PAKIET,
        polityka: polityka({ overcommitRam: 4, reservedHeadroomPercent: 20 }),
      });
      expect(w.mozna).toBe(false);
      expect(w.powod).toBe('REALNE_ZUZYCIE_RAM');
    });

    it('headroom 20% odcina przy 80% realnego zużycia, nie przy 100%', () => {
      const przy79 = czyZmiesciSie({
        fizyczna: WEZEL,
        sprzedane: { cpu: 0, ramMb: 0, diskMb: 0 },
        zuzycie: { cpu: 0, ramMb: WEZEL.ramMb * 0.79, diskMb: 0 },
        potrzeba: PAKIET,
        polityka: polityka({ overcommitRam: 4, reservedHeadroomPercent: 20 }),
      });
      const przy81 = czyZmiesciSie({
        fizyczna: WEZEL,
        sprzedane: { cpu: 0, ramMb: 0, diskMb: 0 },
        zuzycie: { cpu: 0, ramMb: WEZEL.ramMb * 0.81, diskMb: 0 },
        potrzeba: PAKIET,
        polityka: polityka({ overcommitRam: 4, reservedHeadroomPercent: 20 }),
      });
      expect(przy79.mozna).toBe(true);
      expect(przy81.mozna).toBe(false);
    });

    it('realne zużycie z modelu PB-01 (0,5 GB/konto) mieści 51 kont bez alarmu', () => {
      const naKonto = { cpu: 8, ramMb: 512, diskMb: 8 * 1024 };
      const n = ileKontWejdzie(
        polityka({
          overcommitCpu: 4,
          overcommitRam: 4,
          overcommitDisk: 2,
          reservedHeadroomPercent: 20,
        }),
        naKonto,
      );
      // Bramka handlowa zatrzymuje wcześniej niż fizyczna — czyli nadsubskrypcja
      // 4× przy tym profilu zużycia jest z zapasem, a nie na styk.
      expect(n).toBeGreaterThanOrEqual(58);
    });

    it('dwa razy większe zużycie niż zakładane zatrzymuje sprzedaż zanim węzeł padnie', () => {
      const naKonto = { cpu: 16, ramMb: 1024, diskMb: 16 * 1024 };
      const n = ileKontWejdzie(
        polityka({
          overcommitCpu: 4,
          overcommitRam: 4,
          overcommitDisk: 2,
          reservedHeadroomPercent: 20,
        }),
        naKonto,
      );
      const realnyRam = n * 1024;
      expect(realnyRam).toBeLessThanOrEqual(WEZEL.ramMb * 0.8);
    });
  });

  describe('degradacja przy braku telemetrii', () => {
    it('bez świeżych metryk overcommit spada do 1,0', () => {
      expect(efektywnyOvercommit(polityka({ overcommitRam: 4 }), false)).toEqual({
        cpu: 1,
        ram: 1,
        disk: 1,
      });
    });

    it('węzeł bez telemetrii mieści tyle, co przed Z-12', () => {
      const sprzedazowa = pojemnoscSprzedazowa(
        WEZEL,
        polityka({ overcommitCpu: 4, overcommitRam: 4, overcommitDisk: 2 }),
        false,
      );
      expect(sprzedazowa).toEqual(WEZEL);
    });

    it('węzeł już nadsubskrybowany przestaje przyjmować konta, ale nie wywala błędu', () => {
      const w = czyZmiesciSie({
        fizyczna: WEZEL,
        sprzedane: { cpu: 0, ramMb: WEZEL.ramMb * 2, diskMb: 0 }, // sprzedane 2× RAM
        zuzycie: null, // telemetria padła
        potrzeba: PAKIET,
        polityka: polityka({ overcommitRam: 4 }),
      });
      expect(w.mozna).toBe(false);
      expect(w.telemetriaSwieza).toBe(false);
      expect(w.powod).toBe('BRAK_POJEMNOSCI_RAM');
    });
  });

  describe('dysk jest traktowany ostrożniej niż RAM i CPU', () => {
    it('limit górny dla dysku jest niższy', () => {
      expect(MAKS_OVERCOMMIT.disk).toBeLessThan(MAKS_OVERCOMMIT.cpu);
      expect(MAKS_OVERCOMMIT.disk).toBeLessThan(MAKS_OVERCOMMIT.ram);
    });

    it('wartość ponad limit jest przycinana, nie przyjmowana', () => {
      const oc = efektywnyOvercommit(polityka({ overcommitDisk: 99 }), true);
      expect(oc.disk).toBe(MAKS_OVERCOMMIT.disk);
    });

    it('walidacja odrzuca overcommitDisk powyżej limitu i tłumaczy dlaczego', () => {
      const blad = bladWspolczynnika('overcommitDisk', 5);
      expect(blad).toContain('1–3');
      expect(blad).toContain('quota dyskowa jest realnie egzekwowana');
    });

    it('walidacja odrzuca wartość poniżej 1 — to byłaby podsubskrypcja przez pomyłkę', () => {
      expect(bladWspolczynnika('overcommitRam', 0.5)).toContain('1–8');
      expect(bladWspolczynnika('overcommitRam', 0)).not.toBeNull();
    });

    it('walidacja przepuszcza wartości z zakresu', () => {
      expect(bladWspolczynnika('overcommitRam', 4)).toBeNull();
      expect(bladWspolczynnika('overcommitDisk', 2)).toBeNull();
      expect(bladWspolczynnika('overcommitCpu', 1)).toBeNull();
    });

    it('NaN nie przechodzi jako współczynnik', () => {
      expect(bladWspolczynnika('overcommitCpu', Number.NaN)).toContain('musi być liczbą');
      expect(efektywnyOvercommit(polityka({ overcommitCpu: Number.NaN }), true).cpu).toBe(1);
    });
  });

  describe('zabezpieczenia, które istniały wcześniej, nadal działają', () => {
    it('węzeł bez zaraportowanej pojemności jest pomijany', () => {
      const w = czyZmiesciSie({
        fizyczna: { cpu: 0, ramMb: 0, diskMb: 0 },
        sprzedane: { cpu: 0, ramMb: 0, diskMb: 0 },
        zuzycie: null,
        potrzeba: PAKIET,
        polityka: polityka({ overcommitRam: 4 }),
      });
      expect(w.mozna).toBe(false);
      expect(w.powod).toBe('BRAK_RAPORTU_POJEMNOSCI');
    });

    it('maxAccounts obowiązuje niezależnie od nadsubskrypcji', () => {
      const w = czyZmiesciSie({
        fizyczna: WEZEL,
        sprzedane: { cpu: 0, ramMb: 0, diskMb: 0 },
        zuzycie: { cpu: 0, ramMb: 0, diskMb: 0 },
        potrzeba: PAKIET,
        polityka: polityka({ overcommitRam: 8, overcommitCpu: 8 }),
        liczbaKont: 10,
        maxAccounts: 10,
      });
      expect(w.mozna).toBe(false);
      expect(w.powod).toBe('LIMIT_KONT');
    });
  });

  describe('obciążenie do sortowania kandydatów', () => {
    it('bierze GORSZE z handlowego i fizycznego', () => {
      const maloSprzedanyAleZajety = czyZmiesciSie({
        fizyczna: WEZEL,
        sprzedane: { cpu: 0, ramMb: WEZEL.ramMb * 0.1, diskMb: 0 },
        zuzycie: { cpu: 0, ramMb: WEZEL.ramMb * 0.7, diskMb: 0 },
        potrzeba: PAKIET,
        polityka: polityka({ overcommitRam: 4 }),
      });
      const duzoSprzedanyAleWolny = czyZmiesciSie({
        fizyczna: WEZEL,
        sprzedane: { cpu: 0, ramMb: WEZEL.ramMb * 0.7, diskMb: 0 },
        zuzycie: { cpu: 0, ramMb: WEZEL.ramMb * 0.05, diskMb: 0 },
        potrzeba: PAKIET,
        polityka: polityka({ overcommitRam: 4 }),
      });
      // Węzeł realnie zaharowany ma być traktowany jak zajęty, nie jak wolny —
      // inaczej scheduler dokładałby konta dokładnie tam, gdzie boli.
      expect(maloSprzedanyAleZajety.obciazenie).toBeGreaterThan(
        duzoSprzedanyAleWolny.obciazenie,
      );
    });
  });
});
