import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * X-23 — bramka podatności musi zatrzymywać, a nie tylko dopisywać adnotację.
 *
 * Do 2026-08-22 krok `pnpm audit --prod --audit-level high` w jobie
 * `security-scans` miał `continue-on-error: true`. Job świecił się na zielono
 * z adnotacją „Process completed with exit code 1", której nikt nie czyta.
 * Nowa krytyczna podatność przeszłaby dokładnie tak samo.
 *
 * Powód, dla którego alarm był wyłączony, był prawdziwy: jedna wysoka
 * podatność (deepmerge-ts przez Prismę 6) nie da się dziś domknąć. Odpowiedzią
 * nie jest jednak wyłączenie bramki, tylko lista świadomych zgód z terminem.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const BRAMKA = join(KORZEN, 'ops', 'ci', 'audyt-bramka.cjs');
const LISTA = join(KORZEN, 'ops', 'ci', 'podatnosci-dopuszczone.json');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ocen, czyZgodaZaDluga, MAKS_DNI_ZGODY } = require(BRAMKA) as {
  ocen: (
    znalezione: Array<{ severity: string; github_advisory_id?: string; module_name: string }>,
    zgody: Array<{ advisory: string; modul: string; wazneDo: string; pozycja: string }>,
    dzis: Date,
  ) => {
    blokujace: unknown[];
    bezZgody: unknown[];
    poTerminie: unknown[];
    nieuzyte: unknown[];
  };
  czyZgodaZaDluga: (zgoda: { wazneDo: string }, dzis: Date) => boolean;
  MAKS_DNI_ZGODY: number;
};

const DZIS = new Date('2026-08-22T12:00:00Z');
const ZGODA = {
  advisory: 'GHSA-ggr8-5vv4-36mx',
  modul: 'deepmerge-ts',
  pozycja: 'X-20',
  wazneDo: '2026-11-15',
};
const ZNANA = {
  severity: 'high',
  github_advisory_id: 'GHSA-ggr8-5vv4-36mx',
  module_name: 'deepmerge-ts',
};

describe('X-23 — bramka podatności', () => {
  it('przepuszcza podatność objętą zgodą w terminie', () => {
    const w = ocen([ZNANA], [ZGODA], DZIS);
    expect(w.blokujace).toHaveLength(1);
    expect(w.bezZgody).toEqual([]);
    expect(w.poTerminie).toEqual([]);
    expect(w.nieuzyte).toEqual([]);
  });

  it('zatrzymuje NOWĄ krytyczną podatność spoza listy', () => {
    const w = ocen(
      [ZNANA, { severity: 'critical', github_advisory_id: 'GHSA-nowa', module_name: 'cokolwiek' }],
      [ZGODA],
      DZIS,
    );
    expect(w.bezZgody).toHaveLength(1);
  });

  it('zatrzymuje zgodę po terminie — milczące przedłużanie to nie decyzja', () => {
    const w = ocen([ZNANA], [{ ...ZGODA, wazneDo: '2026-08-01' }], DZIS);
    expect(w.poTerminie).toHaveLength(1);
  });

  it('zatrzymuje zgodę na podatność, której już nie ma', () => {
    const w = ocen([], [ZGODA], DZIS);
    expect(w.nieuzyte).toHaveLength(1);
  });

  it('nie blokuje na średnich i niskich', () => {
    const w = ocen(
      [
        { severity: 'moderate', github_advisory_id: 'GHSA-a', module_name: 'x' },
        { severity: 'low', github_advisory_id: 'GHSA-b', module_name: 'y' },
      ],
      [],
      DZIS,
    );
    expect(w.blokujace).toEqual([]);
    expect(w.bezZgody).toEqual([]);
  });

  it('zatrzymuje zgodę bez daty — pusty termin to nie jest termin', () => {
    const w = ocen([ZNANA], [{ ...ZGODA, wazneDo: '' }], DZIS);
    expect(w.poTerminie).toHaveLength(1);
  });

  it(`zatrzymuje zgodę sięgającą dalej niż ${MAKS_DNI_ZGODY} dni`, () => {
    expect(czyZgodaZaDluga({ wazneDo: '2027-12-31' }, DZIS)).toBe(true);
    expect(czyZgodaZaDluga({ wazneDo: '2026-11-15' }, DZIS)).toBe(false);
  });
});

describe('X-23 — lista zgód jest kompletna', () => {
  const lista = JSON.parse(readFileSync(LISTA, 'utf8')) as {
    zgody: Array<Record<string, string>>;
  };

  it('każda zgoda ma powód, pozycję w macierzy i termin', () => {
    const braki: string[] = [];
    for (const z of lista.zgody) {
      for (const pole of ['advisory', 'modul', 'powod', 'pozycja', 'wazneDo']) {
        if (!z[pole]?.trim()) braki.push(`${z.advisory ?? '(bez id)'}: brak pola "${pole}"`);
      }
      if (z.powod && z.powod.length < 80) {
        braki.push(
          `${z.advisory}: powód ma ${z.powod.length} znaków — zgoda na podatność ` +
            `high/critical wymaga wyjaśnienia, nie hasła`,
        );
      }
    }
    expect(braki.join('\n')).toBe('');
  });

  it('każda zgoda wskazuje istniejącą pozycję macierzy', () => {
    const macierz = readFileSync(join(KORZEN, 'audyt', 'dane', 'macierz.csv'), 'utf8');
    for (const z of lista.zgody) {
      expect(macierz).toContain(`${z.pozycja},`);
    }
  });
});

