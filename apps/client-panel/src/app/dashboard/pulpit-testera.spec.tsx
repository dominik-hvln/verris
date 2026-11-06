import { renderToString } from 'react-dom/server';
import { LICZBA_KROKOW_BETA, SCENARIUSZE_BETA, SCENARIUSZE_BETA_POCZTA, type PostepBetaDto } from '@verris/contracts/klient';
import { DashboardHome } from './dashboard-home';
import type { DashboardSnapshot } from './dashboard-data';

jest.mock('@/lib/feature-flags-action', () => ({ pobierzFlagiAction: jest.fn(async () => ({})) }));

/**
 * P1-11 — pulpit nowej testerki: nic nie mówiło, co zrobić z kodem z zaproszenia, a kafelek „Asystent”
 * obiecywał „Pilnujemy DNS, SSL, kopii i obciążenia” przy zerze usług. Na starym kodzie oba asercje padają.
 */
const pusty = {
  profile: null,
  services: [],
  domains: [],
  ecoProgram: null,
  wallet: null,
  ecoLedger: [],
  tickets: [],
  openTickets: 0,
  errors: {},
  bezDostepu: {},
} as unknown as DashboardSnapshot;

describe('pulpit nowego testera (P1-11)', () => {
  it('z zaproszeniem: kafelek „Masz kod z zaproszenia” prowadzi do karty „Kod promocyjny” w Płatnościach', () => {
    const html = renderToString(<DashboardHome snapshot={pusty} zaproszenieBety />);
    expect(html).toContain('Masz kod z zaproszenia do testów?');
    expect(html).toContain('href="/dashboard/billing#kod-promocyjny"');
  });

  it('bez zaproszenia kafelka nie ma', () => {
    expect(renderToString(<DashboardHome snapshot={pusty} />)).not.toContain('Masz kod z zaproszenia');
  });

  it('asystent bez usług nie obiecuje pilnowania DNS, SSL i kopii', () => {
    const html = renderToString(<DashboardHome snapshot={pusty} />);
    expect(html).not.toContain('Wszystko pod kontrolą');
    expect(html).toContain('Gdy zamówisz pierwszą usługę');
  });
});

/** Tekst widoczny dla człowieka: bez znaczników i komentarzy, którymi React SSR rozdziela węzły tekstu. */
const tekst = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const wszystkieKroki = (lista: readonly { kroki: { id: string }[] }[]) =>
  Object.fromEntries(lista.flatMap((s) => s.kroki.map((k) => [k.id, '2026-11-06T10:00:00.000Z'] as const)));
const tester = (p: Partial<PostepBetaDto> = {}): PostepBetaDto => ({ tester: true, kroki: {}, uwagi: {}, zaktualizowano: null, ...p });

describe('pulpit testera – kafelek „Testy (beta)” (decyzja 06.11)', () => {
  it('tester: postęp „0 z N kroków”, następny scenariusz, scenariusze, przewodnik PDF i „Zgłoś uwagę”', () => {
    const html = renderToString(<DashboardHome snapshot={pusty} postepBety={tester()} />);
    expect(html).toContain('data-kafelek-testow="w-toku"');
    expect(tekst(html)).toContain(`0 z ${LICZBA_KROKOW_BETA} kroków`);
    expect(LICZBA_KROKOW_BETA).toBe(56);
    expect(html).toContain('href="/dashboard/beta"');
    expect(html).toContain('href="/dashboard/beta#s01"');
    expect(tekst(html)).toContain(`Następny scenariusz: ${SCENARIUSZE_BETA[0]!.tytul}`);
    expect(html).toContain('href="/dashboard/beta/przewodnik"');
    expect(tekst(html)).toContain('Pobierz przewodnik (PDF)');
    expect(tekst(html)).toContain('Przejdź do scenariuszy');
    expect(tekst(html)).toContain('„Zgłoś uwagę” w prawym dolnym rogu');
  });

  it('postęp z tej samej strony Testy (beta): odhaczony s01 → „4 z N”, dalej s02; opcjonalne kroki się nie liczą', () => {
    const kroki = { ...wszystkieKroki(SCENARIUSZE_BETA.filter((s) => s.id === 's01')), 's15.k1': 'x' };
    const html = renderToString(<DashboardHome snapshot={pusty} postepBety={tester({ kroki })} />);
    expect(tekst(html)).toContain(`4 z ${LICZBA_KROKOW_BETA} kroków`);
    expect(html).toContain('href="/dashboard/beta#s02"');
  });

  it('nie-tester (bez postępu albo tester: false) – kafelka nie ma', () => {
    expect(renderToString(<DashboardHome snapshot={pusty} />)).not.toContain('data-kafelek-testow');
    expect(renderToString(<DashboardHome snapshot={pusty} postepBety={tester({ tester: false })} />)).not.toContain('data-kafelek-testow');
  });

  it('bez dublowania z P1-11: tester nie widzi kafelka z kodem, osoba z zaproszeniem – tylko kafelek z kodem', () => {
    const t = renderToString(<DashboardHome snapshot={pusty} zaproszenieBety postepBety={tester()} />);
    expect(t).toContain('data-kafelek-testow');
    expect(t).not.toContain('Masz kod z zaproszenia');
    const z = renderToString(<DashboardHome snapshot={pusty} zaproszenieBety postepBety={null} />);
    expect(z).toContain('Masz kod z zaproszenia');
    expect(z).not.toContain('data-kafelek-testow');
  });

  it('konto „tylko poczta”: liczby i następny scenariusz tylko ze scenariuszy poczty', () => {
    const poczta = SCENARIUSZE_BETA_POCZTA.filter((s) => !s.opcjonalny);
    const ile = poczta.reduce((n, s) => n + s.kroki.length, 0);
    expect(ile).toBeLessThan(LICZBA_KROKOW_BETA);
    // Odhaczone kroki spoza poczty nie podbijają licznika.
    const spozaPoczty = SCENARIUSZE_BETA.find((s) => !s.poczta && !s.opcjonalny)!;
    const kroki = { ...wszystkieKroki([poczta[0]!]), ...wszystkieKroki([spozaPoczty]) };
    const html = renderToString(<DashboardHome snapshot={pusty} postepBety={tester({ tylkoPoczta: true, kroki })} />);
    expect(tekst(html)).toContain(`${poczta[0]!.kroki.length} z ${ile} kroków`);
    expect(html).toContain(`href="/dashboard/beta#${poczta[1]!.id}"`);
    expect(tekst(html)).toContain('Też przy samej poczcie');
  });

  it('po ukończeniu wszystkich kroków: podziękowanie, bez „Następny scenariusz”, z „Zwiń”', () => {
    const html = renderToString(
      <DashboardHome snapshot={pusty} postepBety={tester({ kroki: wszystkieKroki(SCENARIUSZE_BETA.filter((s) => !s.opcjonalny)) })} />,
    );
    expect(html).toContain('data-kafelek-testow="ukonczone"');
    expect(tekst(html)).toContain('dziękujemy');
    expect(tekst(html)).toContain(`${LICZBA_KROKOW_BETA} z ${LICZBA_KROKOW_BETA} kroków`);
    expect(html).not.toContain('Następny scenariusz');
    expect(tekst(html)).toContain('Zwiń');
    const poczta = renderToString(
      <DashboardHome snapshot={pusty} postepBety={tester({ tylkoPoczta: true, kroki: wszystkieKroki(SCENARIUSZE_BETA_POCZTA) })} />,
    );
    expect(poczta).toContain('data-kafelek-testow="ukonczone"');
  });
});
