import type { EcoPlatformConfig } from '@/app/dashboard/eco/eco-data';

/** Punkty za pierwsze włączenie EKO na usłudze — zgodne z API (`ECO_POINT_DELTAS`). */
export const ECO_FIRST_ENABLE_POINTS = 5;

export type EcoPointRule = {
  id: string;
  title: string;
  points: string;
  description: string;
};

/** Wpisy, które wydają punkty (nie są sposobem ich zdobywania) — przewodnik pokazuje je osobno. */
export const ECO_WYDATKI = new Set(['EKO_REDEEM_WALLET', 'EKO_DRZEWO_PULA', 'EKO_DRZEWO_WLASNE']);

/** Źródła punktów EKO — zgodne z API (`EcoPointsLedgerEntry.reason`). */
export function buildEcoPointRules(platform: EcoPlatformConfig): EcoPointRule[] {
  const perTree = platform.ecoPointsPerTree;
  const redeemRate = platform.ecoPointsPer10Credits;

  return [
    {
      id: 'SUBSCRIPTION_FIRST_PAID',
      title: 'Pierwsza opłacona usługa hostingowa',
      points: '+10',
      description:
        'Punkty za aktywację pierwszej opłaconej subskrypcji hostingu (portfel, karta lub faktura). Naliczamy raz na daną usługę.',
    },
    {
      id: 'SUBSCRIPTION_RENEWAL',
      title: 'Odnowienie usługi hostingowej',
      points: '+5',
      description:
        'Każde udane odnowienie subskrypcji (automatyczne z portfela lub karty). Maksymalnie 4 razy w roku kalendarzowym na jedną usługę.',
    },
    {
      id: 'STRIPE_CARD_LINKED',
      title: 'Podpięcie karty do subskrypcji',
      points: '+15',
      description:
        'Pierwsza udana płatność kartą za subskrypcję hostingu z włączoną automatyczną płatnością kartą. Raz na daną usługę.',
    },
    {
      id: 'WALLET_TOPUP',
      title: 'Doładowanie portfela',
      points: '+2 / 50 PLN',
      description:
        'Punkty po zaksięgowaniu doładowania (kartą, Paynow lub auto-doładowanie). Minimum 20 PLN na transakcję. Maks. 20 pkt miesięcznie.',
    },
    {
      id: 'DOMAIN_FIRST_PAID',
      title: 'Pierwszy zakup domeny',
      points: '+5',
      description: 'Rejestracja nowej domeny opłacona z portfela. Raz na daną domenę.',
    },
    {
      id: 'DOMAIN_RENEWAL',
      title: 'Odnowienie domeny',
      points: '+3',
      description:
        'Udane odnowienie domeny z portfela. Maksymalnie 2 razy w roku kalendarzowym na jedną domenę.',
    },
    {
      id: 'EKO_FIRST_ENABLE',
      title: 'Pierwsze włączenie trybu EKO na usłudze',
      points: '+5',
      description:
        'Włącz tryb EKO w panelu usługi hostingowej. Punkty naliczamy raz — przy pierwszym włączeniu na danej usłudze (mniej agresywne kopie zapasowe, mniejsze obciążenie serwera).',
    },
    {
      id: 'EMAIL_VERIFIED',
      title: 'Potwierdzenie adresu e-mail',
      points: '+2',
      description: 'Kliknij link weryfikacyjny wysłany po rejestracji. Raz na konto.',
    },
    {
      id: 'BILLING_PROFILE_COMPLETE',
      title: 'Kompletne dane do faktury',
      points: '+3',
      description:
        'Uzupełnij dane firmy (nazwa lub NIP) oraz adres rozliczeniowy w ustawieniach konta. Raz na konto.',
    },
    {
      id: 'PASSKEY_REGISTERED',
      title: 'Pierwszy passkey (logowanie biometryczne)',
      points: '+5',
      description: 'Dodaj pierwszy passkey w ustawieniach bezpieczeństwa. Raz na konto.',
    },
    {
      id: 'BADGE_IMPRESSION',
      title: 'Odznaka Verris na Twojej stronie',
      points: `+1 co ${platform.ecoBadgeImpressionsPerPoint} wyśw.`,
      description:
        'Osadź oficjalny badge Verris na swojej witrynie. Liczymy unikalne wyświetlenia (maks. jedno na adres IP na godzinę).',
    },
    {
      id: 'REFERRAL_REGISTER_REFEREE',
      title: 'Rejestracja z kodem polecenia',
      points: '+3',
      description:
        'Dołączasz do Verris z aktywnym kodem polecenia innego klienta (polecający musi mieć zatwierdzony program poleceń).',
    },
    {
      id: 'REFERRAL_REGISTER_REFERRER',
      title: 'Nowy klient z Twoim kodem (rejestracja)',
      points: '+5',
      description:
        'Ktoś rejestruje się z Twoim kodem polecenia, gdy masz zatwierdzony program poleceń.',
    },
    {
      id: 'REFERRAL_APPLIED_REFEREE',
      title: 'Dodanie kodu polecenia po rejestracji',
      points: '+3',
      description: 'Wpisałeś kod polecenia w programie EKO po utworzeniu konta.',
    },
    {
      id: 'REFERRAL_APPLIED_REFERRER',
      title: 'Ktoś wykorzystał Twój kod (po rejestracji)',
      points: '+5',
      description: 'Inny klient dodał Twój kod polecenia — Ty też dostajesz punkty.',
    },
    {
      id: 'EKO_REDEEM_WALLET',
      title: 'Wymiana punktów na saldo portfela',
      points: `−${redeemRate} = 10,00 K`,
      description:
        'To nie jest sposób na zdobywanie punktów — wymieniasz je na środki w portfelu Verris albo na drzewa ' +
        `(całe drzewo z certyfikatem: ${perTree.toLocaleString('pl-PL')} pkt).`,
    },
    {
      id: 'EKO_DRZEWO_PULA',
      title: 'Wymiana punktów na procent drzewa',
      points: `−${Math.ceil(perTree / 100)} = 1%`,
      description:
        'Wymieniasz punkty na procent drzewa we wspólnej puli. Gdy pula uzbiera całe drzewo, zamawiamy jego posadzenie u partnera.',
    },
    {
      id: 'EKO_DRZEWO_WLASNE',
      title: 'Wymiana punktów na własne drzewo',
      points: `−${perTree} = 1 drzewo`,
      description:
        'Wymieniasz punkty na całe drzewo z certyfikatem. Certyfikat wystawiamy na Verris („Drzewo posadzone dzięki klientom Verris”) — ' +
        'w panelu widzisz, że to Twoje drzewo. Pojawi się po potwierdzeniu przez partnera.',
    },
  ];
}