describe('X-23 — job security-scans faktycznie bramkuje', () => {
  const ci = readFileSync(join(KORZEN, '.github', 'workflows', 'ci.yml'), 'utf8');
  /**
   * Komentarze wypadają przed dopasowaniem. Czwarty raz w tym projekcie
   * strażnik czytający plik trafiał we własny opis problemu — po „jest" z X-17
   * i „archiver.create" z X-21. Wzorzec jest już na tyle powtarzalny, że wart
   * zapamiętania: strażnik na treści pliku musi patrzeć na kod, nie na prozę.
   */
  const ciKod = ci
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

  /**
   * Rozkład na kroki po wcięciu myślnika, a nie wyrażeniem regularnym przez
   * cały plik. Pierwsza wersja używała jednego wzorca z leniwym kwantyfikatorem
   * i przeciekała na następny krok — czyli strażnik meldował „Install pnpm jest
   * miękki", choć miękki był krok obok. Strażnik, który wskazuje nie ten
   * element, kosztuje tyle samo czasu co brak strażnika.
   */
  function kroki(): Array<{ nazwa: string; tresc: string }> {
    const linie = ciKod.split('\n');
    const wynik: Array<{ nazwa: string; tresc: string }> = [];
    let biezacy: { nazwa: string; wciecie: number; linie: string[] } | null = null;
    const domknij = (): void => {
      if (biezacy) wynik.push({ nazwa: biezacy.nazwa, tresc: biezacy.linie.join('\n') });
    };
    for (const l of linie) {
      const start = /^(\s*)- name:\s*(.+?)\s*$/.exec(l);
      if (start) {
        domknij();
        biezacy = { nazwa: start[2], wciecie: start[1].length, linie: [l] };
        continue;
      }
      if (!biezacy) continue;
      // Nowy element listy na tym samym wcięciu kończy krok, nawet bez `name:`.
      const innyElement = new RegExp(`^\\s{${biezacy.wciecie}}- `).test(l);
      const wyzejWDrzewie = /^\s{0,4}\S/.test(l) && l.trim() !== '';
      if (innyElement || wyzejWDrzewie) {
        domknij();
        biezacy = null;
        continue;
      }
      biezacy.linie.push(l);
    }
    domknij();
    return wynik;
  }

  function krok(nazwa: string): string {
    return kroki().find((k) => k.nazwa === nazwa)?.tresc ?? '';
  }

  it('krok bramki podatności istnieje i woła nasz skrypt', () => {
    const k = krok('Bramka podatności');
    expect(k).not.toBe('');
    expect(k).toContain('ops/ci/audyt-bramka.cjs');
  });

  it('krok bramki NIE ma continue-on-error', () => {
    expect(krok('Bramka podatności')).not.toContain('continue-on-error');
  });

  it('stary krok `pnpm audit --audit-level` już nie istnieje', () => {
    // Zostawiony obok nowego dawałby fałszywe poczucie, że coś sprawdza,
    // podczas gdy to on miał wyłączony alarm.
    expect(ciKod).not.toContain('--audit-level');
  });

  it('krok Lint NIE ma continue-on-error', () => {
    // Do 2026-08-22 stało tu „lint jest miękki, bramką jest typecheck".
    // Dziś lint wychodzi z zerem błędów we wszystkich pakietach, więc miękkość
    // nie chroniła już niczego poza nowymi błędami — przed nami.
    expect(krok('Lint')).not.toContain('continue-on-error');
  });

  /**
   * Biała lista kroków, którym wolno być miękkimi. Nie chodzi o to, żeby nigdy
   * żaden nie był — czasem to uzasadnione. Chodzi o to, żeby DOŁOŻENIE takiego
   * kroku było widoczną decyzją, a nie linijką, którą ktoś dopisał, bo się
   * świeciło na czerwono.
   */
  const MIEKKIE_DOZWOLONE = [
    {
      krok: 'Gitleaks (secret scan)',
      powod:
        'gitleaks na pełnej historii daje fałszywe trafienia na przykładowych ' +
        'konfiguracjach w ops/; wyciszenie ich wymaga .gitleaksignore — osobna robota',
    },
  ];

  it('tylko świadomie dopuszczone kroki są miękkie', () => {
    const dozwolone = new Set(MIEKKIE_DOZWOLONE.map((m) => m.krok));
    const miekkie = kroki()
      .filter((k) => /continue-on-error:\s*true/.test(k.tresc))
      .map((k) => k.nazwa)
      .filter((n) => !dozwolone.has(n));
    expect(
      miekkie.length === 0
        ? ''
        : `Kroki CI z continue-on-error spoza białej listy — taki krok raportuje ` +
          `porażkę do dziennika i przepuszcza wdrożenie (patrz X-23):\n  ${miekkie.join('\n  ')}\n` +
          `Napraw przyczynę albo dopisz krok do MIEKKIE_DOZWOLONE z powodem.`,
    ).toBe('');
  });

  it('biała lista wskazuje kroki, które naprawdę istnieją', () => {
    for (const m of MIEKKIE_DOZWOLONE) {
      expect(krok(m.krok)).not.toBe('');
      expect(m.powod.length).toBeGreaterThan(40);
    }
  });
});
