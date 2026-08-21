import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SubHero, CTABand } from '../../components/ui';
import { RevealInit } from '../../components/RevealInit';
import { features, featureBySlug } from '@/lib/features';

export function generateStaticParams() {
  return features.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const f = featureBySlug(slug);
  if (!f) return {};
  return {
    title: f.metaTitle,
    description: f.metaDescription,
    alternates: { canonical: `/funkcje/${f.slug}` },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = featureBySlug(slug);
  if (!f) notFound();

  return (
    <main>
      <SubHero
        eyebrow={f.eyebrow}
        title={f.title}
        lead={f.lead}
        crumbs={[{ label: 'Funkcje', href: '/funkcje' }, { label: f.title }]}
      />
      <section>
        <div className="wrap">
          <div className="prose rv">
            {f.sections.map((s, i) => (
              <div key={i}>
                {s.h ? <h2>{s.h}</h2> : null}
                {s.p?.map((p, j) => <p key={j}>{p}</p>)}
                {s.ul ? (
                  <ul>
                    {s.ul.map((li, j) => (
                      <li key={j}>{li}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
      <CTABand
        title={f.cta.title}
        text={f.cta.text}
        primaryLabel={f.cta.primaryLabel}
        primaryHref={f.cta.primaryHref}
        secondary={f.cta.secondary}
      />
      <RevealInit />
    </main>
  );
}
