import { features } from '@/lib/features';
import { EMAIL_MARKETING_W_SPRZEDAZY, OFERTA_KROTKO, VPS_W_SPRZEDAZY } from '@/lib/oferta';
import { getPayloadClient } from '@/lib/payload';
import { OPUBLIKOWANE } from '@/collections/tylko-opublikowane';
import { PORADNIKI } from '@/lib/poradniki';
import { cenaPakietu, stawka, type Ceny } from '@/lib/ceny';
import { pobierzCeny } from '@/lib/ceny-api';
import { DANE_SPRZEDAWCY } from '@/lib/sprzedawca';

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
    const res = await payload.find({ collection: 'posts', where: OPUBLIKOWANE, limit: 500, depth: 0, sort: '-publishedAt' });
    return res.docs as unknown as Post[];
  } catch {
    return [];
  }
}

const naglowek = (c: Ceny) => `# Verris

> Verris to polski ${OFERTA_KROTKO}. Płacisz tyle, ile widzisz —
> odnowienie po cenie z cennika, bez pułapek odnowień. Migracja i SSL za 0 zł, SLA 99,5%
> z automatycznymi rekompensatami, serwery w Unii Europejskiej (zgodność z RODO). Claim: „Hosting bez gwiazdek".

## Oferta
- Hosting z autoskalowaniem: ${cenaPakietu(c.hosting)}. Limity w pakiecie: 50 GB NVMe,
  limit 8 GB RAM i 2 vCPU (limity konta, nie rezerwacja); autoskalowanie do 1000 GB, 64 GB RAM, 24 vCPU (do 12× mocy CPU względem bazy),
  rozliczane w blokach 15 minut według stawek godzinowych; po piku zasoby wracają do bazy. Limit kosztu na 30 dni
  (suma dopłat z ostatnich 30 dni) jest opcjonalny — bez limitu klient płaci za faktyczne użycie.
- ${VPS_W_SPRZEDAZY ? 'VPS niezarządzany (pełny root), d' : 'D'}omeny bez auto-odnowień${EMAIL_MARKETING_W_SPRZEDAZY ? ', e-mail marketing' : ''}, program resellerski (wielu klientów w jednym panelu; własny narzut — wkrótce).

## Kluczowe strony
- [Hosting z autoskalowaniem](${BASE}/hosting)
- [Hosting WordPress](${BASE}/hosting/wordpress) · [Hosting dla sklepu](${BASE}/hosting/sklep)
- [Cennik](${BASE}/cennik)
- [Przeniesienie strony na nowy hosting za darmo](${BASE}/przenies-strone)
- [Jak wybrać hosting — lista pytań](${BASE}/jak-wybrac-hosting)
- [Funkcje](${BASE}/funkcje) · [Statystyki strony bez cookies](${BASE}/funkcje/statystyki)
- ${VPS_W_SPRZEDAZY ? `[VPS](${BASE}/vps) · ` : ''}[Domeny](${BASE}/domeny) · [Poczta w domenie](${BASE}/poczta) · [Dla agencji](${BASE}/reseller)
- [Program poleceń](${BASE}/polecaj) — 10% od płatności poleconych klientów
- [Dokumenty i RODO](${BASE}/dokumenty) · [O nas](${BASE}/o-nas) · [Kontakt](${BASE}/kontakt)
- [Blog](${BASE}/blog)

## Poradniki przeprowadzki
${PORADNIKI.map((p) => `- [${p.h1}](${BASE}/przenies-strone/${p.slug})`).join('\n')}

## Pliki maszynowe
- [Cennik strukturalny](${BASE}/pricing.md) — ceny, limity, stawki autoskalowania
- [Pełny tekst poradników](${BASE}/llms-full.txt)
- [Mapa strony](${BASE}/sitemap.xml)
`;

const fakty = (c: Ceny) => `
## Fakty
- Operator: ${DANE_SPRZEDAWCY}.
- SLA 99,5% z rekompensatami zapisanymi w regulaminie (kredyty wg skali niedostępności),
  przyznawanymi automatycznie, bez wniosku klienta. Verris nie deklaruje „100% uptime".
- Cena hostingu: ${cenaPakietu(c.hosting)}; odnowienie zawsze po cenie z cennika podanej z góry; przy pierwszym
  zakupie rabat na start na pierwszy rok albo pierwszy miesiąc, kwota po rabacie widoczna przed zapłatą.
- Stawki autoskalowania (brutto/h): CPU ${stawka(c.stawki.cpu)} zł za 1% · RAM ${stawka(c.stawki.ram)} zł za 1 GB · dysk ${stawka(c.stawki.dysk)} zł za 1 GB.
- Migracja strony i poczty oraz certyfikat SSL Let's Encrypt: 0 zł, w ramach zamówienia hostingu.
- „Bez limitu" stron, skrzynek i transferu oznacza brak sztywnego licznika; realnym ogranicznikiem
  są zasoby konta i zasady uczciwego korzystania.
- Płatności: karta, BLIK, przelew online. Faktura VAT do każdej płatności.
- Kopie zapasowe z samodzielnym przywracaniem (pliki/bazy/poczta osobno), w tym kopia poza serwerem
  z każdego z ostatnich 30 dni (klient wybiera dzień w panelu); domyślnie przed
  przywróceniem system wykonuje kopię bezpieczeństwa stanu obecnego, więc operację da się cofnąć.
  Kopie Verris są pomocnicze i nie zwalniają klienta z utrzymywania własnych kopii danych krytycznych.
- Domeny bez automatycznych odnowień: odnowienie wyłącznie po opłaceniu, przypomnienia 30/14/7 dni.
- Komplet dokumentów RODO online: polityka prywatności, DPA do akceptacji w panelu, lista podprocesorów.
- Dane klientów przechowywane w Unii Europejskiej (EOG).
`;

export async function GET() {
  const [posts, ceny] = await Promise.all([getPosts(), pobierzCeny()]);

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

  const body = `${naglowek(ceny)}
## Funkcje
${featureLines}
${blogSection}${fakty(ceny)}`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
