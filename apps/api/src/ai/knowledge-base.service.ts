import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiKnowledgeAudience, AiKnowledgeStatus, Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AiProviderService } from './ai-provider.service';

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 150;
const MAX_DOC_CHARS = 200_000;

export interface RetrievedChunk {
  docId: string;
  title: string;
  content: string;
  score: number;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async listDocs(filter?: { audience?: AiKnowledgeAudience; status?: AiKnowledgeStatus }) {
    const docs = await this.prisma.aiKnowledgeDoc.findMany({
      where: {
        audience: filter?.audience,
        status: filter?.status,
      },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { chunks: true } }, createdBy: { select: { email: true } } },
      take: 500,
    });
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      sourceType: d.sourceType,
      sourceRef: d.sourceRef,
      audience: d.audience,
      status: d.status,
      charCount: d.charCount,
      chunkCount: d._count.chunks,
      createdByEmail: d.createdBy?.email ?? null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));
  }

  /** Client-facing: lista aktywnych artykułów widocznych dla klienta (CLIENT/ALL). */
  async listClientDocs(): Promise<Array<{ id: string; title: string; updatedAt: string }>> {
    const docs = await this.prisma.aiKnowledgeDoc.findMany({
      where: {
        status: AiKnowledgeStatus.ACTIVE,
        audience: { in: [AiKnowledgeAudience.CLIENT, AiKnowledgeAudience.ALL] },
      },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, updatedAt: true },
      take: 500,
    });
    return docs.map((d) => ({ id: d.id, title: d.title, updatedAt: d.updatedAt.toISOString() }));
  }

  /** Client-facing: pojedynczy artykuł — tylko jeśli widoczny dla klienta. */
  async getClientDoc(id: string) {
    const doc = await this.getDoc(id);
    if (
      doc.status !== AiKnowledgeStatus.ACTIVE ||
      (doc.audience !== AiKnowledgeAudience.CLIENT && doc.audience !== AiKnowledgeAudience.ALL)
    ) {
      throw new NotFoundException('Artykuł nie istnieje.');
    }
    return { id: doc.id, title: doc.title, content: doc.content, updatedAt: doc.updatedAt };
  }

  async getDoc(id: string) {
    const doc = await this.prisma.aiKnowledgeDoc.findUnique({
      where: { id },
      include: { chunks: { orderBy: { ordinal: 'asc' } } },
    });
    if (!doc) throw new NotFoundException('Dokument nie istnieje.');
    return {
      id: doc.id,
      title: doc.title,
      sourceType: doc.sourceType,
      sourceRef: doc.sourceRef,
      audience: doc.audience,
      status: doc.status,
      charCount: doc.charCount,
      content: doc.chunks.map((c) => c.content).join('\n\n'),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  async createDoc(
    input: {
      title: string;
      content: string;
      audience?: AiKnowledgeAudience;
      sourceType?: string;
      sourceRef?: string | null;
    },
    actorUserId: string,
  ) {
    const title = input.title.trim();
    const content = (input.content ?? '').trim();
    if (!title) throw new BadRequestException('Tytuł jest wymagany.');
    if (content.length < 10) throw new BadRequestException('Treść jest zbyt krótka.');
    if (content.length > MAX_DOC_CHARS) {
      throw new BadRequestException(`Treść przekracza ${MAX_DOC_CHARS} znaków.`);
    }

    const doc = await this.prisma.aiKnowledgeDoc.create({
      data: {
        title,
        audience: input.audience ?? AiKnowledgeAudience.ALL,
        sourceType: input.sourceType ?? 'TEXT',
        sourceRef: input.sourceRef ?? null,
        charCount: content.length,
        createdById: actorUserId,
      },
    });
    await this.indexDocContent(doc.id, content);

    await this.audit.record({
      action: 'AI_KNOWLEDGE_DOC_CREATED',
      actorUserId,
      details: { docId: doc.id, title, audience: doc.audience, chars: content.length },
    });
    return this.getDoc(doc.id);
  }

  async updateDoc(
    id: string,
    input: {
      title?: string;
      content?: string;
      audience?: AiKnowledgeAudience;
      status?: AiKnowledgeStatus;
    },
    actorUserId: string,
  ) {
    const existing = await this.prisma.aiKnowledgeDoc.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Dokument nie istnieje.');

    const data: Prisma.AiKnowledgeDocUpdateInput = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.audience !== undefined) data.audience = input.audience;
    if (input.status !== undefined) data.status = input.status;

    if (input.content !== undefined) {
      const content = input.content.trim();
      if (content.length < 10) throw new BadRequestException('Treść jest zbyt krótka.');
      if (content.length > MAX_DOC_CHARS) {
        throw new BadRequestException(`Treść przekracza ${MAX_DOC_CHARS} znaków.`);
      }
      data.charCount = content.length;
      await this.prisma.aiKnowledgeChunk.deleteMany({ where: { docId: id } });
      await this.indexDocContent(id, content);
    }

    await this.prisma.aiKnowledgeDoc.update({ where: { id }, data });
    await this.audit.record({
      action: 'AI_KNOWLEDGE_DOC_UPDATED',
      actorUserId,
      details: { docId: id, fields: Object.keys(input) },
    });
    return this.getDoc(id);
  }

  async deleteDoc(id: string, actorUserId: string) {
    const existing = await this.prisma.aiKnowledgeDoc.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Dokument nie istnieje.');
    await this.prisma.aiKnowledgeDoc.delete({ where: { id } });
    await this.audit.record({
      action: 'AI_KNOWLEDGE_DOC_DELETED',
      actorUserId,
      details: { docId: id, title: existing.title },
    });
    return { ok: true as const };
  }

  // ---------------------------------------------------------------------------
  // Indexing + retrieval
  // ---------------------------------------------------------------------------

  private async indexDocContent(docId: string, content: string): Promise<void> {
    const chunks = chunkText(content);
    let embeddings: number[][] = [];
    if (this.provider.embeddingsEnabled()) {
      try {
        embeddings = await this.provider.embed(chunks);
      } catch (err) {
        this.logger.warn(
          `Embedding failed for doc=${docId}, falling back to keyword-only: ${(err as Error).message}`,
        );
        embeddings = [];
      }
    }
    await this.prisma.aiKnowledgeChunk.createMany({
      data: chunks.map((c, i) => ({
        docId,
        ordinal: i,
        content: c,
        embedding: embeddings[i] ?? [],
        tokens: Math.ceil(c.length / 4),
      })),
    });
  }

  /**
   * Retrieves the top-K most relevant chunks for a query, restricted to the
   * given audience (CLIENT/STAFF assistants). Uses cosine similarity over
   * embeddings when available, otherwise a keyword-overlap score.
   */
  async retrieve(
    query: string,
    audience: 'CLIENT' | 'STAFF',
    k = 6,
  ): Promise<RetrievedChunk[]> {
    const audiences: AiKnowledgeAudience[] =
      audience === 'CLIENT'
        ? [AiKnowledgeAudience.CLIENT, AiKnowledgeAudience.ALL]
        : [AiKnowledgeAudience.STAFF, AiKnowledgeAudience.ALL];

    const chunks = await this.prisma.aiKnowledgeChunk.findMany({
      where: { doc: { audience: { in: audiences }, status: AiKnowledgeStatus.ACTIVE } },
      include: { doc: { select: { id: true, title: true } } },
      take: 2000,
    });
    if (chunks.length === 0) return [];

    let queryEmbedding: number[] | null = null;
    if (this.provider.embeddingsEnabled()) {
      try {
        queryEmbedding = (await this.provider.embed([query]))[0] ?? null;
      } catch {
        queryEmbedding = null;
      }
    }

    const scored = chunks.map((c) => {
      let score: number;
      if (queryEmbedding && c.embedding.length > 0) {
        score = cosineSimilarity(queryEmbedding, c.embedding);
      } else {
        score = keywordScore(query, c.content);
      }
      return { docId: c.doc.id, title: c.doc.title, content: c.content, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length <= CHUNK_SIZE) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    // Prefer to break on a paragraph/sentence boundary near the end.
    if (end < clean.length) {
      const slice = clean.slice(start, end);
      const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
      if (lastBreak > CHUNK_SIZE * 0.5) end = start + lastBreak + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.length > 0);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function keywordScore(query: string, content: string): number {
  const terms = tokenize(query);
  if (terms.length === 0) return 0;
  const haystack = content.toLowerCase();
  let hits = 0;
  for (const t of terms) {
    if (t.length < 3) continue;
    if (haystack.includes(t)) hits += 1;
  }
  return hits / terms.length;
}

function tokenize(s: string): string[] {
  return Array.from(
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean),
    ),
  );
}
