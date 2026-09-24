import { ryzykoPojemnosci } from './product-ops.admin.controller';

describe('ryzykoPojemnosci (planer pojemności)', () => {
  it('liczy względem rdzeni i RAM węzła', () => {
    expect(ryzykoPojemnosci(250, 2355, 8, 65536)).toBe('low'); // 2,5 rdzenia z 8
    expect(ryzykoPojemnosci(1600, 1024, 8, 65536)).toBe('medium'); // 2× rdzeni
    expect(ryzykoPojemnosci(3200, 1024, 8, 65536)).toBe('high'); // 4× rdzeni
    expect(ryzykoPojemnosci(100, 65536, 8, 65536)).toBe('medium'); // RAM 1×
    expect(ryzykoPojemnosci(100, 98304, 8, 65536)).toBe('high'); // RAM 1,5×
    expect(ryzykoPojemnosci(250, 2355, 2, 2048)).toBe('medium'); // mały węzeł: RAM ponad całość
  });
  it('bez pojemności od agenta — dawne progi bezwzględne', () => {
    expect(ryzykoPojemnosci(250, 2355, null, null)).toBe('low');
    expect(ryzykoPojemnosci(500, 0, null, null)).toBe('medium');
    expect(ryzykoPojemnosci(0, 64 * 1024, null, null)).toBe('high');
  });
});
