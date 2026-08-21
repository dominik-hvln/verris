import { resolveHostingPrimaryDomain } from './hosting-primary-domain';

describe('resolveHostingPrimaryDomain', () => {
  it('keeps stored domain when still on DA', () => {
    expect(
      resolveHostingPrimaryDomain({
        storedDomain: 'hvln.pl',
        daConfigDomain: 'hvln.pl',
        daDomains: ['hvln.pl', 'other.pl'],
      }),
    ).toBe('hvln.pl');
  });

  it('switches to new domain when stored was removed from DA', () => {
    expect(
      resolveHostingPrimaryDomain({
        storedDomain: 'hvln.pl',
        daConfigDomain: 'tprstudio.pl',
        daDomains: ['tprstudio.pl'],
      }),
    ).toBe('tprstudio.pl');
  });

  it('uses DA config domain when stored is gone but config matches list', () => {
    expect(
      resolveHostingPrimaryDomain({
        storedDomain: 'hvln.pl',
        daConfigDomain: 'tprstudio.pl',
        daDomains: ['tprstudio.pl', 'www.tprstudio.pl'],
      }),
    ).toBe('tprstudio.pl');
  });

  it('falls back to sole domain on account when config is stale', () => {
    expect(
      resolveHostingPrimaryDomain({
        storedDomain: 'hvln.pl',
        daConfigDomain: 'hvln.pl',
        daDomains: ['tprstudio.pl'],
      }),
    ).toBe('tprstudio.pl');
  });
});
