import {
  deltaJestZerowa,
  deltaKsiegi,
  KONTO_NIEISTNIEJACE,
  ksiegaUpdateData,
  LimityEfektywne,
  limityEfektywne,
} from './node-capacity';

/**
 * Niezmiennik księgi pojemności węzła.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PO CO TEN TEST ISTNIEJE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Strażniki w `test/ksiega-wezla.spec.ts` czytają tekst źródłowy. Złapią
 * usunięcie linii — i faktycznie złapały, gdy arytmetyka poszła do wspólnych
 * funkcji. Ale nie złapią błędu w ZNAKU delty ani pomylonych argumentów:
 * `deltaKsiegi(po, przed)` zamiast `deltaKsiegi(przed, po)` przechodzi każdy
 * test statyczny i rozjeżdża księgę przy pierwszej operacji.
 *
 * Ten test sprawdza jedyną rzecz, która naprawdę musi być prawdziwa:
 *
 *     allocated* == suma limitów efektywnych kont ŻYWYCH na węźle
 *
 * po DOWOLNYM ciągu operacji. Nie sprawdza pojedynczych przypadków — puszcza
 * setki losowych sekwencji (założenie konta, skalowanie w górę i w dół, zmiana
 * planu, usunięcie) i po każdym kroku porównuje księgę z prawdą.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DLACZEGO TO JEST UCZCIWY TEST, A NIE SYMULACJA WŁASNEJ FANTAZJI
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Symulator używa DOKŁADNIE tych samych funkcji co produkcja
 * (`limityEfektywne`, `deltaKsiegi`, `ksiegaUpdateData`) i odtwarza sposób,
 * w jaki cztery serwisy je wołają. Gdyby liczył po swojemu, sprawdzałby
 * wyłącznie sam siebie.
 *
 * Czego NIE sprawdza: czy serwisy wołają te funkcje w odpowiednich momentach
 * i z odpowiednimi argumentami — to jest rola testu integracyjnego z bazą
 * (X-04). Tu weryfikowana jest arytmetyka, tam okablowanie.
 */

/** Deterministyczny generator — ten sam ciąg przy każdym uruchomieniu CI. */
function generator(ziarno: number): () => number {
  let stan = ziarno >>> 0;
  return () => {
    // xorshift32 — wystarczający i powtarzalny.
    stan ^= stan << 13;
    stan ^= stan >>> 17;
    stan ^= stan << 5;
    stan >>>= 0;
    return stan / 0xffffffff;
  };
}

interface Plan {
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
}

const PLANY: Plan[] = [
  { cpuLimit: 200, ramLimitMb: 8192, diskLimitMb: 51200 }, // pakiet produkcyjny
  { cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 10240 },
  { cpuLimit: 400, ramLimitMb: 4096, diskLimitMb: 51200 },
];

interface Konto {
  id: number;
  plan: Plan;
  scaledCpu: number;
  scaledRamMb: number;
  scaledDiskMb: number;
  zywe: boolean;
}

/** Księga węzła — jedyne, co „widzi" NodeSelector. */
interface Ksiega {
  allocatedCpu: number;
  allocatedMemory: number;
  allocatedDisk: number;
}

/** Stosuje `data` z `ksiegaUpdateData` tak, jak zrobiłby to Prisma. */
function zastosuj(k: Ksiega, delta: LimityEfektywne): Ksiega {
  const data = ksiegaUpdateData(delta);
  return {
    allocatedCpu: k.allocatedCpu + (data.allocatedCpu?.increment ?? 0),
    allocatedMemory: k.allocatedMemory + (data.allocatedMemory?.increment ?? 0),
    allocatedDisk: k.allocatedDisk + (data.allocatedDisk?.increment ?? 0),
  };
}

/** Prawda — policzona niezależnie od księgi, wprost z kont żywych. */
function prawda(konta: Konto[]): Ksiega {
  return konta
    .filter((k) => k.zywe)
    .reduce<Ksiega>(
      (acc, k) => {
        const l = limityEfektywne(k.plan, k);
        return {
          allocatedCpu: acc.allocatedCpu + l.cpu,
          allocatedMemory: acc.allocatedMemory + l.ramMb,
          allocatedDisk: acc.allocatedDisk + l.diskMb,
        };
      },
      { allocatedCpu: 0, allocatedMemory: 0, allocatedDisk: 0 },
    );
}

type Operacja = 'ZALOZ' | 'SKALUJ_W_GORE' | 'SKALUJ_W_DOL' | 'ZMIEN_PLAN' | 'USUN';

interface Przebieg {
  ksiega: Ksiega;
  konta: Konto[];
  operacje: Array<{ op: Operacja; kontoId: number | null }>;
}

