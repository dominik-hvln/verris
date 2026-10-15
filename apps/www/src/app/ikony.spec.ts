import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Noc 15.10 (Lighthouse na verris.pl lokalnie): strona nie miała żadnej ikony — /favicon.ico zwracało 404 (błąd w
 * konsoli na każdej stronie), a Google pokazuje ikonę witryny przy wyniku wyszukiwania. Ikony jak w panelach Verris
 * (konwencja plików Next.js: app/favicon.ico, app/icon.png, app/apple-icon.png).
 */
const app = (n: string) => readFileSync(join(__dirname, n));

describe('ikony verris.pl', () => {
  it('favicon.ico (ICO), icon.png 32×32 i apple-icon.png 180×180', () => {
    expect(app('favicon.ico').subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
    const png = (b: Buffer) => ({ sygnatura: b.subarray(1, 4).toString(), szer: b.readUInt32BE(16), wys: b.readUInt32BE(20) });
    expect(png(app('icon.png'))).toEqual({ sygnatura: 'PNG', szer: 32, wys: 32 });
    expect(png(app('apple-icon.png'))).toEqual({ sygnatura: 'PNG', szer: 180, wys: 180 });
  });
});
