import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-08 / P3-03 (paczka 109): panel opisywał program poleceń jako „punkty EKO za rejestracje”, a www i API
 * dają prowizję od płatności poleconych klientów; checkbox „Akceptuję regulamin” miał `required` poza formularzem,
 * więc niczego nie blokował. Na starym kodzie obie asercje padają.
 */
const czytaj = (plik: string) => readFileSync(join(__dirname, plik), 'utf8');

describe('program poleceń – teksty i zgoda', () => {
  it('panel mówi o prowizji od płatności, nie o punktach EKO, i jedną nazwą „Program poleceń”', () => {
    const tekst = czytaj('referral-program-client.tsx') + czytaj('page.tsx');
    expect(tekst).not.toMatch(/punkty EKO/i);
    expect(tekst).not.toMatch(/Program partnerski/);
    expect(tekst).toContain('prowizję');
  });

  it('przycisk „Zgłoś się do programu” jest nieaktywny bez zaznaczenia zasad', () => {
    expect(czytaj('referral-program-client.tsx')).toMatch(/disabled=\{pending \|\| !zasadyOk\}/);
  });
});
