import { renderToStaticMarkup } from 'react-dom/server';
import { OnboardingWizard } from './onboarding-wizard';

jest.mock('./sidebar-actions', () => ({ savePanelPreferences: jest.fn() }));

/** t1 05.10 — baner „Pierwsze kroki” pokazywał „Zabezpiecz odnowienie” klientowi rozliczanemu poza Verris (PB-28). */
const snapshot = {
  hasService: true, serviceId: 's1', domain: 'd3.hvln.pl', isEmailProduct: false, provisioning: false,
  dnsOk: true, tlsOk: true, platnoscOk: false, fakturaOk: true,
};

describe('OnboardingWizard — kroki wg dostępu konta', () => {
  it('rozliczenie poza Verris: bez kroku płatności, licznik bez niego', () => {
    const html = renderToStaticMarkup(
      <OnboardingWizard snapshot={snapshot} hidden={false} navCtx={{ isSubaccount: false, customerPermissions: null, billingOutside: true }} />,
    );
    expect(html).not.toContain('Zabezpiecz odnowienie');
    expect(html).toContain('3 z 3');
  });

  it('zwykły klient: krok płatności zostaje', () => {
    const html = renderToStaticMarkup(
      <OnboardingWizard snapshot={snapshot} hidden={false} navCtx={{ isSubaccount: false, customerPermissions: null, billingOutside: false }} />,
    );
    expect(html).toContain('Zabezpiecz odnowienie');
    expect(html).toContain('3 z 4');
  });
});
