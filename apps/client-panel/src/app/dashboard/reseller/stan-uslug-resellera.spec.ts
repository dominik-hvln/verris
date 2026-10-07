import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATUS } from './reseller-klient';

// D3 07.10: reseller widział przy usłudze klienta surowe „pending_payment” — mapa miała klucz PENDING,
// którego enum nie zna. Każdy stan subskrypcji musi mieć polską etykietę.
describe('O-05 — stan usługi klienta resellera', () => {
  it('każda wartość SubscriptionStatus ma etykietę', () => {
    const schema = readFileSync(join(__dirname, '../../../../../../libs/database/prisma/schema.prisma'), 'utf8');
    const blok = /enum SubscriptionStatus \{([^}]*)\}/.exec(schema)![1];
    const stany = blok.split('\n').map((l) => l.replace(/\/\/.*/, '').trim()).filter(Boolean);
    expect(stany).toContain('PENDING_PAYMENT');
    for (const s of stany) expect(STATUS[s]?.[0]).toMatch(/^[a-ząćęłńóśźż ]+$/);
  });
});
