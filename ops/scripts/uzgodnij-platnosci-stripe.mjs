#!/usr/bin/env node
/**
 * Z-05 — uzgodnienie płatności Stripe'a z księgą portfela.
 *
 * PO CO TO ISTNIEJE
 * ─────────────────
 * Naprawa Z-05 blokuje przyszłość: od teraz zdarzenie, którego handler nie
 * obsłużył, zostaje w stanie FAILED, jest ponawiane i alarmuje. O PRZESZŁOŚCI
 * nie mówi nic — bo stary wiersz `StripeWebhookEvent` nie przechowywał ani
 * treści, ani identyfikatora sesji, więc nie ma jak go skorelować z transakcją
 * portfela. Migracja `20260822180000_odpornosc_webhooka` oznaczyła te wiersze
 * jako PROCESSED, i to jest założenie, nie ustalenie.
 *
 * Ten skrypt jest ustaleniem. Pyta Stripe'a wprost: które sesje checkout
 * zostały opłacone — i sprawdza, czy dla każdej z nich istnieje transakcja
 * portfela z odpowiadającym kluczem idempotencji.
 *
 * Klucz jest ten sam, którego używa produkcja:
 *     stripe:checkout:<id sesji>
 * (patrz billing.service.ts → handleCheckoutCompleted)
 *
 * KIEDY URUCHAMIAĆ
 * ────────────────
 *  · raz, jednorazowo, dla całego okresu sprzed 2026-08-22 (dług historyczny),
 *  · potem raz w miesiącu, przy zamknięciu okresu — to kontrola, nie narzędzie
 *    awaryjne. Kontrola uruchamiana wyłącznie po awarii wykrywa tylko awarie,
 *    o których ktoś już wie.
 *
 * URUCHOMIENIE
 * ────────────
 *     STRIPE_SECRET_KEY=sk_... DATABASE_URL=postgres://... \
 *       node ops/scripts/uzgodnij-platnosci-stripe.mjs --od 2026-01-01 [--napraw]
 *
 * Bez `--napraw` skrypt WYŁĄCZNIE raportuje. Domyślnie nie księguje niczego,
 * bo automatyczne dopisywanie pieniędzy na podstawie skryptu uruchamianego
 * ręcznie to nie jest coś, co powinno dziać się przez pomyłkę.
 */
import { PrismaClient } from '@verris/database';

const ARG = process.argv.slice(2);
const flaga = (n) => ARG.includes(n);
const wartosc = (n, d = null) => {
  const i = ARG.indexOf(n);
  return i >= 0 && ARG[i + 1] ? ARG[i + 1] : d;
};

const OD = wartosc('--od', '2026-01-01');
const NAPRAW = flaga('--napraw');
const KLUCZ = process.env.STRIPE_SECRET_KEY;

if (!KLUCZ) {
  console.error('Brak STRIPE_SECRET_KEY. Bez niego nie ma czego uzgadniać.');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('Brak DATABASE_URL.');
  process.exit(2);
}

const odTs = Math.floor(new Date(OD).getTime() / 1000);
if (Number.isNaN(odTs)) {
  console.error(`--od "${OD}" nie jest datą w formacie RRRR-MM-DD.`);
  process.exit(2);
}

/** Minimalny klient Stripe'a — jeden endpoint, bez zależności. */
async function stripeGet(sciezka, params = {}) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`https://api.stripe.com/v1/${sciezka}${q ? '?' + q : ''}`, {
    headers: { Authorization: `Bearer ${KLUCZ}`, 'Stripe-Version': '2025-04-30.basil' },
  });
  if (!r.ok) {
    throw new Error(`Stripe ${sciezka} → ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  return r.json();
}

/** Wszystkie sesje checkout od podanej daty, ze stronicowaniem. */
async function sesje() {
  const out = [];
  let po = null;
  for (;;) {
    const strona = await stripeGet('checkout/sessions', {
      limit: '100',
      'created[gte]': String(odTs),
      ...(po ? { starting_after: po } : {}),
    });
    out.push(...strona.data);
    if (!strona.has_more) break;
    po = strona.data[strona.data.length - 1].id;
    process.stderr.write(`  …pobrano ${out.length} sesji\n`);
  }
  return out;
}

const prisma = new PrismaClient();

try {
  console.log(`Uzgodnienie płatności Stripe'a od ${OD}${NAPRAW ? ' (tryb NAPRAW)' : ' (tylko raport)'}\n`);

  const wszystkie = await sesje();
  const oplacone = wszystkie.filter(
    (s) => s.payment_status === 'paid' && (s.metadata?.kind ?? 'wallet_topup') === 'wallet_topup',
  );
  console.log(`Sesji w Stripe: ${wszystkie.length}, w tym opłaconych doładowań: ${oplacone.length}`);

  const klucze = oplacone.map((s) => `stripe:checkout:${s.id}`);
  const maja = new Set(
    (
      await prisma.walletTransaction.findMany({
        where: { idempotencyKey: { in: klucze } },
        select: { idempotencyKey: true },
      })
    ).map((t) => t.idempotencyKey),
  );

  const brakujace = oplacone.filter((s) => !maja.has(`stripe:checkout:${s.id}`));

  console.log(`Zaksięgowanych w portfelu: ${maja.size}`);
  console.log(`BEZ POKRYCIA W KSIĘDZE: ${brakujace.length}\n`);

  if (brakujace.length === 0) {
    console.log('Każda opłacona sesja ma odpowiadającą transakcję portfela.');
    process.exit(0);
  }

  let suma = 0;
  for (const s of brakujace) {
    const kwota = (s.amount_total ?? 0) / 100;
    suma += kwota;
    console.log(
      `  ${s.id}  ${new Date(s.created * 1000).toISOString().slice(0, 10)}  ` +
        `${kwota.toFixed(2)} ${(s.currency ?? 'pln').toUpperCase()}  ` +
        `user=${s.client_reference_id ?? s.metadata?.userId ?? '(brak)'}`,
    );
  }
  console.log(`\nŁącznie bez pokrycia: ${suma.toFixed(2)} PLN w ${brakujace.length} płatnościach.`);

  if (!NAPRAW) {
    console.log(
      '\nTo jest raport. Zanim cokolwiek zaksięgujesz, sprawdź w panelu Stripe, czy te\n' +
        'płatności faktycznie doszły i nie zostały zwrócone — a potem uruchom ponownie\n' +
        'z --napraw albo zaksięguj przez panel admina.',
    );
    process.exit(1);
  }

  console.log('\nTryb NAPRAW — księgowanie przez klucz idempotencji.');
  for (const s of brakujace) {
    const userId = s.client_reference_id ?? s.metadata?.userId;
    if (!userId) {
      console.log(`  ${s.id}: POMINIĘTE — brak powiązania z użytkownikiem`);
      continue;
    }
    const istnieje = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!istnieje) {
      console.log(`  ${s.id}: POMINIĘTE — użytkownik ${userId} nie istnieje`);
      continue;
    }
    console.log(
      `  ${s.id}: do zaksięgowania ${(s.amount_total / 100).toFixed(2)} dla ${userId} — ` +
        `użyj panelu admina (Rozliczenia → uznanie portfela) z opisem „uzgodnienie ${s.id}".`,
    );
  }
  console.log(
    '\nŚwiadomie NIE księguję automatycznie. Ruch pieniędzy na koncie klienta na podstawie\n' +
      'skryptu uruchamianego ręcznie z konsoli powinien mieć człowieka i wpis w dzienniku\n' +
      'audytu po drugiej stronie. Panel admina ma jedno i drugie.',
  );
} finally {
  await prisma.$disconnect();
}
