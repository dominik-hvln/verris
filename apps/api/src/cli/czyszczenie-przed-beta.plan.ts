import type { PrismaClient } from '@verris/database';

/**
 * Czyszczenie panelu przed otwartą betą (decyzja 12.10: „teraz są tylko testowe dokumenty, cały panel będziemy
 * czyścić przed otwartą Betą”). Ten moduł LICZY i SPRAWDZA — usuwa tylko {@link wykonajCzyszczenie}, wołane
 * z CLI z jawnym potwierdzeniem (czyszczenie-przed-beta.ts).
 *
 * Co znika: konta klientów (rola USER) spoza listy „zachowaj” — razem z tym, co do nich należy (kaskada FK:
 * usługi, portfel, faktury, płatności, zgłoszenia, powiadomienia, sesje…). Co zostaje: konta zespołu (ADMIN/STAFF),
 * plany, węzły, ustawienia platformy, dokumenty prawne, baza wiedzy. Dziennik audytu zostaje (userId → NULL).
 *
 * Blokady (bez nich nic nie zostanie usunięte):
 *  - klient z kontem hostingowym albo VPS, które nie są usunięte — najpierw usuń usługę w panelu (zdejmuje konto
 *    z węzła); usunięcie w bazie zostawiłoby osierocone konto na serwerze;
 *  - klient z fakturą w KSeF PRODUKCYJNYM (w kolejce z plikiem PROD, offline, wysłaną albo przyjętą) — to prawdziwy
 *    dokument, nie wolno go usunąć;
 *  - subkonto z listy „zachowaj”, którego właściciel idzie do usunięcia (kaskada customerOwnerId usunęłaby je).
 *
 * Przegląd 15.10: plan i usunięcie liczą się w JEDNEJ transakcji (Serializable) — panel działa w tym czasie, a klient
 * mógł między podglądem a usunięciem dostać konto na węźle. Numeracja (`--zeruj-numeracje`) nie zeruje już liczników
 * na ślepo: licznik dostaje najwyższy numer, który po czyszczeniu zostaje (np. faktura klienta z listy „zachowaj”) —
 * inaczej następny dokument dostawał zajęty numer (P2002) i żadna wpłata w tym miesiącu się nie księgowała.
 */

export interface PlanCzyszczenia {
  baza: string;
  doUsuniecia: Array<{ id: string; email: string; utworzono: string }>;
  zachowani: string[];
  /** Adresy z listy „zachowaj”, których nie ma w bazie (literówka?). */
  nieznalezieni: string[];
  zespol: number;
  /** Ile wierszy zniknie razem z klientami (kaskada FK do User), per tabela. */
  kaskada: Array<{ tabela: string; kolumna: string; wierszy: number }>;
  /** Wiersze, które zostaną, ale stracą powiązanie z klientem (SET NULL), per tabela. */
  odpiete: Array<{ tabela: string; kolumna: string; wierszy: number }>;
  blokady: Array<{ email: string; powod: string }>;
  pieniadze: {
    saldoK: string;
    /** Wpłaty Paynow potwierdzone, MINUS zwroty przyjęte przez Paynow. */
    wplatyPaynowZl: string;
    fakturKsefTest: number;
    fakturBezKsef: number;
    /** Dokumenty z numerem faktury z programu księgowego (tryb „zewnętrzny”) — sprawdź z księgową. */
    zNumeremKsiegowym: number;
  };
  /** Do sprawdzenia przed usunięciem (nie blokują — mogą być testowe/sandbox). */
  uwagi: string[];
  numeracja: Array<{ seria: string; rok: number; miesiac: number; ostatni: number }>;
}

