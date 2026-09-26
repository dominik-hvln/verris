import 'reflect-metadata';
import { Controller, Get, Module, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard.js';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * O-03 / Z-10 — uprawnienia subkonta przez prawdziwy HTTP: passport, JWT, baza, dziennik.
 *
 * 26.09 na produkcji subkonto z samym „Usługi: podgląd” kupiło usługę. Strażnik był globalny,
 * więc działał przed logowaniem i widział pusty req.user. Testy jednostkowe podawały mu gotowego
 * użytkownika — dlatego nic tego nie złapało. Tu kolejność strażników jest taka jak w aplikacji.
 */
const SEKRET = 'test-sekret-uprawnienia-subkonta';
const jwt = new JwtService({ secret: SEKRET });

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
class Uslugi {
  @Get() lista() { return []; }
  @Post() zamow() { return { zamowiono: true }; }
}

@Controller('domains')
@UseGuards(JwtAuthGuard)
class Domeny {
  @Post('registrar/register') rejestruj() { return { zarejestrowano: true }; }
}

@Module({
  imports: [PassportModule],
  controllers: [Uslugi, Domeny],
  providers: [
    JwtStrategy,
    { provide: PrismaService, useFactory: () => prisma() },
    { provide: ConfigService, useValue: { get: () => SEKRET } },
    { provide: AuditService, useFactory: (p: PrismaService) => new AuditService(p), inject: [PrismaService] },
  ],
})
class Aplikacja {}

let app: INestApplication;
let url: string;

const zadanie = async (metoda: string, sciezka: string, sub: string) =>
  (await fetch(url + sciezka, {
    method: metoda,
    headers: { Authorization: `Bearer ${jwt.sign({ sub, email: 'x', role: 'USER', purpose: 'access' }, { expiresIn: 60 })}`, 'Content-Type': 'application/json' },
    body: metoda === 'GET' ? undefined : '{}',
  })).status;

async function konta(uprawnienia: string[]) {
  const t = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const wlasciciel = await prisma().user.create({ data: { email: `wl-${t}@test.verris.pl`, passwordHash: 'x' } });
  const sub = await prisma().user.create({
    data: { email: `sub-${t}@test.verris.pl`, passwordHash: 'x', customerOwnerId: wlasciciel.id, customerPermissions: uprawnienia } as never,
  });
  return { wlasciciel: wlasciciel.id, sub: sub.id };
}

describe('O-03/Z-10 uprawnienia subkonta przez HTTP', () => {
  beforeAll(async () => {
    app = await NestFactory.create(Aplikacja, { logger: false });
    await app.listen(0);
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await rozlacz();
  });
  beforeEach(wyczyscBaze);

  it('podgląd usług: lista tak, zakup usługi i domeny nie — odmowa w dzienniku właściciela', async () => {
    const k = await konta(['SERVICES_READ']);
    expect(await zadanie('GET', '/subscriptions', k.sub)).toBe(200);
    expect(await zadanie('POST', '/subscriptions', k.sub)).toBe(403);
    expect(await zadanie('POST', '/domains/registrar/register', k.sub)).toBe(403);
    await new Promise((r) => setTimeout(r, 200)); // zapis dziennika idzie w tle
    const odmowy = await prisma().auditLog.findMany({ where: { userId: k.wlasciciel, action: 'CUSTOMER_IAM_ACCESS_DENIED' } });
    expect(odmowy.map((o) => o.actorUserId)).toEqual([k.sub, k.sub]);
  });

  it('zarządzanie usługami bez płatności nadal nie kupi', async () => {
    const k = await konta(['SERVICES_READ', 'SERVICES_MANAGE']);
    expect(await zadanie('POST', '/subscriptions', k.sub)).toBe(403);
  });

  it('z płatnościami kupi; właściciel zawsze', async () => {
    const k = await konta(['SERVICES_READ', 'SERVICES_MANAGE', 'BILLING_MANAGE']);
    expect(await zadanie('POST', '/subscriptions', k.sub)).toBe(201);
    expect(await zadanie('POST', '/subscriptions', k.wlasciciel)).toBe(201);
  });

  it('bez tokenu 401, nie 403', async () => {
    expect((await fetch(url + '/subscriptions', { method: 'POST' })).status).toBe(401);
  });
});
