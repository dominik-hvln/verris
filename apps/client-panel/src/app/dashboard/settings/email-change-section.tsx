"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail, Check } from "lucide-react";
import { requestEmailChange } from "./actions";

export function EmailChangeSection({
  currentEmail,
  showToast,
}: {
  currentEmail: string;
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!newEmail.trim() || !password) {
      showToast("Podaj nowy adres e-mail i aktualne hasło.", "error");
      return;
    }
    startTransition(async () => {
      const res = await requestEmailChange(newEmail.trim(), password);
      if ("error" in res) {
        showToast(res.error!, "error");
      } else {
        setSent(true);
        setPassword("");
        showToast("Wysłaliśmy link potwierdzający na nowy adres.", "success");
      }
    });
  };

  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-100">
        <p className="flex items-center gap-2 font-medium">
          <Check className="h-4 w-4" /> Sprawdź nową skrzynkę
        </p>
        <p className="mt-1 text-xs text-emerald-200/80">
          Na adres <span className="font-mono">{newEmail.trim()}</span> wysłaliśmy link potwierdzający.
          Adres konta zmieni się dopiero po kliknięciu w link. Na dotychczasowy adres wysłaliśmy
          powiadomienie bezpieczeństwa.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-verris-tip"
      >
        <Mail className="h-3.5 w-3.5" /> Zmień adres e-mail
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-[#0a0a0a]/50 p-4">
      <p className="text-xs text-neutral-400">
        Dla bezpieczeństwa potwierdź hasłem. Link aktywacyjny wyślemy na nowy adres, a powiadomienie
        na obecny ({currentEmail}). Zmiana wymaga ponownego zalogowania.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="nowy@adres.pl"
          className="w-full rounded-xl border border-white/10 bg-[#0a0a0a]/50 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/20"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Aktualne hasło"
          className="w-full rounded-xl border border-white/10 bg-[#0a0a0a]/50 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/20"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
          Wyślij link potwierdzający
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-400 hover:text-white"
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}
