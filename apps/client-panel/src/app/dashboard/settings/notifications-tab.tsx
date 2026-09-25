"use client";

import { useEffect, useState, useTransition } from "react";
import {
  BellRing,
  CreditCard,
  Lock,
  Activity,
  Loader2,
  ShieldCheck,
  Megaphone,
  Sparkles,
  Handshake,
  TrendingUp,
  HardDrive,
} from "lucide-react";
import { Switch } from "@/components/panel/v2";
import {
  fetchMarketingPreferences,
  updateMarketingPreferences,
  type MarketingPreferences,
} from "./privacy-actions";

/**
 * #12 / N-10 — Centrum powiadomień. Krytyczne (bezpieczeństwo, płatności, zatrzymanie autoskalowania
 * przez limit kosztu albo pusty portfel) są zawsze włączone; operacyjne i marketingowe steruje klient.
 * Backend: `/me/marketing-preferences`, bramka w MailerService (POWIADOMIENIA_OPCJONALNE).
 */
export function NotificationsTab({
  showToast,
}: {
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [prefs, setPrefs] = useState<MarketingPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMarketingPreferences().then((p) => {
      setPrefs(p);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Ładowanie centrum powiadomień...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 p-6 md:p-8">
      <header>
        <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-bold text-foreground">
          <BellRing className="h-5 w-5 text-data-hi" />
          Centrum powiadomień
        </h2>
        <p className="text-sm text-muted-foreground">
          Decyduj, jakie wiadomości od nas chcesz otrzymywać. Powiadomienia o bezpieczeństwie i rozliczeniach są
          zawsze włączone, bo wynikają z umowy i ochrony Twojego konta.
        </p>
      </header>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zawsze włączone</h3>
        <div className="divide-y divide-line rounded-[10px] border border-line bg-raised/40">
          <AlwaysOnRow
            icon={ShieldCheck}
            title="Bezpieczeństwo konta"
            description="Zmiana hasła, passkey i 2FA oraz zmiana adresu e-mail."
          />
          <AlwaysOnRow
            icon={CreditCard}
            title="Płatności i faktury"
            description="Odnowienia, niskie saldo portfela, faktury, nieudane płatności, zawieszenia usług, zmiana planu oraz zatrzymanie autoskalowania przez limit kosztu albo pusty portfel."
          />
          <AlwaysOnRow
            icon={Activity}
            title="Alerty monitoringu strony"
            description="Awarie strony, powroty i wygasanie certyfikatu SSL. Sterujesz nimi osobno dla każdej usługi w zakładce Monitoring."
          />
        </div>
      </section>

      {prefs ? (
        <OptionalSection prefs={prefs} onChange={setPrefs} showToast={showToast} />
      ) : (
        <p className="text-sm text-muted-foreground">Nie udało się pobrać preferencji powiadomień.</p>
      )}
    </div>
  );
}

function AlwaysOnRow({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="flex flex-1 items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[11px] font-medium text-muted-foreground">
        <Lock className="h-3 w-3" /> Zawsze
      </span>
    </div>
  );
}

type Przelacznik = {
  key: "loginAlertsEmail" | "autoscalingEmail" | "quotaAlertsEmail" | "productUpdatesEmail" | "marketingEmail" | "partnerOffersEmail";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
};

const GRUPY: Array<{ tytul: string; pozycje: Przelacznik[] }> = [
  {
    tytul: "Twoje usługi",
    pozycje: [
      {
        key: "autoscalingEmail",
        icon: TrendingUp,
        label: "Autoskalowanie",
        description: "Start skoku zasobów i podsumowanie z kosztem po jego zakończeniu. Zatrzymanie przez limit kosztu albo pusty portfel wyślemy zawsze.",
      },
      {
        key: "quotaAlertsEmail",
        icon: HardDrive,
        label: "Zbliżanie się do limitów",
        description: "Ostrzeżenie, gdy konto zbliża się do limitu dysku lub zasobów planu.",
      },
      {
        key: "loginAlertsEmail",
        icon: ShieldCheck,
        label: "Logowanie z nowego urządzenia",
        description: "Wiadomość, gdy ktoś zaloguje się na Twoje konto z urządzenia, którego wcześniej nie używano.",
      },
    ],
  },
  {
    tytul: "Od Verris",
    pozycje: [
      {
        key: "productUpdatesEmail",
        icon: Sparkles,
        label: "Nowości i aktualizacje funkcji",
        description: "Informacje o nowych możliwościach panelu i usprawnieniach.",
      },
      {
        key: "marketingEmail",
        icon: Megaphone,
        label: "Newsletter Verris",
        description: "Comiesięczne podsumowanie, porady i okazje. Możesz zrezygnować w każdej chwili.",
      },
      {
        key: "partnerOffersEmail",
        icon: Handshake,
        label: "Oferty partnerskie",
        description: "Promocje od starannie wybranych partnerów (rzadko).",
      },
    ],
  },
];

function OptionalSection({
  prefs,
  onChange,
  showToast,
}: {
  prefs: MarketingPreferences;
  onChange: (p: MarketingPreferences) => void;
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [pending, startTransition] = useTransition();

  const updateField = (key: Przelacznik["key"], value: boolean) => {
    // Optymistycznie — natychmiastowy feedback, rollback przy błędzie.
    const prev = prefs[key];
    onChange({ ...prefs, [key]: value });
    startTransition(async () => {
      const result = await updateMarketingPreferences({ [key]: value });
      if (!result.ok) {
        onChange({ ...prefs, [key]: prev });
        showToast(result.error, "error");
        return;
      }
      showToast("Preferencje zaktualizowane", "success");
    });
  };

  return (
    <>
      {GRUPY.map((g) => (
        <section key={g.tytul} className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.tytul}</h3>
          <div className="divide-y divide-line rounded-[10px] border border-line bg-raised/40">
            {g.pozycje.map(({ key, icon: Icon, label, description }) => (
              <div key={key} className="flex items-center justify-between gap-4 p-4">
                <div className="flex flex-1 items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                  </div>
                </div>
                <Switch checked={prefs[key]} onChange={(v) => updateField(key, v)} label={label} disabled={pending} />
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Z newslettera i ofert partnerskich wypiszesz się też linkiem „wypisz się” w stopce każdej takiej wiadomości.
      </p>
    </>
  );
}
