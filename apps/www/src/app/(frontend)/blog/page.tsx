import type { Metadata } from 'next';
import Link from 'next/link';
import { CTABand, JsonLd, SectionHead, SubHero } from '../components/ui';
import { getPayloadClient } from '@/lib/payload';
import { SITE, ORG_ID } from '@/lib/schema';
import { czasCzytania, dataPL } from '@/lib/blog';
import { OPUBLIKOWANE } from '@/collections/tylko-opublikowane';

/*
 * /blog — makieta 14.10 (Blog.dc.html). Lista wyłącznie z CMS (tylko opublikowane — OPUBLIKOWANE). Plan 26 wpisów
 * z makiety NIE jest tu wpisany: wpis pojawi się, gdy zostanie opublikowany w Payload. Kategorie = pole `cluster`
 * (bez zmiany schematu); filtr jest linkiem `?kategoria=` (działa bez JavaScriptu), strony filtra mają noindex.
 */

export const dynamic = 'force-dynamic';

const TITLE = 'Blog o hostingu, WordPressie i stronach firmowych | Verris';
const DESCRIPTION =
  'Poradniki o przenoszeniu stron, szybkości WordPressa, domenach, poczcie i bezpieczeństwie. Pisane prostym językiem przez zespół Verris.';

const META: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/blog' },
};

type SP = Promise<{ kategoria?: string | string[] }>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const { kategoria } = await searchParams;
  // Widoki filtra to duplikaty listy — indeksujemy tylko /blog.
  return kategoria ? { ...META, robots: { index: false, follow: true } } : META;
}

type Post = {
  id: string | number;
  title: string;
  slug: string;
  excerpt?: string;
  publishedAt?: string;
  cluster?: string;
  content?: unknown;
  coverImage?: { url?: string; alt?: string } | null;
};

async function getPosts(): Promise<Post[]> {
  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: 'posts',
      where: OPUBLIKOWANE,
      sort: '-publishedAt',
      limit: 100,
      depth: 1,
    });
    return res.docs as unknown as Post[];
  } catch (err) {
    // NIE maskuj po cichu: błąd bazy (np. brakująca kolumna po zmianie schematu)
    // wyglądałby jak „brak wpisów". Loguj, żeby było widać w `docker compose logs www`.
    console.error('[blog] Nie udało się pobrać wpisów z Payload:', err);
    return [];
  }
}

function Meta({ p }: { p: Post }) {
  const min = czasCzytania(p.content);
  const czesci = [p.cluster, min ? `${min} min czytania` : null].filter(Boolean);
  return (
    <span className="c-meta">
      {czesci.join(' · ')}
      {p.publishedAt ? (
        <>
          {czesci.length ? ' · ' : ''}
          <time dateTime={p.publishedAt}>{dataPL(p.publishedAt)}</time>
        </>
      ) : null}
    </span>
  );
}

const PORADNIKI: [string, string][] = [
  ['Z panelu cPanel', 'Przekaż dostęp do obecnego hostingu, a przeniesiemy pliki, bazy i pocztę.'],
  ['Z panelu DirectAdmin', 'Stara strona działa do chwili, w której przełączysz domenę.'],
  ['Z panelu Plesk', 'Przeniesienie strony, baz i poczty jest w cenie hostingu.'],
  ['Z innego hostingu', 'Masz u dostawcy własny panel? Napisz, ustalimy, jak przenieść stronę.'],
];

