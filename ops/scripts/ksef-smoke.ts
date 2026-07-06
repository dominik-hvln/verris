/**
 * KSEF-2.0 — smoke integracji KSeF 2.0 na ŚRODOWISKU TESTOWYM/DEMO MF.
 *
 * Weryfikuje realnie cały przepływ własnego klienta v2 wobec API MF:
 *   pobranie kluczy publicznych → challenge → auth tokenem KSeF → sesja online
 *   → wysłanie FA(3) → polling statusu do nadania numeru KSeF → zamknięcie sesji.
 *
 * Wymagane env:
 *   KSEF_NIP    — NIP testowy (z konta na api-test/api-demo)
 *   KSEF_TOKEN  — token KSeF (Aplikacja Podatnika, środowisko testowe)
 * Opcjonalne:
 *   KSEF_ENV=test|demo (domyślnie test) LUB KSEF_BASE_URL (pełny, z /api/v2)
 *   KSEF_FA3_TARGET_NAMESPACE — dokładny namespace z XSD FA(3) (walidacja XML)
 *
 * Uruchomienie (z katalogu repo):
 *   KSEF_NIP=… KSEF_TOKEN=… KSEF_ENV=test npx tsx ops/scripts/ksef-smoke.ts
 *
 * ⚠️ NIE uruchamiać na produkcyjnym KSeF z realnym NIP bez intencji wystawienia!
 */
import { Prisma } from '@verris/database';
import { buildFa3Xml } from '../../apps/api/src/ksef/fa3-xml.builder';
import { KsefV2Client } from '../../apps/api/src/ksef/ksef-v2.client';

function baseUrl(): string {
  if (process.env.KSEF_BASE_URL) return process.env.KSEF_BASE_URL;
  const env = process.env.KSEF_ENV ?? 'test';
  const host =
    env === 'prod'
      ? 'https://api.ksef.mf.gov.pl'
      : env === 'demo'
        ? 'https://api-demo.ksef.mf.gov.pl'
        : 'https://api-test.ksef.mf.gov.pl';
  return `${host}/api/v2`;
}

async function main() {
  const nip = (process.env.KSEF_NIP ?? '').replace(/\D/g, '');
  const token = process.env.KSEF_TOKEN ?? '';
  if (!nip || !token) {
    console.error('Ustaw KSEF_NIP i KSEF_TOKEN (środowisko TESTOWE/DEMO).');
    process.exit(1);
  }
  if ((process.env.KSEF_ENV ?? 'test') === 'prod' && !process.env.KSEF_SMOKE_ALLOW_PROD) {
    console.error('Odmowa: smoke na PROD. Ustaw KSEF_SMOKE_ALLOW_PROD=1 tylko świadomie.');
    process.exit(1);
  }

  const { xml, summary } = buildFa3Xml({
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
    systemInfo: 'Verris ksef-smoke v2',
  });
  console.log('[smoke] FA(3) XML zbudowany:', summary);

  const client = new KsefV2Client({ baseUrl: baseUrl(), nip, token });

  console.log('[smoke] Uwierzytelnianie (KSeF 2.0)…');
  await client.openSession();
  console.log('[smoke] Wysyłanie faktury…');
  const { elementReferenceNumber } = await client.sendInvoice(xml);
  console.log('[smoke] Wysłano, ref =', elementReferenceNumber);

  // Zamknięcie sesji wyzwala UPO; potem odpytujemy status per faktura.
  await client.terminateSession();

  // Ponowna auth do odpytania statusu (sesja zamknięta, accessToken świeży).
  await client.openSession();
  for (let i = 0; i < 40; i++) {
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
