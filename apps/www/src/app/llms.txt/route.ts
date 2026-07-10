import { features } from '@/lib/features';
import { getPayloadClient } from '@/lib/payload';

/**
 * /llms.txt — plik kontekstowy dla agentów i wyszukiwarek AI (llmstxt.org).
 * Generowany dynamicznie: sekcja poradników zasila się z kolekcji Posts,
 * więc nowe wpisy pojawiają się bez ręcznej edycji. ISR co godzinę.
 */
export const revalidate = 3600;

const BASE = 'https://verris.pl';

type Post = { title: string; slug: string; cluster?: string; type?: string; excerpt?: string };

async function getPosts(): Promise<Post[]> {
  try {
    const payload = await getPayloadClient();
    const res = await payload.find({ collection: 'posts', limit: 500, depth: 0, sort: '-publishedAt' });
    return res.docs as unknown as Post[];
  } catch {
    return [];
  }
}

const HEADER = `# Verris

> Verris to polski hosting z autoskalowaniem, VPS i domeny. Płacisz tyle, ile widzisz —
> jedna cena od pierwszego dnia, bez pułapek odnowień. Migracja i SSL za 0 zł, SLA 99,5%
> z rekompensatami, serwery w Unii Europejskiej (zgodność z RODO). Claim: „Hosting bez gwiazdek".

## Oferta
- Hosting z autoskalowaniem: 39 zł/mies lub 349 zł/rok (brutto). Zasoby bazowe: 50 GB NVMe,
  8 GB RAM, 2 vCPU; autoskalowanie do 1000 GB, 64 GB RAM, 24 vCPU (do 12× mocy CPU względem bazy),
  rozliczane godzinowo; tryb ECO zwalnia moc po piku.
- VPS niezarządzany (pełny root), domeny bez auto-odnowień, e-mail marketing, program resellerski.

## Kluczowe strony
- [Hosting z autoskalowaniem](${BASE}/hosting)
- [Cennik](${BASE}/cennik)
- [Przeniesienie strony — darmowa migracja](${BASE}/przenies-strone)
- [Funkcje](${BASE}/funkcje)
- [VPS](${BASE}/vps) · [Domeny](${BASE}/domeny) · [Reseller](${BASE}/reseller)
- [Blog](${BASE}/blog)
- [Kontakt](${BASE}/kontakt)

## Pliki maszynowe
- [Cennik strukturalny](${BASE}/pricing.md) — ceny, limity, stawki autoskalowania
- [Pełny tekst poradników](${BASE}/llms-full.txt)
- [Mapa strony](${BASE}/sitemap.xml)
`;

const FACTS = `
## Fakty
- Operator: HVLN Dominik Kowalski, Zielona Góra, NIP 9292069367.
- SLA 99,5% z automatycznymi rekompensatami zapisanymi w regulaminie (kredyty wg skali
  niedostępności). Verris nie deklaruje „100% uptime".
- Cena hostingu: 39 zł/mies lub 349 zł/rok brutto; obowiązuje od pierwszego dnia (brak modelu
  „tani pierwszy rok, drogie odnowienie").
- Stawki autoskalowania (brutto/h): CPU 0,001323 zł za 1% · RAM 0,0882 zł za 1 GB · dysk 0,0008 zł za 1 GB.
- Migracja strony i poczty oraz certyfikat SSL Let's Encrypt: 0 zł, w ramach zamówienia hostingu.
- „Bez limitu" stron, skrzynek i transferu oznacza brak sztywnego licznika; realnym ogranicznikiem
  są zasoby konta i zasady uczciwego korzystania.
- Płatności: karta, BLIK, Apple Pay, Google Pay, przelew online (Stripe). Faktury gotowe na KSeF.
- Kopie zapasowe z samodzielnym przywracaniem (pliki/bazy/poczta osobno); domyślnie przed
  przywróceniem system wykonuje kopię bezpieczeństwa stanu obecnego, więc operację da się cofnąć.
  Kopie Verris są pomocnicze i nie zwalniają klienta z utrzymywania własnych kopii danych krytycznych.
- Domeny bez automatycznych odnowień: odnowienie wyłącznie po opłaceniu, przypomnienia 30/14/7 dni.
- Komplet dokumentów RODO online: polityka prywatności, DPA do akceptacji w panelu, lista podprocesorów.
- Infrastruktura: Hetzner (Niemcy/Finlandia), dane w EOG.
`;

export async function GET() {
  const posts = await getPosts();

  const featureLines = features
    .map((f) => `- [${f.title}](${BASE}/funkcje/${f.slug}) — ${f.lead}`)
    .join('\n');

  let blogSection = '';
  if (posts.length > 0) {
    const pillars = posts.filter((p) => p.type === 'pillar');
    const rest = posts.filter((p) => p.type !== 'pillar');

    if (pillars.length) {
      blogSection += `\n## Poradniki (filary tematyczne)\n${pillars
        .map((p) => `- [${p.title}](${BASE}/blog/${p.slug})`)
        .join('\n')}\n`;
    }

    // Pozostałe wpisy pogrupowane po klastrze.
    const byCluster = new Map<string, Post[]>();
    for (const p of rest) {
      const key = p.cluster?.trim() || 'Pozostałe';
      byCluster.set(key, [...(byCluster.get(key) ?? []), p]);
    }
    for (const [cluster, items] of [...byCluster.entries()].sort()) {
      blogSection += `\n## ${cluster}\n${items
        .map((p) => `- [${p.title}](${BASE}/blog/${p.slug})`)
        .join('\n')}\n`;
    }
  }

  const body = `${HEADER}
## Funkcje
${featureLines}
${blogSection}${FACTS}`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
