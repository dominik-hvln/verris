"use client";

import { useEffect, useState, useTransition } from "react";
import { FileSignature, Loader2 } from "lucide-react";
import { acceptDpa, type UserConsentRow } from "./privacy-actions";
import { aktualnaWersjaDpa } from "./umowa-powierzenia-actions";

/**
 * A2-06 (paczka 109) — umowa powierzenia (DPA) w „Prywatność i dane”: www i DPA §12 ust. 1 obiecują akceptację
 * w panelu i egzemplarz z danymi stron, a panel nie miał ani przycisku, ani linku (endpointy `POST
 * /me/consent/accept-dpa` i `GET /me/dpa.pdf` istniały bez użycia). Akceptacja zapisuje się w „Twoich zgodach”.
 */
export function UmowaPowierzenia({
  consents,
  onAccepted,
  showToast,
}: {
  consents: UserConsentRow[];
  onAccepted: () => Promise<void> | void;
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [aktualna, setAktualna] = useState<string | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let zyje = true;
    aktualnaWersjaDpa().then((v) => zyje && setAktualna(v));
    return () => {
      zyje = false;
    };
  }, []);

  const zaakceptowane = consents
    .filter((c) => c.documentKind === "DPA" && !c.withdrawnAt)
    .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
  const ostatnia = zaakceptowane[0] ?? null;
  const maAktualna = Boolean(ostatnia && aktualna && ostatnia.documentVersion === aktualna);

  const akceptuj = () =>
    startTransition(async () => {
      const r = await acceptDpa();
      if (!r.ok) {
        showToast(r.error, "error");
        return;
      }
      showToast(`Umowa powierzenia zaakceptowana (wersja ${r.version}). Egzemplarz PDF możesz pobrać od razu.`, "success");
      await onAccepted();
    });

  return (
    <section className="space-y-4" aria-labelledby="dpa-tytul">
      <div>
        <h3 id="dpa-tytul" className="text-base font-semibold text-white flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          Umowa powierzenia danych (DPA)
        </h3>
        <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
          Jeśli na hostingu są dane Twoich klientów albo użytkowników (sklep, formularze, poczta, newsletter), przetwarzamy
          je w Twoim imieniu. Zasady opisuje umowa powierzenia (art. 28 RODO). Akceptujesz ją tutaj i pobierasz egzemplarz
          PDF z danymi obu stron. Umowa jest dla firm: w danych do faktury musi być nazwa firmy albo NIP.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#0a0a0a]/40 p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm" role="status">
          {aktualna === undefined ? (
            <span className="text-neutral-400">Sprawdzamy wersję umowy…</span>
          ) : aktualna === null ? (
            <span className="text-neutral-300">Umowa powierzenia nie jest jeszcze opublikowana. Napisz na kontakt@verris.pl, jeśli potrzebujesz jej teraz.</span>
          ) : maAktualna && ostatnia ? (
            <span className="text-emerald-300">
              Zaakceptowana: wersja {ostatnia.documentVersion}, {formatData(ostatnia.grantedAt)}.
            </span>
          ) : ostatnia ? (
            <span className="text-amber-300">
              Masz zaakceptowaną wersję {ostatnia.documentVersion}. Aktualna to {aktualna} — zaakceptuj ją, żeby pobrać nowy egzemplarz.
            </span>
          ) : (
            <span className="text-neutral-300">Nie zaakceptowano jeszcze umowy powierzenia (aktualna wersja {aktualna}).</span>
          )}
          <div className="mt-1">
            <a href="/legal/dpa" target="_blank" rel="noopener" className="text-xs text-neutral-400 underline hover:text-white">
              Przeczytaj umowę
            </a>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {aktualna && !maAktualna ? (
            <button
              type="button"
              onClick={akceptuj}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Akceptuję umowę powierzenia
            </button>
          ) : null}
          {maAktualna ? (
            <a
              href="/api/dpa"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
            >
              Pobierz egzemplarz (PDF)
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function formatData(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}
