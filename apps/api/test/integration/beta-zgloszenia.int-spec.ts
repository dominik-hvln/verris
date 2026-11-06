import { BetaService } from '../../src/beta/beta.service.js';
import { BetaZgloszeniaService } from '../../src/beta/beta-zgloszenia.service.js';
import type { ZgloszenieBetaDto } from '../../src/beta/dto/zgloszenie-beta.dto.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Otwarta beta — zgłoszenie z verris.pl/beta na prawdziwej bazie: formularz → double opt-in → zaproszenie z kodem
 * (powiązanie ze zgłoszeniem), ponowne wysłanie formularza nie dubluje wiersza ani maila, retencja usuwa tylko to,
 * co powinna, a usunięcie zaproszenia nie kasuje zgłoszenia.
 */
function uslugi() {
  const p = prisma() as never;
  const maile: Array<{ to: string; tag: string; text: string }> = [];
  const mailer = { send: async (m: { to: string; tag: string; text: string }) => (maile.push(m), { delivered: true }) };
  const config = { get: (k: string) => (k === 'leadsNotifyEmail' ? 'zespol@verris.pl' : undefined) };
  const audit = { record: async () => undefined };
  const beta = new BetaService(p, mailer as never, config as never, audit as never);
  return { zgl: new BetaZgloszeniaService(p, mailer as never, config as never, audit as never, beta), maile };
}

const formularz = (email = 'Tester@Firma.pl'): ZgloszenieBetaDto =>
  ({ imie: 'Tester', email, zakres: ['WORDPRESS'], zgoda: true, zgodaTekst: 'Chcę dostać zaproszenie do testów', utm: { source: 'facebook' } }) as ZgloszenieBetaDto;