export default async function BlogPage({ searchParams }: { searchParams: SP }) {
  const { kategoria: kRaw } = await searchParams;
  const posts = await getPosts();

  const licznik = new Map<string, number>();
  for (const p of posts) if (p.cluster) licznik.set(p.cluster, (licznik.get(p.cluster) ?? 0) + 1);
  const kategorie = [...licznik.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pl'));
  const wybrana = typeof kRaw === 'string' && licznik.has(kRaw) ? kRaw : null;

  const widoczne = wybrana ? posts.filter((p) => p.cluster === wybrana) : posts;
  const polecany: Post | undefined = wybrana ? undefined : widoczne[0];
  const reszta = wybrana ? widoczne : widoczne.slice(1);

  const blogJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Blog',
        '@id': `${SITE}/blog#blog`,
        name: 'Blog Verris',
        description: DESCRIPTION,
        url: `${SITE}/blog`,
        publisher: { '@id': ORG_ID },
        inLanguage: 'pl-PL',
      },
      {
        '@type': 'ItemList',
        itemListElement: widoczne.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${SITE}/blog/${p.slug}`,
          name: p.title,
        })),
      },
    ],
  };

  return (
    <main>
      <JsonLd data={blogJsonLd} />
      <SubHero
        eyebrow="Blog Verris"
        title="Poradniki, dzięki którym Twoja strona działa szybciej i sprawia mniej kłopotów"
        lead="Przeprowadzki stron, wolny WordPress, maile w spamie, faktury rosnące przy odnowieniu. Piszemy o tym, z czym właściciele stron i sklepów mierzą się naprawdę — konkretnie i krok po kroku."
        crumbs={[{ label: 'Blog' }]}
      />

      <section className="sec" aria-label="Wpisy">
        <div className="wrap">
          {posts.length === 0 ? (
            <div className="empty">
              <p>Pierwsze wpisy pojawią się wkrótce. Zapraszamy niebawem.</p>
            </div>
          ) : (
            <>
              {polecany ? (
                <Link className="c-feat" href={`/blog/${polecany.slug}`}>
                  <div className="c-feat-img">
                    {polecany.coverImage?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={polecany.coverImage.url} alt={polecany.coverImage.alt || ''} />
                    ) : (
                      <div className="bg-pat" aria-hidden="true" />
                    )}
                  </div>
                  <div className="c-feat-txt">
                    <span className="c-tag">Najnowszy wpis</span>
                    <h2>{polecany.title}</h2>
                    {polecany.excerpt ? <p>{polecany.excerpt}</p> : null}
                    <Meta p={polecany} />
                    <span className="c-more">Czytaj →</span>
                  </div>
                </Link>
              ) : null}

              {kategorie.length > 1 ? (
                <nav className="c-filter" aria-label="Kategorie wpisów">
                  <Link href="/blog" aria-current={wybrana ? undefined : 'page'}>
                    Wszystkie <span>{posts.length}</span>
                  </Link>
                  {kategorie.map(([k, n]) => (
                    <Link key={k} href={`/blog?kategoria=${encodeURIComponent(k)}`} aria-current={k === wybrana ? 'page' : undefined}>
                      {k} <span>{n}</span>
                    </Link>
                  ))}
                </nav>
              ) : null}

              {reszta.length > 0 ? (
                <>
                  <h2 className="c-sr">{wybrana ? `Wpisy: ${wybrana}` : 'Pozostałe wpisy'}</h2>
                  <div className="blog-grid" style={{ marginTop: polecany && kategorie.length <= 1 ? 22 : 0 }}>
                    {reszta.map((p) => (
                      <Link className="bcard" href={`/blog/${p.slug}`} key={p.id}>
                        <div className="thumb">
                          {p.coverImage?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.coverImage.url} alt={p.coverImage.alt || ''} />
                          ) : (
                            <div className="bg-pat" aria-hidden="true" />
                          )}
                        </div>
                        <div className="body">
                          <Meta p={p} />
                          <h3>{p.title}</h3>
                          {p.excerpt ? <p>{p.excerpt}</p> : <p />}
                          <span className="go">Czytaj →</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="b-przeprowadzka">
        <div className="wrap">
          <SectionHead
            id="b-przeprowadzka"
            title="Przenosisz stronę? Zrobimy to za Ciebie"
            lead="Przeniesienie strony, baz danych i poczty jest w cenie hostingu. Możesz też zrobić to sam migratorem w panelu."
          />
          <div className="c-guides">
            {PORADNIKI.map(([t, p]) => (
              <Link className="c-fcard" href="/przenies-strone" key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
                <span className="c-more">Przeprowadzka →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTABand
        title="Masz pytanie, na które nie ma tu wpisu?"
        text="Napisz do nas — odpowiadamy zwykle w ciągu dnia roboczego. Hosting Verris: 45 zł/mies albo 449 zł/rok brutto, ta sama cena przy odnowieniu."
        secondary={{ label: 'Napisz do nas', href: '/kontakt' }}
      />
    </main>
  );
}
