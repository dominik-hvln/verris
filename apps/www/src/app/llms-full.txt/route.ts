import { getPayloadClient } from '@/lib/payload';
import { lexicalToText } from '@/lib/lexical-text';

/**
 * /llms-full.txt — pełny tekst poradników dla agentów AI (llmstxt.org).
 * Generowany z kolekcji Posts, więc nowe wpisy trafiają tu automatycznie. ISR co godzinę.
 */
export const revalidate = 3600;

const BASE = 'https://verris.pl';

type Post = {
  title: string;
  slug: string;
  excerpt?: string;
  cluster?: string;
  publishedAt?: string;
  updatedAt?: string;
  content?: unknown;
};

export async function GET() {
  let posts: Post[] = [];
  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: 'posts',
      limit: 200,
      depth: 0,
      sort: '-publishedAt',
    });
    posts = res.docs as unknown as Post[];
  } catch {
    posts = [];
  }

  const head = `# Verris — pełny tekst poradników

Źródło: ${BASE}/blog · Kontekst marki: ${BASE}/llms.txt · Cennik: ${BASE}/pricing.md
Ceny brutto (PLN). SLA 99,5% z rekompensatami. Wygenerowano: ${new Date().toISOString().slice(0, 10)}.

`;

  const body = posts
    .map((p) => {
      const text = lexicalToText(p.content);
      const meta = [
        p.cluster ? `Klaster: ${p.cluster}` : null,
        p.updatedAt ? `Aktualizacja: ${p.updatedAt.slice(0, 10)}` : null,
        `URL: ${BASE}/blog/${p.slug}`,
      ]
        .filter(Boolean)
        .join(' · ');

      return `---

# ${p.title}

${meta}

${p.excerpt ? `${p.excerpt}\n` : ''}
${text || '(treść dostępna na stronie)'}
`;
    })
    .join('\n');

  const out = posts.length
    ? head + body
    : head + '(Brak opublikowanych wpisów. Zobacz ' + BASE + '/blog)\n';

  return new Response(out, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
