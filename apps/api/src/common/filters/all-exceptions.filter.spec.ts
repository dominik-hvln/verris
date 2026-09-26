import { BadRequestException } from '@nestjs/common';
import { DirectAdminApiError } from '@verris/directadmin-sdk';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function obsluz(e: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({ method: 'POST', url: '/x' }) }) };
  new AllExceptionsFilter().catch(e, host as never);
  return { kod: (status.mock.calls[0] as unknown[])[0], tresc: (json.mock.calls[0] as unknown[])[0] as { message: unknown } };
}

describe('AllExceptionsFilter', () => {
  it('odmowa DirectAdmina → 400 z powodem od DA, bez prefiksu', () => {
    const r = obsluz(new DirectAdminApiError('DirectAdmin API Error: Domena już istnieje', 'Domena już istnieje'));
    expect(r.kod).toBe(400);
    expect(r.tresc.message).toBe('Domena już istnieje');
  });

  it('zwykły błąd → 500 bez szczegółów; HttpException bez zmian', () => {
    expect(obsluz(new Error('connect ECONNREFUSED 10.0.0.1:2222'))).toMatchObject({ kod: 500, tresc: { message: 'Wewnętrzny błąd serwera' } });
    expect(obsluz(new BadRequestException('Zła domena'))).toMatchObject({ kod: 400, tresc: { message: 'Zła domena' } });
  });
});
