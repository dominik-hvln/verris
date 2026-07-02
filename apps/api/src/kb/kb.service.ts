import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * KB-CMS — Baza Wiedzy. Serwis danych: kategorie/podkategorie + artykuły
 * (Markdown, status DRAFT/PUBLISHED, pola SEO). Publiczny widok (pomoc.verris.pl)
 * czyta tylko PUBLISHED. Autoring: admin/staff wg uprawnień (kontroler).
 *
 * Uwaga: generated Prisma client regeneruje się w prod (Dockerfile.api); w
 * sandboxie modele KbCategory/KbArticle jeszcze nie istnieją na typie, więc
 * używamy typed-delegate castów (wzorzec repo).
 */

type KbCategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  parentId: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

type KbArticleRow = {
  id: string;
  slug: string;
  categoryId: string;
  title: string;
  excerpt: string | null;
  bodyMarkdown: string;
  status: 'DRAFT' | 'PUBLISHED';
  seoTitle: string | null;
  seoDescription: string | null;
  authorUserId: string | null;
  authorName: string | null;
  order: number;
  views: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

interface Delegate<Row> {
  findMany(args?: unknown): Promise<Row[]>;
  findUnique(args: unknown): Promise<Row | null>;
  findFirst(args: unknown): Promise<Row | null>;
  create(args: unknown): Promise<Row>;
  update(args: unknown): Promise<Row>;
  delete(args: unknown): Promise<Row>;
  count(args?: unknown): Promise<number>;
}

export interface UpsertCategoryInput {
  name: string;
  slug?: string;
  description?: string | null;
  icon?: string | null;
  parentId?: string | null;
  order?: number;
}

export interface UpsertArticleInput {
  title: string;
  slug?: string;
  categoryId: string;
  excerpt?: string | null;
  bodyMarkdown: string;
  status?: 'DRAFT' | 'PUBLISHED';
  seoTitle?: string | null;
  seoDescription?: string | null;
  order?: number;
}

@Injectable()
export class KbService {
  constructor(private readonly prisma: PrismaService) {}

  private get categories(): Delegate<KbCategoryRow> {
    return (this.prisma as unknown as { kbCategory: Delegate<KbCategoryRow> }).kbCategory;
  }
  private get articles(): Delegate<KbArticleRow> {
    return (this.prisma as unknown as { kbArticle: Delegate<KbArticleRow> }).kbArticle;
  }

  // --------------------------------------------------------------- slug
  static slugify(input: string): string {
    const map: Record<string, string> = {
      ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
    };
    return input
      .toLowerCase()
      .replace(/[ąćęłńóśźż]/g, (c) => map[c] ?? c)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'wpis';
  }

  private async uniqueSlug(base: string, kind: 'category' | 'article', ignoreId?: string): Promise<string> {
    const del = kind === 'category' ? this.categories : this.articles;
    let slug = base;
    let i = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const found = await del.findUnique({ where: { slug } });
      if (!found || found.id === ignoreId) return slug;
      slug = `${base}-${i++}`;
    }
  }

  // --------------------------------------------------------------- categories
  async listCategories(): Promise<KbCategoryRow[]> {
    return this.categories.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] });
  }

  async createCategory(input: UpsertCategoryInput): Promise<KbCategoryRow> {
    if (!input.name?.trim()) throw new BadRequestException('Nazwa kategorii jest wymagana.');
    const slug = await this.uniqueSlug(KbService.slugify(input.slug || input.name), 'category');
    return this.categories.create({
      data: {
        slug,
        name: input.name.trim(),
        description: input.description ?? null,
        icon: input.icon ?? null,
        parentId: input.parentId ?? null,
        order: input.order ?? 0,
      },
    });
  }

  async updateCategory(id: string, input: Partial<UpsertCategoryInput>): Promise<KbCategoryRow> {
    const existing = await this.categories.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kategoria nie istnieje.');
    if (input.parentId && input.parentId === id) {
      throw new BadRequestException('Kategoria nie może być swoim rodzicem.');
    }
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description;
    if (input.icon !== undefined) data.icon = input.icon;
    if (input.parentId !== undefined) data.parentId = input.parentId;
    if (input.order !== undefined) data.order = input.order;
    if (input.slug !== undefined) {
      data.slug = await this.uniqueSlug(KbService.slugify(input.slug), 'category', id);
    }
    return this.categories.update({ where: { id }, data });
  }

  async deleteCategory(id: string): Promise<{ ok: true }> {
    const articleCount = await this.articles.count({ where: { categoryId: id } });
    if (articleCount > 0) {
      throw new BadRequestException('Kategoria zawiera artykuły — przenieś lub usuń je najpierw.');
    }
    const childCount = await this.categories.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BadRequestException('Kategoria ma podkategorie — usuń je najpierw.');
    }
    await this.categories.delete({ where: { id } });
    return { ok: true };
  }

  // --------------------------------------------------------------- articles (admin)
  async listArticles(filters: { categoryId?: string; status?: 'DRAFT' | 'PUBLISHED'; q?: string } = {}): Promise<KbArticleRow[]> {
    const where: Record<string, unknown> = {};
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.status) where.status = filters.status;
    if (filters.q) where.title = { contains: filters.q, mode: 'insensitive' };
    return this.articles.findMany({ where, orderBy: [{ updatedAt: 'desc' }] });
  }

  async getArticle(id: string): Promise<KbArticleRow> {
    const a = await this.articles.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Artykuł nie istnieje.');
    return a;
  }

  async createArticle(input: UpsertArticleInput, author: { userId: string; name: string | null }): Promise<KbArticleRow> {
    if (!input.title?.trim()) throw new BadRequestException('Tytuł jest wymagany.');
    if (!input.categoryId) throw new BadRequestException('Kategoria jest wymagana.');
    const cat = await this.categories.findUnique({ where: { id: input.categoryId } });
    if (!cat) throw new BadRequestException('Wybrana kategoria nie istnieje.');
    const slug = await this.uniqueSlug(KbService.slugify(input.slug || input.title), 'article');
    const status = input.status ?? 'DRAFT';
    return this.articles.create({
      data: {
        slug,
        categoryId: input.categoryId,
        title: input.title.trim(),
        excerpt: input.excerpt ?? null,
        bodyMarkdown: input.bodyMarkdown ?? '',
        status,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        authorUserId: author.userId,
        authorName: author.name,
        order: input.order ?? 0,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
      },
    });
  }

  async updateArticle(id: string, input: Partial<UpsertArticleInput>): Promise<KbArticleRow> {
    const existing = await this.getArticle(id);
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.categoryId !== undefined) data.categoryId = input.categoryId;
    if (input.excerpt !== undefined) data.excerpt = input.excerpt;
    if (input.bodyMarkdown !== undefined) data.bodyMarkdown = input.bodyMarkdown;
    if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;
    if (input.order !== undefined) data.order = input.order;
    if (input.slug !== undefined) data.slug = await this.uniqueSlug(KbService.slugify(input.slug), 'article', id);
    if (input.status !== undefined && input.status !== existing.status) {
      data.status = input.status;
      data.publishedAt = input.status === 'PUBLISHED' ? (existing.publishedAt ?? new Date()) : null;
    }
    return this.articles.update({ where: { id }, data });
  }

  async deleteArticle(id: string): Promise<{ ok: true }> {
    await this.articles.delete({ where: { id } });
    return { ok: true };
  }

  // --------------------------------------------------------------- public reads
  async publicTree(): Promise<Array<KbCategoryRow & { articles: Array<Pick<KbArticleRow, 'slug' | 'title' | 'excerpt'>> }>> {
    const [cats, arts] = await Promise.all([
      this.categories.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
      this.articles.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: [{ order: 'asc' }, { title: 'asc' }],
      }),
    ]);
    return cats.map((c) => ({
      ...c,
      articles: arts
        .filter((a) => a.categoryId === c.id)
        .map((a) => ({ slug: a.slug, title: a.title, excerpt: a.excerpt })),
    }));
  }

  async publicArticleBySlug(slug: string): Promise<{ article: KbArticleRow; category: KbCategoryRow } | null> {
    const a = await this.articles.findFirst({ where: { slug, status: 'PUBLISHED' } });
    if (!a) return null;
    const category = await this.categories.findUnique({ where: { id: a.categoryId } });
    return { article: a, category: category as KbCategoryRow };
  }

  async incrementViews(id: string): Promise<void> {
    try {
      await this.articles.update({ where: { id }, data: { views: { increment: 1 } } });
    } catch {
      /* best-effort */
    }
  }

  async publishedSlugs(): Promise<Array<{ slug: string; updatedAt: Date }>> {
    const arts = await this.articles.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return arts.map((a) => ({ slug: a.slug, updatedAt: a.updatedAt }));
  }
}
