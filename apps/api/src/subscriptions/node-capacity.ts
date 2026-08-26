/**
 * Z-12 — pojemność węzła: jedno miejsce, w którym liczy się, czy konto się zmieści.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DWIE KSIĘGI, KTÓRYCH NIE WOLNO MYLIĆ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1. SPRZEDANE (`Server.allocatedCpu/Memory/Disk`) — wszystko, co węzeł komuś
 *    obiecał. Rośnie przy provisioningu o PEŁNY limit planu oraz — od Z-16 —
 *    o nadwyżkę przyznaną przez autoskalowanie. To jest zobowiązanie handlowe,
 *    nie zajętość maszyny.
 *
 *    Do Z-16 autoskalowanie podnosiło limity konta w DirectAdminie, nie
 *    dopisując ich tutaj. Skutek: dwie warstwy nadsubskrybowały ten sam węzeł
 *    niezależnie od siebie i żadna nie widziała drugiej — placement liczył
 *    limity bazowe, a nadwyżka istniała poza księgą.
 *
 * 2. REALNE ZUŻYCIE (`UsageMetric` po `serverId`) — ile węzeł faktycznie zjada.
 *    To jest zajętość maszyny.
 *
 * Do 2026-08-22 kod znał tylko księgę pierwszą i traktował ją jak drugą.
 * Konsekwencja: konto z limitem 8 GB RAM „zajmowało" 8 GB pamięci węzła, więc
 * na maszynie ze 128 GB mieściło się szesnaście kont i ani jednego więcej.
 * Próg rentowności przy cenie 45 zł to 58 kont (PB-01), a zatem przy tym
 * sposobie liczenia nie istniała liczba sprzedanych pakietów, przy której
 * węzeł wychodzi na zero.
 *
 * Błąd był kategorii, nie arytmetyki. W CloudLinux/LVE `MemoryMax` i `SPEED` są
 * SUFITAMI, do których proces może dobić — nie zasobami odłożonymi na bok.
 * Rezerwowanie sufitu to to samo, co trzymanie stolika dla każdego, kto MÓGŁBY
 * przyjść.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DWIE BRAMKI ZAMIAST JEDNEJ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Bramka A (handlowa): SPRZEDANE + limit planu ≤ pojemność fizyczna × overcommit
 * Bramka B (fizyczna): REALNE ZUŻYCIE ≤ pojemność fizyczna × (1 − headroom)
 *
 * Bramka A pozwala sprzedać więcej, niż węzeł ma. Bramka B pilnuje, żeby to
 * „więcej" nigdy nie zamieniło się w maszynę, która nie wyrabia. Sama bramka A
 * to hazard; sama bramka B to dzisiejszy stan sprzed poprawki, tylko z inną
 * etykietą. Dopiero obie razem są nadsubskrypcją, a nie życzeniem.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DYSK JEST INNY NIŻ RAM I CPU
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Quota dyskowa jest realnie egzekwowana przez system plików. Klient MOŻE ją
 * wypełnić w całości i wtedy te gigabajty są zajęte na stałe — nie zwolnią się
 * po piku, jak pamięć. Dlatego `overcommitDisk` ma osobne, niższe ograniczenie
 * górne niż CPU i RAM, a bramka B dla dysku jest tą, która naprawdę pracuje.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DEGRADACJA PRZY BRAKU TELEMETRII
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Nadsubskrypcja bez wglądu w realne zużycie jest zgadywaniem. Gdy węzeł nie
 * przysłał świeżych metryk, `overcommit` spada do 1,0 — czyli do zachowania
 * sprzed poprawki. Świadomie NIE blokujemy wtedy sprzedaży całkowicie: awaria
 * telemetrii nie powinna zatrzymywać firmy, a zachowanie zachowawcze jest
 * bezpieczne. Węzeł już nadsubskrybowany po prostu przestaje przyjmować nowe
 * konta do czasu powrotu metryk, a istniejące działają bez zmian.
 */

/** Pojemność fizyczna węzła. CPU w „procentach rdzenia" (LVE SPEED: 100 = 1 rdzeń). */
export interface PojemnoscFizyczna {
  cpu: number;
  ramMb: number;
  diskMb: number;
}

