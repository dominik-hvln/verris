/**
 * Grupa C — /blog i /blog/[slug] (makieta 14.10). Payload i renderer Lexical są zamockowane (bez bazy).
 * Sprawdza: tylko-opublikowane w zapytaniach, metadane, jedno <h1>, JSON-LD, „W skrócie”, spis treści z kotwicami.
 */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { czasCzytania, kotwica, przytnij, spisTresci, wSkrocie } from '@/lib/blog';
import { OPUBLIKOWANE } from '@/collections/tylko-opublikowane';

type Node = { type: string; tag?: string; text?: string; children?: Node[] };

jest.mock('@payloadcms/richtext-lexical/react', () => ({
  // Minimalny renderer: nagłówki przez przekazany konwerter (to on nadaje kotwice), reszta jako <p>.
  RichText: ({
    data,
    converters,
  }: {
    data: { root: { children: Node[] } };
    converters: (a: { defaultConverters: object }) => {
      heading: (a: { node: Node; nodesToJSX: (a: { nodes: Node[] }) => ReactNode[] }) => ReactNode;
    };
  }) => {
    const conv = converters({ defaultConverters: {} });
    const tekst = (n: Node): string => n.text ?? (n.children ?? []).map(tekst).join('');
    return data.root.children.map((n, i) =>
      n.type === 'heading' ? (
        <span key={i}>{conv.heading({ node: n, nodesToJSX: ({ nodes }) => nodes.map(tekst) })}</span>
      ) : (
        <p key={i}>{tekst(n)}</p>
      ),
    );
  },
}));

const t = (text: string): Node => ({ type: 'text', text });
const TRESC = {
  root: {
    type: 'root',
    children: [
      { type: 'heading', tag: 'h2', children: [t('W skrócie')] },
      {
        type: 'list',
        children: [
          { type: 'listitem', children: [t('Porównuj koszt za 3 lata.')] },
          { type: 'listitem', children: [t('Szukaj ceny odnowienia.')] },
        ],
      },
      { type: 'heading', tag: 'h2', children: [t('Skąd się bierze cena po roku')] },
      { type: 'paragraph', children: [t('słowo '.repeat(450))] },
      { type: 'heading', tag: 'h1', children: [t('Jak czytać cennik')] },
      { type: 'heading', tag: 'h4', children: [t('Szczegół')] },
    ] as Node[],
  },
};

const WPIS = {
  id: 1,
  title: 'Dlaczego hosting drożeje przy odnowieniu',
  slug: 'hosting-drozeje',
  excerpt: 'Tani pierwszy rok to nie przypadek. Pokazujemy, jak czytać cenniki.',
  publishedAt: '2026-10-14T08:00:00.000Z',
  updatedAt: '2026-10-14T09:00:00.000Z',
  author: 'Dominik Kowalski',
  cluster: 'Hosting od kuchni',
  faq: [{ q: 'Czy hosting zawsze drożeje?', a: 'Nie zawsze, ale często.' }],
  content: TRESC,
};
const INNY = { ...WPIS, id: 2, slug: 'checklista', title: 'Checklista przed zmianą hostingu', cluster: 'Przeprowadzka', content: undefined };

const mockFind = jest.fn();
jest.mock('@/lib/payload', () => ({ getPayloadClient: async () => ({ find: mockFind }) }));

function typy(html: string): string[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const d = JSON.parse(m[1]) as { '@type'?: string; '@graph'?: { '@type': string }[] };
    return [d['@type'], ...(d['@graph'] ?? []).map((g) => g['@type'])].filter(Boolean) as string[];
  });
}

beforeEach(() => {
  mockFind.mockReset();
  mockFind.mockImplementation(async (args: { where: unknown; depth?: number }) => {
    const w = JSON.stringify(args.where);
    if (w.includes('"equals":"hosting-drozeje"')) return { docs: [WPIS] };
    if (w.includes('not_equals')) return { docs: [INNY] };
    return { docs: [WPIS, INNY] };
  });
});

