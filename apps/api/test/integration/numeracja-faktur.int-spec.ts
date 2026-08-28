import { prisma, rozlacz, wyczyscBaze } from './setup';
import {
  nadajNumerFaktury,
  SERIA_FAKTURY,
  SERIA_KOREKTY,
} from '../../src/billing/faktura-za-portfel';

/**
 * M-02 — numeracja faktur.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DLACZEGO TEN PLIK POWSTAŁ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `nadajNumerFaktury` był w repozytorium używany w czterech miejscach
 * (faktura za portfel, korekta, mirror Stripe'a, scheduler) i nie miał ani
 * jednej własnej asercji. Występował w `faktura-portfel.int-spec.ts` wyłącznie
 * jako narzędzie do zbudowania faktury — czyli był WYWOŁYWANY, nie SPRAWDZANY.
 * Test, który używa funkcji, przechodzi także wtedy, gdy funkcja robi coś
 * innego, niż obiecuje; sprawdza wynik złożenia, nie kontrakt składnika.
 *
 * Stawka nie jest techniczna. Numeracja faktur musi być ciągła i bez luk
 * (art. 106e ust. 1 pkt 2 ustawy o VAT). Luka albo duplikat to nie usterka
 * do poprawienia w następnym wydaniu — to wada dokumentu księgowego, który
 * już trafił do nabywcy i do rejestru VAT.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DLACZEGO INTEGRACYJNY, A NIE JEDNOSTKOWY
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Cała gwarancja siedzi w jednym zdaniu SQL-a:
 *
 *     INSERT ... ON CONFLICT ("series","year","month")
 *     DO UPDATE SET "seq" = "InvoiceCounter"."seq" + 1
 *     RETURNING "seq";
 *
 * To Postgres — nie TypeScript — zapewnia, że dwa równoległe wywołania nie
 * dostaną tego samego numeru: `ON CONFLICT DO UPDATE` bierze blokadę wiersza,
 * więc drugie wywołanie czeka i widzi już zwiększoną wartość. Atrapa Prismy
 * odda cokolwiek, co jej każemy, i przejdzie zawsze — również gdyby ktoś
 * zamienił to zdanie na `SELECT max(seq)+1`, które pod obciążeniem wydaje
 * duplikaty. Test jednostkowy dowodziłby tu wyłącznie, że test istnieje.
 */
