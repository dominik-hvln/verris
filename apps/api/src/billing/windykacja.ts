import { KARENCJA_PLATNOSCI_DNI, POWODY_ZAWIESZENIA_ZA_PLATNOSC, RETENCJA_KONTA_DNI, ZAWIESZENIE_DO_WYGASNIECIA_DNI } from '../subscriptions/subscriptions.service.js';
import { REMINDER_WINDOWS } from '../subscriptions/renewal-reminder.scheduler.js';

const GODZINA = 60 * 60 * 1000;
const DZIEN = 24 * GODZINA;
/** renewal.scheduler.ts renewalWindowMs — portfel obciążany do 24 h przed końcem okresu. */
const OKNO_ODNOWIENIA_MS = 24 * GODZINA;

/**
 * F3.6 — progi windykacji tak, jak są zaszyte w harmonogramach (renewal-reminder.scheduler.ts, renewal.scheduler.ts,
 * subscriptions.service.ts). Panel tylko je pokazuje — zmiana to zmiana kodu (decyzja właściciela 29.09: „od razu,
 * 14 + 14 dni”).
 */
export const PROGI_WINDYKACJI = {
  przypomnieniaDniPrzed: REMINDER_WINDOWS.map((w) => w.daysBefore),
  karencjaDni: KARENCJA_PLATNOSCI_DNI,
  zawieszenieDoWygasnieciaDni: ZAWIESZENIE_DO_WYGASNIECIA_DNI,
  retencjaKontaDni: RETENCJA_KONTA_DNI,
} as const;

/** Wpisy dziennika, które są przypomnieniami albo krokami windykacji widocznymi dla klienta (maile, zawieszenie). */
export const AKCJE_PRZYPOMNIEN: Record<string, string> = {
  ...Object.fromEntries(REMINDER_WINDOWS.map((w) => [w.auditAction, `Przypomnienie o odnowieniu (${w.daysBefore} ${w.daysBefore === 1 ? 'dzień' : 'dni'} przed)`])),
  WALLET_LOW_BALANCE_NOTIFIED: 'Niskie saldo portfela',
  WALLET_AUTO_TOPUP_FAILED: 'Nieudane auto-doładowanie',
  WALLET_AUTOTOPUP_PAYMENT_FAILED: 'Karta odrzuciła auto-doładowanie',
  SUBSCRIPTION_PAST_DUE: 'Nieudane odnowienie — usługa zaległa',
  SUBSCRIPTION_SUSPENDED: 'Usługa zawieszona',
  SUBSCRIPTION_UNSUSPENDED: 'Usługa wznowiona',
  SUBSCRIPTION_EXPIRED: 'Usługa wygasła',
  SUBSCRIPTION_PAYMENT_PROMISE_SET: 'Obietnica zapłaty',
};

export interface UslugaDoPrognozy {
  status: string;
  paymentSource: string;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
  paymentPromiseUntil: Date | null;
  isTrial: boolean;
  /** Ostatnie zdarzenie PAYMENT_FAILED usługi. */
  ostatniaNieudana: Date | null;
  /** Ostatnie zdarzenie SUSPENDED usługi (z powodem z details.reason). */
  ostatnieZawieszenie: { kiedy: Date; powod: string | null } | null;
}

export type EtapWindykacji = 'bez-windykacji' | 'odnowienie' | 'zalegla' | 'zawieszona';

export interface Prognoza {
  etap: EtapWindykacji;
  /** Kiedy harmonogram spróbuje obciążyć portfel (usługa z portfela, aktywna). */
  probaOdnowienia: Date | null;
  /** Od kiedy harmonogram zawiesi usługę (w pierwszym przebiegu godzinowym po tej chwili), jeśli nie będzie zapłaty. */
  zawieszenie: Date | null;
  /** Od kiedy zawieszona za brak płatności usługa wygaśnie (§7 ust. 3), jeśli nie będzie zapłaty. */
  wygasniecie: Date | null;
  uwaga: string;
}

const pozniej = (...d: Array<Date | null | undefined>): Date | null =>
  d.reduce<Date | null>((a, b) => (b && (!a || b > a) ? b : a), null);

/**
 * F3.6 — co i kiedy zrobi harmonogram z usługą, jeśli klient nie zapłaci. Lustro warunków z renewal.scheduler.ts
 * (runRenewalWindow, runGraceExpiry, runSuspensionExpiry) — tylko odczyt, niczego nie zmienia. Daty to „najwcześniej”:
 * harmonogram biegnie co godzinę, więc zdarzenie nastąpi w pierwszym przebiegu po wskazanej chwili.
 */
