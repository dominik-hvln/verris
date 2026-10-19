import { ForbiddenException } from '@nestjs/common';
import { PromoKind } from '@verris/database';
import { LICZBA_KROKOW_BETA } from '@verris/contracts';
import { BetaService } from '../../src/beta/beta.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * PB-26 — postęp testera na stronie „Testy (beta)” na prawdziwej bazie: równoczesne odhaczenia z dwóch kart
 * nie gubią się (zapis jsonb || w jednym zapytaniu), odznaczenie i pusta uwaga usuwają wpis, osoba spoza
 * testów nic nie zapisze, a panel admina widzi postęp testera.
 */
let n = 0;
async function osoba(tester: boolean) {
  n += 1;
  const user = await prisma().user.create({ data: { email: `beta-${n}@test.verris.pl`, passwordHash: 'x' } });
  if (tester) {
    const invite = await prisma().betaInvite.create({
      data: {
        email: user.email,
        promoCode: { create: { code: `BETA-T${n}`, kind: PromoKind.FIXED_CREDIT, value: 150, currency: 'PLN', maxRedemptions: 1 } },
      },
    });
    await prisma().promoRedemption.create({ data: { promoCodeId: invite.promoCodeId, userId: user.id, amountCredited: 150 } });
  }
  return user;
}

const usluga = () => {
  const p = prisma() as never;
  return new BetaService(p, { send: async () => ({ delivered: true }) } as never, { get: () => undefined } as never, { record: async () => undefined } as never);
};

describe('Testy (beta) — postęp testera', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('równoczesne odhaczenia nie nadpisują się nawzajem; odznaczenie usuwa tylko swój krok', async () => {
    const t = await osoba(true);
    const beta = usluga();
    const kroki = ['s01.k1', 's01.k2', 's01.k3', 's02.k1', 's08.k1'];
    await Promise.all(kroki.map((k) => beta.ustawKrok(t.id, k, true)));
    let p = await beta.postep(t.id);
    expect(Object.keys(p.kroki).sort()).toEqual([...kroki].sort());

    await beta.ustawKrok(t.id, 's01.k2', false);
    p = await beta.postep(t.id);
    expect(Object.keys(p.kroki).sort()).toEqual(['s01.k1', 's01.k3', 's02.k1', 's08.k1']);
    expect(p.zaktualizowano).not.toBeNull();
  });

  it('uwagi: zapis, nadpisanie, pusta usuwa; kroki zostają nietknięte', async () => {
    const t = await osoba(true);
    const beta = usluga();
    await beta.ustawKrok(t.id, 's05.k1', true);
    await Promise.all([beta.ustawUwage(t.id, 's05', 'Mail doszedł po 3 min'), beta.ustawUwage(t.id, 's06', 'Kopia OK')]);
    await beta.ustawUwage(t.id, 's05', '  Mail doszedł po 2 min  ');
    let p = await beta.postep(t.id);
    expect(p.uwagi).toEqual({ s05: 'Mail doszedł po 2 min', s06: 'Kopia OK' });
    expect(Object.keys(p.kroki)).toEqual(['s05.k1']);

    await beta.ustawUwage(t.id, 's06', '   ');
    p = await beta.postep(t.id);
    expect(p.uwagi).toEqual({ s05: 'Mail doszedł po 2 min' });
  });

  it('osoba spoza testów: odczyt pusty, zapis odrzucony, w bazie nic nie powstaje', async () => {
    const obcy = await osoba(false);
    const beta = usluga();
    expect(await beta.postep(obcy.id)).toEqual({ tester: false, kroki: {}, uwagi: {}, zaktualizowano: null });
    await expect(beta.ustawKrok(obcy.id, 's01.k1', true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(beta.ustawUwage(obcy.id, 's01', 'x')).rejects.toBeInstanceOf(ForbiddenException);
    expect(await prisma().betaPostep.count()).toBe(0);
  });

  it('panel admina: lista zaproszeń pokazuje postęp testera; usunięcie konta kasuje postęp', async () => {
    const t = await osoba(true);
    const beta = usluga();
    await beta.ustawKrok(t.id, 's01.k1', true);
    await beta.ustawUwage(t.id, 's01', 'Brak maila w Gmailu');
    const [wiersz] = await beta.lista();
    expect(wiersz.postep).toMatchObject({ zrobione: 1, wszystkie: LICZBA_KROKOW_BETA, uwagi: { s01: 'Brak maila w Gmailu' } });
    expect(Object.keys(wiersz.postep!.kroki)).toEqual(['s01.k1']);

    await prisma().user.delete({ where: { id: t.id } });
    expect(await prisma().betaPostep.count()).toBe(0);
  });
});
