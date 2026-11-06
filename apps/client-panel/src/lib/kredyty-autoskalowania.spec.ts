import { korzyscZamowienia, okresWaznosci, opisPuli } from './kredyty-autoskalowania';

/** Decyzja 6.11.2026 — kredyty na autoskalowanie zamiast rabatu na start: teksty w zamówieniu i stan puli w panelu. */
describe('kredyty na autoskalowanie — teksty panelu', () => {
  it('korzyść w zamówieniu: kwota, plan i ważność; 0 zł = brak', () => {
    expect(korzyscZamowienia(60, 'YEAR')).toBe('+60 zł na autoskalowanie przy pierwszym zakupie (plan roczny), ważne 12 miesięcy.');
    expect(korzyscZamowienia(10, 'MONTH')).toBe('+10 zł na autoskalowanie przy pierwszym zakupie (plan miesięczny), ważne 12 miesięcy.');
    expect(korzyscZamowienia(0, 'YEAR')).toBeNull();
  });

  it('ważność z odmianą liczebnika', () => {
    expect(okresWaznosci(1)).toBe('1 miesiąc');
    expect(okresWaznosci(3)).toBe('3 miesiące');
    expect(okresWaznosci(12)).toBe('12 miesięcy');
  });

  it('pula: saldo z datą ważności, wykorzystana, wygasła; brak puli = nic', () => {
    const p = { saldo: '42.50', kwota: '60.00', przyznanoAt: '2026-11-06T10:00:00Z', wygasaAt: '2027-11-06T10:00:00Z', wygasla: false };
    expect(opisPuli(p)).toEqual({ kwota: '42,50 zł', podpis: 'Do wykorzystania na autoskalowanie do 6 listopada 2027.', dostepne: 42.5, wygasla: false });
    expect(opisPuli({ ...p, saldo: '0.00' })?.podpis).toBe('Kredyty na autoskalowanie wykorzystane (ważność do 6 listopada 2027).');
    expect(opisPuli({ ...p, saldo: '0.00', wygasla: true })).toMatchObject({ dostepne: 0, wygasla: true, podpis: 'Kredyty na autoskalowanie wygasły 6 listopada 2027.' });
    expect(opisPuli(null)).toBeNull();
  });
});
