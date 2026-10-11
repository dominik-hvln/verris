"use client";

import { useState, useTransition } from "react";
import { potwierdz, zapytaj } from "@/components/potwierdz";
import { blokadaNadawcyAction, odrzucPocztaAction, przypiszPocztaAction, type Wynik } from "./actions";

const MALY = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";

export interface PlikPoczty {
  nr: number;
  nazwa: string;
  typ?: string;
  rozmiar?: number;
  pominiety?: string;
  dostepny: boolean;
}

/**
 * F3.7 — pliki od nieznanego nadawcy: domyślnie tylko liczba; „Pokaż” po ostrzeżeniu odsłania nazwy i linki
 * (pobranie z potwierdzam=1). Brak skanu antywirusowego — mówimy to wprost.
 */
export function PlikiPoczty({ id, pliki }: { id: string; pliki: PlikPoczty[] }) {
  const [widoczne, setWidoczne] = useState(false);
  if (!pliki.length) return null;
  const pokaz = async () => {
    const ok = await potwierdz(
      "Pliki od nieznanego nadawcy nie były skanowane antywirusem. Przepuściliśmy tylko PDF, obrazy i tekst, ale nie otwieraj ich, jeśli mail wygląda podejrzanie.",
      { akcja: "Pokaż pliki", tytul: "Pliki od nieznanego nadawcy" },
    );
    if (ok) setWidoczne(true);
  };
  if (!widoczne) {
    return (
      <button type="button" data-akcja="pokaz-pliki" className={MALY} onClick={() => void pokaz()}>
        Pokaż pliki ({pliki.length})
      </button>
    );
  }
  return (
    <ul className="flex flex-col gap-0.5 text-xs">
      {pliki.map((p) =>
        p.dostepny ? (
          <li key={p.nr}>
            <a className="underline" href={`/api/poczta-plik/${id}/${p.nr}?potwierdzam=1`} rel="noopener noreferrer">
              {p.nazwa}
            </a>{" "}
            <span className="text-muted-foreground">{p.rozmiar ? `${Math.max(1, Math.round(p.rozmiar / 1024))} KB` : ""}</span>
          </li>
        ) : (
          <li key={p.nr} className="text-muted-foreground">
            {p.nazwa} — pominięty: {p.pominiety}
          </li>
        ),
      )}
    </ul>
  );
}

/** Decyzja obsługi: klient (adres konta), zgłoszenie (#xxxxxxxx) albo odrzucenie z opcjonalną blokadą nadawcy. */
export function DecyzjePoczty({ id, nadawca, sugerowane }: { id: string; nadawca: string; sugerowane: string | null }) {
  const [pending, start] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const wykonaj = (fn: () => Promise<Wynik>, sukces: (t?: string) => string) =>
    start(async () => {
      const r: Wynik = await fn().catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }));
      setInfo(r.ok ? sukces(r.ticketId) : r.error);
    });
  const doKlienta = async () => {
    const email = await zapytaj("Adres e-mail konta klienta:", { akcja: "Załóż zgłoszenie", tytul: "Nowe zgłoszenie z maila", placeholder: "klient@firma.pl" });
    if (!email?.trim()) return;
    wykonaj(() => przypiszPocztaAction(id, { email: email.trim() }), (t) => `Założono zgłoszenie #${t?.slice(0, 8)}.`);
  };
  const doZgloszenia = async () => {
    const nr = await zapytaj("Numer zgłoszenia (#xxxxxxxx) — mail trafi jako notatka wewnętrzna:", {
      akcja: "Dopisz",
      tytul: "Dopisz do zgłoszenia",
      domyslna: sugerowane?.slice(0, 8) ?? "",
    });
    if (!nr?.trim()) return;
    wykonaj(() => przypiszPocztaAction(id, { zgloszenieId: nr.trim().replace(/^#/, "") }), (t) => `Dopisano do zgłoszenia #${t?.slice(0, 8)}.`);
  };
  const odrzuc = async () => {
    const powod = await zapytaj("Powód odrzucenia (np. reklama, nie do nas):", { akcja: "Dalej", tytul: "Odrzuć wiadomość" });
    if (powod === null || powod.trim().length < 3) return;
    const blokuj = await potwierdz(`Zablokować też nadawcę ${nadawca}? Jego kolejne maile nie trafią do kolejki.`, { akcja: "Zablokuj", tytul: "Blokada nadawcy" });
    wykonaj(() => odrzucPocztaAction(id, powod.trim(), blokuj), () => (blokuj ? "Odrzucono i zablokowano nadawcę." : "Odrzucono."));
  };
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <button type="button" data-akcja="do-klienta" className={MALY} disabled={pending} onClick={() => void doKlienta()}>
        Załóż zgłoszenie
      </button>
      <button type="button" data-akcja="do-zgloszenia" className={MALY} disabled={pending} onClick={() => void doZgloszenia()}>
        Dopisz do zgłoszenia
      </button>
      <button type="button" data-akcja="odrzuc" className={MALY} disabled={pending} onClick={() => void odrzuc()}>
        Odrzuć
      </button>
      {info ? (
        <span role="status" className="text-xs text-muted-foreground">
          {info}
        </span>
      ) : null}
    </span>
  );
}

/** Blokady nadawców: dodanie (adres albo @domena) i zdjęcie. */
export function BlokadyNadawcow({ blokady, moze }: { blokady: { wzorzec: string; powod: string | null }[]; moze: boolean }) {
  const [pending, start] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const zmien = (wzorzec: string, dodaj: boolean, powod?: string) =>
    start(async () => {
      const r = await blokadaNadawcyAction(wzorzec, dodaj, powod).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }));
      setInfo(r.ok ? (dodaj ? `Zablokowano ${wzorzec}.` : `Odblokowano ${wzorzec}.`) : r.error);
    });
  const dodaj = async () => {
    const w = await zapytaj("Adres (jan@firma.pl) albo domena (@firma.pl):", { akcja: "Zablokuj", tytul: "Blokada nadawcy" });
    if (!w?.trim()) return;
    const powod = await zapytaj("Powód (opcjonalnie):", { akcja: "Zablokuj", tytul: "Blokada nadawcy" });
    if (powod === null) return;
    zmien(w.trim(), true, powod.trim() || undefined);
  };
  return (
    <div className="flex flex-col gap-2">
      {blokady.length === 0 ? <p className="text-sm text-muted-foreground">Brak blokad.</p> : null}
      <ul className="flex flex-col gap-1 text-sm">
        {blokady.map((b) => (
          <li key={b.wzorzec} className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{b.wzorzec}</span>
            {b.powod ? <span className="text-xs text-muted-foreground">{b.powod}</span> : null}
            {moze ? (
              <button type="button" className={MALY} disabled={pending} onClick={() => zmien(b.wzorzec, false)}>
                Odblokuj
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {moze ? (
        <span className="flex items-center gap-2">
          <button type="button" data-akcja="zablokuj" className={MALY} disabled={pending} onClick={() => void dodaj()}>
            Zablokuj nadawcę
          </button>
          {info ? <span role="status" className="text-xs text-muted-foreground">{info}</span> : null}
        </span>
      ) : null}
    </div>
  );
}
