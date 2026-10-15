import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { CryptoService } from '../../src/common/crypto/crypto.service.js';
import { BootstrapTokenService } from '../../src/servers/bootstrap-token.service.js';
import { ServersService } from '../../src/servers/servers.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Audyt 13.10 (do potwierdzenia #7, servers.service.ts:handleHandshake:unrevoked-bootstrap-tokens-rebind-node-identity):
 * (A) stary, niezużyty token węzła OFFLINE/DEPROVISIONING przepinał tożsamość węzła na nowy adres;
 * (B) drugi wydany token zostawał ważny po udanym handshake pierwszym;
 * (C) dwa równoległe handshake jednym tokenem dostawały dwie tożsamości.
 */
const crypto = Object.create(CryptoService.prototype) as CryptoService;

function uslugi() {
  const p = prisma() as never;
  const tokens = new BootstrapTokenService(p, crypto);
  const servers = new ServersService(p, crypto, new AuditService(p), tokens, null as never, null as never, null as never, null as never, null as never);
  return { tokens, servers };
}

const dto = (ip: string) => ({ ipAddress: ip, totalCpuCores: 4, totalMemoryMb: 8192 }) as never;

describe('Handshake węzła — tokeny bootstrapu', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('(A) węzeł OFFLINE/DEPROVISIONING: stary token nie przepina tożsamości', async () => {
    for (const status of ['OFFLINE', 'DEPROVISIONING'] as const) {
      const stara = crypto.sha256Hex(`stara-tozsamosc-${status}`);
      const w = await utworzWezel({ status, identityToken: stara });
      const { tokens, servers } = uslugi();
      const t = await tokens.issue({ serverId: w.id });
      await expect(servers.handleHandshake(w.id, dto('198.51.100.7'), { bootstrapTokenId: t.token.id }))
        .rejects.toBeInstanceOf(ConflictException);
      const po = await prisma().server.findUniqueOrThrow({ where: { id: w.id } });
      expect(po.status).toBe(status);
      expect(po.identityToken).toBe(stara);
      expect((await prisma().bootstrapToken.findUniqueOrThrow({ where: { id: t.token.id } })).usedAt).toBeNull();
    }
  });

  it('(B) po udanym handshake pozostałe tokeny węzła są unieważnione', async () => {
    const w = await utworzWezel({ status: 'INIT', identityToken: null });
    const { tokens, servers } = uslugi();
    const pierwszy = await tokens.issue({ serverId: w.id });
    const drugi = await tokens.issue({ serverId: w.id });
    const r = await servers.handleHandshake(w.id, dto('198.51.100.10'), { bootstrapTokenId: pierwszy.token.id });
    expect(r.identityToken).toBeTruthy();
    await expect(tokens.peek(drugi.plaintext)).rejects.toThrow('revoked');
  });

  it('(D) token unieważniony po `peek` (równoległy handshake rodzeństwa) nie zostaje zużyty', async () => {
    const w = await utworzWezel({ status: 'INIT', identityToken: null });
    const { tokens, servers } = uslugi();
    const t1 = await tokens.issue({ serverId: w.id });
    const t2 = await tokens.issue({ serverId: w.id });
    await tokens.peek(t2.plaintext); // T2 przeszedł guard…
    await servers.handleHandshake(w.id, dto('198.51.100.30'), { bootstrapTokenId: t1.token.id }); // …a T1 wygrał
    await expect(servers.handleHandshake(w.id, dto('198.51.100.31'), { bootstrapTokenId: t2.token.id }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect((await prisma().server.findUniqueOrThrow({ where: { id: w.id } })).ipAddress).toBe('198.51.100.30');
  });

  it('(C) dwa równoległe handshake jednym tokenem → tylko jeden dostaje tożsamość', async () => {
    const w = await utworzWezel({ status: 'INIT', identityToken: null });
    const { tokens, servers } = uslugi();
    const t = await tokens.issue({ serverId: w.id });
    const wyniki = await Promise.allSettled([
      servers.handleHandshake(w.id, dto('198.51.100.20'), { bootstrapTokenId: t.token.id }),
      servers.handleHandshake(w.id, dto('198.51.100.20'), { bootstrapTokenId: t.token.id }),
    ]);
    const udane = wyniki.filter((x) => x.status === 'fulfilled');
    expect(udane).toHaveLength(1);
    const odrzucone = wyniki.filter((x): x is PromiseRejectedResult => x.status === 'rejected');
    expect(odrzucone[0]?.reason).toBeInstanceOf(UnauthorizedException);
    const po = await prisma().server.findUniqueOrThrow({ where: { id: w.id } });
    expect(po.identityToken).toBe(crypto.sha256Hex((udane[0] as PromiseFulfilledResult<{ identityToken: string }>).value.identityToken));
  });

  describe('Decyzja 15.10 — reinstalacja u dostawcy na tym samym IP', () => {
    const IP = '198.51.100.50';

    it('wycofany węzeł bez kont oddaje IP nowemu węzłowi z kreatora (i traci tożsamość); wpis w dzienniku', async () => {
      const stary = await utworzWezel({ name: 't2', ipAddress: IP, ipv6Address: '2001:db8::50', status: 'DEPROVISIONING', identityToken: crypto.sha256Hex('stara') });
      const nowy = await utworzWezel({ status: 'INIT', identityToken: null });
      const { tokens, servers } = uslugi();
      const t = await tokens.issue({ serverId: nowy.id });
      const r = await servers.handleHandshake(nowy.id, dto(IP), { bootstrapTokenId: t.token.id });
      expect(r.identityToken).toBeTruthy();
      expect((await prisma().server.findUniqueOrThrow({ where: { id: nowy.id } })).ipAddress).toBe(IP);
      const po = await prisma().server.findUniqueOrThrow({ where: { id: stary.id } });
      expect(po).toMatchObject({ ipAddress: `wycofany-${stary.id}`, ipv6Address: null, identityToken: null, status: 'DEPROVISIONING' });
      const wpis = await prisma().auditLog.findFirst({ where: { action: 'SERVER_IP_RELEASED' } });
      expect(wpis?.details).toMatchObject({ ipAddress: IP, odWezla: stary.id, dlaWezla: nowy.id });
    });

    it('IP działającego węzła albo wycofywanego z kontami — odmowa, nic się nie zmienia, token niezużyty', async () => {
      for (const [status, zKontem] of [['ACTIVE', false], ['OFFLINE', false], ['DEPROVISIONING', true]] as const) {
        await wyczyscBaze();
        const stary = await utworzWezel({ ipAddress: IP, status });
        if (zKontem) await utworzKonto({ serverId: stary.id, planId: (await utworzPlan()).id });
        const nowy = await utworzWezel({ status: 'INIT', identityToken: null });
        const { tokens, servers } = uslugi();
        const t = await tokens.issue({ serverId: nowy.id });
        await expect(servers.handleHandshake(nowy.id, dto(IP), { bootstrapTokenId: t.token.id })).rejects.toBeInstanceOf(ConflictException);
        expect((await prisma().server.findUniqueOrThrow({ where: { id: stary.id } })).ipAddress).toBe(IP);
        expect((await prisma().bootstrapToken.findUniqueOrThrow({ where: { id: t.token.id } })).usedAt).toBeNull();
      }
    });
  });
});