describe('Otwarta beta – zgłoszenia z verris.pl/beta', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('formularz → potwierdzenie → zaproszenie: jeden wiersz, jeden mail do nadawcy, kod powiązany ze zgłoszeniem', async () => {
    const { zgl, maile } = uslugi();
    await zgl.zglos(formularz(), { ip: '10.0.0.1' });
    await zgl.zglos(formularz('tester@firma.pl'), { ip: '10.0.0.1' });
    const wiersze = await prisma().betaZgloszenie.findMany();
    expect(wiersze).toHaveLength(1);
    expect(wiersze[0]).toMatchObject({ email: 'tester@firma.pl', status: 'NIEPOTWIERDZONE' });
    expect(maile.filter((m) => m.tag === 'beta.zgloszenie.potwierdz')).toHaveLength(1);

    await expect(zgl.zapros(wiersze[0].id, 'admin')).rejects.toThrow(/nie jest jeszcze potwierdzony/);
    expect(await zgl.potwierdz(wiersze[0].confirmToken!)).toEqual({ stan: 'POTWIERDZONE' });
    // P5-09 — drugie kliknięcie (druga karta, skaner poczty): „już potwierdzone”, nie „nieaktualny”.
    expect(await zgl.potwierdz(wiersze[0].confirmToken!)).toEqual({ stan: 'JUZ_POTWIERDZONE' });
    expect(await zgl.stanLinku(wiersze[0].confirmToken!)).toBe('JUZ_POTWIERDZONE');
    expect(maile.some((m) => m.to === 'zespol@verris.pl' && m.tag === 'beta.zgloszenie.notify')).toBe(true);

    const invite = await zgl.zapros(wiersze[0].id, 'admin');
    const po = await prisma().betaZgloszenie.findUniqueOrThrow({ where: { id: wiersze[0].id } });
    expect(po).toMatchObject({ status: 'ZAPROSZONE', betaInviteId: invite.id });
    expect(maile.some((m) => m.tag === 'beta.invite' && m.text.includes(invite.code))).toBe(true);

    const lista = await zgl.lista();
    expect(lista.liczby).toEqual({ NIEPOTWIERDZONE: 0, NOWE: 0, ZAPROSZONE: 1, ODRZUCONE: 0 });
    expect(lista.zgloszenia[0]).toMatchObject({ kod: invite.code, zrodlo: { source: 'facebook', campaign: null, content: null } });

    // Po zaproszeniu formularz z tym adresem nic nie dopisuje — P2-11: zaproszenie z kodem przychodzi jeszcze raz.
    const przed = maile.filter((m) => m.tag === 'beta.invite').length;
    await zgl.zglos(formularz(), {});
    expect(await prisma().betaZgloszenie.count()).toBe(1);
    expect(maile.filter((m) => m.tag === 'beta.invite')).toHaveLength(przed + 1);
    await zgl.zglos(formularz(), {});
    expect(maile.filter((m) => m.tag === 'beta.invite')).toHaveLength(przed + 1);
  });

  it('A1-01 – potwierdzonego zgłoszenia osoba trzecia nie nadpisze; zmiana wchodzi dopiero po linku z maila, stara zgoda w dzienniku', async () => {
    const { zgl, maile } = uslugi();
    await zgl.zglos({ ...formularz('ofiara@firma.pl'), imie: 'Ofiara', uwagi: 'Moje uwagi' } as ZgloszenieBetaDto, { ip: '10.0.0.1' });
    const z = await prisma().betaZgloszenie.findFirstOrThrow();
    await zgl.potwierdz(z.confirmToken!);
    // Doba później (limit maili), z innego IP i z inną treścią klauzuli.
    await prisma().betaZgloszenie.update({ where: { id: z.id }, data: { mailAt: new Date(Date.now() - 25 * 3600_000) } });
    await zgl.zglos(
      { ...formularz('OFIARA@firma.pl'), imie: 'Ktos Obcy', zakres: ['INNE'], uwagi: 'Podmienione', zgodaTekst: 'inna klauzula' } as ZgloszenieBetaDto,
      { ip: '10.9.9.9' },
    );
    const po = await prisma().betaZgloszenie.findUniqueOrThrow({ where: { id: z.id } });
    expect(po).toMatchObject({ status: 'NOWE', imie: 'Ofiara', uwagi: 'Moje uwagi', zgodaTekst: 'Chcę dostać zaproszenie do testów', ip: '10.0.0.1' });
    const mail = maile.find((m) => m.tag === 'beta.zgloszenie.zmiana')!;
    expect(mail.to).toBe('ofiara@firma.pl');
    expect(po.zmianaToken).toBeTruthy();
    expect(await zgl.stanLinku(po.zmianaToken!)).toBe('ZMIANA_DO_POTWIERDZENIA');

    expect(await zgl.potwierdz(po.zmianaToken!)).toEqual({ stan: 'ZMIANA_ZAPISANA' });
    const zmienione = await prisma().betaZgloszenie.findUniqueOrThrow({ where: { id: z.id } });
    expect(zmienione).toMatchObject({ status: 'NOWE', imie: 'Ktos Obcy', zakres: ['INNE'], zgodaTekst: 'inna klauzula', ip: '10.9.9.9', zmianaToken: null });
    expect(await zgl.potwierdz(po.zmianaToken!)).toEqual({ stan: 'NIEAKTUALNY' });
  });

  it('A1-01 – w ciągu doby od maila kolejne wysłanie nie podmienia oczekującej zmiany ani nie wysyła maila', async () => {
    const { zgl, maile } = uslugi();
    await zgl.zglos(formularz('a@b.pl'), {});
    const z = await prisma().betaZgloszenie.findFirstOrThrow();
    await zgl.potwierdz(z.confirmToken!);
    await zgl.zglos({ ...formularz('a@b.pl'), imie: 'Obcy' } as ZgloszenieBetaDto, {});
    const po = await prisma().betaZgloszenie.findUniqueOrThrow({ where: { id: z.id } });
    expect(po).toMatchObject({ imie: 'Tester', zmiana: null, zmianaToken: null });
    expect(maile.filter((m) => m.to === 'a@b.pl')).toHaveLength(1);
  });

  it('retencja: niepotwierdzone po 7 dniach, nowe i odrzucone po 90; zaproszone i świeże zostają', async () => {
    const { zgl } = uslugi();
    const teraz = new Date('2026-12-30T12:00:00Z');
    const dni = (n: number) => new Date(teraz.getTime() - n * 86_400_000);
    const baza = { imie: 'X', zakres: ['INNE'], zgodaTekst: 'z', zgodaAt: dni(100) };
    await prisma().betaZgloszenie.createMany({
      data: [
        { ...baza, email: 'n8@t.pl', status: 'NIEPOTWIERDZONE', createdAt: dni(8) },
        { ...baza, email: 'n6@t.pl', status: 'NIEPOTWIERDZONE', createdAt: dni(6) },
        { ...baza, email: 'w91@t.pl', status: 'NOWE', createdAt: dni(91) },
        { ...baza, email: 'w30@t.pl', status: 'NOWE', createdAt: dni(30) },
        { ...baza, email: 'o91@t.pl', status: 'ODRZUCONE', createdAt: dni(91) },
        { ...baza, email: 'z200@t.pl', status: 'ZAPROSZONE', createdAt: dni(200) },
      ],
    });
    expect(await zgl.usunStare(teraz)).toBe(3);
    const zostaly = (await prisma().betaZgloszenie.findMany({ select: { email: true } })).map((r) => r.email).sort();
    expect(zostaly).toEqual(['n6@t.pl', 'w30@t.pl', 'z200@t.pl']);
  });

  it('usunięcie zaproszenia (kodu) nie kasuje zgłoszenia – tylko zrywa powiązanie', async () => {
    const { zgl } = uslugi();
    await zgl.zglos(formularz('a@b.pl'), {});
    const z = await prisma().betaZgloszenie.findFirstOrThrow();
    await zgl.potwierdz(z.confirmToken!);
    const invite = await zgl.zapros(z.id, 'admin');
    const promo = await prisma().betaInvite.findUniqueOrThrow({ where: { id: invite.id } });
    await prisma().promoCode.delete({ where: { id: promo.promoCodeId } });
    expect(await prisma().betaZgloszenie.findUniqueOrThrow({ where: { id: z.id } })).toMatchObject({ status: 'ZAPROSZONE', betaInviteId: null });
  });
});
