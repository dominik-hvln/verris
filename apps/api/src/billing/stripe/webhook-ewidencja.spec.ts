import {
  czyAlarmowac,
  decyzja,
  DNI_PRZECHOWANIA_TRESCI,
  DZIERZAWA_MS,
  granicaCzyszczeniaTresci,
  kryteriaPodjecia,
  nastepnaProba,
  ODSTEPY_PONOWIEN_MIN,
  ODSTEP_PONOWNEGO_ALERTU_MS,
  PROG_ALERTU_MS,
  PROG_ALERTU_PROB,
  WierszZdarzenia,
} from './webhook-ewidencja';

/**
 * Z-05 — decyzja o zdarzeniu webhooka, sprawdzona liczbowo.
 *
 * Te testy nie dotykają bazy ani Stripe'a. Cała rzecz, którą trzeba tu udowodnić,
 * to że kombinacja (stan wiersza, czas, liczba prób) prowadzi do właściwej
 * decyzji — a takich kombinacji jest kilkanaście i żadnej nie da się rzetelnie
 * przejechać, gdy do każdej trzeba postawić Postgresa i udać awarię.
 *
 * Test integracyjny obok (`test/integration/webhook-odpornosc.int-spec.ts`)
 * sprawdza to samo raz, na prawdziwej bazie, w scenariuszu z macierzy.
 */

const T0 = new Date('2026-08-22T12:00:00.000Z');
const oT = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60 * 1000;

const wiersz = (o: Partial<WierszZdarzenia>): WierszZdarzenia => ({
  status: 'PENDING',
  claimedAt: T0,
  attempts: 1,
  ...o,
});

describe('Z-05 — decyzja o zdarzeniu', () => {
  it('brak wiersza → przetwarzaj', () => {
    expect(decyzja(null, T0)).toEqual({ rodzaj: 'przetwarzaj' });
  });

  it('PROCESSED → duplikat, i to jest jedyny stan, który nim jest', () => {
    expect(decyzja(wiersz({ status: 'PROCESSED' }), T0)).toEqual({ rodzaj: 'duplikat' });
  });

  it('FAILED → przejmij, bo poprzednia próba padła', () => {
    expect(decyzja(wiersz({ status: 'FAILED', claimedAt: null }), T0)).toEqual({
      rodzaj: 'przejmij',
      powod: 'poprzednia-proba-nieudana',
    });
  });

  it('PENDING świeży → w trakcie, NIE duplikat', () => {
    // To jest sedno Z-05. Pod starym kodem ten przypadek był nieodróżnialny od
    // duplikatu i dostawał 200 — czyli Stripe przestawał ponawiać, choć nikt
    // jeszcze niczego nie obsłużył.
    const d = decyzja(wiersz({ status: 'PENDING', claimedAt: oT(-1 * MIN) }), T0);
    expect(d).toEqual({ rodzaj: 'wTrakcie' });
  });

  it('PENDING tuż przed końcem dzierżawy nadal w trakcie', () => {
    const d = decyzja(wiersz({ claimedAt: oT(-DZIERZAWA_MS + 1000) }), T0);
    expect(d.rodzaj).toBe('wTrakcie');
  });

  it('PENDING po dzierżawie → przejmij, bo proces prawdopodobnie padł', () => {
    // Ubicie procesu API między zajęciem a zakończeniem (wdrożenie, OOM,
    // restart węzła) zostawia wiersz w PENDING. Bez tej reguły nie wróciłby
    // już nigdy — ta sama pułapka co przed Z-05, tylko pod inną nazwą.
    expect(decyzja(wiersz({ claimedAt: oT(-DZIERZAWA_MS) }), T0)).toEqual({
      rodzaj: 'przejmij',
      powod: 'dzierzawa-wygasla',
    });
  });

  it('PENDING bez claimedAt → przejmij, a nie „w trakcie na zawsze"', () => {
    expect(decyzja(wiersz({ claimedAt: null }), T0).rodzaj).toBe('przejmij');
  });

  it('żaden stan nie prowadzi do cichego pominięcia', () => {
    const stany: Array<WierszZdarzenia['status']> = ['PENDING', 'PROCESSED', 'FAILED'];
    for (const status of stany) {
      for (const claimedAt of [null, T0, oT(-DZIERZAWA_MS * 2)]) {
        const d = decyzja(wiersz({ status, claimedAt }), T0);
        expect(['przetwarzaj', 'duplikat', 'przejmij', 'wTrakcie']).toContain(d.rodzaj);
      }
    }
  });
});

