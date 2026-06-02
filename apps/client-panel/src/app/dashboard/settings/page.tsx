"use client";

import { useState, useEffect, useTransition } from "react";
import {
  User,
  Shield,
  Building2,
  Save,
  Check,
  AlertCircle,
  Loader2,
  Lock,
  LayoutGrid,
} from "lucide-react";
import { SpinBorder } from "@/components/spin-border";
import {
  fetchUserProfile,
  updateUserProfile,
  changeUserPassword,
  type UserProfile,
} from "./actions";
import { TwoFactorSection } from "./two-factor-section";
import { PrivacyTab } from "./privacy-tab";
import { SidebarTilesSection } from "./sidebar-tiles-section";

/* ─────────────────────────── Tabs Definition ─────────────────────── */

const tabs = [
  { id: "profile", label: "Profil", icon: User },
  { id: "security", label: "Bezpieczeństwo", icon: Shield },
  { id: "billing", label: "Dane do faktury", icon: Building2 },
  { id: "privacy", label: "Prywatność i dane", icon: Lock },
  { id: "panel", label: "Wygląd panelu", icon: LayoutGrid },
] as const;

type TabId = (typeof tabs)[number]["id"];

const SUBACCOUNT_TAB_IDS: TabId[] = ["profile", "security", "privacy"];

function visibleTabsForProfile(profile: UserProfile): (typeof tabs)[number][] {
  if (!profile.isSubaccount) return [...tabs];
  return tabs.filter((t) => SUBACCOUNT_TAB_IDS.includes(t.id));
}

/* ──────────────────── Reusable Form Components ──────────────────── */

function FormField({
  label,
  children,
  description,
}: {
  label: string;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-neutral-300">
        {label}
      </label>
      {children}
      {description && (
        <p className="text-xs text-neutral-500">{description}</p>
      )}
    </div>
  );
}

function Input({
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`
        w-full rounded-xl border border-white/10 bg-[#0a0a0a]/50 px-4 py-2.5 text-sm text-white
        placeholder:text-neutral-500
        focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/50
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${props.className || ""}
      `}
    />
  );
}

