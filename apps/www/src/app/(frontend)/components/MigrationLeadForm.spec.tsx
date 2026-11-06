/**
 * A2-01 (paczka 109): plan migracji przychodzi bez zgody marketingowej — przycisk działa bez checkboxa,
 * a zgoda na dalsze wiadomości jest osobna, nieobowiązkowa i zapisywana dokładnie w widocznej treści.
 */
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/lib/submit-lead', () => ({ submitLead: jest.fn() }));
jest.mock('./Captcha', () => ({ Captcha: () => null }));

import { CONSENT_TEXT, MigrationLeadForm } from './MigrationLeadForm';

describe('MigrationLeadForm – plan bez wymogu zgody', () => {
  const html = renderToStaticMarkup(<MigrationLeadForm />);

  it('przycisk „Wyślij mi plan” nie jest wyłączony przed zaznaczeniem zgody', () => {
    const przycisk = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? '';
    expect(przycisk).not.toMatch(/disabled/);
  });

  it('checkbox zgody nie jest wymagany i ma tę samą treść, którą zapisuje API', () => {
    const checkbox = html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0] ?? '';
    expect(checkbox).not.toMatch(/required/);
    expect(html).toContain(CONSENT_TEXT);
    expect(html).toContain('nieobowiązkowe');
  });

  it('nie obiecuje „nie przekazujemy adresu nikomu” (mamy dostawcę poczty) – odsyła do polityki', () => {
    expect(html).not.toMatch(/nie przekazujemy/i);
    expect(html).toMatch(/polityk/);
  });
});
