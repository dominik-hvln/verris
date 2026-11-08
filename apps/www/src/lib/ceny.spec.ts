import {
  CENY_ZAPASOWE,
  kosztMocy,
  kwotaGodzinowa,
  miesiecznieZRocznej,
  netto,
  opisCeny,
  parsujPlany,
  parsujStawki,
  rabatRocznyProcent,
  stawka,
  zl,
  zlozCeny,
} from './ceny';

// Odpowiedzi API w kształcie z produkcji 1.11.2026 (GET /plans, GET /autoscaling/pricing).
const PLANY = [
  { slug: 'poczta-standard', priceMonthly: '9.99', priceYearly: '99.99', productKind: 'EMAIL', trialDays: 0 },
  { slug: 'verris-hosting', priceMonthly: '45', priceYearly: '449', productKind: 'HOSTING', trialDays: 0 },
  { slug: 'newsletter-start', priceMonthly: '19', priceYearly: '190', productKind: 'EMAIL_MARKETING', trialDays: 0 },
  // Paczka 123: abonament Verris Kreator Pro (migracja 20261108140100_plan_kreator_pro).
  { slug: 'kreator-pro', priceMonthly: '9.9', priceYearly: '99', productKind: 'KREATOR_PRO', trialDays: 0 },
];
const STAWKI = [
  { resource: 'CPU', unit: 'cpu_pct', pricePerUnit: '0.001323', isActive: true },
  { resource: 'RAM', unit: 'ram_gb', pricePerUnit: '0.0882', isActive: true },
  { resource: 'DISK', unit: 'disk_gb', pricePerUnit: '0.0008', isActive: true },
];

describe('netto i formatowanie', () => {
  it('netto z brutto przy VAT 23%, do grosza', () => {
    expect(netto(45)).toBe(36.59);
    expect(netto(449)).toBe(365.04);
    expect(netto(9.99)).toBe(8.12);
    expect(netto(99.99)).toBe(81.29);
  });

  it('zł: pełne złote bez groszy, grosze z przecinkiem, tysiące ze spacją', () => {
    expect(zl(45)).toBe('45 zł');
    expect(zl(36.59)).toBe('36,59 zł');
    expect(zl(1347)).toBe('1 347 zł');
    expect(zl(9.9)).toBe('9,90 zł');
  });

  it('stawki godzinowe wszystkimi cyframi (do 6 znaczących), bez zer na końcu i bez notacji 1e-7', () => {
    expect(stawka(0.001323)).toBe('0,001323');
    expect(stawka(0.001283)).toBe('0,001283');
    expect(stawka(0.0882)).toBe('0,0882');
    expect(stawka(0.0008)).toBe('0,0008');
    // uwaga 6.11: stawka z 6 miejscami nie może się skracać (stary kod: „0,1235”)
    expect(stawka(0.123456)).toBe('0,123456');
    expect(stawka(0.0882 / 1.23)).toBe('0,0717073');
    expect(stawka(0.001323 / 1.23)).toBe('0,00107561');
    expect(stawka(0.0000005)).toBe('0,0000005');
    expect(stawka(0.1 * 3)).toBe('0,3');
  });

  it('kwota za godzinę: poniżej 1 zł dokładnie, od 1 zł do grosza', () => {
    expect(kwotaGodzinowa(0.001283)).toBe('0,001283');
    expect(kwotaGodzinowa(50 * 0.001323)).toBe('0,06615');
    expect(kwotaGodzinowa(0.4)).toBe('0,40');
    expect(kwotaGodzinowa(0)).toBe('0,00');
    expect(kwotaGodzinowa(1.2348)).toBe('1,23');
  });

  it('rabat roczny w pełnych procentach w dół: 449 zamiast 540 → 16%', () => {
    expect(rabatRocznyProcent({ miesiecznie: 45, rocznie: 449 })).toBe(16);
    expect(rabatRocznyProcent({ miesiecznie: 45, rocznie: 540 })).toBe(0);
    expect(miesiecznieZRocznej({ miesiecznie: 45, rocznie: 449 })).toBe(37.42);
  });

  it('opis ceny w czterech wariantach', () => {
    const c = { miesiecznie: 45, rocznie: 449 };
    expect(opisCeny(c, true, false).podpis).toBe('brutto · 365,04 zł netto · ok. 37,42 zł miesięcznie');
    expect(opisCeny(c, true, true).cena).toBe('365,04 zł');
    expect(opisCeny(c, false, false).podpis).toBe('brutto · 36,59 zł netto · bez zobowiązania');
    expect(opisCeny(c, false, true).podpis).toBe('netto · 45 zł brutto · bez zobowiązania');
  });

  it('koszt mocy: 3 h z +2 vCPU i +4 GB RAM = 1,85 zł (przykład z makiety)', () => {
    expect(kosztMocy(CENY_ZAPASOWE.stawki, 2, 4, 0, 3)).toBeCloseTo(1.8522, 4);
  });
});