/** Suma limitów planów kont już umieszczonych na węźle. */
export interface Sprzedane {
  cpu: number;
  ramMb: number;
  diskMb: number;
}

/** Realna zajętość węzła z telemetrii. `null` = brak świeżych danych. */
export type ZuzycieRealne = PojemnoscFizyczna | null;

/** Czego potrzebuje konto — limity bazowe planu. */
export interface ZapotrzebowaniePlanu {
  cpu: number;
  ramMb: number;
  diskMb: number;
}

export interface PolitykaPojemnosci {
  overcommitCpu: number;
  overcommitRam: number;
  overcommitDisk: number;
  /** 0–90. Rezerwa pojemności FIZYCZNEJ pod burst autoskalowania. */
  reservedHeadroomPercent: number;
}

/**
 * Górne ograniczenia współczynników nadsubskrypcji.
 *
 * CPU i RAM: 8× to i tak więcej, niż model PB-01 zakłada (4×). Limit istnieje po
 * to, żeby literówka w panelu admina nie zamieniła węzła w maszynę, która
 * przyjmie tysiąc kont.
 *
 * DYSK: 3× i ani grama więcej. Przy bazie 50 GB i węźle 1,92 TB nadsubskrypcja
 * 3× to 5,7 TB sprzedanego miejsca. Jeżeli klienci zaczną realnie wypełniać
 * quoty, nie da się tego cofnąć inaczej niż migracją kont.
 */
export const MAKS_OVERCOMMIT = { cpu: 8, ram: 8, disk: 3 } as const;
export const MIN_OVERCOMMIT = 1;

/** Po tylu minutach bez metryki uznajemy telemetrię węzła za nieświeżą. */
export const SWIEZOSC_TELEMETRII_MIN = 30;

/**
 * OPS-01 — po tylu minutach bez sygnału życia węzeł uznajemy za milczący.
 *
 * To NIE jest to samo co `SWIEZOSC_TELEMETRII_MIN`. Nieświeża telemetria mówi
 * „nie znam realnego zużycia" i degraduje nadsubskrypcję do 1,0×; milczący
 * węzeł mówi „nie wiem, czy ta maszyna w ogóle żyje" i musi wypaść z wyboru.
 * Wcześniej pierwsze istniało, drugiego nie było wcale — więc martwy węzeł
 * z wolną pojemnością nominalną nadal dostawał nowe konta.
 *
 * Ta stała jest JEDYNYM źródłem progu: `ops-watchdog.scheduler.ts` liczył
 * własne 10 minut osobno. Dwa progi opisujące to samo rozjeżdżają się cicho.
 */
export const BRAK_SYGNALU_MIN = 10;

/** `null` znaczy „nigdy się nie odezwał", czyli milczy. */
export function czyWezelMilczy(
  lastHeartbeatAt: Date | null | undefined,
  teraz: Date = new Date(),
): boolean {
  if (!lastHeartbeatAt) return true;
  return teraz.getTime() - lastHeartbeatAt.getTime() > BRAK_SYGNALU_MIN * 60_000;
}

export type PowodOdmowy =
  | 'BRAK_POJEMNOSCI_CPU'
  | 'BRAK_POJEMNOSCI_RAM'
  | 'BRAK_POJEMNOSCI_DYSK'
  | 'REALNE_ZUZYCIE_CPU'
  | 'REALNE_ZUZYCIE_RAM'
  | 'REALNE_ZUZYCIE_DYSK'
  | 'LIMIT_KONT'
  | 'BRAK_RAPORTU_POJEMNOSCI';

export interface WynikDopasowania {
  mozna: boolean;
  powod?: PowodOdmowy;
  /** Obciążenie 0–1: gorsze z obciążenia handlowego i fizycznego. Niżej = luźniej. */
  obciazenie: number;
  /** Czy węzeł miał świeżą telemetrię — po degradacji overcommit spada do 1,0. */
  telemetriaSwieza: boolean;
}

function przytnij(v: number, min: number, maks: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(Math.max(v, min), maks);
}

