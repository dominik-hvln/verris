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
 *  - klient z fakturą w KSeF PRODUKCYJNYM (wysłaną albo przyjętą) — to prawdziwy dokument, nie wolno go usunąć.
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
  pieniadze: { saldoK: string; wplatyPaynowZl: string; fakturKsefTest: number; fakturBezKsef: number };
  numeracja: Array<{ seria: string; rok: number; miesiac: number; ostatni: number }>;
}

interface FkDoUser {
  tabela: string;
  kolumna: string;
  regula: 'CASCADE' | 'SET NULL' | 'INNE';
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function kluczeObce(db: PrismaClient): Promise<FkDoUser[]> {
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

export async function planCzyszczenia(db: PrismaClient, zachowaj: string[]): Promise<PlanCzyszczenia> {
  const lista = [...new Set(zachowaj.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const [{ baza }] = await db.$queryRaw<Array<{ baza: string }>>`SELECT current_database() AS baza`;
  const klienci = await db.user.findMany({
    where: { role: 'USER' },
    select: { id: true, email: true, createdAt: true, walletBalance: true },
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
  const ksefProd = await db.invoice.findMany({
    where: { userId: { in: ids }, ksefSrodowisko: 'prod', ksefStatus: { in: ['SUBMITTED', 'ACCEPTED'] } },
    select: { userId: true, number: true },
  });
  for (const f of ksefProd) {
    blokady.push({ email: email.get(f.userId) ?? f.userId, powod: `faktura ${f.number} w KSeF produkcyjnym — prawdziwy dokument, nie usuwamy` });
  }

  const saldo = doUsuniecia.reduce((s, k) => s + Number(k.walletBalance), 0);
  const paynow = await db.paynowPlatnosc.aggregate({ where: { userId: { in: ids }, status: 'CONFIRMED' }, _sum: { kwotaMinor: true } });
  const [fakturKsefTest, fakturBezKsef] = await Promise.all([
    db.invoice.count({ where: { userId: { in: ids }, ksefSrodowisko: { in: ['test', 'demo'] } } }),
    db.invoice.count({ where: { userId: { in: ids }, ksefSrodowisko: null } }),
  ]);
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
      wplatyPaynowZl: ((paynow._sum.kwotaMinor ?? 0) / 100).toFixed(2),
      fakturKsefTest,
      fakturBezKsef,
    },
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
    `Pieniądze klientów do usunięcia: saldo ${p.pieniadze.saldoK} K, wpłaty Paynow ${p.pieniadze.wplatyPaynowZl} zł ` +
      `(prawdziwe — sprawdź zwroty przed usunięciem); faktury KSeF TEST: ${p.pieniadze.fakturKsefTest}, poza KSeF: ${p.pieniadze.fakturBezKsef}`,
  );
  l.push('Numeracja dokumentów (zostaje, chyba że --zeruj-numeracje — decyzja księgowej):');
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
  const plan = await planCzyszczenia(db, zachowaj);
  if (plan.blokady.length) throw new Error(`Są blokady (${plan.blokady.length}) — uruchom podgląd i usuń je najpierw.`);
  if (o.potwierdzenie !== plan.doUsuniecia.length) {
    throw new Error(
      `Potwierdzenie ${o.potwierdzenie} ≠ liczba klientów do usunięcia (${plan.doUsuniecia.length}) — stan zmienił się od podglądu; uruchom podgląd ponownie.`,
    );
  }
  const ids = plan.doUsuniecia.map((k) => k.id);
  await db.$transaction(async (tx) => {
    // Subkonta wskazują właściciela (customerOwnerId, CASCADE) — usuwają się razem z nim.
    await tx.user.deleteMany({ where: { id: { in: ids }, role: 'USER' } });
    if (o.zerujNumeracje) await tx.invoiceCounter.deleteMany({});
    await tx.auditLog.create({
      data: {
        action: 'CZYSZCZENIE_PRZED_BETA',
        details: { usunieto: ids.length, zachowani: plan.zachowani, zerujNumeracje: !!o.zerujNumeracje },
      },
    });
  });
  return { usunieto: ids.length, wyzerowanoNumeracje: !!o.zerujNumeracje };
}
