import { kadr, ramkaNaZrzucie } from './zrzut-strony';

/** Zrzut „Zgłoś uwagę”: z płótna z całym body wycinamy to, co tester widział w oknie. */
describe('kadr', () => {
  it('przewinięta strona: obszar okna od miejsca przewinięcia', () => {
    expect(kadr({ left: 0, top: -1200, width: 1280 }, { szer: 1280, wys: 800 }, { szer: 1280, wys: 5000 })).toEqual({
      sx: 0,
      sy: 1200,
      sw: 1280,
      sh: 800,
      skala: 1,
    });
  });

  it('płótno zmniejszone przez bibliotekę (limit 16384 px) — współrzędne w skali płótna', () => {
    const k = kadr({ left: 0, top: -20000, width: 1280 }, { szer: 1280, wys: 800 }, { szer: 640, wys: 16384 });
    expect(k).toEqual({ sx: 0, sy: 10000, sw: 640, sh: 400, skala: 0.5 });
  });

  it('koniec strony: kadr nie wychodzi poza płótno', () => {
    const k = kadr({ left: 0, top: -4500, width: 1280 }, { szer: 1280, wys: 800 }, { szer: 1280, wys: 5000 });
    expect(k.sy + k.sh).toBeLessThanOrEqual(5000);
    expect(k.sh).toBe(500);
  });
});

describe('ramkaNaZrzucie', () => {
  it('prostokąt elementu z marginesem, w skali zrzutu', () => {
    expect(ramkaNaZrzucie({ x: 100, y: 50, szer: 80, wys: 20 }, 1)).toEqual({ x: 96, y: 46, szer: 88, wys: 28 });
    expect(ramkaNaZrzucie({ x: 100, y: 50, szer: 80, wys: 20 }, 0.5)).toEqual({ x: 48, y: 23, szer: 44, wys: 14 });
  });
});