/** Współczynniki po przycięciu do dozwolonego zakresu i po degradacji. */
export function efektywnyOvercommit(
  polityka: PolitykaPojemnosci,
  telemetriaSwieza: boolean,
): { cpu: number; ram: number; disk: number } {
  if (!telemetriaSwieza) {
    // Bez wglądu w realne zużycie wracamy do zachowania sprzed Z-12.
    return { cpu: 1, ram: 1, disk: 1 };
  }
  return {
    cpu: przytnij(polityka.overcommitCpu, MIN_OVERCOMMIT, MAKS_OVERCOMMIT.cpu),
    ram: przytnij(polityka.overcommitRam, MIN_OVERCOMMIT, MAKS_OVERCOMMIT.ram),
    disk: przytnij(polityka.overcommitDisk, MIN_OVERCOMMIT, MAKS_OVERCOMMIT.disk),
  };
}

/** Ile węzeł może SPRZEDAĆ (pojemność fizyczna × overcommit). */
export function pojemnoscSprzedazowa(
  fizyczna: PojemnoscFizyczna,
  polityka: PolitykaPojemnosci,
  telemetriaSwieza: boolean,
): PojemnoscFizyczna {
  const oc = efektywnyOvercommit(polityka, telemetriaSwieza);
  return {
    cpu: fizyczna.cpu * oc.cpu,
    ramMb: fizyczna.ramMb * oc.ram,
    diskMb: fizyczna.diskMb * oc.disk,
  };
}

/**
 * Czy na węźle zmieści się kolejne konto o zapotrzebowaniu `potrzeba`.
 *
 * Zwraca też obciążenie do sortowania kandydatów — celowo GORSZE z dwóch:
 * handlowego i fizycznego. Węzeł mało sprzedany, ale realnie zaharowany, ma
 * być traktowany jak zajęty, nie jak wolny.
 */
export function czyZmiesciSie(args: {
  fizyczna: PojemnoscFizyczna;
  sprzedane: Sprzedane;
  zuzycie: ZuzycieRealne;
  potrzeba: ZapotrzebowaniePlanu;
  polityka: PolitykaPojemnosci;
  liczbaKont?: number;
  maxAccounts?: number | null;
}): WynikDopasowania {
  const { fizyczna, sprzedane, zuzycie, potrzeba, polityka } = args;
  const telemetriaSwieza = zuzycie !== null;

  // Węzeł, który nie zaraportował pojemności, jest dla nas nieznany — a na
  // nieznanym nie da się rozsądnie rozumować o nadsubskrypcji.
  if (fizyczna.cpu <= 0 || fizyczna.ramMb <= 0 || fizyczna.diskMb <= 0) {
    return { mozna: false, powod: 'BRAK_RAPORTU_POJEMNOSCI', obciazenie: 1, telemetriaSwieza };
  }

  if (
    args.maxAccounts != null &&
    args.liczbaKont != null &&
    args.liczbaKont >= args.maxAccounts
  ) {
    return { mozna: false, powod: 'LIMIT_KONT', obciazenie: 1, telemetriaSwieza };
  }

  const sprzedazowa = pojemnoscSprzedazowa(fizyczna, polityka, telemetriaSwieza);

  // ── Bramka A: handlowa ────────────────────────────────────────────────────
  const obcHandloweCpu = sprzedane.cpu / sprzedazowa.cpu;
  const obcHandloweRam = sprzedane.ramMb / sprzedazowa.ramMb;
  const obcHandloweDisk = sprzedane.diskMb / sprzedazowa.diskMb;

  // ── Bramka B: fizyczna ────────────────────────────────────────────────────
  // Headroom liczy się od pojemności FIZYCZNEJ i chroni REALNE zużycie.
  // Mieszanie tych jednostek to dokładnie ten błąd, który Z-12 naprawia.
  const headroom = przytnij(polityka.reservedHeadroomPercent, 0, 90) / 100;
  const dostepneFizycznie = {
    cpu: fizyczna.cpu * (1 - headroom),
    ramMb: fizyczna.ramMb * (1 - headroom),
    diskMb: fizyczna.diskMb * (1 - headroom),
  };

  const obcFizyczne = zuzycie
    ? {
        cpu: zuzycie.cpu / dostepneFizycznie.cpu,
        ram: zuzycie.ramMb / dostepneFizycznie.ramMb,
        disk: zuzycie.diskMb / dostepneFizycznie.diskMb,
      }
    : { cpu: 0, ram: 0, disk: 0 };

  const obciazenie = Math.max(
    obcHandloweCpu,
    obcHandloweRam,
    obcHandloweDisk,
    obcFizyczne.cpu,
    obcFizyczne.ram,
    obcFizyczne.disk,
  );

  // Bramka B sprawdzana PRZED A: węzeł realnie zajęty nie przyjmuje konta,
  // choćby handlowo miał jeszcze zapas. Kolejność ma znaczenie dla powodu
  // odmowy, który trafia do logu i do alertu operatorskiego.
  if (zuzycie) {
    if (zuzycie.diskMb >= dostepneFizycznie.diskMb) {
      return { mozna: false, powod: 'REALNE_ZUZYCIE_DYSK', obciazenie, telemetriaSwieza };
    }
    if (zuzycie.ramMb >= dostepneFizycznie.ramMb) {
      return { mozna: false, powod: 'REALNE_ZUZYCIE_RAM', obciazenie, telemetriaSwieza };
    }
    if (zuzycie.cpu >= dostepneFizycznie.cpu) {
      return { mozna: false, powod: 'REALNE_ZUZYCIE_CPU', obciazenie, telemetriaSwieza };
    }
  }

  if (sprzedane.cpu + potrzeba.cpu > sprzedazowa.cpu) {
    return { mozna: false, powod: 'BRAK_POJEMNOSCI_CPU', obciazenie, telemetriaSwieza };
  }
  if (sprzedane.ramMb + potrzeba.ramMb > sprzedazowa.ramMb) {
    return { mozna: false, powod: 'BRAK_POJEMNOSCI_RAM', obciazenie, telemetriaSwieza };
  }
  if (sprzedane.diskMb + potrzeba.diskMb > sprzedazowa.diskMb) {
    return { mozna: false, powod: 'BRAK_POJEMNOSCI_DYSK', obciazenie, telemetriaSwieza };
  }

  return { mozna: true, obciazenie, telemetriaSwieza };
}

