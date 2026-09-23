import { Prisma } from '@verris/database';
import {
  etykietaStawki, kredytZaWplate, numerVatUe, rozbicieWgStawki, ustalTraktowanieVat, PROG_OSS_PLN,
} from './vat';
import { ViesService } from './vies.service';

const t = (kraj: string, viesWazny: boolean | null = null, sprzedaz = 0, oss = false) =>
  ustalTraktowanieVat({ kraj, viesWazny, sprzedazB2cUePln: sprzedaz, ossWlaczone: oss });

describe('M-09 — traktowanie VAT', () => {
  it('Polska 23%, także gdy kraj pusty', () => {
    expect(t('PL')).toMatchObject({ kod: 'PL', stawka: 23, cenaNetto: false });
    expect(t('')).toMatchObject({ kod: 'PL', stawka: 23 });
  });

  it('firma z UE z ważnym VAT-UE: np + odwrotne obciążenie + cena netto; nigdy 0%', () => {
    const r = t('DE', true);
    expect(r).toMatchObject({ kod: 'OO', stawka: null, adnotacja: 'odwrotne obciążenie', cenaNetto: true });
    expect(etykietaStawki(r.stawka)).toBe('np');
  });

  it('konsument z UE: 23% poniżej progu, alarm po przekroczeniu bez OSS, stawka kraju z OSS', () => {
    expect(t('DE', false, 1000)).toMatchObject({ kod: 'UE_B2C', stawka: 23, wymagaOss: false, b2cUe: true });
    expect(t('DE', null, PROG_OSS_PLN)).toMatchObject({ stawka: 23, wymagaOss: true });
    expect(t('FI', null, 0, true)).toMatchObject({ kod: 'OSS', stawka: 25.5, cenaNetto: false });
    expect(etykietaStawki(25.5)).toBe('25,5%');
  });

  it('spoza UE: np, cena netto; Grecja jako EL traktowana jak GR', () => {
    expect(t('US')).toMatchObject({ kod: 'POZA_UE', stawka: null, cenaNetto: true });
    expect(t('EL', true).kraj).toBe('GR');
  });

  it('rozbicie: np = całość netto; 23% sumuje się co do grosza', () => {
    expect(rozbicieWgStawki(new Prisma.Decimal('100'), null).vat.toFixed(2)).toBe('0.00');
    const r = rozbicieWgStawki(new Prisma.Decimal('45'), 23);
    expect(r.netto.plus(r.vat).toFixed(2)).toBe('45.00');
  });

  it('kredyt za wpłatę: cena netto daje 1,23 K za złotówkę', () => {
    expect(kredytZaWplate(new Prisma.Decimal('36.59'), { cenaNetto: true }).toFixed(2)).toBe('45.01');
    expect(kredytZaWplate(new Prisma.Decimal('45'), { cenaNetto: false }).toFixed(2)).toBe('45.00');
  });

  it('numer VAT-UE z pola NIP', () => {
    expect(numerVatUe('DE', 'DE 123-456-789')).toEqual({ kodVies: 'DE', numer: '123456789' });
    expect(numerVatUe('GR', 'EL094259216')).toEqual({ kodVies: 'EL', numer: '094259216' });
    expect(numerVatUe('DE', '')).toBeNull();
    expect(numerVatUe('DE', '12<script>')).toBeNull();
  });
});

describe('ViesService', () => {
  const orig = global.fetch;
  afterEach(() => { global.fetch = orig; });
  const odp = (body: unknown, ok = true) =>
    (global.fetch = jest.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as never);

  it('ważny numer', async () => {
    odp({ valid: true, name: 'ACME GmbH', requestIdentifier: 'WAPI1', requestDate: '2026-09-23' });
    const w = await new ViesService().sprawdz('DE', '1');
    expect(w).toMatchObject({ wazny: true, nazwa: 'ACME GmbH', identyfikator: 'WAPI1' });
  });

  it('awaria kraju w odpowiedzi 200 to „nie wiadomo”, nie „nieważny”', async () => {
    odp({ actionSucceed: false, userError: 'MS_UNAVAILABLE' });
    expect((await new ViesService().sprawdz('DE', '2')).wazny).toBeNull();
  });

  it('nieważny numer', async () => {
    odp({ valid: false, name: '---' });
    expect(await new ViesService().sprawdz('DE', '3')).toMatchObject({ wazny: false, nazwa: null });
  });
});
