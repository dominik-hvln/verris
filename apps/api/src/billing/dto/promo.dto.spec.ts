import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminUpdatePromoDto } from './promo.dto.js';

// B1 (przegląd) — PATCH kodu: `null` zdejmuje termin/limit/opis, ale `active` nie ma stanu „brak”.
// Wcześniej `{ active: null }` przechodziło walidację (@IsOptional przepuszcza null) i padało w Prismie jako 500.
const bledy = (v: Record<string, unknown>) =>
  validateSync(plainToInstance(AdminUpdatePromoDto, v, { enableImplicitConversion: true }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((e) => e.property);

describe('AdminUpdatePromoDto', () => {
  it('active: null — błąd walidacji (400), nie 500 z bazy', () => {
    expect(bledy({ active: null })).toEqual(['active']);
  });

  it('null zdejmuje termin, limit i opis; pominięte pola bez zmian', () => {
    expect(bledy({ validTo: null, maxRedemptions: null, description: null })).toEqual([]);
    expect(bledy({})).toEqual([]);
    expect(bledy({ active: false })).toEqual([]);
  });

  it('złe typy i pola spoza zakresu odrzucone', () => {
    expect(bledy({ maxRedemptions: -1 })).toEqual(['maxRedemptions']);
    expect(bledy({ validTo: 'jutro' })).toEqual(['validTo']);
    expect(bledy({ value: 90 })).toEqual(['value']);
  });
});
