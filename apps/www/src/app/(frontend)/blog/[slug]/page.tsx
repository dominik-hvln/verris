import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RichText } from '@payloadcms/richtext-lexical/react';
import { Breadcrumbs, CTABand, JsonLd } from '../../components/ui';
import { RevealInit } from '../../components/RevealInit';
import { getPayloadClient } from '@/lib/payload';
import { articleSchema, faqSchema } from '@/lib/schema';

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
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 1,
    });
    return (res.docs[0] as unknown as Post) ?? null;
  } catch (err) {
    console.error(`[blog] Nie udało się pobrać wpisu "${slug}":`, err);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.seo?.title || `${post.title} | Blog Verris`,
    description: post.seo?.description || post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const faq = faqPairs(post.faq);

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
            <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }, { label: post.title }]} />
            <h1 style={{ marginTop: 18 }}>{post.title}</h1>
            <div className="post-byline">
              {post.cluster ? <span className="chip">{post.cluster}</span> : null}
              {post.author ? <span>{post.author}</span> : null}
              {post.publishedAt ? (
                <time dateTime={post.publishedAt}>
                  {new Date(post.publishedAt).toLocaleDateString('pl-PL', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </time>
              ) : null}
              {post.updatedAt && post.updatedAt.slice(0, 10) !== post.publishedAt?.slice(0, 10) ? (
                <span>
                  · akt.{' '}
                  <time dateTime={post.updatedAt}>
                    {new Date(post.updatedAt).toLocaleDateString('pl-PL', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </time>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      <section>
        <div className="wrap">
          <article className="article prose rv">
            {post.coverImage?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="article-cover"
                src={post.coverImage.url}
                alt={post.coverImage.alt || post.title}
              />
            ) : null}
            {post.content ? (
              <RichText data={post.content as never} />
            ) : (
              <p>{post.excerpt}</p>
            )}
          </article>
        </div>
      </section>
      <CTABand
        title="Hosting bez gwiazdek"
        text="Przenieś stronę do Verris za 0 zł i płać za realne użycie zasobów."
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
      <RevealInit />
    </main>
  );
}