interface FkDoUser {
  tabela: string;
  kolumna: string;
  regula: 'CASCADE' | 'SET NULL' | 'INNE';
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function kluczeObce(db: Pick<PrismaClient, '$queryRaw'>): Promise<FkDoUser[]> {
  const wiersze = await db.$queryRaw<Array<{ tabela: string; kolumna: string; regula: string }>>`
    SELECT c.conrelid::regclass::text AS tabela, a.attname AS kolumna, c.confdeltype::text AS regula
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = '"User"'::regclass`;
  return wiersze.map((w) => ({
    tabela: w.tabela.replace(/^"|"$/g, ''),
    kolumna: w.kolumna,
    regula: w.regula === 'c' ? 'CASCADE' : w.regula === 'n' ? 'SET NULL' : 'INNE',
  }));
}

type Db = Pick<PrismaClient, '$queryRaw' | '$queryRawUnsafe' | 'user' | 'account' | 'vpsInstance' | 'invoice' | 'paynowPlatnosc' | 'invoiceCounter' | 'domain'>;

export async function planCzyszczenia(db: Db, zachowaj: string[]): Promise<PlanCzyszczenia> {
  const lista = [...new Set(zachowaj.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const [{ baza }] = await db.$queryRaw<Array<{ baza: string }>>`SELECT current_database() AS baza`;
  const klienci = await db.user.findMany({
    where: { role: 'USER' },
    select: { id: true, email: true, createdAt: true, walletBalance: true, customerOwnerId: true, anonymizedAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const zachowani = klienci.filter((k) => lista.includes(k.email.toLowerCase()));
  const doUsuniecia = klienci.filter((k) => !lista.includes(k.email.toLowerCase()));
  const ids = doUsuniecia.map((k) => k.id);
  const zespol = await db.user.count({ where: { role: { not: 'USER' } } });

  const fk = await kluczeObce(db);
  const kaskada: PlanCzyszczenia['kaskada'] = [];
  const odpiete: PlanCzyszczenia['odpiete'] = [];
  if (ids.length) {
    for (const k of fk) {
      if (k.regula === 'INNE') continue;
      const [{ n }] = await db.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*)::bigint AS n FROM ${ident(k.tabela)} WHERE ${ident(k.kolumna)} = ANY($1::text[])`,
        ids,
      );
      if (Number(n) === 0) continue;
      (k.regula === 'CASCADE' ? kaskada : odpiete).push({ tabela: k.tabela, kolumna: k.kolumna, wierszy: Number(n) });
    }
  }
  kaskada.sort((a, b) => b.wierszy - a.wierszy);
  odpiete.sort((a, b) => b.wierszy - a.wierszy);

  const email = new Map(doUsuniecia.map((k) => [k.id, k.email]));
  const blokady: PlanCzyszczenia['blokady'] = [];
  const konta = await db.account.findMany({
    where: { userId: { in: ids }, status: { not: 'DELETED' } },
    select: { userId: true, domain: true, status: true },
  });
  for (const a of konta) {
    blokady.push({ email: email.get(a.userId) ?? a.userId, powod: `konto hostingowe ${a.domain} (${a.status}) na węźle — usuń usługę w panelu` });
  }
  const vps = await db.vpsInstance.findMany({
    where: { userId: { in: ids }, status: { not: 'DELETED' } },
    select: { userId: true, status: true },
  });
  for (const v of vps) blokady.push({ email: email.get(v.userId) ?? v.userId, powod: `VPS (${v.status}) — usuń w panelu` });
  // Przegląd 15.10: także PENDING (plik PROD już zamrożony — np. klient pobrał PDF z kodem QR) i OFFLINE (wystawiona
  // w trybie offline, czeka na dosłanie).
  const ksefProd = await db.invoice.findMany({
    where: { userId: { in: ids }, ksefSrodowisko: 'prod', ksefStatus: { in: ['PENDING', 'OFFLINE', 'SUBMITTED', 'ACCEPTED', 'UNCERTAIN'] } },
    select: { userId: true, number: true },
  });
  for (const f of ksefProd) {
    blokady.push({ email: email.get(f.userId) ?? f.userId, powod: `faktura ${f.number} w KSeF produkcyjnym — prawdziwy dokument, nie usuwamy` });
  }

  // Przegląd 15.10: subkonto zachowane, a właściciel do usunięcia — kaskada (customerOwnerId) usunęłaby je mimo listy.
  const doUsunieciaIds = new Set(ids);
  for (const z of zachowani) {
    if (z.customerOwnerId && doUsunieciaIds.has(z.customerOwnerId)) {
      blokady.push({
        email: z.email,
        powod: `subkonto na liście „zachowaj”, a jego właściciel ${email.get(z.customerOwnerId)} nie — dopisz właściciela albo usuń subkonto z listy`,
      });
    }
  }

  const saldo = doUsuniecia.reduce((s, k) => s + Number(k.walletBalance), 0);
  const paynow = await db.paynowPlatnosc.aggregate({ where: { userId: { in: ids }, status: 'CONFIRMED' }, _sum: { kwotaMinor: true, zwroconoMinor: true } });
  const [fakturKsefTest, fakturBezKsef, zNumeremKsiegowym, domeny] = await Promise.all([
    db.invoice.count({ where: { userId: { in: ids }, ksefSrodowisko: { in: ['test', 'demo'] } } }),
    db.invoice.count({ where: { userId: { in: ids }, ksefSrodowisko: null } }),
    db.invoice.count({ where: { userId: { in: ids }, externalInvoiceNumber: { not: null } } }),
    db.domain.findMany({ where: { userId: { in: ids }, status: { not: 'EXPIRED' }, registrarExternalId: { not: null } }, select: { userId: true, name: true, status: true } }),
  ]);
  const uwagi: string[] = [];
  // Przegląd 15.10 — rzeczy, których skrypt nie rozstrzygnie sam (bywają testowe: sandbox OpenProvider, test RODO).
  for (const d of domeny) uwagi.push(`${email.get(d.userId)}: domena ${d.name} (${d.status}) u rejestratora — sandbox? jeśli prawdziwa, przenieś albo zostaw klienta`);
  const anonimowe = doUsuniecia.filter((k) => k.anonymizedAt);
  if (anonimowe.length) {
    uwagi.push(`${anonimowe.length} zanonimizowanych kont (RODO) — ich dokumenty mogą podlegać obowiązkowi przechowywania 5 lat; sprawdź przed usunięciem`);
  }
  const liczniki = await db.invoiceCounter.findMany({ orderBy: [{ series: 'asc' }, { year: 'asc' }, { month: 'asc' }] });

  return {
    baza,
    doUsuniecia: doUsuniecia.map((k) => ({ id: k.id, email: k.email, utworzono: k.createdAt.toISOString().slice(0, 10) })),
    zachowani: zachowani.map((k) => k.email),
    nieznalezieni: lista.filter((e) => !klienci.some((k) => k.email.toLowerCase() === e)),
    zespol,
    kaskada,
    odpiete,
    blokady,
    pieniadze: {
      saldoK: saldo.toFixed(2),
      wplatyPaynowZl: (((paynow._sum.kwotaMinor ?? 0) - (paynow._sum.zwroconoMinor ?? 0)) / 100).toFixed(2),
      fakturKsefTest,
      fakturBezKsef,
      zNumeremKsiegowym,
    },
    uwagi,
    numeracja: liczniki.map((l) => ({ seria: l.series, rok: l.year, miesiac: l.month, ostatni: l.seq })),
  };
}

export function opisPlanu(p: PlanCzyszczenia): string {
  const l: string[] = [];
  l.push(`Baza: ${p.baza}`);
  l.push(`Klienci do usunięcia: ${p.doUsuniecia.length} · zachowani klienci: ${p.zachowani.length} · konta zespołu (zostają): ${p.zespol}`);
  for (const k of p.doUsuniecia) l.push(`  - ${k.email} (od ${k.utworzono})`);
  if (p.zachowani.length) l.push(`Zachowani: ${p.zachowani.join(', ')}`);
  if (p.nieznalezieni.length) l.push(`UWAGA — z listy „zachowaj” nie ma w bazie: ${p.nieznalezieni.join(', ')}`);
  l.push('Zniknie razem z klientami (kaskada):');
  for (const k of p.kaskada) l.push(`  ${k.tabela}.${k.kolumna}: ${k.wierszy}`);
  if (p.odpiete.length) {
    l.push('Zostanie bez powiązania z klientem (SET NULL):');
    for (const k of p.odpiete) l.push(`  ${k.tabela}.${k.kolumna}: ${k.wierszy}`);
  }
  l.push(
    `Pieniądze klientów do usunięcia: saldo ${p.pieniadze.saldoK} K, wpłaty Paynow po zwrotach ${p.pieniadze.wplatyPaynowZl} zł ` +
      `(prawdziwe — sprawdź zwroty przed usunięciem); faktury KSeF TEST: ${p.pieniadze.fakturKsefTest}, poza KSeF: ${p.pieniadze.fakturBezKsef}` +
      ` (w tym z numerem z programu księgowego: ${p.pieniadze.zNumeremKsiegowym} — sprawdź z księgową)`,
  );
  if (p.uwagi.length) {
    l.push('DO SPRAWDZENIA przed usunięciem:');
    for (const u of p.uwagi) l.push(`  ${u}`);
  }
  l.push('Numeracja dokumentów (zostaje, chyba że --zeruj-numeracje: licznik = najwyższy numer, który zostaje — decyzja księgowej):');
  for (const n of p.numeracja) l.push(`  ${n.seria} ${n.rok}/${String(n.miesiac).padStart(2, '0')}: ostatni ${n.ostatni}`);
  if (p.blokady.length) {
    l.push(`BLOKADY (${p.blokady.length}) — czyszczenie nie ruszy, dopóki są:`);
    for (const b of p.blokady) l.push(`  ${b.email}: ${b.powod}`);
  } else {
    l.push('Blokad brak.');
  }
  return l.join('\n');
}

/**
 * Usunięcie wg planu — w jednej transakcji, po ponownym sprawdzeniu. `potwierdzenie` musi równać się liczbie
 * klientów do usunięcia z podglądu (operator potwierdza to, co widział), a blokad nie może być.
 */
export async function wykonajCzyszczenie(
  db: PrismaClient,
  zachowaj: string[],
  o: { potwierdzenie: number; zerujNumeracje?: boolean },
): Promise<{ usunieto: number; wyzerowanoNumeracje: boolean }> {
  // Przegląd 15.10: plan (blokady, lista, liczba) liczony w TEJ SAMEJ transakcji co usunięcie, Serializable — panel
  // działa; klient z planu nie może w międzyczasie dostać konta na węźle ani faktury PROD, które usunęlibyśmy na ślepo.
  return db.$transaction(
    async (tx) => {
      const plan = await planCzyszczenia(tx as unknown as Db, zachowaj);
      if (plan.blokady.length) throw new Error(`Są blokady (${plan.blokady.length}) — uruchom podgląd i usuń je najpierw.`);
      if (o.potwierdzenie !== plan.doUsuniecia.length) {
        throw new Error(
          `Potwierdzenie ${o.potwierdzenie} ≠ liczba klientów do usunięcia (${plan.doUsuniecia.length}) — stan zmienił się od podglądu; uruchom podgląd ponownie.`,
        );
      }
      const ids = plan.doUsuniecia.map((k) => k.id);
      // Subkonta wskazują właściciela (customerOwnerId, CASCADE) — usuwają się razem z nim (zachowane blokuje plan).
      const { count } = await tx.user.deleteMany({ where: { id: { in: ids }, role: 'USER' } });
      if (count !== ids.length) throw new Error(`Usunięto ${count} zamiast ${ids.length} — wycofano; uruchom podgląd ponownie.`);
      if (o.zerujNumeracje) await dopasujNumeracje(tx);
      await tx.auditLog.create({
        data: {
          action: 'CZYSZCZENIE_PRZED_BETA',
          details: { usunieto: ids.length, zachowani: plan.zachowani, zerujNumeracje: !!o.zerujNumeracje },
        },
      });
      return { usunieto: ids.length, wyzerowanoNumeracje: !!o.zerujNumeracje };
    },
    { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 120_000 },
  );
}

/**
 * Liczniki numeracji po czyszczeniu: najwyższy numer, który ZOSTAJE w danej serii i miesiącu (faktury i proformy
 * klientów z listy „zachowaj”), a licznik bez żadnego dokumentu znika (następny dokument dostaje 0001).
 */
async function dopasujNumeracje(tx: Pick<PrismaClient, 'invoiceCounter' | 'invoice' | 'proforma'>): Promise<void> {
  for (const l of await tx.invoiceCounter.findMany()) {
    const prefiks = `${l.series}/${l.year}/${String(l.month).padStart(2, '0')}/`;
    const where = { number: { startsWith: prefiks } };
    const numery = [
      ...(await tx.invoice.findMany({ where, select: { number: true } })),
      ...(await tx.proforma.findMany({ where, select: { number: true } })),
    ].map((d) => Number(d.number.slice(prefiks.length)));
    const najwyzszy = Math.max(0, ...numery.filter((n) => Number.isInteger(n)));
    if (najwyzszy === 0) await tx.invoiceCounter.delete({ where: { id: l.id } });
    else await tx.invoiceCounter.update({ where: { id: l.id }, data: { seq: najwyzszy } });
  }
}

// Przegląd 15.10: `--zachowaj a@b.pl` (spacja zamiast „=”) dawało pustą listę „zachowaj”, powtórzony argument liczył
// się raz, a literówka w nazwie przechodziła po cichu. Teraz każdy z tych przypadków to błąd przed czymkolwiek.
const ZNANE = ['zachowaj', 'wykonaj', 'potwierdz', 'zeruj-numeracje'] as const;
const Z_WARTOSCIA = new Set(['zachowaj', 'potwierdz']);

export function sprawdzArgumenty(argv: string[]): Map<string, string> {
  const wynik = new Map<string, string>();
  for (const a of argv) {
    if (a === '--') continue;
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m || !(ZNANE as readonly string[]).includes(m[1])) throw new Error(`Nieznany argument: ${a} (znane: ${ZNANE.map((z) => `--${z}`).join(', ')}).`);
    if (wynik.has(m[1])) throw new Error(`Argument --${m[1]} podany dwa razy.`);
    if (Z_WARTOSCIA.has(m[1]) && m[2] === undefined) throw new Error(`Użyj --${m[1]}=<wartość> (ze znakiem „=”).`);
    wynik.set(m[1], m[2] ?? '');
  }
  return wynik;
}
