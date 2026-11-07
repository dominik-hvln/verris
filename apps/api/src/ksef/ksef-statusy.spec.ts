import { komunikatUwierzytelnienia, komunikatWyjatkuXades, statusFakturyKsef } from './ksef-statusy.js';

/**
 * KSeF 07.11 — kody statusów z open-api.json → stan panelu. Do dziś każdy kod ≥ 400 był „odrzuceniem”,
 * także 440 (duplikat — faktura JEST w KSeF) i 550 („Spróbuj ponownie”), więc przyjęta albo poprawna
 * faktura lądowała jako odrzucona do ręcznej poprawy.
 */
describe('KSeF – kody statusów faktury (SessionInvoiceStatusResponse)', () => {
  it.each([
    [100, 'w-toku'], [150, 'w-toku'], [200, 'przyjeta'],
    [405, 'ponow'], [410, 'ponow'], [435, 'ponow'], [500, 'ponow'], [550, 'ponow'],
    [415, 'odrzucona'], [430, 'odrzucona'], [450, 'odrzucona'],
    [440, 'duplikat'],
  ] as const)('%i → %s', (kod, stan) => {
    expect(statusFakturyKsef(kod).stan).toBe(stan);
    expect(statusFakturyKsef(kod).komunikat).toMatch(/\S/);
  });

  it('kod spoza dokumentacji: 4xx = odrzucona z opisem z KSeF, 5xx = ponów', () => {
    expect(statusFakturyKsef(499, 'Nowy błąd')).toEqual({ stan: 'odrzucona', komunikat: 'Nowy błąd' });
    expect(statusFakturyKsef(599).stan).toBe('ponow');
  });

  it('uwierzytelnienie: polskie komunikaty dla operatora (token, certyfikat, uprawnienia)', () => {
    expect(komunikatUwierzytelnienia(450)).toMatch(/Token KSeF odrzucony/);
    expect(komunikatUwierzytelnienia(460)).toMatch(/Certyfikat odrzucony/);
    expect(komunikatUwierzytelnienia(415)).toMatch(/InvoiceWrite/);
    expect(komunikatWyjatkuXades([9105])).toBe('Nieprawidłowy podpis. (kod 9105)');
    expect(komunikatWyjatkuXades([1])).toBeNull();
  });
});
