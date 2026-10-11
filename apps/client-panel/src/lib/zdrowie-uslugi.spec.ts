import { statusZdrowia, WYSYLKA_WSTRZYMANA_OPIS } from './zdrowie-uslugi';

/** Weryfikacja 11.10 — nagłówek karty usługi nie mówi „Wszystko działa”, gdy obsługa wstrzymała wysyłkę poczty. */
describe('statusZdrowia', () => {
  it('blokada wysyłki wygrywa z „Wszystko działa”', () => {
    expect(statusZdrowia({ label: 'healthy' })).toEqual({ tone: 'data', text: 'Wszystko działa' });
    expect(statusZdrowia({ label: 'healthy', wysylkaWstrzymana: true })).toEqual({ tone: 'warn', text: 'Wysyłka poczty wstrzymana' });
    expect(statusZdrowia({ label: 'attention', wysylkaWstrzymana: true }).text).toBe('Wysyłka poczty wstrzymana');
  });

  it('bez danych — „Sprawdzamy usługę”; opis bez nazw usług serwera', () => {
    expect(statusZdrowia(null).text).toBe('Sprawdzamy usługę');
    expect(WYSYLKA_WSTRZYMANA_OPIS).not.toMatch(/DirectAdmin|\bDA\b|exim/i);
  });
});