export const ECO_LEDGER_REASON_LABEL: Record<string, string> = {
  SUBSCRIPTION_FIRST_PAID: 'Pierwsza opłacona usługa hostingowa',
  SUBSCRIPTION_RENEWAL: 'Odnowienie usługi hostingowej',
  STRIPE_CARD_LINKED: 'Podpięcie karty do subskrypcji',
  WALLET_TOPUP: 'Doładowanie portfela',
  DOMAIN_FIRST_PAID: 'Pierwszy zakup domeny',
  DOMAIN_RENEWAL: 'Odnowienie domeny',
  EKO_FIRST_ENABLE: 'Pierwsze włączenie trybu EKO',
  EMAIL_VERIFIED: 'Potwierdzenie e-mail',
  BILLING_PROFILE_COMPLETE: 'Dane do faktury uzupełnione',
  PASSKEY_REGISTERED: 'Pierwszy passkey',
  BADGE_IMPRESSION: 'Wyświetlenia badge na stronie',
  REFERRAL_REGISTER_REFEREE: 'Polecenie (rejestracja)',
  REFERRAL_REGISTER_REFERRER: 'Polecenie — nowy klient',
  REFERRAL_APPLIED_REFEREE: 'Polecenie (kod dodany)',
  REFERRAL_APPLIED_REFERRER: 'Polecenie — kod wykorzystany',
  EKO_REDEEM_WALLET: 'Wymiana na saldo portfela',
  EKO_DRZEWO_PULA: 'Wymiana na procent drzewa (wspólna pula)',
  EKO_DRZEWO_WLASNE: 'Wymiana na własne drzewo',
};