export function prognozaWindykacji(s: UslugaDoPrognozy, teraz: Date): Prognoza {
  const bez = (uwaga: string): Prognoza => ({ etap: 'bez-windykacji', probaOdnowienia: null, zawieszenie: null, wygasniecie: null, uwaga });
  const karta = s.paymentSource === 'STRIPE_CARD' && !!s.stripeSubscriptionId;

  if (s.paymentSource === 'MANUAL') return bez('Rozliczenie poza Verris — bez przypomnień i automatycznego zawieszenia.');

  if (s.status === 'SUSPENDED') {
    const z = s.ostatnieZawieszenie;
    if (!z || !POWODY_ZAWIESZENIA_ZA_PLATNOSC.some((p) => p === z.powod)) {
      return {
        etap: 'zawieszona',
        probaOdnowienia: null,
        zawieszenie: z?.kiedy ?? null,
        wygasniecie: null,
        uwaga: 'Zawieszona przez obsługę (nie za brak płatności) — nie wygaśnie sama i nie wróci po wpłacie.',
      };
    }
    return {
      etap: 'zawieszona',
      probaOdnowienia: null,
      zawieszenie: z.kiedy,
      wygasniecie: new Date(z.kiedy.getTime() + ZAWIESZENIE_DO_WYGASNIECIA_DNI * DZIEN),
      uwaga: karta
        ? 'Wróci po opłaceniu zaległej faktury kartą.'
        : 'Wróci sama po doładowaniu portfela (obciążenie w najbliższym przebiegu).',
    };
  }

  if (s.status === 'PAST_DUE') {
    const start = s.ostatniaNieudana ?? s.currentPeriodEnd ?? teraz;
    const poKarencji = new Date(start.getTime() + KARENCJA_PLATNOSCI_DNI * DZIEN);
    // Portfel: opłaconego okresu nie odbieramy; karta (Stripe): liczy się sama nieudana płatność.
    const zawieszenie = pozniej(poKarencji, karta ? null : s.currentPeriodEnd, s.paymentPromiseUntil);
    return {
      etap: 'zalegla',
      probaOdnowienia: null,
      zawieszenie,
      wygasniecie: null,
      uwaga:
        s.paymentPromiseUntil && s.paymentPromiseUntil > teraz
          ? `Obietnica zapłaty — bez zawieszenia do ${s.paymentPromiseUntil.toISOString()}.`
          : karta
            ? 'Płatność kartą odrzucona — operator kart ponawia sam.'
            : 'Za mało środków w portfelu — doładowanie opłaci usługę w najbliższym przebiegu.',
    };
  }

  if (s.status !== 'ACTIVE') return bez('Usługa nie jest aktywna.');
  if (s.isTrial) return bez('Okres próbny — jego koniec obsługuje osobny harmonogram.');
  if (s.cancelAt) return bez('Anulowana na koniec okresu — nie odnowi się i nie będzie obciążenia.');
  if (karta) return bez('Odnowienie kartą cykliczną — przy odmowie usługa przejdzie w zaległą (operator kart ponawia sam).');
  if (!s.currentPeriodEnd) return bez('Brak daty końca okresu.');

  return {
    etap: 'odnowienie',
    probaOdnowienia: new Date(s.currentPeriodEnd.getTime() - OKNO_ODNOWIENIA_MS),
    zawieszenie: pozniej(new Date(s.currentPeriodEnd.getTime() + KARENCJA_PLATNOSCI_DNI * DZIEN), s.currentPeriodEnd),
    wygasniecie: null,
    uwaga: 'Odnowienie z portfela — przy braku środków zawieszenie z końcem opłaconego okresu.',
  };
}

/** Próba auto-doładowania z dziennika (dwa źródła: odpowiedź Stripe przy obciążeniu i webhook payment_failed). */
export interface ProbaAutoDoladowania {
  id: string;
  userId: string;
  kiedy: Date;
  akcja: 'WALLET_AUTO_TOPUP_FAILED' | 'WALLET_AUTOTOPUP_PAYMENT_FAILED';
  powod: string | null;
  referencja: string | null;
}

const SCALANIE_MS = 15 * 60 * 1000;

/**
 * Odmowa karty przy auto-doładowaniu zostawia zwykle DWA wpisy: WALLET_AUTO_TOPUP_FAILED (odpowiedź Stripe przy
 * obciążeniu) i WALLET_AUTOTOPUP_PAYMENT_FAILED (webhook payment_intent.payment_failed). Na liście to jedna nieudana
 * płatność — wpis z webhooka pomijamy, gdy ten sam klient ma wpis z obciążenia w ciągu 15 minut.
 */
export function scalProbyAutoDoladowania(wpisy: ProbaAutoDoladowania[]): ProbaAutoDoladowania[] {
  const zObciazenia = wpisy.filter((w) => w.akcja === 'WALLET_AUTO_TOPUP_FAILED');
  return wpisy.filter(
    (w) =>
      w.akcja === 'WALLET_AUTO_TOPUP_FAILED' ||
      !zObciazenia.some((o) => o.userId === w.userId && Math.abs(o.kiedy.getTime() - w.kiedy.getTime()) <= SCALANIE_MS),
  );
}
