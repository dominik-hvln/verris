import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Accordion, Breadcrumbs, Button, CTABand, JsonLd, SectionHead } from '../../components/ui';
import { TrescWpisu } from '../../components/TrescWpisu';
import { getPayloadClient } from '@/lib/payload';
import { articleSchema, faqSchema } from '@/lib/schema';
import { czasCzytania, dataPL, przytnij, spisTresci, wSkrocie } from '@/lib/blog';
import { OPUBLIKOWANE } from '@/collections/tylko-opublikowane';

/*
 * Szablon wpisu — makieta 14.10 (BlogWpis.dc.html): „W skrócie” (gdy treść zaczyna się od nagłówka „W skrócie”
 * i listy), spis treści z nagłówków H2 treści, autor z pola `author`, FAQ z pola `faq`, Article (BlogPosting)
 * + BreadcrumbList + FAQPage. Bez zmian schematu kolekcji `posts` i bez migracji bazy.
 */

type FaqItem = { q?: string; a?: string; question?: string; answer?: string };

/** Zamienia pole `faq` (json) na pary [pytanie, odpowiedź] dla schema FAQPage. */
function faqPairs(raw: unknown): [string, string][] {
  if (!Array.isArray(raw)) return [];
  return (raw as FaqItem[])
    .map((i) => [i.q ?? i.question ?? '', i.a ?? i.answer ?? ''] as [string, string])
    .filter(([q, a]) => q.trim() !== '' && a.trim() !== '');
}

export const dynamic = 'force-dynamic';

type Post = {
  id?: string | number;
  title: string;
  slug: string;
  excerpt?: string;
  publishedAt?: string;
  content?: unknown;
  coverImage?: { url?: string; alt?: string } | null;
  author?: string;
  cluster?: string;
  faq?: unknown;
  updatedAt?: string;
  seo?: { title?: string; description?: string };
};

async function getPost(slug: string): Promise<Post | null> {
  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: 'posts',
      where: { and: [{ slug: { equals: slug } }, OPUBLIKOWANE] },
      limit: 1,
      depth: 1,
    });
    return (res.docs[0] as unknown as Post) ?? null;
  } catch (err) {
    console.error(`[blog] Nie udało się pobrać wpisu "${slug}":`, err);
    return null;
  }
}

/** Do 3 innych opublikowanych wpisów — najpierw z tej samej kategorii (`cluster`). */
async function getPowiazane(post: Post): Promise<Post[]> {
  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: 'posts',
      where: { and: [{ slug: { not_equals: post.slug } }, OPUBLIKOWANE] },
      sort: '-publishedAt',
      limit: 30,
      depth: 0,
    });
    const inne = res.docs as unknown as Post[];
    const ta = inne.filter((p) => post.cluster && p.cluster === post.cluster);
    return [...ta, ...inne.filter((p) => !ta.includes(p))].slice(0, 3);
  } catch (err) {
    console.error('[blog] Nie udało się pobrać powiązanych wpisów:', err);
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  const zMarka = `${post.title} | Verris`;
  return {
    title: post.seo?.title || (zMarka.length <= 60 ? zMarka : post.title),
    description: przytnij(post.seo?.description || post.excerpt),
    alternates: { canonical: `/blog/${slug}` },
  };
}

