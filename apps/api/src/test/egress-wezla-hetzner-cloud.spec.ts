import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Egress węzła (security-egress-lockdown.sh --role node) na Hetzner Cloud / AlmaLinux:
 *  - IPv4 z DHCP → odnowienie dzierżawy (udp/67) musi przejść, inaczej węzeł traci IP;
 *  - drop IOC przed akceptacjami portów (wcześniej 80/443 przechodziły przed dropem);
 *  - worker migracji (root) sięga dowolnych hostów/portów klientów (SFTP 65002, FTP pasywne, IMAP 143);
 *  - nie używamy nftables.service (Conflicts= z firewalld, ExecStop = flush ruleset).
 */
const SKRYPT = readFileSync(
  join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'security-egress-lockdown.sh'),
  'utf8',
);
const REGULY = SKRYPT.slice(SKRYPT.indexOf('chain output'), SKRYPT.indexOf('\nEOF', SKRYPT.indexOf('chain output')));

describe('Egress węzła — Hetzner Cloud', () => {
  it('przepuszcza DHCP (udp 67) i DNS/NTP', () => {
    expect(SKRYPT).toMatch(/COMMON_ALLOW_UDP="\{ 53, 67, 123, 547 \}"/);
  });

  it('drop IOC stoi przed pierwszą akceptacją', () => {
    expect(REGULY.indexOf('ip daddr 216.218.185.162 drop')).toBeLessThan(REGULY.indexOf('accept'));
  });

  it('root (worker migracji) może łączyć się po TCP na dowolny port, reszta UID nie', () => {
    expect(REGULY).toContain('meta skuid 0 meta l4proto tcp accept');
    expect(REGULY).not.toMatch(/^\s*meta l4proto tcp accept/m);
  });

  it('trwałość przez własną jednostkę, nie nftables.service (Conflicts z firewalld, flush ruleset)', () => {
    expect(SKRYPT).toContain('systemctl enable verris-node-egress.service');
    expect(SKRYPT).toContain('ExecStop=/usr/sbin/nft delete table inet verris_egress');
    expect(SKRYPT).not.toMatch(/^\s*systemctl enable --now nftables/m);
  });
});