/**
 * Z-16 — ile węzeł może JESZCZE zadysponować ponad to, co już obiecał.
 *
 * Używane przez autoskalowanie, żeby przyznać kontu nadwyżkę tylko do wysokości,
 * którą węzeł faktycznie ma. Wcześniej silnik autoskalowania w ogóle nie pytał
 * o węzeł: podnosił limity w DirectAdminie i tyle.
 *
 * Zwraca zera dla zasobu, którego REALNIE zaczyna brakować — dokładanie
 * gigabajtów na maszynie, która ich nie ma, jest właśnie tą awarią, przed którą
 * bramka fizyczna chroni przy sprzedaży.
 *
 * Wynik jest zawsze nieujemny. Węzeł nadsubskrybowany ponad politykę (bo admin
 * obniżył współczynnik) zwraca zera, a nie liczby ujemne — autoskalowanie ma
 * wtedy nie rosnąć, a nie kurczyć konta klienta w tle.
 */
export function wolneDoZadysponowania(args: {
  fizyczna: PojemnoscFizyczna;
  sprzedane: Sprzedane;
  zuzycie: ZuzycieRealne;
  polityka: PolitykaPojemnosci;
}): PojemnoscFizyczna {
  const { fizyczna, sprzedane, zuzycie, polityka } = args;

  if (fizyczna.cpu <= 0 || fizyczna.ramMb <= 0 || fizyczna.diskMb <= 0) {
    return { cpu: 0, ramMb: 0, diskMb: 0 };
  }

  const telemetriaSwieza = zuzycie !== null;
  const sprzedazowa = pojemnoscSprzedazowa(fizyczna, polityka, telemetriaSwieza);

  const headroom = przytnij(polityka.reservedHeadroomPercent, 0, 90) / 100;
  const dostepneFizycznie = {
    cpu: fizyczna.cpu * (1 - headroom),
    ramMb: fizyczna.ramMb * (1 - headroom),
    diskMb: fizyczna.diskMb * (1 - headroom),
  };

  const dodatnie = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

  // Bramka fizyczna: zasób, którego realnie brakuje, jest zamknięty niezależnie
  // od tego, ile zostało w księdze handlowej.
  const zablokowany = {
    cpu: zuzycie ? zuzycie.cpu >= dostepneFizycznie.cpu : false,
    ramMb: zuzycie ? zuzycie.ramMb >= dostepneFizycznie.ramMb : false,
    diskMb: zuzycie ? zuzycie.diskMb >= dostepneFizycznie.diskMb : false,
  };

  return {
    cpu: zablokowany.cpu ? 0 : dodatnie(sprzedazowa.cpu - sprzedane.cpu),
    ramMb: zablokowany.ramMb ? 0 : dodatnie(sprzedazowa.ramMb - sprzedane.ramMb),
    diskMb: zablokowany.diskMb ? 0 : dodatnie(sprzedazowa.diskMb - sprzedane.diskMb),
  };
}

