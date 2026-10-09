import { AiKnowledgeAudience, AiKnowledgeStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { KnowledgeBaseService } from '../../src/ai/knowledge-base.service.js';
import { dokumentyWiedzyStaff, czytajRunbook, idDokumentuStaff } from '../../src/ai/wiedza-staff.js';
import { prisma, rozlacz } from './setup.js';

/**
 * Patch 7 — synchronizacja wiedzy pracowników (słownik „?” + runbooki) na prawdziwej bazie: ponowny start
 * niczego nie dubluje ani nie przelicza, zmiana treści przeindeksowuje, usunięty wpis znika, a dokument
 * przestawiony w panelu na ALL wraca do STAFF (runbook nie może trafić do czatu klienta).
 */
function kb() {
  const p = prisma() as never;
  const provider = { embeddingsEnabled: () => false, embed: async () => [] };
  return new KnowledgeBaseService(p, provider as never, new AuditService(p));
}

const zarzadzane = () =>
  prisma().aiKnowledgeDoc.findMany({
    where: { OR: [{ sourceRef: { startsWith: 'pomoc:' } }, { sourceRef: { startsWith: 'docs-ops:' } }] },
  });

describe('Patch 7 — synchronizacja wiedzy STAFF', () => {
  beforeEach(async () => {
    await prisma().aiKnowledgeDoc.deleteMany({});
  });
  afterAll(async () => {
    await prisma().aiKnowledgeDoc.deleteMany({});
    await rozlacz();
  });

  it('pierwsza synchronizacja zakłada dokumenty STAFF; druga nic nie zmienia', async () => {
    const { dokumenty, pominiete } = dokumentyWiedzyStaff(czytajRunbook);
    expect(pominiete).toEqual([]);
    const w1 = await kb().synchronizujWiedzeStaff(dokumenty);
    expect(w1).toEqual({ dodane: dokumenty.length, zmienione: 0, bezZmian: 0, usuniete: 0 });
    const docs = await zarzadzane();
    expect(docs).toHaveLength(dokumenty.length);
    expect(new Set(docs.map((d) => d.audience))).toEqual(new Set([AiKnowledgeAudience.STAFF]));
    expect(docs.find((d) => d.sourceRef === 'docs-ops:SUPPORT_MODEL_24-7.md')).toBeTruthy();
    const chunki = await prisma().aiKnowledgeChunk.count();

    const w2 = await kb().synchronizujWiedzeStaff(dokumenty);
    expect(w2).toEqual({ dodane: 0, zmienione: 0, bezZmian: dokumenty.length, usuniete: 0 });
    expect(await prisma().aiKnowledgeChunk.count()).toBe(chunki);
  });

  it('zmiana treści przeindeksowuje, usunięty wpis znika, obce dokumenty zostają; ALL wraca do STAFF', async () => {
    const reczny = await prisma().aiKnowledgeDoc.create({
      data: { title: 'Ręczny', audience: AiKnowledgeAudience.STAFF, sourceRef: 'reczny', charCount: 10 },
    });
    const a = { sourceRef: 'pomoc:a', sourceType: 'TEXT' as const, title: 'A', content: 'Pierwsza wersja opisu.' };
    const b = { sourceRef: 'pomoc:b', sourceType: 'TEXT' as const, title: 'B', content: 'Opis funkcji B.' };
    await kb().synchronizujWiedzeStaff([a, b]);
    await prisma().aiKnowledgeDoc.update({
      where: { id: idDokumentuStaff('pomoc:b') },
      data: { audience: AiKnowledgeAudience.ALL, status: AiKnowledgeStatus.ARCHIVED },
    });

    const w = await kb().synchronizujWiedzeStaff([{ ...a, content: 'Druga wersja opisu.' }, b]);
    expect(w).toEqual({ dodane: 0, zmienione: 2, bezZmian: 0, usuniete: 0 });
    const chunkA = await prisma().aiKnowledgeChunk.findMany({ where: { docId: idDokumentuStaff('pomoc:a') } });
    expect(chunkA.map((c) => c.content)).toEqual(['Druga wersja opisu.']);
    const docB = await prisma().aiKnowledgeDoc.findUniqueOrThrow({ where: { id: idDokumentuStaff('pomoc:b') } });
    expect(docB.audience).toBe(AiKnowledgeAudience.STAFF);
    expect(docB.status).toBe(AiKnowledgeStatus.ARCHIVED);

    const w2 = await kb().synchronizujWiedzeStaff([a]);
    expect(w2.usuniete).toBe(1);
    expect((await zarzadzane()).map((d) => d.sourceRef)).toEqual(['pomoc:a']);
    expect(await prisma().aiKnowledgeDoc.findUnique({ where: { id: reczny.id } })).toBeTruthy();
  });

  it('przegląd: dokumentu ze słownika/runbooka nie da się w panelu udostępnić klientom (ALL/CLIENT)', async () => {
    await kb().synchronizujWiedzeStaff([
      { sourceRef: 'docs-ops:X.md', sourceType: 'MARKDOWN', title: 'X', content: 'Runbook tylko dla pracowników.' },
    ]);
    const id = idDokumentuStaff('docs-ops:X.md');
    for (const audience of [AiKnowledgeAudience.ALL, AiKnowledgeAudience.CLIENT]) {
      await expect(kb().updateDoc(id, { audience }, 'admin')).rejects.toThrow('tylko dla pracowników');
    }
    expect((await prisma().aiKnowledgeDoc.findUniqueOrThrow({ where: { id } })).audience).toBe(AiKnowledgeAudience.STAFF);
    // Archiwizacja i ręczne dokumenty — bez zmian.
    await kb().updateDoc(id, { status: AiKnowledgeStatus.ARCHIVED }, 'admin');
    const reczny = await prisma().aiKnowledgeDoc.create({
      data: { title: 'Ręczny', audience: AiKnowledgeAudience.STAFF, sourceRef: 'reczny', charCount: 10 },
    });
    await kb().updateDoc(reczny.id, { audience: AiKnowledgeAudience.ALL }, 'admin');
  });

  it('przegląd: dokument zindeksowany bez embeddingów dostaje je po włączeniu dostawcy', async () => {
    const a = { sourceRef: 'pomoc:a', sourceType: 'TEXT' as const, title: 'A', content: 'Opis funkcji A.' };
    await kb().synchronizujWiedzeStaff([a]);
    const p = prisma() as never;
    const embed = vi.fn(async (wej: string[]) => wej.map(() => [0.1, 0.2]));
    const zEmbeddingami = new KnowledgeBaseService(p, { embeddingsEnabled: () => true, embed } as never, new AuditService(p));

    expect(await zEmbeddingami.synchronizujWiedzeStaff([a])).toMatchObject({ zmienione: 1, bezZmian: 0 });
    const chunki = await prisma().aiKnowledgeChunk.findMany({ where: { docId: idDokumentuStaff('pomoc:a') } });
    expect(chunki.map((c) => c.embedding)).toEqual([[0.1, 0.2]]);
    expect(await zEmbeddingami.synchronizujWiedzeStaff([a])).toMatchObject({ zmienione: 0, bezZmian: 1 });
    expect(embed).toHaveBeenCalledTimes(1);
  });
});
