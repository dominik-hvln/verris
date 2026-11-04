/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LIMIT_WYSYLKI_PROBY, tylkoProbneUslugi, uslugaWProbie } from '@verris/contracts/klient';

const mockConvert = jest.fn();
const mockStartTrial = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('@/app/dashboard/services/subscription-payment-actions', () => ({ convertTrialAction: (...a: unknown[]) => mockConvert(...a) }));
jest.mock('@/app/dashboard/services/new/actions', () => ({
  getTrialEligibilityAction: async () => ({ eligible: true }),
  startTrialAction: (...a: unknown[]) => mockStartTrial(...a),
}));
jest.mock('@/lib/analytics-events', () => ({ trackPurchase: jest.fn(), trackGenerateLead: jest.fn() }));
jest.mock('@/app/dashboard/services/[id]/autoscaling/actions', () => ({ updateAutoscalingAction: jest.fn() }));

import { OgraniczenieProby } from './ograniczenie-proby';
import { TrialCallout } from '@/app/dashboard/services/new/trial-callout';
import { AutoscalingForm } from '@/app/dashboard/services/[id]/autoscaling/form';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function render(node: React.ReactElement) {
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () => root.render(node));
  return { el, unmount: () => act(() => root.unmount()) };
}

/** 1.11 — ograniczenia okresu próbnego widoczne w panelu, zanim klient trafi na odmowę z API. */
describe('okres próbny w panelu', () => {
  it('tylkoProbneUslugi: próba bez płatnej usługi blokuje domeny; płatna obok próby albo brak usług — nie', () => {
    const proba = { isTrial: true, status: 'ACTIVE' as const };
    const platna = { isTrial: false, status: 'ACTIVE' as const };
    expect(tylkoProbneUslugi([proba])).toBe(true);
    expect(tylkoProbneUslugi([proba, platna])).toBe(false);
    expect(tylkoProbneUslugi([])).toBe(false);
    expect(tylkoProbneUslugi([{ isTrial: true, status: 'EXPIRED' }])).toBe(false);
    expect(uslugaWProbie({ isTrial: true, status: 'SUSPENDED' })).toBe(false);
    expect(LIMIT_WYSYLKI_PROBY).toBe(100);
  });

  it('OgraniczenieProby pokazuje powód i przycisk „Opłać hosting” dla usługi próbnej', async () => {
    const { el, unmount } = await render(<OgraniczenieProby tytul="Domeny po opłaceniu hostingu" tresc="Powód" uslugaProbnaId="s1" />);
    expect(el.textContent).toContain('Domeny po opłaceniu hostingu');
    expect(el.textContent).toContain('Opłać hosting');
    unmount();
  });

  it('TrialCallout wypisuje ograniczenia próby i 14 dni na opłacenie (nie 30)', async () => {
    const plan = { id: 'p1', name: 'Hosting Verris', trialDays: 14 } as never;
    const { el, unmount } = await render(<TrialCallout plans={[plan]} />);
    const blok = el.querySelector('[data-ograniczenia-proby]');
    expect(blok).not.toBeNull();
    expect(blok!.textContent).toContain(`${LIMIT_WYSYLKI_PROBY} wiadomości na dobę`);
    expect(blok!.textContent).toContain('bez rejestracji i transferu domen');
    expect(blok!.textContent).toContain('bez dodatkowej mocy');
    expect(blok!.textContent).toContain('Po 14 dniach');
    expect(blok!.textContent).toContain('jeszcze 14 dni');
    expect(el.textContent).not.toContain('30 dni');
    unmount();
  });

  it('AutoscalingForm w próbie: przełącznik i zapis nieaktywne', async () => {
    const props = { subscriptionId: 's1', enabled: false, maxMonthlyCost: 0, scaleCpu: true, scaleRam: true, scaleDisk: true };
    const zwykly = await render(<AutoscalingForm {...props} />);
    expect((zwykly.el.querySelector('input[name="enabled"]') as HTMLInputElement).disabled).toBe(false);
    zwykly.unmount();
    const proba = await render(<AutoscalingForm {...props} zablokowane />);
    expect((proba.el.querySelector('input[name="enabled"]') as HTMLInputElement).disabled).toBe(true);
    expect((proba.el.querySelector('button[type="submit"], button:not([type])') as HTMLButtonElement | null)?.disabled ?? true).toBe(true);
    proba.unmount();
  });
});
