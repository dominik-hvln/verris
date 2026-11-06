import { CENY_ZAPASOWE } from './ceny';
import { sekcjeSpecyfikacji, sekcjeWidoczne } from './specyfikacja';

const stawki = (s: ReturnType<typeof sekcjeSpecyfikacji>) =>
  s.flatMap((x) => x.wiersze).find(([p]) => p.startsWith('Stawki autoskalowania'));

describe('lib/specyfikacja — jedno źródło dla /specyfikacja i /hosting', () => {
  it('stawki brutto z modułu cen dają ten sam tekst, który /specyfikacja miała wpisany na sztywno', () => {
    expect(stawki(sekcjeSpecyfikacji(CENY_ZAPASOWE.stawki))).toEqual([
      'Stawki autoskalowania (brutto)',
      '0,001323 zł za 1% CPU/h · 0,0882 zł za 1 GB RAM/h · 0,0008 zł za 1 GB dysku/h, naliczane w blokach 15 minut',
    ]);
  });

  it('wariant netto przelicza stawki (÷1,23) i zmienia podpis', () => {
    const [p, w] = stawki(sekcjeSpecyfikacji(CENY_ZAPASOWE.stawki, true)) ?? [];
    expect(p).toBe('Stawki autoskalowania (netto)');
    // do 6 cyfr znaczących (uwaga 6.11: stawek nie skracamy) — 0,001323 / 1,23 = 0,00107560…
    expect(w).toContain('0,00107561 zł za 1% CPU/h');
    expect(w).toContain('0,0717073 zł za 1 GB RAM/h');
  });

  it('stawka z API trafia do tekstu (nie stała)', () => {
    const [, w] = stawki(sekcjeSpecyfikacji({ cpu: 0.002, ram: 0.1, dysk: 0.001 })) ?? [];
    expect(w).toContain('0,002 zł za 1% CPU/h · 0,1 zł za 1 GB RAM/h · 0,001 zł za 1 GB dysku/h');
  });

  it('pięć grup jak w makiecie', () => {
    expect(sekcjeWidoczne(CENY_ZAPASOWE.stawki).map((s) => s.tytul)).toEqual([
      'Zasoby',
      'Oprogramowanie serwera',
      'Bezpieczeństwo',
      'Domeny, SSL i poczta',
      'Kopie i gwarancje',
    ]);
  });
});