describe('M-02 — numeracja faktur', () => {
  const teraz = new Date('2026-08-15T10:00:00.000Z');

  beforeEach(async () => {
    await wyczyscBaze();
  });

  afterAll(async () => {
    await rozlacz();
  });

  describe('kolejność i format', () => {
    it('pierwszy numer w miesiącu to 0001', async () => {
      expect(await nadajNumerFaktury(prisma(), teraz)).toBe('VFV/2026/08/0001');
    });

    it('kolejne numery rosną o jeden, bez luk', async () => {
      const numery: string[] = [];
      for (let i = 0; i < 5; i++) {
        numery.push(await nadajNumerFaktury(prisma(), teraz));
      }
      expect(numery).toEqual([
        'VFV/2026/08/0001',
        'VFV/2026/08/0002',
        'VFV/2026/08/0003',
        'VFV/2026/08/0004',
        'VFV/2026/08/0005',
      ]);
    });

    it('miesiąc jest dopełniany do dwóch cyfr', async () => {
      const numer = await nadajNumerFaktury(prisma(), new Date('2026-01-05T00:00:00.000Z'));
      expect(numer).toBe('VFV/2026/01/0001');
    });
  });

  describe('rozdzielność liczników', () => {
    // Daty podane w czasie polskim (południe), żeby test mówił o rozdzielności
    // miesięcy, a nie o strefach — te są sprawdzane osobno w okres-numeracji.spec.ts.
    it('nowy miesiąc zaczyna od 0001, nie kontynuuje poprzedniego', async () => {
      await nadajNumerFaktury(prisma(), new Date('2026-08-31T10:00:00.000Z'));
      await nadajNumerFaktury(prisma(), new Date('2026-08-31T10:00:00.000Z'));
      const wrzesien = await nadajNumerFaktury(prisma(), new Date('2026-09-01T10:00:00.000Z'));
      expect(wrzesien).toBe('VFV/2026/09/0001');
    });

    /**
     * M-02 — regresja znaleziona przez ten plik 2026-08-28.
     *
     * `2026-08-31T23:59:59Z` to w Polsce już 1 września (01:59 czasu letniego).
     * Przed poprawką numer zależał od strefy PROCESU: na maszynie w
     * Europe/Warsaw wychodził wrzesień, w kontenerze UTC — sierpień. Ta sama
     * faktura, dwa różne numery, w zależności od tego, gdzie kod działa.
     */
    it('okres liczy się w czasie polskim, nie w strefie procesu', async () => {
      const numer = await nadajNumerFaktury(prisma(), new Date('2026-08-31T23:59:59.000Z'));
      expect(numer).toBe('VFV/2026/09/0001');
    });

    it('nowy rok zaczyna od 0001 mimo tego samego miesiąca', async () => {
      await nadajNumerFaktury(prisma(), new Date('2026-08-15T10:00:00.000Z'));
      const nastepnyRok = await nadajNumerFaktury(prisma(), new Date('2027-08-15T10:00:00.000Z'));
      expect(nastepnyRok).toBe('VFV/2027/08/0001');
    });

    // Korekta z numerem z serii faktur zostałaby w rejestrze VAT policzona
    // jako sprzedaż. Rozdzielność serii nie jest kosmetyką numeru.
    it('seria korekt ma własny licznik, niezależny od serii faktur', async () => {
      await nadajNumerFaktury(prisma(), teraz, SERIA_FAKTURY);
      await nadajNumerFaktury(prisma(), teraz, SERIA_FAKTURY);
      await nadajNumerFaktury(prisma(), teraz, SERIA_FAKTURY);

      const korekta = await nadajNumerFaktury(prisma(), teraz, SERIA_KOREKTY);
      expect(korekta).toBe('VFK/2026/08/0001');

      // …a wystawienie korekty nie przesunęło licznika faktur.
      expect(await nadajNumerFaktury(prisma(), teraz, SERIA_FAKTURY)).toBe('VFV/2026/08/0004');
    });
  });

  describe('równoległość — sedno M-02', () => {
    /**
     * To jest jedyny test w tym pliku, którego nie da się napisać jednostkowo,
     * i jedyny powód, dla którego numerator jest napisany surowym SQL-em
     * zamiast odczytem i zapisem w dwóch krokach.
     *
     * Wersja „przeczytaj max, dodaj jeden, zapisz" przechodzi każdy test
     * sekwencyjny i wydaje duplikaty dokładnie wtedy, gdy jest obciążenie —
     * czyli przy webhookach Stripe'a lecących równolegle albo przy zbiorczym
     * fakturowaniu w schedulerze.
     */
    it('20 równoległych wywołań daje 20 RÓŻNYCH numerów', async () => {
      const numery = await Promise.all(
        Array.from({ length: 20 }, () => nadajNumerFaktury(prisma(), teraz)),
      );
      expect(new Set(numery).size).toBe(20);
    });

    it('20 równoległych wywołań daje ciąg bez luk od 0001 do 0020', async () => {
      const numery = await Promise.all(
        Array.from({ length: 20 }, () => nadajNumerFaktury(prisma(), teraz)),
      );
      const sekwencje = numery.map((n) => Number(n.split('/')[3])).sort((a, b) => a - b);
      expect(sekwencje).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });

    it('licznik w bazie zgadza się z liczbą wydanych numerów', async () => {
      await Promise.all(Array.from({ length: 12 }, () => nadajNumerFaktury(prisma(), teraz)));
      const licznik = await prisma().invoiceCounter.findFirst({
        where: { series: SERIA_FAKTURY, year: 2026, month: 8 },
      });
      expect(licznik?.seq).toBe(12);
    });

    it('równoległe wystawianie w dwóch seriach nie miesza liczników', async () => {
      await Promise.all([
        ...Array.from({ length: 10 }, () => nadajNumerFaktury(prisma(), teraz, SERIA_FAKTURY)),
        ...Array.from({ length: 10 }, () => nadajNumerFaktury(prisma(), teraz, SERIA_KOREKTY)),
      ]);

      const faktury = await prisma().invoiceCounter.findFirst({
        where: { series: SERIA_FAKTURY, year: 2026, month: 8 },
      });
      const korekty = await prisma().invoiceCounter.findFirst({
        where: { series: SERIA_KOREKTY, year: 2026, month: 8 },
      });
      expect(faktury?.seq).toBe(10);
      expect(korekty?.seq).toBe(10);
    });
  });

  describe('zachowanie na krawędziach — spisane, nie założone', () => {
    /**
     * Powyżej 9999 `padStart(4, '0')` nie obcina — numer po prostu rośnie do
     * pięciu cyfr. To NIE jest usterka: numeracja pozostaje ciągła i
     * unikalna, a stała szerokość nigdy nie była wymogiem ustawy. Test stoi
     * tu po to, żeby ktoś, kto kiedyś zobaczy `VFV/2026/08/10000`, znalazł
     * dowód, że tak miało być — zamiast „naprawiać" to obcięciem, które
     * zrobiłoby dwie faktury o tym samym numerze.
     */
    it('powyżej 9999 numer rośnie do pięciu cyfr zamiast się zawijać', async () => {
      await prisma().invoiceCounter.create({
        data: { series: SERIA_FAKTURY, year: 2026, month: 8, seq: 9999 },
      });
      expect(await nadajNumerFaktury(prisma(), teraz)).toBe('VFV/2026/08/10000');
    });

    it('numer pozostaje unikalny przy przechodzeniu przez 9999', async () => {
      await prisma().invoiceCounter.create({
        data: { series: SERIA_FAKTURY, year: 2026, month: 8, seq: 9998 },
      });
      const numery = await Promise.all(
        Array.from({ length: 4 }, () => nadajNumerFaktury(prisma(), teraz)),
      );
      expect(new Set(numery).size).toBe(4);
      expect([...numery].sort()).toEqual(
        [
          'VFV/2026/08/9999',
          'VFV/2026/08/10000',
          'VFV/2026/08/10001',
          'VFV/2026/08/10002',
        ].sort(),
      );
    });
  });
});
