import { parseIpConfig } from '@verris/directadmin-sdk';

// Surowa odpowiedź DA 1.710 z węzła testowego t1.verris.pl (28.09) — klucz = zakodowany adres.
const DA_1710 =
  '%32%2E%32%38%2E%32%30%34%2E%32%34%39=gateway%3D%26ip%3D%32%2E%32%38%2E%32%30%34%2E%32%34%39%26netmask%3D%2F%33%32%26ns%3D%26reseller%3D%26status%3Dserver%26value%3D%31';

describe('parseIpConfig (CMD_API_IP_CONFIG)', () => {
  it('DA 1.710: adres w kluczu', () => {
    expect(parseIpConfig(DA_1710)).toEqual(['2.28.204.249']);
  });
  it('starszy format list[]', () => {
    expect(parseIpConfig('list[]=203.0.113.7&list[]=2a01:4f8::1')).toEqual(['203.0.113.7', '2a01:4f8::1']);
  });
  it('IPv6 w kluczu, bez śmieci z innych pól', () => {
    expect(parseIpConfig('2a01%3A4f8%3A1c16%3Ab3cc%3A%3A1=status%3Dserver&error=0')).toEqual(['2a01:4f8:1c16:b3cc::1']);
  });
});
