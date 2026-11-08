import sharp from 'sharp';
import { BibliotekaZdjec, CZAS_CACHE_MS, Pamiec } from './biblioteka.js';
import { BladDostawcy, hostDozwolony, pobierzPlik, type Fetch } from './dostawca.js';
import { DostawcaPixabay } from './pixabay.js';
import { DostawcaOpenverse } from './openverse.js';
import { DostawcaPexels } from './pexels.js';

/** Paczka 122 – adaptery bibliotek zdjęć z atrapą fetch: mapowanie pól, cache, brak klucza, dozwolone hosty. */
const json = (dane: unknown, status = 200) => new Response(JSON.stringify(dane), { status, headers: { 'content-type': 'application/json' } });

function atrapa(odpowiedz: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const wywolania: { url: string; init?: RequestInit }[] = [];
  const f = (async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u);
    wywolania.push({ url, init });
    return odpowiedz(url, init);
  }) as Fetch;
  return { f, wywolania };
}

const PIXABAY_HIT = {
  id: 195893,
  pageURL: 'https://pixabay.com/en/blossom-bloom-flower-195893/',
  webformatURL: 'https://pixabay.com/get/35bbf209e13e39d2_640.jpg',
  largeImageURL: 'https://pixabay.com/get/ed6a99fd0a76647_1280.jpg',
  imageWidth: 4000,
  imageHeight: 2250,
  user: 'Josch13',
  user_id: 48777,
};

describe('Pixabay', () => {
  it('wyszukiwanie: parametry zapytania i mapowanie pól (autor, strona autora, licencja, źródło)', async () => {
    const { f, wywolania } = atrapa(() => json({ total: 4692, totalHits: 500, hits: [PIXABAY_HIT, { id: 'zly' }] }));
    const d = new DostawcaPixabay('KLUCZ-TESTOWY', f);
    const w = await d.szukaj('fryzjer', 2, 24);
    const u = new URL(wywolania[0]!.url);
    expect(u.origin + u.pathname).toBe('https://pixabay.com/api/');
    expect(Object.fromEntries(u.searchParams)).toEqual({ key: 'KLUCZ-TESTOWY', q: 'fryzjer', image_type: 'photo', safesearch: 'true', per_page: '24', page: '2', lang: 'pl' });
    expect(w).toEqual({
      razem: 500,
      wyniki: [
        {
          id: '195893',
          miniatura: PIXABAY_HIT.webformatURL,
          szerokosc: 4000,
          wysokosc: 2250,
          autor: 'Josch13',
          autorUrl: 'https://pixabay.com/users/Josch13-48777/',
          licencja: 'pixabay',
          licencjaUrl: 'https://pixabay.com/service/license-summary/',
          zrodloUrl: PIXABAY_HIT.pageURL,
        },
      ],
    });
  });

  it('pobierz: largeImageURL z zapytania po id; bez klucza dostawca wyłączony i bez zapytań', async () => {
    const { f } = atrapa(() => json({ hits: [PIXABAY_HIT] }));
    const z = await new DostawcaPixabay('K', f).pobierz('195893');
    expect(z.url).toBe(PIXABAY_HIT.largeImageURL);
    expect(z.meta.autor).toBe('Josch13');
    const bez = atrapa(() => json({}));
    const d = new DostawcaPixabay(undefined, bez.f);
    expect(d.wlaczony()).toBe(false);
    await expect(d.szukaj('x', 1, 24)).rejects.toBeInstanceOf(BladDostawcy);
    expect(bez.wywolania).toHaveLength(0);
  });

  it('błąd dostawcy → polski komunikat bez nazwy klucza i treści odpowiedzi', async () => {
    const { f } = atrapa(() => new Response('[ERROR 400] "key" is invalid: KLUCZ-TESTOWY', { status: 400 }));
    const e = (await new DostawcaPixabay('KLUCZ-TESTOWY', f).szukaj('x', 1, 24).then(() => null, (x: unknown) => x)) as BladDostawcy;
    expect(e).toBeInstanceOf(BladDostawcy);
    expect(e.message).toMatch(/Biblioteka zdjęć/);
    expect(e.message).not.toMatch(/key|KLUCZ/i);
  });
});