function przebieg(ziarno: number, krokow: number): Przebieg {
  const los = generator(ziarno);
  const wybierz = <T,>(t: T[]): T => t[Math.floor(los() * t.length)]!;

  let ksiega: Ksiega = { allocatedCpu: 0, allocatedMemory: 0, allocatedDisk: 0 };
  const konta: Konto[] = [];
  const operacje: Przebieg['operacje'] = [];
  let nastepneId = 1;

  for (let i = 0; i < krokow; i++) {
    const zywe = konta.filter((k) => k.zywe);
    const dostepne: Operacja[] =
      zywe.length === 0
        ? ['ZALOZ']
        : ['ZALOZ', 'SKALUJ_W_GORE', 'SKALUJ_W_DOL', 'ZMIEN_PLAN', 'USUN'];
    const op = wybierz(dostepne);

    if (op === 'ZALOZ') {
      // provisioning.service.ts — nowe konto nie ma nadwyżki.
      const plan = wybierz(PLANY);
      const konto: Konto = {
        id: nastepneId++,
        plan,
        scaledCpu: 0,
        scaledRamMb: 0,
        scaledDiskMb: 0,
        zywe: true,
      };
      ksiega = zastosuj(
        ksiega,
        deltaKsiegi(KONTO_NIEISTNIEJACE, limityEfektywne(plan)),
      );
      konta.push(konto);
      operacje.push({ op, kontoId: konto.id });
      continue;
    }

    const konto = wybierz(zywe);

    if (op === 'SKALUJ_W_GORE' || op === 'SKALUJ_W_DOL') {
      // autoscaling-engine.service.ts — baza bez zmian, zmienia się nadwyżka.
      const kierunek = op === 'SKALUJ_W_GORE' ? 1 : -1;
      const nowa = {
        scaledCpu: Math.max(0, konto.scaledCpu + kierunek * Math.floor(los() * 200)),
        scaledRamMb: Math.max(0, konto.scaledRamMb + kierunek * Math.floor(los() * 4096)),
        scaledDiskMb: Math.max(0, konto.scaledDiskMb + kierunek * Math.floor(los() * 20480)),
      };
      ksiega = zastosuj(
        ksiega,
        deltaKsiegi(limityEfektywne(konto.plan, konto), limityEfektywne(konto.plan, nowa)),
      );
      Object.assign(konto, nowa);
      operacje.push({ op, kontoId: konto.id });
      continue;
    }

    if (op === 'ZMIEN_PLAN') {
      // plan-change.service.ts — nadwyżka jest zerowana przy zmianie planu.
      const nowyPlan = wybierz(PLANY);
      ksiega = zastosuj(
        ksiega,
        deltaKsiegi(limityEfektywne(konto.plan, konto), limityEfektywne(nowyPlan)),
      );
      konto.plan = nowyPlan;
      konto.scaledCpu = 0;
      konto.scaledRamMb = 0;
      konto.scaledDiskMb = 0;
      operacje.push({ op, kontoId: konto.id });
      continue;
    }

    // USUN — account-deletion.service.ts zwalnia limity efektywne.
    ksiega = zastosuj(
      ksiega,
      deltaKsiegi(limityEfektywne(konto.plan, konto), KONTO_NIEISTNIEJACE),
    );
    konto.zywe = false;
    operacje.push({ op, kontoId: konto.id });
  }

  return { ksiega, konta, operacje };
}

