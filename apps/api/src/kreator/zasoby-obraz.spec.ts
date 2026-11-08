import sharp from 'sharp';
import { BladObrazu, MAKS_BAJTOW_WEJSCIA, przetworzObraz, rozpoznajTyp } from './zasoby-obraz.js';

/** Paczka 122 – przetwarzanie zdjęć biblioteki kreatora (sharp): typ po zawartości, EXIF/GPS, warianty, limity. */
const plotno = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#c86432' } });

describe('przetworzObraz', () => {
  it('JPEG z EXIF i GPS: metadane usunięte, oryginał WebP, warianty webp+jpg tylko ≤ szerokości oryginału', async () => {
    const wejscie = await plotno(1800, 1200)
      .withExif({ IFD0: { Copyright: 'Klient', ImageDescription: 'tajny opis' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '52/1 24/1 0/1' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(wejscie).metadata()).exif).toBeDefined(); // test sam się nie oszukuje
    const o = await przetworzObraz(wejscie);
    expect(o.typ).toBe('jpeg');
    expect([o.szerokosc, o.wysokosc]).toEqual([1800, 1200]);
    const mo = await sharp(o.oryginal).metadata();
    expect(mo.format).toBe('webp');
    expect(mo.exif).toBeUndefined();
    expect(o.warianty.map((w) => `${w.szerokosc}.${w.format}`)).toEqual(['480.webp', '480.jpg', '960.webp', '960.jpg', '1600.webp', '1600.jpg']);
    for (const w of o.warianty) {
      const m = await sharp(w.dane).metadata();
      expect(m.format).toBe(w.format === 'jpg' ? 'jpeg' : 'webp');
      expect(m.width).toBe(w.szerokosc);
      expect(m.exif).toBeUndefined();
      expect(w.dane.includes(Buffer.from('tajny opis'))).toBe(false);
    }
    expect(o.bajty).toBe(o.oryginal.length + o.warianty.reduce((a, w) => a + w.dane.length, 0));
    expect(o.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('autoorientacja: zdjęcie z orientacją EXIF 6 (obrót 90°) ma zamienione wymiary', async () => {
    const wejscie = await plotno(800, 600).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const o = await przetworzObraz(wejscie);
    expect([o.szerokosc, o.wysokosc]).toEqual([600, 800]);
  });

  it('małe zdjęcie: jeden wariant 480 bez powiększania; PNG z przezroczystością → jpg na białym tle', async () => {
    const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const o = await przetworzObraz(png);
    expect(o.typ).toBe('png');
    expect(o.warianty.map((w) => `${w.szerokosc}.${w.format}`)).toEqual(['480.webp', '480.jpg']);
    const jpg = o.warianty.find((w) => w.format === 'jpg')!;
    expect((await sharp(jpg.dane).metadata()).width).toBe(300);
    const { data } = await sharp(jpg.dane).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
  });

  it('WebP i AVIF są przyjmowane', async () => {
    expect((await przetworzObraz(await plotno(500, 400).webp().toBuffer())).typ).toBe('webp');
    expect((await przetworzObraz(await plotno(500, 400).avif().toBuffer())).typ).toBe('avif');
  });

  it('SVG odrzucony (także z rozszerzeniem/nagłówkiem udającym zdjęcie)', async () => {
    const svg = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(przetworzObraz(svg)).rejects.toThrow(/SVG/);
  });

  it('udawany typ: tekst albo HTML z nazwą .jpg, PNG z uciętą treścią – odrzucone', async () => {
    await expect(przetworzObraz(Buffer.from('<html><body>to nie jest zdjęcie</body></html>'))).rejects.toBeInstanceOf(BladObrazu);
    const png = await plotno(400, 300).png().toBuffer();
    await expect(przetworzObraz(png.subarray(0, 60))).rejects.toBeInstanceOf(BladObrazu);
    // Sygnatura JPEG + treść PNG: zawartość nie zgadza się z sygnaturą.
    const udawany = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), png]);
    await expect(przetworzObraz(udawany)).rejects.toBeInstanceOf(BladObrazu);
  });

  it('HEIC: czytelna odmowa (gotowe binarki sharp nie dekodują HEVC)', () => {
    const ftyp = Buffer.alloc(32);
    ftyp.writeUInt32BE(24, 0);
    ftyp.write('ftypheic', 4, 'latin1');
    ftyp.write('mif1heic', 16, 'latin1');
    expect(() => rozpoznajTyp(ftyp)).toThrow(/HEIC/);
  });

  it('za duży plik i za duża rozdzielczość – odmowa przed dekodowaniem całości', async () => {
    await expect(przetworzObraz(Buffer.alloc(MAKS_BAJTOW_WEJSCIA + 1, 0xff))).rejects.toThrow(/za duże/);
    // 8000 × 6000 = 48 Mpx > 40 Mpx (jednolity kolor – mały plik).
    const duzy = await plotno(8000, 6000).png({ compressionLevel: 9 }).toBuffer();
    expect(duzy.length).toBeLessThan(MAKS_BAJTOW_WEJSCIA);
    await expect(przetworzObraz(duzy)).rejects.toThrow(/rozdzielczość/);
  });
});
