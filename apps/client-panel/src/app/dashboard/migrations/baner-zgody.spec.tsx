/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/** PB-45 — migracja przygotowana przez obsługę to w Migracjach baner „sprawdź i zatwierdź”, nie pasek postępu. */
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
jest.mock('./actions', () => ({ getMigrationBundleDetailAction: jest.fn(async () => ({ error: 'x' })) }));
jest.mock('@/app/dashboard/services/[id]/hosting-email-actions', () => ({ fetchHostingEmailAction: jest.fn() }));

import { MigrationsClient } from './migrations-client';
import type { MigrationBundleSummary } from './types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const zlecenie = (z: Partial<MigrationBundleSummary>): MigrationBundleSummary => ({
  id: 'm1000000-0000-4000-8000-000000000001', status: 'DRAFT', currentStep: 'consent', targetDomain: 'sklep.example.pl', sourcePanelType: 'manual',
  needsAttention: false, attentionReason: null, cutoverMode: null, cutoverAt: null, bytesTransferred: '0', filesTransferred: 0,
  databasesMigrated: 0, mailboxesMigrated: 0, startedAt: null, completedAt: null, createdAt: '2026-10-08T10:00:00Z',
  updatedAt: '2026-10-08T10:00:00Z', lastError: null, ticketId: null, consentExpiresAt: '2026-10-15T10:00:00Z', ...z,
});

it('czekająca prośba: baner z linkiem do zgody (bez tokenu), bez „Twoich migracji”', async () => {
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () => root.render(<MigrationsClient serviceId="s1" bundles={[zlecenie({})]} />));
  expect(el.textContent).toContain('Obsługa przygotowała migrację — sprawdź i zatwierdź');
  const link = [...el.querySelectorAll('a')].find((a) => a.textContent?.includes('Sprawdź i zatwierdź'))!;
  expect(link.getAttribute('href')).toBe('/dashboard/migrations/zgoda?serviceId=s1&id=m1000000-0000-4000-8000-000000000001');
  expect(el.textContent).not.toContain('Twoje migracje');
  act(() => root.unmount());
});

it('prośba po terminie (bez consentExpiresAt) nie pokazuje banera; zwykłe migracje na liście', async () => {
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () =>
    root.render(
      <MigrationsClient serviceId="s1" bundles={[zlecenie({ consentExpiresAt: null }), zlecenie({ id: 'm2000000-0000-4000-8000-000000000002', status: 'QUEUED', consentExpiresAt: null })]} />,
    ),
  );
  expect(el.textContent).not.toContain('sprawdź i zatwierdź');
  expect(el.textContent).toContain('Twoje migracje');
  expect(el.textContent).toContain('#m2000000');
  expect(el.textContent).not.toContain('#m1000000');
  act(() => root.unmount());
});
