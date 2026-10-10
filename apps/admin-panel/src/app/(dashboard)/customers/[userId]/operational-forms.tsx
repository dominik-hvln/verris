"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, Save, KeyRound, Mail, ShieldOff } from "lucide-react";
import type { AdminCustomerOperationalDetail } from "../data";
import {
  changeCustomerEmailAction,
  forceAnonymizeCustomerAction,
  patchCustomerOperationalAction,
  resetCustomerPasswordAction,
} from "../actions";
import { Checkbox } from '@/components/checkbox';
import { WyslijWniosek } from "@/components/wniosek-operacji";
import { brakUprawnienia, type DostepDoAkcji } from "@/lib/akcje/wezel";
import { PrzelacznikKontaWewnetrznego } from "./konto-wewnetrzne";

interface Props {
  detail: AdminCustomerOperationalDetail;
  /** D1 — uprawnienia operatora (domyślnie administrator). */
  dostep?: DostepDoAkcji;
}

const ADMIN: DostepDoAkcji = { isAdmin: true, permissions: [] };

export function CustomerOperationalForms({ detail, dostep = ADMIN }: Props) {
  // D9 (10.10) — e-mail i hasło: CUSTOMERS_MANAGE (L3) bezpośrednio, niżej „Wyślij wniosek”; blokada —
  // CUSTOMERS_MANAGE; usunięcie konta (wymuszona anonimizacja) — tylko administrator (D1).
  const bezZarzadzania = brakUprawnienia("CUSTOMERS_MANAGE", dostep);
  const bezAdmina = brakUprawnienia("ADMIN", dostep);
  const router = useRouter();
  const [pending, start] = useTransition();

  const [loginBlocked, setLoginBlocked] = useState(detail.loginBlocked);
  const [blockReason, setBlockReason] = useState(detail.loginBlockedReason ?? "");
  const [isInternal, setIsInternal] = useState(Boolean(detail.isInternal));
  const [opErr, setOpErr] = useState<string | null>(null);
  const [opOk, setOpOk] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailReason, setEmailReason] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailOk, setEmailOk] = useState(false);

  const [resetReason, setResetReason] = useState("");
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetOk, setResetOk] = useState<string | null>(null);

  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deleteOk, setDeleteOk] = useState(false);

  // Świeże dane z serwera (np. po router.refresh) nadpisują pola formularza.
  // Porównanie z poprzednim `detail` w renderze zamiast efektu — wzorzec z dokumentacji Reacta.
  const [syncedDetail, setSyncedDetail] = useState(detail);
  if (
    syncedDetail.id !== detail.id ||
    syncedDetail.loginBlocked !== detail.loginBlocked ||
    syncedDetail.loginBlockedReason !== detail.loginBlockedReason ||
    syncedDetail.isInternal !== detail.isInternal
  ) {
    setSyncedDetail(detail);
    setIsInternal(Boolean(detail.isInternal));
    setLoginBlocked(detail.loginBlocked);
    setBlockReason(detail.loginBlockedReason ?? "");
  }

  const saveOperational = () => {
    setOpErr(null);
    setOpOk(false);
    // PB-46: notatkę i blokadę zapisuje też obsługa (CUSTOMERS_MANAGE) — wysyłamy tylko pola zmienione
    // względem danych z serwera, inaczej samo przełączenie blokady nadpisywało cudzą notatkę stanem
    // z chwili wczytania strony i zostawiało w dzienniku fałszywy wpis „zmiana notatki”.
    const zmiany: Parameters<typeof patchCustomerOperationalAction>[1] = {};
    const powod = blockReason.trim() || null;
    if (loginBlocked !== detail.loginBlocked || powod !== (detail.loginBlockedReason?.trim() || null)) {
      zmiany.loginBlocked = loginBlocked;
      zmiany.loginBlockedReason = powod;
    }
    if (isInternal !== Boolean(detail.isInternal)) zmiany.isInternal = isInternal;
    if (Object.keys(zmiany).length === 0) {
      setOpErr("Brak zmian do zapisania.");
      return;
    }
    start(async () => {
      const res = await patchCustomerOperationalAction(detail.id, zmiany);
      if (!res.ok) {
        setOpErr(res.error);
        return;
      }
      setOpOk(true);
      router.refresh();
    });
  };

  const submitEmail = () => {
    setEmailErr(null);
    setEmailOk(false);
    const em = newEmail.trim();
    if (!em) {
      setEmailErr("Podaj nowy adres e-mail.");
      return;
    }
    if (emailReason.trim().length < 5) {
      setEmailErr("Podaj powód, np. numer zgłoszenia (min. 5 znaków).");
      return;
    }
    start(async () => {
      const res = await changeCustomerEmailAction(detail.id, em, emailReason.trim());
      if (!res.ok) {
        setEmailErr(res.error);
        return;
      }
      setEmailOk(true);
      setNewEmail("");
      setEmailReason("");
      router.refresh();
    });
  };

  const submitReset = () => {
    setResetErr(null);
    setResetOk(null);
    if (resetReason.trim().length < 5) {
      setResetErr("Podaj powód, np. numer zgłoszenia (min. 5 znaków).");
      return;
    }
    start(async () => {
      const res = await resetCustomerPasswordAction(detail.id, resetReason.trim());
      if (!res.ok) {
        setResetErr(res.error);
        return;
      }
      setResetOk(
        res.linkWyslany
          ? `Link do ustawienia hasła wysłany na ${res.email}.`
          : "Hasło zresetowane, ale mail nie wyszedł. Klient może użyć „Nie pamiętasz hasła?”.",
      );
      setResetReason("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      <section id="blokada" data-karta="blokada" className="scroll-mt-24 rounded-2xl border border-white/10 bg-black/35 p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white">Blokada logowania</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Zablokowany klient nie zaloguje się, a wejście na jego konto z panelu też nie zadziała, dopóki blokada trwa.
        </p>
        {bezZarzadzania ? <p className="text-xs text-amber-200">{bezZarzadzania} — blokadę zmienia starszy specjalista (L3).</p> : null}
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox
            checked={loginBlocked}
            disabled={pending || !!bezZarzadzania}
            onChange={(e) => setLoginBlocked(e.target.checked)}
            className="rounded border-white/20"
          />
          <span className="text-sm text-white">Login zablokowany</span>
        </label>
        <PrzelacznikKontaWewnetrznego userId={detail.id} checked={isInternal} disabled={pending} onChange={setIsInternal} />
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Powód blokady (opcjonalnie)
          </span>
          <textarea
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            disabled={pending || !!bezZarzadzania}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
          />
        </label>
        {/* F2.4 — notatki wewnętrzne (wiele, z autorem i przypięciem) są na Przeglądzie karty. */}
        {opErr ? <p className="text-sm text-rose-300">{opErr}</p> : null}
        {opOk ? <p className="text-sm text-emerald-300">Zapisano.</p> : null}
        <button
          type="button"
          onClick={saveOperational}
          disabled={pending || !!bezZarzadzania}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/35 bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/25 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz
        </button>
      </section>

      <section id="email" data-karta="email" className="scroll-mt-24 rounded-2xl border border-white/10 bg-black/35 p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white flex items-center gap-2">
          <Mail className="h-4 w-4 text-cyan-400" />
          Zmiana adresu e-mail
        </h2>
        <p className="text-xs text-muted-foreground">
          Adres musi być unikalny. Przy aktywnym Stripe wykonamy próbę aktualizacji klienta (best-effort).
        </p>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Nowy e-mail
          </span>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={pending}
            placeholder={detail.email}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
          />
        </label>
        {bezZarzadzania ? (
          <WyslijWniosek
            typ="CUSTOMER_EMAIL_CHANGE"
            userId={detail.id}
            payload={{ newEmail: newEmail.trim() }}
            gotowe={newEmail.trim().includes("@")}
            podpowiedz={`${bezZarzadzania}. Wpisz nowy adres i wyślij wniosek — zdecyduje kierownik zmiany.`}
          />
        ) : (
          <>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Powód (np. numer zgłoszenia)
              </span>
              <input
                value={emailReason}
                onChange={(e) => setEmailReason(e.target.value)}
                disabled={pending}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
              />
            </label>
            {emailErr ? <p className="text-sm text-rose-300">{emailErr}</p> : null}
            {emailOk ? <p className="text-sm text-emerald-300">E-mail został zmieniony.</p> : null}
            <button
              type="button"
              onClick={submitEmail}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/35 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Zmień e-mail
            </button>
          </>
        )}
      </section>

      <section id="reset" data-karta="reset" className="scroll-mt-24 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-amber-100 flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Reset hasła
        </h2>
        <p className="text-xs text-amber-100/80 leading-relaxed flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Obecne hasło przestaje działać, <strong>2FA zostaje wyłączone</strong>. Klient dostaje mailem link do ustawienia
          nowego hasła (ważny 24 h). Hasła nikt w Verris nie widzi.
        </p>
        {bezZarzadzania ? (
          <WyslijWniosek
            typ="CUSTOMER_PASSWORD_RESET"
            userId={detail.id}
            payload={{}}
            podpowiedz={`${bezZarzadzania}. Wyślij wniosek — zdecyduje kierownik zmiany.`}
          />
        ) : (
          <>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Powód (np. numer zgłoszenia)
              </span>
              <input
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                disabled={pending}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
              />
            </label>
            {resetErr ? <p className="text-sm text-rose-300">{resetErr}</p> : null}
            {resetOk ? <p className="text-sm text-emerald-300">{resetOk}</p> : null}
            <button
              type="button"
              onClick={submitReset}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-50 hover:bg-amber-400/25 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Wyślij link do ustawienia hasła
            </button>
          </>
        )}
      </section>

      {bezAdmina ? null : (
      <section id="usuniecie" data-karta="usuniecie" className="scroll-mt-24 rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-rose-100 flex items-center gap-2">
          <ShieldOff className="h-4 w-4" />
          Usunięcie konta (RODO)
        </h2>
        <p className="text-xs text-rose-100/80 leading-relaxed">
          Natychmiastowa <strong>anonimizacja</strong> danych osobowych (art. 17 RODO). Konto klienta
          przestaje działać; subskrypcje i hosting są wstrzymywane zgodnie z procedurą compliance.
          Operacja jest nieodwracalna dla danych identyfikujących.
        </p>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Powód (audyt, min. 5 znaków)
          </span>
          <textarea
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            disabled={pending || deleteOk}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox
            checked={deleteConfirm}
            disabled={pending || deleteOk}
            onChange={(e) => setDeleteConfirm(e.target.checked)}
            className="rounded border-white/20"
          />
          <span className="text-sm text-white">
            Potwierdzam trwałe usunięcie (anonimizację) konta {detail.email}
          </span>
        </label>
        {deleteErr ? <p className="text-sm text-rose-300">{deleteErr}</p> : null}
        {deleteOk ? (
          <p className="text-sm text-emerald-300">
            Konto zanonimizowane. Odśwież listę klientów — profil nie będzie już dostępny.
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending || deleteOk || !deleteConfirm}
          onClick={() => {
            setDeleteErr(null);
            start(async () => {
              const res = await forceAnonymizeCustomerAction(detail.id, deleteReason);
              if (!res.ok) {
                setDeleteErr(res.error ?? "Błąd anonimizacji.");
                return;
              }
              setDeleteOk(true);
              router.refresh();
            });
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-500/50 bg-rose-600/20 px-4 py-2 text-sm font-semibold text-rose-50 hover:bg-rose-600/35 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
          Usuń konto (anonimizuj)
        </button>
      </section>
      )}
    </div>
  );
}
