import type { Metadata } from 'next';
import { SubHero } from '../components/ui';
import { RevealInit } from '../components/RevealInit';
import { getPayloadClient } from '@/lib/payload';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Blog Verris — hosting, migracja, WordPress, koszty',
  description:
    'Praktyczne poradniki o hostingu: jak przenieść stronę bez przestoju, ile realnie kosztuje hosting z autoskalowaniem, jak zabezpieczyć WordPressa i wybrać domenę.',
  alternates: { canonical: '/blog' },
};

type Post = {
  id: string | number;
  title: string;
  slug: string;
  excerpt?: string;
  publishedAt?: string;
  coverImage?: { url?: string; alt?: string } | null;
};

async function getPosts(): Promise<Post[]> {
  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: 'posts',
      sort: '-publishedAt',
      limit: 24,
      depth: 1,
    });
    return res.docs as unknown as Post[];
  } catch {
    return [];
  }
}

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <main>
      <SubHero
        eyebrow="Blog"
        title="Wiedza o hostingu bez ściemy"
        lead="Poradniki o migracji, kosztach hostingu, WordPressie i domenach — pisane prostym językiem, z konkretami zamiast marketingowej waty."
        crumbs={[{ label: 'Blog' }]}
      />
      <section>
        <div className="wrap">
          {posts.length === 0 ? (
            <div className="empty rv">
              <p>Pierwsze wpisy pojawią się wkrótce. Zapraszamy niebawem.</p>
            </div>
          ) : (
            <div className="blog-grid">
              {posts.map((p) => (
                <a className="bcard rv" href={`/blog/${p.slug}`} key={p.id}>
                  <div className="thumb">
                    {p.coverImage?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.coverImage.url} alt={p.coverImage.alt || p.title} />
                    ) : (
                      <div className="bg-pat" aria-hidden="true" />
                    )}
                  </div>
                  <div className="body">
                    {p.publishedAt ? (
                      <time dateTime={p.publishedAt}>
                        {new Date(p.publishedAt).toLocaleDateString('pl-PL', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </time>
                    ) : null}
                    <h3>{p.title}</h3>
                    {p.excerpt ? <p>{p.excerpt}</p> : <p />}
                    <span className="go">Czytaj →</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>
      <RevealInit />
    </main>
  );
}