function inicjaly(imie: string): string {
  return imie
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const faq = faqPairs(post.faq);
  const { punkty, tresc } = wSkrocie(post.content);
  const spis = spisTresci(tresc);
  const min = czasCzytania(post.content);
  const powiazane = await getPowiazane(post);
  const zaktualizowano =
    post.updatedAt && post.updatedAt.slice(0, 10) !== post.publishedAt?.slice(0, 10) ? post.updatedAt : null;

  const okruszki = [
    { label: 'Blog', href: '/blog' },
    ...(post.cluster ? [{ label: post.cluster, href: `/blog?kategoria=${encodeURIComponent(post.cluster)}` }] : []),
    { label: post.title },
  ];

  return (
    <main>
      {faq.length > 0 ? <JsonLd data={faqSchema(faq)} /> : null}
      <JsonLd
        data={articleSchema({
          title: post.title,
          slug: post.slug,
          description: post.seo?.description || post.excerpt,
          image: post.coverImage?.url,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
          author: post.author,
        })}
      />
      <section className="subhero post-hero">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap">
          <div className="subhero-inner">
            <Breadcrumbs items={okruszki} />
            {post.cluster || min ? (
              <p className="c-meta" style={{ marginTop: 18 }}>
                {[post.cluster, min ? `${min} min czytania` : null].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            <h1 style={{ marginTop: 12 }}>{post.title}</h1>
            {post.excerpt ? <p className="lead">{post.excerpt}</p> : null}
            <div className="post-byline">
              {post.author ? <span>{post.author}</span> : null}
              {post.publishedAt ? (
                <span>
                  opublikowano <time dateTime={post.publishedAt}>{dataPL(post.publishedAt)}</time>
                </span>
              ) : null}
              {zaktualizowano ? (
                <span>
                  zaktualizowano <time dateTime={zaktualizowano}>{dataPL(zaktualizowano)}</time>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap c-post">
          <article className="article prose">
            {punkty.length > 0 ? (
              <div className="c-tldr">
                <h2>W skrócie</h2>
                <ul>
                  {punkty.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {post.coverImage?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="article-cover" src={post.coverImage.url} alt={post.coverImage.alt || ''} />
            ) : null}
            {tresc ? <TrescWpisu data={tresc} /> : <p>{post.excerpt}</p>}
            {post.author ? (
              <div className="c-author">
                <span className="c-author-av" aria-hidden="true">
                  {inicjaly(post.author)}
                </span>
                <span>
                  <b>{post.author}</b>
                  <span>Autor wpisu · zespół Verris</span>
                </span>
              </div>
            ) : null}
          </article>
          <aside aria-label="Na marginesie">
            <div className="c-toc">
              {spis.length > 1 ? (
                <nav aria-labelledby="w-spis">
                  <h2 id="w-spis">W tym tekście</h2>
                  <ol>
                    {spis.map((n) => (
                      <li key={n.id}>
                        <a href={`#${n.id}`}>{n.tekst}</a>
                      </li>
                    ))}
                  </ol>
                </nav>
              ) : null}
              <Button href="/hosting#kalkulator" variant="ghost" cta="blog-kalkulator" className="btn-block btn-sm">
                Policz koszt autoskalowania
              </Button>
            </div>
          </aside>
        </div>
      </section>

      {faq.length > 0 ? (
        <section className="sec sec-alt" aria-labelledby="w-faq">
          <div className="wrap c-narrow">
            <SectionHead id="w-faq" title="Pytania czytelników" />
            <Accordion items={faq.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          </div>
        </section>
      ) : null}

      {powiazane.length > 0 ? (
        <section className="sec" aria-labelledby="w-dalej">
          <div className="wrap">
            <SectionHead id="w-dalej" title="Czytaj dalej" />
            <div className="grid3">
              {powiazane.map((p) => (
                <Link className="c-fcard" href={`/blog/${p.slug}`} key={p.slug}>
                  {p.cluster ? <span className="c-tag">{p.cluster}</span> : null}
                  <h3>{p.title}</h3>
                  {p.excerpt ? <p>{p.excerpt}</p> : <p />}
                  <span className="c-more">Czytaj →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <CTABand
        title="Hosting bez niespodzianek przy odnowieniu"
        text="45 zł miesięcznie albo 449 zł za rok brutto — przy odnowieniu tyle samo, a przeprowadzkę robimy za Ciebie."
        secondary={{ label: 'Przeniesienie strony', href: '/przenies-strone' }}
      />
    </main>
  );
}