describe('lib/blog', () => {
  it('„W skrócie” wyjmuje listę z początku treści i usuwa ją z artykułu', () => {
    const { punkty, tresc } = wSkrocie(TRESC);
    expect(punkty).toEqual(['Porównuj koszt za 3 lata.', 'Szukaj ceny odnowienia.']);
    expect((tresc as typeof TRESC).root.children).toHaveLength(4);
    expect(wSkrocie({ root: { children: [] } }).punkty).toEqual([]);
  });

  it('spis treści: H2 i H1 (mapowane na H2), bez H4; kotwice bez polskich znaków', () => {
    expect(spisTresci(wSkrocie(TRESC).tresc)).toEqual([
      { id: 'skad-sie-bierze-cena-po-roku', tekst: 'Skąd się bierze cena po roku' },
      { id: 'jak-czytac-cennik', tekst: 'Jak czytać cennik' },
    ]);
    expect(kotwica('Łódź i żółw')).toBe('lodz-i-zolw');
  });

  it('czas czytania i przycinanie opisu do 155 znaków', () => {
    expect(czasCzytania(TRESC)).toBe(2);
    expect(czasCzytania(undefined)).toBe(0);
    const p = przytnij('a '.repeat(200));
    expect(p!.length).toBeLessThanOrEqual(155);
  });
});

describe('/blog', () => {
  it('lista: tylko opublikowane, jedno h1, Blog + ItemList, filtr kategorii z pola cluster', async () => {
    const strona = await import('./page');
    const html = renderToStaticMarkup(await strona.default({ searchParams: Promise.resolve({}) }));
    expect(JSON.stringify(mockFind.mock.calls[0][0].where)).toBe(JSON.stringify(OPUBLIKOWANE));
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(typy(html)).toEqual(expect.arrayContaining(['Blog', 'ItemList', 'BreadcrumbList']));
    expect(html).toContain('href="/blog?kategoria=Przeprowadzka"');
    expect(html).toContain(`${czasCzytania(TRESC)} min czytania`);

    const meta = await strona.generateMetadata({ searchParams: Promise.resolve({}) });
    expect(String(meta.title).length).toBeLessThanOrEqual(60);
    expect(String(meta.title)).toMatch(/^Blog o hostingu/);
    expect(String(meta.description).length).toBeLessThanOrEqual(155);
    const filtr = await strona.generateMetadata({ searchParams: Promise.resolve({ kategoria: 'Przeprowadzka' }) });
    expect(filtr.robots).toEqual({ index: false, follow: true });
  });

  it('filtr pokazuje tylko wpisy z kategorii', async () => {
    const strona = await import('./page');
    const html = renderToStaticMarkup(
      await strona.default({ searchParams: Promise.resolve({ kategoria: 'Przeprowadzka' }) }),
    );
    expect(html).toContain('Checklista przed zmianą hostingu');
    expect(html).not.toContain('Dlaczego hosting drożeje');
  });
});

describe('/blog/[slug]', () => {
  it('wpis: jedno h1, W skrócie, spis treści = kotwice w treści, autor, FAQ, Article + BreadcrumbList + FAQPage', async () => {
    const strona = await import('./[slug]/page');
    const params = Promise.resolve({ slug: 'hosting-drozeje' });
    const html = renderToStaticMarkup(await strona.default({ params }));
    for (const c of mockFind.mock.calls) expect(JSON.stringify(c[0].where)).toContain(JSON.stringify(OPUBLIKOWANE));
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain('W skrócie');
    expect(html).toContain('href="#skad-sie-bierze-cena-po-roku"');
    expect(html).toContain('<h2 id="skad-sie-bierze-cena-po-roku">');
    expect(html).toContain('<h2 id="jak-czytac-cennik">');
    expect(html).toContain('<h3 id="szczegol">');
    expect(html).toContain('Dominik Kowalski');
    expect(html).toContain('Checklista przed zmianą hostingu');
    expect(typy(html)).toEqual(expect.arrayContaining(['BlogPosting', 'BreadcrumbList', 'FAQPage']));

    const meta = await strona.generateMetadata({ params });
    expect(String(meta.title).length).toBeLessThanOrEqual(60);
    expect(meta.alternates?.canonical).toBe('/blog/hosting-drozeje');
  });
});