describe('Z-05 — odstępy ponowień', () => {
  it('rosną, nie maleją', () => {
    const odstepy = [1, 2, 3, 4].map(
      (p) => nastepnaProba(p, T0).getTime() - T0.getTime(),
    );
    for (let i = 1; i < odstepy.length; i++) {
      expect(odstepy[i]).toBeGreaterThan(odstepy[i - 1]);
    }
  });

  it('pierwsza próba jest szybka — przejściowy timeout naprawia się sam', () => {
    expect(nastepnaProba(1, T0).getTime() - T0.getTime()).toBe(1 * MIN);
  });

  it('trzecia próba mieści się w progu alertu', () => {
    // Gdyby trzeci odstęp był dłuższy niż próg czasowy, alert szedłby zawsze
    // z powodu czasu i próg prób nigdy by się nie uruchomił.
    const doTrzeciej = ODSTEPY_PONOWIEN_MIN[0] + ODSTEPY_PONOWIEN_MIN[1];
    expect(doTrzeciej * MIN).toBeLessThanOrEqual(PROG_ALERTU_MS);
  });

  it('powyżej listy odstępów obowiązuje ostatnia wartość, bez wyjścia poza tablicę', () => {
    const ostatni = ODSTEPY_PONOWIEN_MIN[ODSTEPY_PONOWIEN_MIN.length - 1] * MIN;
    for (const p of [4, 5, 99, 1000]) {
      expect(nastepnaProba(p, T0).getTime() - T0.getTime()).toBe(ostatni);
    }
  });

  it('numer próby poniżej 1 nie daje terminu w przeszłości', () => {
    for (const p of [0, -1]) {
      expect(nastepnaProba(p, T0).getTime()).toBeGreaterThan(T0.getTime());
    }
  });
});

describe('Z-05 — próg alertu', () => {
  const stan = (o: Partial<Parameters<typeof czyAlarmowac>[0]> = {}) => ({
    status: 'FAILED' as const,
    attempts: 1,
    createdAt: T0,
    alertedAt: null,
    ...o,
  });

  it('nie alarmuje po pierwszej nieudanej próbie', () => {
    expect(czyAlarmowac(stan(), T0)).toBe(false);
  });

  it(`alarmuje po ${PROG_ALERTU_PROB} próbach, nawet gdy poszły szybko`, () => {
    expect(czyAlarmowac(stan({ attempts: PROG_ALERTU_PROB }), oT(MIN))).toBe(true);
  });

  it('alarmuje po progu czasu, nawet gdy prób było mało', () => {
    // Handler wiszący na timeoucie generuje mało prób. Alarm wyłącznie na
    // progu prób przespałby dokładnie ten kształt awarii.
    expect(czyAlarmowac(stan({ attempts: 1 }), oT(PROG_ALERTU_MS))).toBe(true);
  });

  it('nie alarmuje o zdarzeniu przetworzonym', () => {
    expect(
      czyAlarmowac(stan({ status: 'PROCESSED', attempts: 99 }), oT(PROG_ALERTU_MS * 10)),
    ).toBe(false);
  });

  it('nie powtarza alertu przed upływem odstępu', () => {
    const s = stan({ attempts: 9, alertedAt: T0 });
    expect(czyAlarmowac(s, oT(ODSTEP_PONOWNEGO_ALERTU_MS - MIN))).toBe(false);
    expect(czyAlarmowac(s, oT(ODSTEP_PONOWNEGO_ALERTU_MS))).toBe(true);
  });

  it('alarmuje też o zdarzeniu wiszącym w PENDING', () => {
    // Wiersz porzucony przez martwy proces nie przechodzi w FAILED — nie ma
    // komu go tam przestawić. Gdyby alert patrzył tylko na FAILED, ten
    // przypadek byłby niewidzialny.
    expect(czyAlarmowac(stan({ status: 'PENDING', attempts: 1 }), oT(PROG_ALERTU_MS))).toBe(
      true,
    );
  });
});