describe('parsowanie odpowiedzi API', () => {
  it('hosting i poczta z GET /plans, z trialDays', () => {
    const p = parsujPlany(PLANY);
    expect(p.hosting).toEqual({ miesiecznie: 45, rocznie: 449, trialDays: 0 });
    expect(p.poczta).toEqual({ miesiecznie: 9.99, rocznie: 99.99 });
    expect(parsujPlany([{ ...PLANY[1], trialDays: 14 }]).hosting?.trialDays).toBe(14);
  });

  it('Kreator Pro z GET /plans (slug kreator-pro albo productKind KREATOR_PRO); netto jak w panelu: 8,05 i 80,49 zł', () => {
    expect(parsujPlany(PLANY).kreatorPro).toEqual({ miesiecznie: 9.9, rocznie: 99 });
    expect(parsujPlany([{ ...PLANY[3], slug: 'kreator-pro-2027', priceMonthly: '12.3' }]).kreatorPro?.miesiecznie).toBe(12.3);
    expect(parsujPlany(PLANY.slice(0, 3)).kreatorPro).toBeNull();
    expect([netto(9.9), netto(99)]).toEqual([8.05, 80.49]);
  });

  it('stawki z GET /autoscaling/pricing; nieaktywna albo brakująca reguła → null', () => {
    expect(parsujStawki(STAWKI)).toEqual({ cpu: 0.001323, ram: 0.0882, dysk: 0.0008 });
    expect(parsujStawki(STAWKI.slice(0, 2))).toBeNull();
    expect(parsujStawki([...STAWKI.slice(0, 2), { ...STAWKI[2], isActive: false }])).toBeNull();
  });

  it('ceny z API, gdy wszystko jest; nowa cena z admina od razu w wyniku', () => {
    const c = zlozCeny([{ ...PLANY[1], priceMonthly: '49' }, PLANY[0], { ...PLANY[3], priceMonthly: '11.9' }], STAWKI);
    expect(c.zrodlo).toBe('api');
    expect(c.hosting.miesiecznie).toBe(49);
    expect(c.kreatorPro.miesiecznie).toBe(11.9);
  });

  it('brak planu Kreator Pro w API → cena zapasowa i źródło „zapas” (strona nie pokaże pustej ceny)', () => {
    const c = zlozCeny(PLANY.slice(0, 3), STAWKI);
    expect(c.zrodlo).toBe('zapas');
    expect(c.kreatorPro).toEqual(CENY_ZAPASOWE.kreatorPro);
  });

  it('API nie odpowiada albo zwraca śmieci → wartości zapasowe, strona nie jest pusta', () => {
    expect(zlozCeny(null, null)).toEqual(CENY_ZAPASOWE);
    const c = zlozCeny({ error: 'x' }, STAWKI);
    expect(c.zrodlo).toBe('zapas');
    expect(c.hosting).toEqual(CENY_ZAPASOWE.hosting);
    expect(c.stawki).toEqual({ cpu: 0.001323, ram: 0.0882, dysk: 0.0008 });
  });
});
