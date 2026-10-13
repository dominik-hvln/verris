import { BadRequestException } from '@nestjs/common';
import { ControlPlaneMailService } from './control-plane-mail.service.js';
import { PostfixMapSyncService } from './postfix-map-sync.service.js';

/**
 * Audyt bezpieczeństwa 13.10: domena skrzynki poczty zespołu nie była walidowana, a generator map traktował
 * adresy jako zaufane — tabulator/koniec linii dopisywał własne wiersze do map Postfixa/Dovecota, a ścieżka
 * skrzynki szła do skryptu roota (mkdir/chown).
 */
describe('Poczta zespołu — domena skrzynki i mapy Postfixa', () => {
  it('nowa skrzynka spoza domeny zespołu → 400 bez zapisu', async () => {
    const prisma = { controlPlaneMailbox: { findUnique: vi.fn(async () => null) }, $transaction: vi.fn() };
    const svc = new ControlPlaneMailService(prisma as never, { record: vi.fn() } as never, {} as never, {} as never, {} as never, { get: () => undefined } as never);
    for (const domain of ['../../etc', 'example.com', 'verris.pl\tx']) {
      await expect(svc.createMailbox({ localPart: 'jan', domain, kind: 'SYSTEM' } as never, 'admin')).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('generator map pomija rekordy ze znakami sterującymi, ścieżką albo „:”', async () => {
    const mb = (email: string, localPart: string, o: object = {}) => ({
      email, localPart, imapEnabled: true, passwordHash: '{ARGON2ID}x', kind: 'STAFF', aliases: [], forwards: [], ...o,
    });
    const prisma = {
      controlPlaneMailbox: {
        findMany: vi.fn(async () => [
          mb('jan@verris.pl', 'jan', {
            aliases: [{ aliasEmail: 'evil@verris.pl\troot@verris.pl' }, { aliasEmail: 'kontakt@verris.pl' }],
            forwards: [{ forwardTo: 'x@example.com\ny@example.com', keepCopy: false }],
          }),
          mb('zly@verris.pl\nroot@verris.pl', 'zly'),
          mb('a@../../etc', '../../etc'),
          mb('b:x@verris.pl', 'b:x'),
        ]),
      },
    };
    const svc = new PostfixMapSyncService(prisma as never, { get: () => undefined } as never);
    const m = await svc.generateMaps();
    expect(m.virtualMailbox).toBe('jan@verris.pl\tverris.pl/jan/\n');
    expect(m.virtualAlias).toBe('kontakt@verris.pl\tjan@verris.pl\n');
    expect(m.dovecotPasswd).toBe('jan@verris.pl:{ARGON2ID}x\n');
  });
});
