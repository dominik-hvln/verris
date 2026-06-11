/**
 * B-1 — smoke integracji KSeF na ŚRODOWISKU TESTOWYM MF.
 *
 * Wymagane env:
 *   KSEF_NIP                — NIP testowy (z konta na ksef-test)
 *   KSEF_TOKEN              — token autoryzacyjny (Aplikacja Podatnika, ksef-test)
 *   KSEF_PUBLIC_KEY_PEM_B64 — klucz publiczny MF dla ksef-test (base64 PEM)
 *
 * Uruchomienie (po `pnpm install`, z katalogu repo):
 *   KSEF_NIP=… KSEF_TOKEN=… KSEF_PUBLIC_KEY_PEM_B64=… \
 *     npx tsx ops/scripts/ksef-smoke.ts
 *
 * Co robi: challenge → sesja → wysyłka przykładowej FA(2) → polling statusu
 * do nadania numeru KSeF → terminate. Sukces = wypisany numer KSeF.
 * NIE uruchamiać na produkcyjnym KSeF z realnym NIP bez intencji wystawienia!
 */
import { Prisma } from '@verris/database';
import { buildFaXml } from '../../apps/api/src/ksef/fa-xml.builder';
import { KsefClient } from '../../apps/api/src/ksef/ksef.client';

async function main() {
  const nip = (process.env.KSEF_NIP ?? '').replace(/\D/g, '');
  const token = process.env.KSEF_TOKEN ?? '';
  const pemB64 = process.env.KSEF_PUBLIC_KEY_PEM_B64 ?? '';
  if (!nip || !token || !pemB64) {
    console.error('Ustaw KSEF_NIP, KSEF_TOKEN, KSEF_PUBLIC_KEY_PEM_B64 (środowisko TESTOWE).');
    process.exit(1);
  }

  const { xml, summary } = buildFaXml({
    invoice: {
      number: `SMOKE/${Date.now()}`,
      amount: new Prisma.Decimal('1.23'),
      netAmount: new Prisma.Decimal('1.00'),
      vatAmount: new Prisma.Decimal('0.23'),
      vatRate: new Prisma.Decimal('23'),
      currency: 'PLN',
      issuedAt: new Date(),
      paidAt: new Date(),
      sellerSnapshot: {
        name: 'Verris SMOKE TEST',
        nip,
        address: 'ul. Testowa 1',
        city: 'Warszawa',
        postalCode: '00-001',
        country: 'PL',
      },
      buyerSnapshot: { firstName: 'Smoke', lastName: 'Test', country: 'PL' },
      lineItems: [
        {
          name: 'Usługa testowa',
          quantity: 1,
          unitNet: '1.00',
          vatRate: 23,
          totalNet: '1.00',
          totalVat: '0.23',
          totalGross: '1.23',
        },
      ],
    },
    systemInfo: 'Verris ksef-smoke',
  });
  console.log('[smoke] FA XML zbudowany:', summary);

  const client = new KsefClient({
    baseUrl: process.env.KSEF_BASE_URL ?? 'https://ksef-test.mf.gov.pl/api',
    nip,
    token,
    publicKeyPem: Buffer.from(pemB64, 'base64').toString('utf8'),
  });

  await client.openSession();
  console.log('[smoke] Sesja otwarta');
  const { elementReferenceNumber } = await client.sendInvoice(xml);
  console.log('[smoke] Wysłano, ref =', elementReferenceNumber);

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await client.invoiceStatus(elementReferenceNumber);
    console.log(`[smoke] status: code=${st.statusCode} ${st.statusDescription ?? ''}`);
    if (st.processed) {
      console.log('[smoke] ✅ Numer KSeF:', st.ksefReferenceNumber);
      await client.terminateSession();
      return;
    }
    if (st.rejected) {
      console.error('[smoke] ❌ Odrzucono:', st.statusDescription);
      await client.terminateSession();
      process.exit(1);
    }
  }
  console.error('[smoke] Timeout oczekiwania na numer KSeF');
  await client.terminateSession();
  process.exit(1);
}

main().catch((err) => {
  console.error('[smoke] Błąd:', err);
  process.exit(1);
});