/**
 * Górna granica krotności autoskalowania dopuszczalna w definicji planu.
 *
 * Do Z-16 silnik przycinał krotność do 10× na sztywno — bez związku z tym, co
 * stało w planie. Oferta Verris obiecuje 12× dla CPU i 20× dla dysku, więc
 * sufit nie był osiągalny, a klient płacący za nadwyżkę godzinowo nie dostawał
 * tego, za co zapłacił.
 *
 * Podniesienie progu było bezpieczne DOPIERO po dołożeniu sprawdzania pojemności
 * węzła (`wolneDoZadysponowania`). Odwrotna kolejność powiększyłaby promień
 * rażenia: konto rosłoby do 20× na maszynie, która o tym nie wie.
 *
 * Granica istnieje nadal, ale jako zabezpieczenie przed literówką w definicji
 * planu, a nie jako ukryty sufit produktu.
 */
export const MAKS_KROTNOSC_AUTOSKALOWANIA = 32;

/** Domyślna krotność, gdy plan ma wartość bezsensowną. */
export const DOMYSLNA_KROTNOSC_AUTOSKALOWANIA = 3;

/** Krotność autoskalowania po przycięciu do dozwolonego zakresu. */
export function krotnoscAutoskalowania(wartoscZPlanu: number): number {
  if (!Number.isFinite(wartoscZPlanu) || wartoscZPlanu < 1) {
    return DOMYSLNA_KROTNOSC_AUTOSKALOWANIA;
  }
  return Math.min(wartoscZPlanu, MAKS_KROTNOSC_AUTOSKALOWANIA);
}

// ═══════════════════════════════════════════════════════════════════════════
// KSIĘGA POJEMNOŚCI — arytmetyka delt
// ═══════════════════════════════════════════════════════════════════════════
//
// `Server.allocated*` prowadzą CZTERY miejsca:
//
//   provisioning.service.ts      konto powstaje        → +limity bazowe planu
//   autoscaling-engine.service   nadwyżka rośnie/maleje → ±delta nadwyżki
//   plan-change.service.ts       zmiana planu          → ±różnica efektywnych
//   account-deletion.service.ts  konto znika           → −limity efektywne
//
// Każde liczyło deltę po swojemu. Przy Z-16 wyszło, że plan-change stał się
// błędny przez samą zmianę znaczenia księgi — nie przez zmianę w nim samym.
// Wykrycie było kwestią przeczytania kodu, nie testu.
//
// Poniższe funkcje są jedyną arytmetyką księgi w projekcie. Dzięki temu piąty
// rozjazd nie ma gdzie powstać, a niezmiennik „księga = suma limitów
// efektywnych kont żywych" da się sprawdzić testem symulacyjnym zamiast
// czekać, aż rozjazd zobaczy operator.

/** Limity, które węzeł faktycznie trzyma dla jednego konta. */
export interface LimityEfektywne {
  cpu: number;
  ramMb: number;
  diskMb: number;
}

/** Konto, którego nie ma — stan przed założeniem i po usunięciu. */
export const KONTO_NIEISTNIEJACE: LimityEfektywne = { cpu: 0, ramMb: 0, diskMb: 0 };

