import { walletTopupOkTemplate } from './billing-lifecycle-notifications.js';

/**
 * Przegląd F3.6 — potwierdzenie doładowania dostaje klient po karcie, Paynow i po wpłacie przelewem zaksięgowanej
 * przez obsługę. Mail mówił „doładowanie portfela kartą” także po przelewie.
 */
it('potwierdzenie doładowania nie twierdzi, że zapłacono kartą', () => {
  const m = walletTopupOkTemplate({ to: 'k@test.verris.pl', firstName: null, amountPln: '100.00', newBalancePln: '150.00', panelUrl: 'https://panel.verris.pl' });
  expect(m.text).toContain('doładowanie portfela');
  expect(`${m.subject}\n${m.text}\n${m.html}`).not.toMatch(/kart[ąa]/i);
});
