import { createHash } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { ConsentsService } from '../../src/compliance/consents.service.js';
import { LegalDocumentsService } from '../../src/compliance/legal-documents.service.js';
import { CustomerIamService } from '../../src/users/customer-iam.service.js';
import { AcceptSubaccountInviteDto } from '../../src/users/customer-iam.dto.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * P3-10 — współpracownik akceptował regulamin i politykę dopiero w oknie po pierwszym logowaniu, a w zgodach miał
 * źródło „Re-akceptacja”, choć to pierwsza akceptacja. Teraz zgody są na ekranie aktywacji subkonta: konto powstaje
 * z UserConsent (źródło SUBACCOUNT_ACTIVATION) i bieżącymi wersjami dokumentów, więc okna po logowaniu nie ma.
 * Na starym kodzie: accept() nie zapisywał zgód → checkReConsent = required: true, brak wierszy UserConsent.
 */
const mailer = { send: async () => ({}) };
const config = { get: () => undefined };

function serwisy() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const consents = new ConsentsService(p, audit, new LegalDocumentsService(p, audit), mailer as never, config as never);
  return { consents, iam: new CustomerIamService(p, audit, mailer as never, config as never, consents) };
}

async function zaproszenie(ownerUserId: string, email: string) {
  const token = `tok-p310-${Date.now()}-${Math.random().toString(36).slice(2)}-xxxxxxxx`;
  await prisma().customerSubaccountInvite.create({
    data: {
      ownerUserId,
      email,
      permissions: ['SERVICES_READ'],
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  return token;
}

describe('P3-10 – zgody współpracownika przy aktywacji subkonta', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().legalDocument.deleteMany({});
    for (const kind of ['TERMS', 'PRIVACY'] as const) {
      await prisma().legalDocument.create({ data: { kind, version: '1.1.0', title: kind, contentMarkdown: '#', isCurrent: true } });
    }
  });
  afterAll(rozlacz);

  it('aktywacja z zaproszenia zapisuje regulamin i politykę (źródło: aktywacja subkonta) – po zalogowaniu bez ponownej akceptacji', async () => {
    const { iam, consents } = serwisy();
    const wlasciciel = await prisma().user.create({ data: { email: `kasia-p310-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const email = `piotr-p310-${Date.now()}@test.verris.pl`;
    const token = await zaproszenie(wlasciciel.id, email);

    await iam.accept(
      { token, password: 'Haslo-dlugie-123', firstName: 'Piotr', lastName: 'Nowak', acceptTerms: true, acceptPrivacy: true },
      { ipAddress: '203.0.113.7', userAgent: 'test' },
    );

    const piotr = await prisma().user.findUniqueOrThrow({ where: { email } });
    expect(piotr).toMatchObject({ lastConsentVersionTerms: '1.1.0', lastConsentVersionPrivacy: '1.1.0' });
    const zgody = await prisma().userConsent.findMany({ where: { userId: piotr.id } });
    expect(zgody).toHaveLength(2);
    expect(zgody.map((z) => [z.documentKind, z.documentVersion, z.source, z.ipAddress])).toEqual(
      expect.arrayContaining([
        ['TERMS', '1.1.0', 'SUBACCOUNT_ACTIVATION', '203.0.113.7'],
        ['PRIVACY', '1.1.0', 'SUBACCOUNT_ACTIVATION', '203.0.113.7'],
      ]),
    );
    expect(await consents.checkReConsent(piotr.id)).toEqual({ required: false });
  });

  it('bez zaakceptowanych dokumentów aktywacja nie przejdzie walidacji (jak rejestracja)', async () => {
    const baza = { token: 'x'.repeat(24), password: 'Haslo-dlugie-123', firstName: 'Piotr', lastName: 'Nowak' };
    const bledy = async (o: object) => (await validate(plainToInstance(AcceptSubaccountInviteDto, o))).map((e) => e.property);
    expect(await bledy(baza)).toEqual(expect.arrayContaining(['acceptTerms', 'acceptPrivacy']));
    expect(await bledy({ ...baza, acceptTerms: true, acceptPrivacy: false })).toEqual(['acceptPrivacy']);
    expect(await bledy({ ...baza, acceptTerms: true, acceptPrivacy: true })).toEqual([]);
  });
});
