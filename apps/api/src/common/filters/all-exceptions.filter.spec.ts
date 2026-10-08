import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { DirectAdminApiError } from '@verris/directadmin-sdk';
import { KOMUNIKAT_OGOLNY } from '../biala-etykieta.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function obsluz(e: unknown, url = '/x') {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({ method: 'POST', url }) }) };
  new AllExceptionsFilter().catch(e, host as never);
  return {
    kod: (status.mock.calls[0] as unknown[])[0],
    tresc: (json.mock.calls[0] as unknown[])[0] as { message: unknown; zrodlo?: string; code?: string; operacja?: string },
  };
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

  it('odmowa serwera jest oznaczona dla panelu klienta (tłumaczy ją na polski)', () => {
    expect(obsluz(new DirectAdminApiError('DirectAdmin API Error: Database already exists', 'Database already exists')).tresc).toMatchObject({
      message: 'Database already exists',
      zrodlo: 'serwer-hostingu',
    });
    expect(obsluz(new BadRequestException('Zła domena')).tresc.zrodlo).toBeUndefined();
  });

  it('white label: tekst z nazwą panelu serwera nie trafia do klienta, zespół widzi go w całości', () => {
    const provisioning = () =>
      new ServiceUnavailableException('DirectAdmin package "start" is missing on the node and could not be created automatically. Contact support. [ensureUserPackage: ECONNREFUSED]');
    expect(obsluz(provisioning(), '/subscriptions/s1/retry')).toMatchObject({ kod: 503, tresc: { message: KOMUNIKAT_OGOLNY } });
    expect(obsluz(new DirectAdminApiError('x', 'Unable to run CMD_API_DATABASES'), '/services/s1/hosting-databases').tresc.message).toBe(KOMUNIKAT_OGOLNY);
    expect(obsluz(new BadRequestException('Brak połączenia z 10.0.0.5:2222')).tresc.message).toBe(KOMUNIKAT_OGOLNY);
    expect(obsluz(new BadRequestException('Tej bazy nie da się usunąć')).tresc.message).toBe('Tej bazy nie da się usunąć');
    expect(obsluz(provisioning(), '/admin/subscriptions/s1/retry').tresc.message).toMatch(/^DirectAdmin package/);
    expect(obsluz(provisioning(), '/staff/migrations/m1').tresc.message).toMatch(/^DirectAdmin package/);
  });

  it('PB-47 — kod odmowy „wymaga wniosku” dociera do panelu, inne pola wyjątku nie', () => {
    const r = obsluz(
      new ForbiddenException({ code: 'WYMAGA_WNIOSKU', operacja: 'CUSTOMER_INTERNAL_FLAG', message: 'Wymaga wniosku.', sekret: 'x' }),
      '/admin/users/u1/operational',
    );
    expect(r.kod).toBe(403);
    expect(r.tresc).toMatchObject({ message: 'Wymaga wniosku.', code: 'WYMAGA_WNIOSKU', operacja: 'CUSTOMER_INTERNAL_FLAG' });
    expect(r.tresc).not.toHaveProperty('sekret');
    expect(obsluz(new BadRequestException('Zła domena')).tresc).not.toHaveProperty('code');
  });
});
