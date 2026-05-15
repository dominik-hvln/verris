export interface Domain {
  id: string;
  name: string;
  status: 'ACTIVE' | 'EXPIRED' | 'PENDING';
  expiryDate: string;
  autoRenew: boolean;
}

export interface DnsRecord {
  id: string;
  type: 'A' | 'CNAME' | 'MX' | 'TXT' | 'AAAA';
  name: string;
  value: string;
  ttl: number;
}

export interface Database {
  id: string;
  name: string;
  user: string;
  sizeMb: number;
}

export interface SslCertificate {
  id: string;
  domain: string;
  issuer: string;
  expiryDate: string;
  status: 'VALID' | 'EXPIRED' | 'REVOKED';
  isLetsEncrypt: boolean;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class HostingService {
  static async getDomains(): Promise<Domain[]> {
    await delay(800);
    return [
      { id: '1', name: 'verris.pl', status: 'ACTIVE', expiryDate: '2027-04-01', autoRenew: true },
      { id: '2', name: 'mojadomena.com', status: 'ACTIVE', expiryDate: '2026-10-15', autoRenew: false },
      { id: '3', name: 'test-staging.pl', status: 'PENDING', expiryDate: '2025-04-01', autoRenew: true },
    ];
  }

  static async getDnsRecords(domain: string): Promise<DnsRecord[]> {
    await delay(600);
    return [
      { id: '1', type: 'A', name: '@', value: '1.2.3.4', ttl: 3600 },
      { id: '2', type: 'CNAME', name: 'www', value: 'verris.pl', ttl: 3600 },
      { id: '3', type: 'MX', name: '@', value: 'mail.verris.pl (10)', ttl: 3600 },
      { id: '4', type: 'TXT', name: '@', value: 'v=spf1 include:_spf.google.com ~all', ttl: 3600 },
    ];
  }

  static async getDatabases(): Promise<Database[]> {
    await delay(700);
    return [
      { id: '1', name: 'verris_wp_main', user: 'verris_dbu', sizeMb: 124.5 },
      { id: '2', name: 'verris_shop', user: 'verris_shop_u', sizeMb: 45.2 },
    ];
  }

  static async getSslCertificates(): Promise<SslCertificate[]> {
    await delay(500);
    return [
      { id: '1', domain: 'verris.pl', issuer: "Let's Encrypt", expiryDate: '2026-07-01', status: 'VALID', isLetsEncrypt: true },
      { id: '2', domain: 'panel.verris.pl', issuer: "Let's Encrypt", expiryDate: '2026-06-15', status: 'VALID', isLetsEncrypt: true },
    ];
  }
}