describe('Z-05 — retencja i podejmowanie', () => {
  it('granica czyszczenia leży dokładnie 90 dni wstecz', () => {
    const g = granicaCzyszczeniaTresci(T0);
    expect(Math.round((T0.getTime() - g.getTime()) / (24 * 60 * 60 * 1000))).toBe(
      DNI_PRZECHOWANIA_TRESCI,
    );
  });

  it('kryteria podjęcia obejmują nieudane i porzucone', () => {
    const k = kryteriaPodjecia(T0);
    expect(k.nieudaneDo).toEqual(T0);
    expect(T0.getTime() - k.porzuconePrzed.getTime()).toBe(DZIERZAWA_MS);
  });

  it('okno retencji jest dłuższe niż okno ponowień Stripe’a', () => {
    // Stripe ponawia około trzech dni. Gdyby nasza retencja była krótsza,
    // skasowalibyśmy treść zdarzenia, które on jeszcze próbuje dostarczyć.
    expect(DNI_PRZECHOWANIA_TRESCI).toBeGreaterThan(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Strażniki na powrót do stanu sprzed Z-05
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..', '..');

function pliki(kat: string, out: string[] = []): string[] {
  for (const w of readdirSync(kat)) {
    const s = join(kat, w);
    if (statSync(s).isDirectory()) pliki(s, out);
    else if (w.endsWith('.ts') && !w.endsWith('.spec.ts')) out.push(s);
  }
  return out;
}

/** Kod bez komentarzy — po „jest" z X-17 i „archiver.create" z X-21 to już nawyk. */
export function bezKomentarzy(zrodlo: string): string {
  return zrodlo
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

describe('Z-05 — strażniki na powrót starego zachowania', () => {
  const zrodla = pliki(SRC).map((p) => ({
    sciezka: relative(SRC, p),
    kod: bezKomentarzy(readFileSync(p, 'utf8')),
  }));

  it('strażnik ma czego pilnować', () => {
    expect(zrodla.length).toBeGreaterThan(100);
    expect(zrodla.some((z) => z.kod.includes('stripeWebhookEvent.create'))).toBe(true);
  });

  it('każde zakładanie wiersza zdarzenia nadaje mu stan', () => {
    // Wiersz bez stanu to dokładnie Z-05: jego istnienie znaczy „widziałem",
    // a kod czyta je jako „obsłużyłem".
    const winne = zrodla
      .filter((z) => z.kod.includes('stripeWebhookEvent.create'))
      .filter((z) => {
        const i = z.kod.indexOf('stripeWebhookEvent.create');
        return !z.kod.slice(i, i + 400).includes('status:');
      })
      .map((z) => z.sciezka);
    expect(
      winne.length === 0
        ? ''
        : `Zakładanie StripeWebhookEvent bez pola \`status\` — wiersz bez stanu znaczy ` +
          `„widziałem", a kod przeczyta go jako „obsłużyłem" (Z-05):\n  ${winne.join('\n  ')}`,
    ).toBe('');
  });

  it('kontroler webhooka nie połyka błędów handlera', () => {
    // Odpowiedź 200 na nieudaną obsługę każe Stripe'owi uznać zdarzenie za
    // doręczone i przestać ponawiać — czyli Z-05 od drugiej strony.
    const k = zrodla.find((z) => z.sciezka === join('billing', 'stripe', 'stripe.controller.ts'));
    expect(k).toBeDefined();
    expect(k!.kod).not.toMatch(/catch\s*\(/);
  });

  it('handler jest wywoływany przez ścieżkę, która zapisuje wynik', () => {
    // Ścieżka porównywana DOKŁADNIE, nie przez endsWith. Pierwsza wersja
    // używała `endsWith('billing.service.ts')` i trafiała w
    // `autoscaling/autoscaling-billing.service.ts`, który jest wcześniej
    // alfabetycznie — czyli strażnik pilnował nie tego pliku i przez chwilę
    // wyglądał na słusznie czerwonego z zupełnie innego powodu.
    const serwis = zrodla.find((z) => z.sciezka === join('billing', 'billing.service.ts'));
    expect(serwis).toBeDefined();
    for (const wymagane of ['zajmijZdarzenie', 'zakonczZdarzenie', 'oznaczNieudane', 'przetworzPonownie']) {
      expect(serwis!.kod).toContain(wymagane);
    }
  });

  it('rozpoznaje spreparowany kod bez stanu', () => {
    const kod = bezKomentarzy("await p.stripeWebhookEvent.create({ data: { eventId: e.id } });");
    const i = kod.indexOf('stripeWebhookEvent.create');
    expect(kod.slice(i, i + 400).includes('status:')).toBe(false);
  });
});