/**
 * Limity efektywne = baza planu + nadwyżka autoskalowania.
 *
 * To jest DOKŁADNIE to, co siedzi w `Account.cpuLimit/ramLimitMb/diskLimitMb`
 * i co węzeł ma zarezerwowane. Rozróżnienie bazy od nadwyżki ma znaczenie przy
 * rozliczeniach, ale nie przy pojemności — węzłowi jest wszystko jedno, z
 * jakiego tytułu gigabajt jest zajęty.
 */
export function limityEfektywne(
  baza: { cpuLimit: number; ramLimitMb: number; diskLimitMb: number },
  nadwyzka: { scaledCpu: number; scaledRamMb: number; scaledDiskMb: number } = {
    scaledCpu: 0,
    scaledRamMb: 0,
    scaledDiskMb: 0,
  },
): LimityEfektywne {
  return {
    cpu: baza.cpuLimit + nadwyzka.scaledCpu,
    ramMb: baza.ramLimitMb + nadwyzka.scaledRamMb,
    diskMb: baza.diskLimitMb + nadwyzka.scaledDiskMb,
  };
}

/**
 * O ile zmienia się księga węzła, gdy konto przechodzi ze stanu `przed`
 * do stanu `po`.
 *
 * Założenie konta:  deltaKsiegi(KONTO_NIEISTNIEJACE, limity)
 * Usunięcie konta:  deltaKsiegi(limity, KONTO_NIEISTNIEJACE)
 * Zmiana planu:     deltaKsiegi(limityStare, limityNowe)
 * Autoskalowanie:   deltaKsiegi(limityPrzedSkalowaniem, limityPoSkalowaniu)
 *
 * Jedna funkcja na wszystkie cztery, bo to jest jedna operacja.
 */
export function deltaKsiegi(przed: LimityEfektywne, po: LimityEfektywne): LimityEfektywne {
  return {
    cpu: po.cpu - przed.cpu,
    ramMb: po.ramMb - przed.ramMb,
    diskMb: po.diskMb - przed.diskMb,
  };
}

/** Czy delta w ogóle coś zmienia — pozwala pominąć zapis do bazy. */
export function deltaJestZerowa(d: LimityEfektywne): boolean {
  return d.cpu === 0 && d.ramMb === 0 && d.diskMb === 0;
}

/**
 * Delta w postaci gotowej do `prisma.server.update({ data })`.
 *
 * `increment` z wartością ujemną działa jak zmniejszenie i jest odporne na
 * równoległy zapis — w przeciwieństwie do odczytu, obliczenia i zapisu wartości.
 */
export function ksiegaUpdateData(d: LimityEfektywne): {
  allocatedCpu?: { increment: number };
  allocatedMemory?: { increment: number };
  allocatedDisk?: { increment: number };
} {
  return {
    ...(d.cpu !== 0 ? { allocatedCpu: { increment: d.cpu } } : {}),
    ...(d.ramMb !== 0 ? { allocatedMemory: { increment: d.ramMb } } : {}),
    ...(d.diskMb !== 0 ? { allocatedDisk: { increment: d.diskMb } } : {}),
  };
}

/** Walidacja wartości wpisywanej przez admina. Zwraca komunikat albo null. */
export function bladWspolczynnika(
  nazwa: 'overcommitCpu' | 'overcommitRam' | 'overcommitDisk',
  wartosc: number,
): string | null {
  const maks =
    nazwa === 'overcommitDisk'
      ? MAKS_OVERCOMMIT.disk
      : nazwa === 'overcommitRam'
        ? MAKS_OVERCOMMIT.ram
        : MAKS_OVERCOMMIT.cpu;
  if (!Number.isFinite(wartosc)) {
    return `${nazwa} musi być liczbą.`;
  }
  if (wartosc < MIN_OVERCOMMIT || wartosc > maks) {
    return (
      `${nazwa} musi być z zakresu ${MIN_OVERCOMMIT}–${maks}. ` +
      (nazwa === 'overcommitDisk'
        ? 'Dysk ma niższy limit niż CPU i RAM, bo quota dyskowa jest realnie egzekwowana — ' +
          'klient może ją wypełnić w całości, a wtedy miejsca nie da się odzyskać bez migracji kont.'
        : 'Wartość 1 oznacza brak nadsubskrypcji (zachowanie sprzed Z-12).')
    );
  }
  return null;
}
