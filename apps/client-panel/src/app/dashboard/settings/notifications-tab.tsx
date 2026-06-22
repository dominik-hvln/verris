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
} from "lucide-react";
import {
  fetchMarketingPreferences,
  updateMarketingPreferences,
  type MarketingPreferences,
} from "./privacy-actions";

/**
 * #12 — Centrum powiadomień. Jedno miejsce na wszystkie kanały e-mail:
 * krytyczne (zawsze włączone, wynikają z umowy/bezpieczeństwa) + opcjonalne
 * (sterowane przez klienta). Backend: istniejące `/me/marketing-preferences`.
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
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
        <p className="text-neutral-400">Ładowanie centrum powiadomień...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-10">
      <header>
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <BellRing className="h-5 w-5 text-sky-300" />
          Centrum powiadomień
        </h2>
        <p className="text-neutral-400">
          Decyduj, jakie wiadomości od nas chcesz otrzymywać. Powiadomienia krytyczne (bezpieczeństwo
          i rozliczenia) są zawsze włączone, bo wynikają z umowy i ochrony Twojego konta.
        </p>
      </header>

      {/* Krytyczne — zawsze włączone */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Zawsze włączone
        </h3>
        <div className="rounded-xl border border-white/10 bg-[#0a0a0a]/40 divide-y divide-white/5">
          <AlwaysOnRow
            icon={ShieldCheck}
            iconClass="text-emerald-300"
            title="Bezpieczeństwo konta"
            description="Logowania z nowego urządzenia, zmiana hasła, passkey/2FA, zmiana e-maila, wylogowania sesji."
          />
          <AlwaysOnRow
            icon={CreditCard}
            iconClass="text-amber-300"
            title="Płatności i faktury"
            description="Odnowienia, niskie saldo portfela, faktury, nieudane płatności i zawieszenia usług."
          />
          <AlwaysOnRow
            icon={Activity}
            iconClass="text-sky-300"
            title="Alerty usług (monitoring)"
            description="Awarie strony, powroty i wygasanie certyfikatu SSL. Możesz nimi sterować osobno dla każdej usługi w zakładce Monitoring."
          />
        </div>
      </section>

      {/* Opcjonalne — sterowane przez klienta */}
      {prefs ? (
        <OptionalSection prefs={prefs} onChange={setPrefs} showToast={showToast} />
      ) : (
        <p className="text-sm text-neutral-500">Nie udało się pobrać preferencji powiadomień.</p>
      )}
    </div>
  );
}

function AlwaysOnRow({
  icon: Icon,
  iconClass,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 p-4">
      <div className="flex items-start gap-3 flex-1">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconClass}`} />
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-neutral-400">
        <Lock className="h-3 w-3" /> Zawsze
      </span>
    </div>
  );
}

const OPTIONAL_TOGGLES: Array<{
  key: keyof MarketingPreferences;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  label: string;
  description: string;
}> = [
  {
    key: "loginAlertsEmail",
    icon: ShieldCheck,
    iconClass: "text-emerald-300",
    label: "Dodatkowe alerty logowania",
    description: "Powiadomienia o nowym logowaniu z nieznanego urządzenia (ponad podstawowe alerty bezpieczeństwa).",
  },
  {
    key: "productUpdatesEmail",
    icon: Sparkles,
    iconClass: "text-violet-300",
    label: "Nowości i aktualizacje funkcji",
    description: "Informacje o nowych możliwościach panelu i usprawnieniach.",
  },
  {
    key: "marketingEmail",
    icon: Megaphone,
    iconClass: "text-sky-300",
    label: "Newsletter Verris",
    description: "Comiesięczne podsumowanie, porady i okazje. Możesz zrezygnować w każdej chwili.",
  },
  {
    key: "partnerOffersEmail",
    icon: Handshake,
    iconClass: "text-amber-300",
    label: "Oferty partnerskie",
    description: "Promocje od starannie wybranych partnerów (rzadko).",
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

  const updateField = (key: keyof MarketingPreferences, value: boolean) => {
    // Optymistycznie — natychmiastowy feedback, rollback przy błędzie.
    const prev = prefs[key] as boolean;
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
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        Opcjonalne — Ty decydujesz
      </h3>
      <div className="rounded-xl border border-white/10 bg-[#0a0a0a]/40 divide-y divide-white/5">
        {OPTIONAL_TOGGLES.map(({ key, icon: Icon, iconClass, label, description }) => {
          const value = prefs[key] as boolean;
          return (
            <div key={key} className="flex items-center justify-between gap-6 p-4">
              <div className="flex items-start gap-3 flex-1">
                <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconClass}`} />
                <div>
                  <p className="text-sm font-medium text-white">{label}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center shrink-0">
                <input
                  type="checkbox"
                  checked={value}
                  disabled={pending}
                  onChange={(e) => updateField(key, e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-neutral-700 peer-checked:bg-sky-500 peer-disabled:opacity-50 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
              </label>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-neutral-500">
        Rezygnacja z newslettera i ofert partnerskich działa też przez link „wypisz się" w stopce
        każdej takiej wiadomości.
      </p>
    </section>
  );
}
