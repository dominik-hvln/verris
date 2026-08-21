import { mergeAdminSettingsPayload } from '@verris/directadmin-sdk';

describe('mergeAdminSettingsPayload', () => {
  it('reads server_settings from JSON', () => {
    expect(
      mergeAdminSettingsPayload({
        server_settings: { ns1: 'ns1.verris.pl', ns2: 'ns2.verris.pl', dns_ttl: '1440' },
      }),
    ).toEqual({
      ns1: 'ns1.verris.pl',
      ns2: 'ns2.verris.pl',
      dns_ttl: '1440',
    });
  });

  it('reads urlencoded body', () => {
    expect(mergeAdminSettingsPayload('ns1=old.pl&ns2=old2.pl&error=0')).toEqual({
      ns1: 'old.pl',
      ns2: 'old2.pl',
    });
  });

  it('reads flat keys from CMD_ADMIN_SETTINGS JSON', () => {
    expect(
      mergeAdminSettingsPayload({
        success: 'saved',
        ns1: 'ns1.verris.pl',
        auto_update: 'yes',
      }),
    ).toMatchObject({ ns1: 'ns1.verris.pl', auto_update: 'yes' });
  });
});
