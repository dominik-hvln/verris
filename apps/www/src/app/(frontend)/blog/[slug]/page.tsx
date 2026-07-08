import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RichText } from '@payloadcms/richtext-lexical/react';
import { Breadcrumbs, CTABand } from '../../components/ui';
import { RevealInit } from '../../components/RevealInit';
import { getPayloadClient } from '@/lib/payload';

export const dynamic = 'force-dynamic';

type Post = {
  title: string;
  slug: string;
  excerpt?: string;
  publishedAt?: string;
  content?: unknown;
  coverImage?: { url?: string; alt?: string } | null;
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
  } catch {
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

  return (
    <main>
      <section className="subhero">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap">
          <div className="subhero-inner">
            <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }, { label: post.title }]} />
            <h1 style={{ marginTop: 18 }}>{post.title}</h1>
            {post.publishedAt ? (
              <p className="meta" style={{ marginTop: 12 }}>
                {new Date(post.publishedAt).toLocaleDateString('pl-PL', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            ) : null}
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
