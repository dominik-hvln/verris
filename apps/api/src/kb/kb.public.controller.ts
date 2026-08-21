import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { KbService } from './kb.service';
import { renderMarkdown, renderPublicPage, escapeHtml, renderFaq, renderRelated, renderReadingTime } from './kb-render';

/**
 * KB-PUBLIC — publiczny, indeksowalny widok Bazy Wiedzy (SSR + SEO).
 * Serwowany pod pomoc.verris.pl (Caddy: rewrite /* → /kb/*). Tylko PUBLISHED.
 */
@Controller('kb')
export class KbPublicController {
  constructor(private readonly kb: KbService) {}

  private base(): string {
    return (process.env.KB_PUBLIC_URL || 'https://pomoc.verris.pl').replace(/\/$/, '');
  }

  private html(res: Response, body: string, status = 200): void {
    res.status(status);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.end(body);
  }

  // ---- index (drzewo kategorii najwyższego poziomu)
  @Get()
  async index(@Res() res: Response): Promise<void> {
    const base = this.base();
    const tree = await this.kb.publicTree();
    const top = tree.filter((c) => !c.parentId);
    const cards = top
      .map((c) => {
        const childArticles =
          c.articles.length + tree.filter((x) => x.parentId === c.id).reduce((n, x) => n + x.articles.length, 0);
        return `<a class="cat" href="${base}/c/${escapeHtml(c.slug)}">
          <h3>${escapeHtml(c.name)}</h3>
          <p>${escapeHtml(c.description ?? '')}</p>
          <span class="n">${childArticles} artykuł(ów) →</span>
        </a>`;
      })
      .join('');
    const body = `<h1>Baza wiedzy Verris</h1>
      <p class="lead">Poradniki i odpowiedzi: hosting, domeny, poczta, DNS, SSL, WordPress, bezpieczeństwo i rozliczenia.</p>
      <div class="cats">${cards || '<p>Wkrótce pojawią się pierwsze artykuły.</p>'}</div>`;
    this.html(
      res,
      renderPublicPage({
        title: 'Baza wiedzy Verris — pomoc hostingu, domen i poczty',
        description: 'Poradniki Verris: hosting, domeny, poczta, DNS, SSL, WordPress, bezpieczeństwo, rozliczenia. Szybkie odpowiedzi i instrukcje krok po kroku.',
        canonical: base + '/',
        baseUrl: base,
        breadcrumbs: [{ label: 'Baza wiedzy' }],
        bodyHtml: body,
        cta: await this.kb.getCtaConfig(),
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Verris — Baza wiedzy',
          url: base + '/',
        },
      }),
    );
  }

  // ---- kategoria
  @Get('c/:slug')
  async category(@Param('slug') slug: string, @Res() res: Response): Promise<void> {
    const base = this.base();
    const tree = await this.kb.publicTree();
    const cat = tree.find((c) => c.slug === slug);
    if (!cat) {
      this.html(res, this.notFound(base), 404);
      return;
    }
    const children = tree.filter((c) => c.parentId === cat.id);
    const listArts = (arts: typeof cat.articles) =>
      `<ul class="arts">${arts
        .map((a) => `<li><a href="${base}/a/${escapeHtml(a.slug)}">${escapeHtml(a.title)}${a.excerpt ? `<span>${escapeHtml(a.excerpt)}</span>` : ''}</a></li>`)
        .join('')}</ul>`;
    const childBlocks = children
      .map((ch) => `<h2>${escapeHtml(ch.name)}</h2>${ch.articles.length ? listArts(ch.articles) : '<p>Brak artykułów.</p>'}`)
      .join('');
    const body = `<h1>${escapeHtml(cat.name)}</h1>
      ${cat.description ? `<p class="lead">${escapeHtml(cat.description)}</p>` : ''}
      ${cat.articles.length ? listArts(cat.articles) : (children.length ? '' : '<p>Wkrótce pojawią się artykuły.</p>')}
      ${childBlocks}`;
    this.html(
      res,
      renderPublicPage({
        title: `${cat.name} — Baza wiedzy Verris`,
        description: cat.description ?? `${cat.name} — poradniki i instrukcje Verris.`,
        canonical: `${base}/c/${cat.slug}`,
        baseUrl: base,
        breadcrumbs: [{ label: 'Baza wiedzy', url: base + '/' }, { label: cat.name }],
        bodyHtml: body,
        cta: await this.kb.getCtaConfig(),
      }),
    );
  }

  // ---- artykuł
  @Get('a/:slug')
  async article(@Param('slug') slug: string, @Res() res: Response): Promise<void> {
    const base = this.base();
    const found = await this.kb.publicArticleBySlug(slug);
    if (!found) {
      this.html(res, this.notFound(base), 404);
      return;
    }
    const { article, category } = found;
    void this.kb.incrementViews(article.id);

    const readingMin = this.kb.readingTimeMin(article.bodyMarkdown);
    const faq = this.kb.parseFaq(article.faq);
    const related = await this.kb.getRelated(article);

    const bodyHtml = `<h1>${escapeHtml(article.title)}</h1>
      ${article.excerpt ? `<p class="lead">${escapeHtml(article.excerpt)}</p>` : ''}
      <p style="margin:0 0 14px;">${renderReadingTime(readingMin)}</p>
      <div class="card">${renderMarkdown(article.bodyMarkdown)}</div>
      ${renderFaq(faq)}
      ${renderRelated(base, related)}`;
    const desc = article.seoDescription || article.excerpt || `${article.title} — Baza wiedzy Verris.`;
    const published = (article.publishedAt ?? article.createdAt)?.toISOString?.();
    const modified = article.updatedAt?.toISOString?.();

    // JSON-LD @graph: Article + BreadcrumbList (+ FAQPage gdy są pytania).
    const graph: object[] = [
      {
        '@type': 'Article',
        headline: article.title,
        description: desc,
        author: { '@type': 'Organization', name: 'Verris' },
        publisher: { '@type': 'Organization', name: 'Verris' },
        datePublished: published,
        dateModified: modified,
        mainEntityOfPage: `${base}/a/${article.slug}`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Baza wiedzy', item: base + '/' },
          ...(category ? [{ '@type': 'ListItem', position: 2, name: category.name, item: `${base}/c/${category.slug}` }] : []),
          { '@type': 'ListItem', position: category ? 3 : 2, name: article.title, item: `${base}/a/${article.slug}` },
        ],
      },
    ];
    if (faq.length) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      });
    }

    this.html(
      res,
      renderPublicPage({
        title: (article.seoTitle || article.title) + ' — Verris',
        description: desc,
        canonical: `${base}/a/${article.slug}`,
        baseUrl: base,
        updatedAt: article.updatedAt,
        breadcrumbs: [
          { label: 'Baza wiedzy', url: base + '/' },
          ...(category ? [{ label: category.name, url: `${base}/c/${category.slug}` }] : []),
          { label: article.title },
        ],
        bodyHtml,
        cta: await this.kb.getCtaConfig(),
        jsonLd: { '@context': 'https://schema.org', '@graph': graph },
      }),
    );
  }

  // ---- sitemap.xml
  @Get('sitemap.xml')
  async sitemap(@Res() res: Response): Promise<void> {
    const base = this.base();
    const [tree, slugs] = await Promise.all([this.kb.publicTree(), this.kb.publishedSlugs()]);
    const urls: string[] = [`<url><loc>${base}/</loc></url>`];
    for (const c of tree) urls.push(`<url><loc>${base}/c/${escapeHtml(c.slug)}</loc></url>`);
    for (const a of slugs) {
      urls.push(`<url><loc>${base}/a/${escapeHtml(a.slug)}</loc><lastmod>${a.updatedAt.toISOString().slice(0, 10)}</lastmod></url>`);
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  }

  // ---- robots.txt
  @Get('robots.txt')
  robots(@Res() res: Response): void {
    const base = this.base();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
  }

  // ---- llms.txt (standard dla crawlerów/AI) — spis bazy wiedzy
  @Get('llms.txt')
  async llms(@Res() res: Response): Promise<void> {
    const base = this.base();
    const arts = await this.kb.llmsData();
    const lines = [
      '# Verris — Baza wiedzy',
      '',
      '> Hosting nowej generacji (Polska): hosting, domeny, poczta, DNS, SSL, WordPress, bezpieczeństwo, rozliczenia, migracja od konkurencji. Poradniki i FAQ.',
      '',
      '## Artykuły',
      ...arts.map((a) => `- [${a.title}](${base}/a/${a.slug})${a.excerpt ? `: ${a.excerpt}` : ''}`),
      '',
      '## Zasoby',
      `- Panel klienta: https://panel.verris.pl`,
      `- Status usług: https://status.verris.pl`,
      `- Sitemap: ${base}/sitemap.xml`,
    ];
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(lines.join('\n'));
  }

  // ---- JSON (reużycie w panelach klienta/staff)
  @Get('api/tree')
  apiTree() {
    return this.kb.publicTree();
  }

  @Get('api/article/:slug')
  async apiArticle(@Param('slug') slug: string) {
    const found = await this.kb.publicArticleBySlug(slug);
    if (!found) return null;
    const related = await this.kb.getRelated(found.article);
    return {
      slug: found.article.slug,
      title: found.article.title,
      excerpt: found.article.excerpt,
      bodyMarkdown: found.article.bodyMarkdown,
      updatedAt: found.article.updatedAt,
      categoryName: found.category?.name ?? null,
      categorySlug: found.category?.slug ?? null,
      readingMin: this.kb.readingTimeMin(found.article.bodyMarkdown),
      faq: this.kb.parseFaq(found.article.faq),
      related,
    };
  }

  @Get('api/cta')
  cta() {
    return this.kb.getCtaConfig();
  }

  private notFound(base: string): string {
    return renderPublicPage({
      title: 'Nie znaleziono — Baza wiedzy Verris',
      description: 'Nie znaleziono strony.',
      canonical: base + '/',
      baseUrl: base,
      breadcrumbs: [{ label: 'Baza wiedzy', url: base + '/' }, { label: 'Nie znaleziono' }],
      bodyHtml: '<h1>Nie znaleziono</h1><p class="lead">Ten artykuł nie istnieje lub nie jest jeszcze opublikowany.</p>',
    });
  }
}