describe('Openverse', () => {
  const rekord = (o: Record<string, unknown> = {}) => ({
    id: '4bc43a04-ef46-4544-a0c1-63c63f56e276',
    url: 'https://live.staticflickr.com/7/123_abc_b.jpg',
    thumbnail: 'https://api.openverse.org/v1/images/4bc43a04-ef46-4544-a0c1-63c63f56e276/thumb/',
    width: 1024,
    height: 768,
    creator: 'Jan Kowalski',
    creator_url: 'https://www.flickr.com/photos/jan',
    license: 'cc0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    foreign_landing_url: 'https://www.flickr.com/photos/jan/123',
    ...o,
  });

  it('tylko CC0 i domena publiczna w zapytaniu; wyniki spoza licencji i hostów importu odfiltrowane', async () => {
    const { f, wywolania } = atrapa(() =>
      json({ result_count: 3, results: [rekord(), rekord({ license: 'by' }), rekord({ url: 'https://zly-host.example/x.jpg' })] }),
    );
    const w = await new DostawcaOpenverse(f).szukaj('salon fryzjerski', 1, 24);
    const u = new URL(wywolania[0]!.url);
    expect(u.searchParams.get('license')).toBe('cc0,pdm');
    expect(u.searchParams.get('page_size')).toBe('24');
    expect(w.razem).toBe(3);
    expect(w.wyniki).toHaveLength(1);
    expect(w.wyniki[0]).toMatchObject({ autor: 'Jan Kowalski', licencja: 'cc0', zrodloUrl: 'https://www.flickr.com/photos/jan/123', szerokosc: 1024 });
    expect(w.wyniki[0]).not.toHaveProperty('oryginal');
  });

  it('pobierz: oryginał u źródła z listy hostów; zawsze włączony (bez klucza)', async () => {
    const { f, wywolania } = atrapa(() => json(rekord({ license: 'pdm' })));
    const d = new DostawcaOpenverse(f);
    expect(d.wlaczony()).toBe(true);
    const z = await d.pobierz('4bc43a04-ef46-4544-a0c1-63c63f56e276');
    expect(wywolania[0]!.url).toBe('https://api.openverse.org/v1/images/4bc43a04-ef46-4544-a0c1-63c63f56e276/');
    expect(z.url).toBe('https://live.staticflickr.com/7/123_abc_b.jpg');
    expect(z.meta.licencja).toBe('pdm');
  });
});

describe('Pexels', () => {
  const zdjecie = {
    id: 2014422,
    width: 3024,
    height: 3024,
    url: 'https://www.pexels.com/photo/brown-rocks-2014422/',
    photographer: 'Joey Farina',
    photographer_url: 'https://www.pexels.com/@joey',
    src: { original: 'https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg', medium: 'https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?h=350' },
  };

  it('nagłówek Authorization z kluczem, mapowanie pól; wyłączony bez PEXELS_API_KEY', async () => {
    const { f, wywolania } = atrapa(() => json({ total_results: 10000, photos: [zdjecie] }));
    const w = await new DostawcaPexels('PK', f).szukaj('kawa', 1, 24);
    expect((wywolania[0]!.init?.headers as Record<string, string>).Authorization).toBe('PK');
    expect(new URL(wywolania[0]!.url).searchParams.get('query')).toBe('kawa');
    expect(w.wyniki[0]).toMatchObject({ id: '2014422', autor: 'Joey Farina', licencja: 'pexels', miniatura: zdjecie.src.medium });
    expect(new DostawcaPexels(undefined).wlaczony()).toBe(false);
    const z = await new DostawcaPexels('PK', atrapa(() => json(zdjecie)).f).pobierz('2014422');
    expect(new URL(z.url).searchParams.get('w')).toBe('2400');
  });
});

