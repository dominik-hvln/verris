/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('./dns-actions', () => ({ createDnsRecordAction: jest.fn(), deleteDnsRecordAction: jest.fn(), editDnsRecordAction: jest.fn() }));
import { DnsManager } from './dns-manager';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * t1, 08.10: rekord DS (delegacja DNSSEC, zakłada go serwer DNS) miał w panelu „Edytuj” — formularz nie zna
 * typu DS, a API go odrzucało. DS da się tylko usunąć (sieroty po usuniętych domenach).
 */
it('DS: bez przycisku edycji, z przyciskiem usuwania; zwykły rekord ma oba', async () => {
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () =>
    root.render(
      <DnsManager
        serviceId="s1"
        domain="firma.pl"
        records={[
          { id: '1', name: 'sklep.firma.pl.', type: 'DS', value: '55243 13 2 ABCD', ttl: 3600 },
          { id: '2', name: 'www', type: 'A', value: '1.2.3.4', ttl: 3600 },
        ] as never}
      />,
    ),
  );
  const etykiety = [...el.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
  expect(etykiety).not.toContain('Edytuj rekord DS sklep.firma.pl.');
  expect(etykiety).toContain('Usuń rekord DS sklep.firma.pl.');
  expect(etykiety).toContain('Edytuj rekord A www');
  act(() => root.unmount());
});
