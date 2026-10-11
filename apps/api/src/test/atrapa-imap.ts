import * as net from 'node:net';

/**
 * Atrapa serwera IMAP do testów (zwykły TCP, bez TLS) — tylko komendy, których używa PolaczenieImap.
 * Wiadomości: uid → treść; `oznaczone` zbiera UID-y ze słowem kluczowym (STORE).
 */
export async function atrapaImap(o: { wiadomosci: Map<number, Buffer>; haslo?: string; storeNo?: boolean }) {
  const oznaczone = new Set<number>();
  const komendy: string[] = [];
  const serwer = net.createServer((s) => {
    s.write('* OK [CAPABILITY IMAP4rev1] atrapa gotowa\r\n');
    let bufor = '';
    s.on('data', (c) => {
      bufor += c.toString('utf8');
      let i: number;
      while ((i = bufor.indexOf('\r\n')) >= 0) {
        const linia = bufor.slice(0, i);
        bufor = bufor.slice(i + 2);
        obsluz(s, linia);
      }
    });
  });
  const obsluz = (s: net.Socket, linia: string) => {
    const [tag, ...reszta] = linia.split(' ');
    const cmd = reszta.join(' ');
    komendy.push(cmd);
    const ok = (t = 'OK zrobione') => s.write(`${tag} ${t}\r\n`);
    if (/^LOGIN /i.test(cmd)) return o.haslo && !cmd.endsWith(`"${o.haslo.replace(/[\\"]/g, (z) => `\\${z}`)}"`) ? ok('NO [AUTHENTICATIONFAILED] złe dane') : ok();
    if (/^SELECT /i.test(cmd)) return s.write(`* ${o.wiadomosci.size} EXISTS\r\n`), ok('OK [READ-WRITE] SELECT');
    if (/^UID SEARCH /i.test(cmd)) {
      const uidy = [...o.wiadomosci.keys()].filter((u) => !oznaczone.has(u));
      return s.write(`* SEARCH${uidy.map((u) => ` ${u}`).join('')}\r\n`), ok();
    }
    const f = /^UID FETCH (\d+) \((.+)\)$/i.exec(cmd);
    if (f) {
      const uid = Number(f[1]);
      const m = o.wiadomosci.get(uid);
      if (!m) return ok();
      if (/BODY\.PEEK\[HEADER\]/i.test(f[2])) {
        const h = m.subarray(0, m.indexOf('\r\n\r\n') + 2);
        s.write(`* 1 FETCH (UID ${uid} RFC822.SIZE ${m.length} BODY[HEADER] {${h.length}}\r\n`);
        s.write(h);
        return s.write(')\r\n'), ok();
      }
      s.write(`* 1 FETCH (UID ${uid} BODY[] {${m.length}}\r\n`);
      s.write(m);
      return s.write(')\r\n'), ok();
    }
    const st = /^UID STORE (\d+) /i.exec(cmd);
    if (st) {
      if (o.storeNo) return ok('NO [CANNOT] słowa kluczowe wyłączone');
      oznaczone.add(Number(st[1]));
      return ok();
    }
    if (/^LOGOUT/i.test(cmd)) return s.write('* BYE\r\n'), ok(), s.end();
    return ok('BAD nieznana komenda');
  };
  await new Promise<void>((r) => serwer.listen(0, '127.0.0.1', r));
  const port = (serwer.address() as net.AddressInfo).port;
  return {
    oznaczone,
    komendy,
    polacz: () => new Promise<net.Socket>((r) => { const s = net.connect(port, '127.0.0.1', () => r(s)); }),
    zamknij: () => new Promise<void>((r) => serwer.close(() => r())),
  };
}