describe('BibliotekaZdjec – cache, włączeni dostawcy, pobieranie tylko z dozwolonych hostów', () => {
  it('wyniki wyszukiwania z cache (24 h) – drugie zapytanie bez wywołania dostawcy', async () => {
    const { f, wywolania } = atrapa(() => json({ totalHits: 1, hits: [PIXABAY_HIT] }));
    const b = new BibliotekaZdjec([new DostawcaPixabay('K', f)]);
    const d = b.dostawca('pixabay', ['pixabay']);
    await b.szukaj(d, 'Fryzjer ', 1);
    await b.szukaj(d, 'fryzjer', 1);
    expect(wywolania).toHaveLength(1);
    await b.szukaj(d, 'fryzjer', 2);
    expect(wywolania).toHaveLength(2);
  });

  it('pamięć: termin i limit wpisów', () => {
    const p = new Pamiec<number>(2, CZAS_CACHE_MS);
    p.ustaw('a', 1, 0, 0);
    p.ustaw('b', 2, 0, 0);
    p.ustaw('c', 3, 0, 0);
    expect(p.wez('a', 1)).toBeUndefined();
    expect(p.wez('c', 1)).toBe(3);
    expect(p.wez('c', CZAS_CACHE_MS + 1)).toBeUndefined();
  });

  it('włączeni = z konfiguracji i z kluczem, w kolejności z konfiguracji', () => {
    const b = new BibliotekaZdjec([new DostawcaPixabay(undefined), new DostawcaOpenverse(), new DostawcaPexels('PK')]);
    expect(b.wlaczeni(['pixabay', 'openverse', 'pexels']).map((d) => d.nazwa)).toEqual(['openverse', 'pexels']);
    expect(b.wlaczeni(['pexels', 'openverse']).map((d) => d.nazwa)).toEqual(['pexels', 'openverse']);
    expect(() => b.dostawca('pixabay', ['pixabay', 'openverse'])).toThrow(BladDostawcy);
  });

  it('import: oryginał tylko z hostów dostawcy, także po przekierowaniu; limit rozmiaru', async () => {
    const jpg = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const { f, wywolania } = atrapa((url) => {
      if (url.startsWith('https://pixabay.com/api/')) return json({ hits: [{ ...PIXABAY_HIT, largeImageURL: 'https://pixabay.com/get/przekieruj.jpg' }] });
      if (url === 'https://pixabay.com/get/przekieruj.jpg') return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
      return new Response(jpg, { status: 200 });
    });
    const b = new BibliotekaZdjec([new DostawcaPixabay('K', f)]);
    const d = b.dostawca('pixabay', ['pixabay']);
    await expect(b.pobierzOryginal(d, '195893', 1_000_000)).rejects.toThrow(/nie da się zaimportować/);
    expect(wywolania.some((w) => w.url.includes('169.254'))).toBe(false);

    const dobry = atrapa((url) => (url.startsWith('https://pixabay.com/api/') ? json({ hits: [PIXABAY_HIT] }) : new Response(jpg)));
    const b2 = new BibliotekaZdjec([new DostawcaPixabay('K', dobry.f)]);
    const p = await b2.pobierzOryginal(b2.dostawca('pixabay', ['pixabay']), '195893', 1_000_000);
    expect(p.dane.equals(jpg)).toBe(true);
    await expect(pobierzPlik(dobry.f, PIXABAY_HIT.largeImageURL, ['pixabay.com'], 10)).rejects.toThrow(/za duże/);
  });

  it('hostDozwolony: tylko https, bez portów i danych logowania, poddomeny tylko dla *.domena', () => {
    const h = ['pixabay.com', '*.staticflickr.com'];
    expect(hostDozwolony('https://pixabay.com/get/a.jpg', h)).toBe(true);
    expect(hostDozwolony('http://pixabay.com/get/a.jpg', h)).toBe(false);
    expect(hostDozwolony('https://pixabay.com:8443/a.jpg', h)).toBe(false);
    expect(hostDozwolony('https://user:x@pixabay.com/a.jpg', h)).toBe(false);
    expect(hostDozwolony('https://evil-pixabay.com/a.jpg', h)).toBe(false);
    expect(hostDozwolony('https://pixabay.com.evil.pl/a.jpg', h)).toBe(false);
    expect(hostDozwolony('https://farm1.staticflickr.com/a.jpg', h)).toBe(true);
    expect(hostDozwolony('https://staticflickr.com.evil.pl/a.jpg', h)).toBe(false);
  });

  it('miniatura: treść musi być obrazem rastrowym (HTML od dostawcy odrzucony), drugi raz z pamięci', async () => {
    const jpg = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).jpeg().toBuffer();
    const { f, wywolania } = atrapa((url) => new Response(url.endsWith('html') ? '<html>' : jpg));
    const b = new BibliotekaZdjec([new DostawcaPixabay('K', f)]);
    const d = b.dostawca('pixabay', ['pixabay']);
    await expect(b.miniatura(d, 'https://pixabay.com/get/x.html')).rejects.toBeInstanceOf(BladDostawcy);
    expect((await b.miniatura(d, 'https://pixabay.com/get/x.jpg')).typ).toBe('image/jpeg');
    await b.miniatura(d, 'https://pixabay.com/get/x.jpg');
    expect(wywolania.filter((w) => w.url.endsWith('x.jpg'))).toHaveLength(1);
    await expect(b.miniatura(d, 'https://inny-host.pl/x.jpg')).rejects.toBeInstanceOf(BladDostawcy);
  });
});
