import { NotFoundException } from '@nestjs/common';
import { DirectAdminService } from './directadmin.service';

/** C-18 — zmiana hasła FTP zachowuje katalog konta i trafia do audytu. */
function fake(rows: { username: string; path: string }[]) {
  return {
    accountDomainForSubscription: jest.fn().mockResolvedValue('firma.pl'),
    listHostingFtpAccounts: jest.fn().mockResolvedValue({ rows, fetchError: null }),
    daFormForSubscription: jest.fn().mockResolvedValue(new URLSearchParams()),
    audit: { record: jest.fn() },
  };
}
const change = (self: ReturnType<typeof fake>, user: string) =>
  (DirectAdminService.prototype.changeHostingFtpPassword as (...a: unknown[]) => Promise<unknown>).call(self, 's1', 'u1', user, 'NoweHaslo123');

describe('C-18 changeHostingFtpPassword', () => {
  it('modyfikuje konto z zachowaniem katalogu i zapisuje audyt', async () => {
    const self = fake([{ username: 'transfer@firma.pl', path: '/home/u/domains/firma.pl/public_html/sklep' }]);
    await change(self, 'transfer@firma.pl');
    expect(self.daFormForSubscription).toHaveBeenCalledWith('s1', 'u1', '/CMD_API_FTP', expect.objectContaining({
      action: 'modify',
      user: 'transfer',
      passwd: 'NoweHaslo123',
      passwd2: 'NoweHaslo123',
      custom_val: '/home/u/domains/firma.pl/public_html/sklep',
    }));
    expect(self.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_FTP_PASSWORD_CHANGED' }));
  });

  it('konto spoza usługi → 404, nic nie wysyłamy do DA', async () => {
    const self = fake([{ username: 'inne@firma.pl', path: '/' }]);
    await expect(change(self, 'obcy')).rejects.toBeInstanceOf(NotFoundException);
    expect(self.daFormForSubscription).not.toHaveBeenCalled();
  });
});