describe('niezmiennik księgi pojemności węzła', () => {
  it('księga zgadza się z prawdą po każdym pojedynczym kroku', () => {
    const los = generator(20260822);
    let ksiega: Ksiega = { allocatedCpu: 0, allocatedMemory: 0, allocatedDisk: 0 };
    const konta: Konto[] = [];
    let nastepneId = 1;

    for (let i = 0; i < 400; i++) {
      const zywe = konta.filter((k) => k.zywe);
      if (zywe.length === 0 || los() < 0.35) {
        const plan = PLANY[Math.floor(los() * PLANY.length)]!;
        ksiega = zastosuj(ksiega, deltaKsiegi(KONTO_NIEISTNIEJACE, limityEfektywne(plan)));
        konta.push({
          id: nastepneId++,
          plan,
          scaledCpu: 0,
          scaledRamMb: 0,
          scaledDiskMb: 0,
          zywe: true,
        });
      } else {
        const konto = zywe[Math.floor(los() * zywe.length)]!;
        const nowa = {
          scaledCpu: Math.floor(los() * 400),
          scaledRamMb: Math.floor(los() * 8192),
          scaledDiskMb: Math.floor(los() * 40960),
        };
        ksiega = zastosuj(
          ksiega,
          deltaKsiegi(limityEfektywne(konto.plan, konto), limityEfektywne(konto.plan, nowa)),
        );
        Object.assign(konto, nowa);
      }

      // Sprawdzenie po KAŻDYM kroku — inaczej dwa błędy mogłyby się znieść.
      expect(ksiega).toEqual(prawda(konta));
    }
  });

  it.each([1, 7, 42, 1337, 20260822, 999983])(
    'niezmiennik trzyma się przez 300 losowych operacji (ziarno %i)',
    (ziarno) => {
      const { ksiega, konta } = przebieg(ziarno, 300);
      expect(ksiega).toEqual(prawda(konta));
    },
  );

  it('węzeł opróżniony do zera wraca dokładnie do zera', () => {
    // To jest test przecieku nr 2 z Z-16, ale liczbowo zamiast tekstowo:
    // usunięcie wszystkich kont MUSI wyzerować księgę. Przed poprawką zostawała
    // w niej suma wszystkiego, co kiedykolwiek na węźle stanęło.
    const { konta } = przebieg(555, 200);
    let ksiega = przebieg(555, 200).ksiega;

    for (const konto of konta.filter((k) => k.zywe)) {
      ksiega = zastosuj(
        ksiega,
        deltaKsiegi(limityEfektywne(konto.plan, konto), KONTO_NIEISTNIEJACE),
      );
      konto.zywe = false;
    }

    expect(ksiega).toEqual({ allocatedCpu: 0, allocatedMemory: 0, allocatedDisk: 0 });
  });

  it('księga nigdy nie schodzi poniżej zera przy poprawnej sekwencji', () => {
    // Wartość ujemna w księdze znaczy, że coś zwolniono dwa razy albo zwolniono
    // więcej, niż zarezerwowano. NodeSelector nie ma na to obrony — zobaczyłby
    // węzeł jako pusty i pakował na niego konta bez końca.
    for (const ziarno of [3, 11, 97, 4242]) {
      const los = generator(ziarno);
      let ksiega: Ksiega = { allocatedCpu: 0, allocatedMemory: 0, allocatedDisk: 0 };
      const konta: Konto[] = [];

      for (let i = 0; i < 250; i++) {
        const zywe = konta.filter((k) => k.zywe);
        if (zywe.length === 0 || los() < 0.4) {
          const plan = PLANY[Math.floor(los() * PLANY.length)]!;
          ksiega = zastosuj(ksiega, deltaKsiegi(KONTO_NIEISTNIEJACE, limityEfektywne(plan)));
          konta.push({
            id: i,
            plan,
            scaledCpu: 0,
            scaledRamMb: 0,
            scaledDiskMb: 0,
            zywe: true,
          });
        } else {
          const konto = zywe[Math.floor(los() * zywe.length)]!;
          ksiega = zastosuj(
            ksiega,
            deltaKsiegi(limityEfektywne(konto.plan, konto), KONTO_NIEISTNIEJACE),
          );
          konto.zywe = false;
        }

        expect(ksiega.allocatedCpu).toBeGreaterThanOrEqual(0);
        expect(ksiega.allocatedMemory).toBeGreaterThanOrEqual(0);
        expect(ksiega.allocatedDisk).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('arytmetyka delt — przypadki, na których łatwo się pomylić', () => {
  it('kolejność argumentów ma znaczenie i jest jawna', () => {
    const male = { cpu: 100, ramMb: 1024, diskMb: 10240 };
    const duze = { cpu: 200, ramMb: 8192, diskMb: 51200 };
    expect(deltaKsiegi(male, duze).cpu).toBe(100);
    expect(deltaKsiegi(duze, male).cpu).toBe(-100);
  });

  it('delta z siebie na siebie jest zerowa i nie generuje zapisu', () => {
    const l = { cpu: 200, ramMb: 8192, diskMb: 51200 };
    const d = deltaKsiegi(l, l);
    expect(deltaJestZerowa(d)).toBe(true);
    expect(ksiegaUpdateData(d)).toEqual({});
  });

  it('zmniejszenie jest incrementem ujemnym, nie decrementem', () => {
    // decrement dodatniej wartości i increment ujemnej dają ten sam skutek,
    // ale mieszanie ich w czterech serwisach było jednym z powodów rozjazdu.
    const d = deltaKsiegi({ cpu: 200, ramMb: 8192, diskMb: 51200 }, KONTO_NIEISTNIEJACE);
    expect(ksiegaUpdateData(d)).toEqual({
      allocatedCpu: { increment: -200 },
      allocatedMemory: { increment: -8192 },
      allocatedDisk: { increment: -51200 },
    });
  });

  it('pomija zasób, który się nie zmienił', () => {
    const d = deltaKsiegi(
      { cpu: 200, ramMb: 8192, diskMb: 51200 },
      { cpu: 200, ramMb: 8192, diskMb: 61440 },
    );
    const data = ksiegaUpdateData(d);
    expect(data.allocatedCpu).toBeUndefined();
    expect(data.allocatedMemory).toBeUndefined();
    expect(data.allocatedDisk).toEqual({ increment: 10240 });
  });

  it('limity efektywne konta bez nadwyżki równają się bazie planu', () => {
    const plan = { cpuLimit: 200, ramLimitMb: 8192, diskLimitMb: 51200 };
    expect(limityEfektywne(plan)).toEqual({ cpu: 200, ramMb: 8192, diskMb: 51200 });
  });

  it('limity efektywne doliczają nadwyżkę autoskalowania', () => {
    const plan = { cpuLimit: 200, ramLimitMb: 8192, diskLimitMb: 51200 };
    expect(
      limityEfektywne(plan, { scaledCpu: 200, scaledRamMb: 8192, scaledDiskMb: 0 }),
    ).toEqual({ cpu: 400, ramMb: 16384, diskMb: 51200 });
  });
});
