import { LegalDocumentKind } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { LegalDocumentsService } from '../../src/compliance/legal-documents.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * PB-03 — opublikowana wersja dokumentu prawnego jest dowodem tego, co klient zaakceptował.
 * 27.09: na produkcji istniały już 1.0.0 i 1.0.1, a plan zakładał „wszystko jako 1.0.0” —
 * publikacja nadpisałaby treść wersji zaakceptowanej przez konta. Tego nie wolno.
 */
const svc = () => new LegalDocumentsService(prisma() as never, new AuditService(prisma() as never));
const tresc = (x: string) => `# Regulamin\n\n${x}\n\n${'Treść dokumentu. '.repeat(20)}`;

describe('PB-03 publikacja dokumentów prawnych', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('ta sama wersja z inną treścią — odmowa, stara treść nietknięta; nowy numer przechodzi i jest obowiązujący', async () => {
    const admin = await prisma().user.create({ data: { email: `adm-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    const pub = (version: string, t: string) =>
      svc().publish({ kind: LegalDocumentKind.TERMS, version, title: 'Regulamin', contentMarkdown: tresc(t), publishedById: admin.id });
    await pub('1.0.0', 'pierwotna');
    await expect(pub('1.0.0', 'podmieniona')).rejects.toThrow('nadaj nowy numer');
    const stara = await prisma().legalDocument.findFirstOrThrow({ where: { kind: 'TERMS', version: '1.0.0' } });
    expect(stara.contentMarkdown).toContain('pierwotna');
    await pub('1.1.0', 'nowa');
    await pub('1.0.0', 'pierwotna'); // identyczna treść — wolno przywrócić jako obowiązującą
    const obowiazujace = await prisma().legalDocument.findMany({ where: { kind: 'TERMS', isCurrent: true } });
    expect(obowiazujace.map((d) => d.version)).toEqual(['1.0.0']);
  });
});