function Select({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
        <select
        {...props}
        className={`
            w-full appearance-none rounded-xl border border-white/10 bg-[#0a0a0a]/50 px-4 py-2.5 text-sm text-white
            focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/50
            transition-all duration-200
            ${props.className || ""}
        `}
        >
        {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#0a0a0a] text-white">
            {opt.label}
            </option>
        ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-neutral-400">
            <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
        </div>
    </div>
  );
}

function Toast({
  message,
  type,
}: {
  message: string;
  type: "success" | "error";
}) {
  return (
    <div
      className={`
        fixed bottom-8 right-8 z-50 flex items-center gap-3 rounded-2xl px-6 py-4 text-sm font-semibold shadow-[0_0_30px_rgba(0,0,0,0.5)] border
        animate-in slide-in-from-bottom-6 fade-in duration-300 backdrop-blur-xl
        ${
          type === "success"
            ? "bg-white/10 text-white border-white/20"
            : "bg-[#0a0a0a]/80 text-neutral-300 border-white/20"
        }
      `}
    >
      <div className={`flex items-center justify-center h-8 w-8 rounded-full ${type === "success" ? "bg-white/20 text-white" : "bg-[#1a1a1a]/50 text-neutral-300"}`}>
        {type === "success" ? (
            <Check className="h-4 w-4" />
        ) : (
            <AlertCircle className="h-4 w-4" />
        )}
      </div>
      {message}
    </div>
  );
}

/* ──────────────────────────── Main Page ──────────────────────────── */

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    fetchUserProfile().then((data) => {
      setProfile(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!profile) return;
    const allowed = visibleTabsForProfile(profile).map((t) => t.id);
    if (!allowed.includes(activeTab)) {
      setActiveTab("profile");
    }
  }, [profile, activeTab]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
        <p className="text-neutral-400 font-medium">Ładowanie ustawień...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <AlertCircle className="h-12 w-12 text-neutral-300" />
        <p className="text-neutral-300 font-medium text-lg">
          Nie udało się załadować profilu
        </p>
        <p className="text-neutral-500">Spróbuj odświeżyć stronę.</p>
      </div>
    );
  }

  const visibleTabs = visibleTabsForProfile(profile);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Ustawienia konta</h1>
        <p className="text-neutral-400 text-sm md:text-base">
          {profile.isSubaccount
            ? "Konto operatora (subkonto). Dane firmy i układ panelu zarządza właściciel konta."
            : "Zarządzaj swoim profilem, bezpieczeństwem i danymi do faktur."}
        </p>
        {profile.isSubaccount && profile.subaccountLabel ? (
          <p className="mt-2 text-xs text-neutral-500">Etykieta: {profile.subaccountLabel}</p>
        ) : null}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 rounded-2xl bg-[#0a0a0a]/50 p-2 border border-white/5 backdrop-blur-xl shrink-0 overflow-x-auto scrollbar-none">
        {visibleTabs.map((tab) => {
          const Icon = tab;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-300 shrink-0
                ${
                  isActive
                    ? "bg-white/10 border border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                    : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"
                }
              `}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="relative rounded-[32px] p-px overflow-hidden group">
        <SpinBorder variant="white" className="opacity-20 transition-opacity duration-500 group-hover:opacity-40" />
        <div className="relative rounded-[calc(32px-1px)] bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/5 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
            {activeTab === "profile" && (
            <ProfileTab
                profile={profile}
                onUpdate={setProfile}
                showToast={showToast}
            />
            )}
            {activeTab === "security" && <SecurityTab showToast={showToast} />}
            {activeTab === "billing" && (
            <BillingTab
                profile={profile}
                onUpdate={setProfile}
                showToast={showToast}
            />
            )}
            {activeTab === "privacy" && <PrivacyTab showToast={showToast} />}
            {activeTab === "panel" && (
              <div className="p-8">
                <SidebarTilesSection initialLinks={profile.sidebarQuickLinks ?? []} />
              </div>
            )}
        </div>
      </div>

      {/* Toast Notification */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

/* ────────────────────── Tab: Profil ────────────────────── */

function ProfileTab({
  profile,
  onUpdate,
  showToast,
}: {
  profile: UserProfile;
  onUpdate: (p: UserProfile) => void;
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
    locale: profile.locale || "pl",
  });

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateUserProfile(form);
      if ("error" in result) {
        showToast(result.error!, "error");
      } else {
        onUpdate({ ...profile, ...form });
        showToast("Profil został zaktualizowany", "success");
      }
    });
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Profil użytkownika</h2>
        <p className="text-neutral-400">
          Podstawowe informacje o Twoim koncie.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField label="Imię">
          <Input
            value={form.firstName}
            onChange={(e) =>
              setForm((f) => ({ ...f, firstName: e.target.value }))
            }
            placeholder="Jan"
          />
        </FormField>
        <FormField label="Nazwisko">
          <Input
            value={form.lastName}
            onChange={(e) =>
              setForm((f) => ({ ...f, lastName: e.target.value }))
            }
            placeholder="Kowalski"
          />
        </FormField>
      </div>

      <FormField label="Adres e-mail" description="Aby zmienić adres e-mail przypisany do konta, skontaktuj się z biurem obsługi klienta.">
        <Input value={profile.email} disabled className="opacity-50 bg-[#0a0a0a] border-white/5" />
      </FormField>

      <FormField
        label="Język interfejsu"
        description="Zmiana języka dotyczy wyłącznie panelu klienta."
      >
        <Select
          value={form.locale}
          onChange={(e) =>
            setForm((f) => ({ ...f, locale: e.target.value }))
          }
          options={[
            { value: "pl", label: "🇵🇱  Polski" },
            { value: "en", label: "🇬🇧  English" },
          ]}
        />
      </FormField>

      <div className="flex justify-end pt-8 mt-8 border-t border-white/5">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="relative group overflow-hidden rounded-xl p-px disabled:opacity-50"
        >
          <SpinBorder variant="white" className="opacity-70" />
          <div className="relative flex items-center justify-center gap-2 rounded-[calc(0.75rem-1px)] bg-[#0a0a0a] px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#121212] min-w-[160px]">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <Save className="h-4 w-4 text-white" />
          )}
          <span>Zapisz zmiany</span>
          </div>
        </button>
      </div>
    </div>
  );
}

/* ────────────────────── Tab: Bezpieczeństwo ────────────────────── */

function SecurityTab({
  showToast,
}: {
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handleChangePassword = () => {
    if (form.newPassword !== form.confirmPassword) {
      showToast("Hasła nie są identyczne", "error");
      return;
    }
    if (form.newPassword.length < 8) {
      showToast("Nowe hasło musi mieć minimum 8 znaków", "error");
      return;
    }

    startTransition(async () => {
      const result = await changeUserPassword(
        form.currentPassword,
        form.newPassword
      );
      if ("error" in result) {
        showToast(result.error!, "error");
      } else {
        showToast(
          "Hasło zostało zmienione. Zaloguj się ponownie.",
          "success"
        );
        setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      }
    });
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Zmiana hasła</h2>
        <p className="text-neutral-400">
          Upewnij się, że Twoje konto jest chronione silnym, unikalnym hasłem.
        </p>
      </div>

      <div className="space-y-6 max-w-md">
        <FormField label="Aktualne hasło">
          <Input
            type="password"
            value={form.currentPassword}
            onChange={(e) =>
              setForm((f) => ({ ...f, currentPassword: e.target.value }))
            }
            placeholder="••••••••"
          />
        </FormField>
        <FormField label="Nowe hasło">
          <Input
            type="password"
            value={form.newPassword}
            onChange={(e) =>
              setForm((f) => ({ ...f, newPassword: e.target.value }))
            }
            placeholder="Min. 8 znaków"
          />
        </FormField>
        <FormField label="Powtórz nowe hasło">
          <Input
            type="password"
            value={form.confirmPassword}
            onChange={(e) =>
              setForm((f) => ({ ...f, confirmPassword: e.target.value }))
            }
            placeholder="Powtórz nowe hasło"
          />
        </FormField>
      </div>

      <TwoFactorSection showToast={showToast} />

      <div className="flex justify-end pt-8 mt-8 border-t border-white/5">
        <button
          onClick={handleChangePassword}
          disabled={isPending}
          className="relative group overflow-hidden rounded-xl p-px disabled:opacity-50"
        >
          <SpinBorder variant="white" className="opacity-70" />
          <div className="relative flex items-center justify-center gap-2 rounded-[calc(0.75rem-1px)] bg-[#0a0a0a] px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#121212] min-w-[160px]">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <Shield className="h-4 w-4 text-white" />
          )}
          <span>Zmień hasło</span>
          </div>
        </button>
      </div>
    </div>
  );
}

/* ────────────────────── Tab: Dane do faktury ────────────────────── */

function BillingTab({
  profile,
  onUpdate,
  showToast,
}: {
  profile: UserProfile;
  onUpdate: (p: UserProfile) => void;
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    companyName: profile.companyName || "",
    nip: profile.nip || "",
    address: profile.address || "",
    city: profile.city || "",
    postalCode: profile.postalCode || "",
    country: profile.country || "PL",
  });

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateUserProfile(form);
      if ("error" in result) {
        showToast(result.error!, "error");
      } else {
        onUpdate({ ...profile, ...form });
        showToast("Dane do faktury zostały zapisane", "success");
      }
    });
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Dane bilingowe</h2>
        <p className="text-neutral-400">
          Dane te zostaną użyte na wszystkich nowo wystawianych fakturach VAT.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField label="Nazwa firmy">
          <Input
            value={form.companyName}
            onChange={(e) =>
              setForm((f) => ({ ...f, companyName: e.target.value }))
            }
            placeholder="Firma Sp. z o.o."
          />
        </FormField>
        <FormField label="NIP">
          <Input
            value={form.nip}
            onChange={(e) =>
              setForm((f) => ({ ...f, nip: e.target.value }))
            }
            placeholder="PL1234567890"
          />
        </FormField>
      </div>

      <FormField label="Adres">
        <Input
          value={form.address}
          onChange={(e) =>
            setForm((f) => ({ ...f, address: e.target.value }))
          }
          placeholder="ul. Przykładowa 10/2"
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Miasto">
          <Input
            value={form.city}
            onChange={(e) =>
              setForm((f) => ({ ...f, city: e.target.value }))
            }
            placeholder="Warszawa"
          />
        </FormField>
        <FormField label="Kod pocztowy">
          <Input
            value={form.postalCode}
            onChange={(e) =>
              setForm((f) => ({ ...f, postalCode: e.target.value }))
            }
            placeholder="00-001"
          />
        </FormField>
        <FormField label="Kraj">
          <Select
            value={form.country}
            onChange={(e) =>
              setForm((f) => ({ ...f, country: e.target.value }))
            }
            options={[
              { value: "PL", label: "🇵🇱  Polska" },
              { value: "DE", label: "🇩🇪  Niemcy" },
              { value: "GB", label: "🇬🇧  Wielka Brytania" },
              { value: "US", label: "🇺🇸  Stany Zjednoczone" },
              { value: "NL", label: "🇳🇱  Holandia" },
              { value: "FR", label: "🇫🇷  Francja" },
            ]}
          />
        </FormField>
      </div>

      <div className="flex justify-end pt-8 mt-8 border-t border-white/5">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="relative group overflow-hidden rounded-xl p-px disabled:opacity-50"
        >
          <SpinBorder variant="white" className="opacity-70" />
          <div className="relative flex items-center justify-center gap-2 rounded-[calc(0.75rem-1px)] bg-[#0a0a0a] px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#121212] min-w-[160px]">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <Save className="h-4 w-4 text-white" />
          )}
          <span>Zapisz dane</span>
          </div>
        </button>
      </div>
    </div>
  );
}

