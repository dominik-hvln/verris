/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('./actions', () => ({}));
jest.mock('@/components/hosting/PodgladPrzedDns', () => ({ PodgladPrzedDns: () => null }));
import { CutoverPanel, JobRow } from './migration-progress';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** t1, 08.10 (#da592220): migracja samych plików WordPressa — test strony bez bazy wraca błędem, to nie awaria. */
it('krok testu strony z uwagą „strona-bez-bazy” mówi, co zrobić z bazą', async () => {
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () =>
    root.render(
      <ul>
        <JobRow
          job={{
            id: 'j', kind: 'HTTP_POST_CHECK', status: 'COMPLETED', sequence: 90, attempts: 1, maxAttempts: 1, lastError: 'http check failed',
            progress: null, integrity: null, uwaga: 'strona-bez-bazy', lastHeartbeatAt: null, startedAt: null, completedAt: null,
          } as never}
        />
      </ul>,
    ),
  );
  expect(el.textContent).toContain('Baza danych');
  expect(el.textContent).not.toContain('http check failed');
  act(() => root.unmount());
});

/** P2-06 (decyzja 13) — sklep: przed przełączeniem DNS ostatnie kopiowanie bazy z krótką przerwą na starej stronie. */
describe('plan przełączenia – sklep z bazą', () => {
  const plan = (o: Record<string, unknown>) =>
    ({
      migrationRequestId: 'm', domain: 'sklep.pl', status: 'waiting-dns', message: 'm', deltaSyncRecommended: false,
      nameserverOption: null, records: [], cutoverAt: null, cutoverMode: null, ...o,
    }) as never;
  const pokaz = async (p: unknown) => {
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => root.render(<CutoverPanel serviceId="s" poczta={false} plan={p as never} busy={null} onDelta={() => {}} onVerify={() => {}} />));
    const tekst = el.textContent ?? '';
    act(() => root.unmount());
    return tekst;
  };

  it('zalecenie mówi o bazie i kilkuminutowej przerwie', async () => {
    const t = await pokaz(plan({ deltaSyncRecommended: true, dosyncBazy: true }));
    expect(t).toContain('bazę (zamówienia, klienci, stany)');
    expect(t).toContain('przerwa na kilka minut');
  });

  it('po kopiowaniu: stara strona w trybie konserwacji do …, przełącz DNS teraz', async () => {
    const t = await pokaz(plan({ dosyncBazy: true, konserwacjaZrodlaDo: '2026-11-03T14:00:00.000Z' }));
    expect(t).toContain('w trybie konserwacji do');
    expect(t).toContain('Przełącz DNS teraz');
  });

  it('strona spoza WordPressa: prośba o ręczne wstrzymanie sprzedaży', async () => {
    const t = await pokaz(plan({ dosyncBazy: true, konserwacjaRecznie: true }));
    expect(t).toContain('wstrzymaj sprzedaż w jej panelu');
  });
});
