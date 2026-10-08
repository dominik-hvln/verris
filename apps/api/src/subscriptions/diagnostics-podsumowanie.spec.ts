import { podsumowanieDiagnostyki } from './diagnostics.service.js';

/** PB-43 — podsumowanie diagnostyki stoi w panelu obsługi pod nagłówkiem z plForm; liczebniki muszą się zgadzać. */
describe('podsumowanieDiagnostyki — odmiana liczebników', () => {
  const ust = (...statusy: string[]) => statusy.map((status) => ({ status }));

  it('bez ustaleń — zdanie „brak problemów”', () => {
    expect(podsumowanieDiagnostyki([])).toMatch(/^Nie wykryto problemów/);
  });

  it('1 / 2–4 / 5+ i 12–14', () => {
    expect(podsumowanieDiagnostyki(ust('critical'))).toBe('1 ustalenie: 1 krytyczne, 0 ostrzeżeń.');
    expect(podsumowanieDiagnostyki(ust('critical', 'warn', 'warn'))).toBe('3 ustalenia: 1 krytyczne, 2 ostrzeżenia.');
    expect(podsumowanieDiagnostyki(ust('warn', 'critical', 'critical', 'critical', 'critical', 'info'))).toBe(
      '6 ustaleń: 4 krytyczne, 1 ostrzeżenie.',
    );
    expect(podsumowanieDiagnostyki(ust(...Array<string>(12).fill('critical'), ...Array<string>(22).fill('warn')))).toBe(
      '34 ustalenia: 12 krytycznych, 22 ostrzeżenia.',
    );
  });
});
