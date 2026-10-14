"use client";

import { useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/checkbox";
import { Select } from "@/components/select";
import { plForm } from "@/lib/pl";
import { NarzedziaZrodlaPlikow, polaczenieDoPodgladu, type WynikTestuPlikow } from "@verris/ui/zrodlo-plikow-migracji";
import {
  katalogiZrodlaZaKlientaAction,
  testDostepowZaKlientaAction,
  testZrodlaPlikowZaKlientaAction,
  utworzMigracjeZaKlientaAction,
  type MigracjaZaKlientaInput,
  type PreflightZaKlienta,
} from "../actions";

type Baza = { host: string; port: string; database: string; username: string; password: string };
type Skrzynka = { email: string; host: string; password: string };

const pole = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white";
const etykieta = "space-y-1 text-xs text-muted-foreground";
const PORT_DOMYSLNY = { sftp: "22", ftp: "21", ftps: "21" } as const;

/** Prostszy niż kreator klienta: jedno źródło plików, dowolnie wiele baz i skrzynek — bez wykrywania panelu. */
export function zbudujZlecenie(f: {
  subscriptionId: string;
  powod: string;
  ticketId: string;
  targetDomain: string;
  sourceDomain: string;
  notes: string;
  protokol: "sftp" | "ftp" | "ftps";
  ftp: { host: string; port: string; username: string; password: string; remotePath: string };
  bazy: Baza[];
  skrzynki: Skrzynka[];
  zalozSkrzynki: boolean;
}): MigracjaZaKlientaInput {
  const bazy = f.bazy.filter((b) => b.database.trim());
  const skrzynki = f.skrzynki.filter((s) => s.email.trim());
  return {
    subscriptionId: f.subscriptionId,
    powod: f.powod.trim(),
    ticketId: f.ticketId.trim() || undefined,
    targetDomain: f.targetDomain.trim() || undefined,
    sourceDomain: f.sourceDomain.trim() || undefined,
    notes: f.notes.trim() || undefined,
    ftp: f.ftp.host.trim()
      ? {
          protocol: f.protokol,
          host: f.ftp.host.trim(),
          port: Number(f.ftp.port) || Number(PORT_DOMYSLNY[f.protokol]),
          username: f.ftp.username.trim(),
          password: f.ftp.password,
          remotePath: f.ftp.remotePath.trim() || "/",
        }
      : undefined,
    mysql: bazy.length
      ? bazy.map((b) => ({
          host: b.host.trim(),
          port: Number(b.port) || 3306,
          database: b.database.trim(),
          username: b.username.trim() || undefined,
          password: b.password || undefined,
        }))
      : undefined,
    imap: skrzynki.length
      ? skrzynki.map((s) => ({ email: s.email.trim().toLowerCase(), host: s.host.trim(), password: s.password }))
      : undefined,
    utworzBrakujaceSkrzynki: skrzynki.length > 0 && f.zalozSkrzynki ? true : undefined,
  };
}

export function FormularzZaKlienta(props: { subscriptionId: string; klient: string; email: string; domenaKonta: string }) {
  const [powod, setPowod] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [targetDomain, setTargetDomain] = useState("");
  const [sourceDomain, setSourceDomain] = useState("");
  const [notes, setNotes] = useState("");
  // 14.10 — domyślnie „automatycznie”: Test połączenia wykrywa SFTP → FTPS → FTP; ręczny wybór w ustawieniach zaawansowanych.
  const [protokol, setProtokolSurowy] = useState<"auto" | "sftp" | "ftp" | "ftps">("auto");
  const [ftp, setFtpSurowy] = useState({ host: "", port: "", username: "", password: "", remotePath: "" });
  const [wykryty, setWykryty] = useState<WynikTestuPlikow | null>(null);
  // Zmiana danych dostępu unieważnia wynik testu (katalog strony — nie).
  const setFtp = (f: typeof ftp) => {
    if (f.host !== ftp.host || f.port !== ftp.port || f.username !== ftp.username || f.password !== ftp.password) setWykryty(null);
    setFtpSurowy(f);
  };
  const setProtokol = (p: "auto" | "sftp" | "ftp" | "ftps") => {
    setWykryty(null);
    setProtokolSurowy(p);
  };
  const dostep = { host: ftp.host, port: Number(ftp.port) || null, username: ftp.username, password: ftp.password, protocol: protokol };
  const polaczenie = polaczenieDoPodgladu(dostep, wykryty);
  const [bazy, setBazy] = useState<Baza[]>([]);
  const [skrzynki, setSkrzynki] = useState<Skrzynka[]>([]);
  const [zalozSkrzynki, setZalozSkrzynki] = useState(false);
  const [busy, setBusy] = useState<"test" | "wyslij" | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [test, setTest] = useState<PreflightZaKlienta | null>(null);
  const [wyslane, setWyslane] = useState<{ id: string; wygasa: string; mailWyslany: boolean } | null>(null);

  const zlecenie = () =>
    zbudujZlecenie({
      subscriptionId: props.subscriptionId,
      powod,
      ticketId,
      targetDomain,
      sourceDomain,
      notes,
      // Protokół i port do zlecenia: wykryte Testem połączenia albo wybrane ręcznie.
      protokol: polaczenie?.protocol ?? "sftp",
      ftp: { ...ftp, port: polaczenie ? String(polaczenie.port) : ftp.port },
      bazy,
      skrzynki,
      zalozSkrzynki,
    });
  const brakWykrycia = !!ftp.host.trim() && !polaczenie;
  const maZrodlo = !!ftp.host.trim() || bazy.some((b) => b.database.trim()) || skrzynki.some((s) => s.email.trim());

  async function testuj() {
    setBusy("test");
    setBlad(null);
    setTest(null);
    const res = await testDostepowZaKlientaAction(zlecenie());
    setBusy(null);
    if ("error" in res) setBlad(res.error);
    else setTest(res.wynik);
  }

  async function wyslij() {
    setBusy("wyslij");
    setBlad(null);
    const res = await utworzMigracjeZaKlientaAction(zlecenie());
    setBusy(null);
    if ("error" in res) setBlad(res.error);
    else setWyslane(res);
  }

  if (wyslane) {
    return (
      <section className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        <p className="font-semibold">Prośba o zgodę wysłana do klienta.</p>
        <p>
          {wyslane.mailWyslany
            ? `E-mail poszedł na ${props.email}.`
            : "E-maila nie udało się wysłać — klient i tak zobaczy baner w zakładce Migracje w panelu."}{" "}
          Prośba jest ważna do {new Date(wyslane.wygasa).toLocaleString("pl-PL")}; migracja wystartuje dopiero po zgodzie klienta.
        </p>
        <Link href={`/migrations/${wyslane.id}`} className="text-cyan-200 underline">
          Szczegóły zlecenia
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white">
        Klient: <span className="font-semibold">{props.klient}</span> · {props.email} · konto{" "}
        <span className="font-mono text-cyan-100/90">{props.domenaKonta}</span>
      </section>

      <section className="grid gap-3 rounded-xl border border-white/10 bg-black/30 p-4 sm:grid-cols-2">
        <label className={`${etykieta} sm:col-span-2`}>
          <span>Powód / numer zgłoszenia (trafia do dziennika)</span>
          <input value={powod} onChange={(e) => setPowod(e.target.value)} className={pole} placeholder="np. Zgłoszenie #1234 — przeniesienie sklepu" />
        </label>
        <label className={etykieta}>
          <span>ID zgłoszenia klienta (opcjonalnie)</span>
          <input value={ticketId} onChange={(e) => setTicketId(e.target.value)} className={pole} />
        </label>
        <label className={etykieta}>
          <span>Domena docelowa (puste = {props.domenaKonta})</span>
          <input value={targetDomain} onChange={(e) => setTargetDomain(e.target.value)} className={pole} />
        </label>
        <label className={etykieta}>
          <span>Domena u starego dostawcy (gdy inna)</span>
          <input value={sourceDomain} onChange={(e) => setSourceDomain(e.target.value)} className={pole} />
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
        <h2 className="text-sm font-semibold text-white">Pliki strony (FTP/SFTP)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={etykieta}>
            <span>Host</span>
            <input value={ftp.host} onChange={(e) => setFtp({ ...ftp, host: e.target.value })} className={pole} placeholder="puste = bez plików" />
          </label>
          <label className={etykieta}>
            <span>Port</span>
            <input value={ftp.port} onChange={(e) => setFtp({ ...ftp, port: e.target.value })} className={pole} placeholder={protokol === "auto" ? "automatycznie" : PORT_DOMYSLNY[protokol]} inputMode="numeric" />
          </label>
          <label className={etykieta}>
            <span>Użytkownik</span>
            <input value={ftp.username} onChange={(e) => setFtp({ ...ftp, username: e.target.value })} className={pole} />
          </label>
          <label className={etykieta}>
            <span>Hasło</span>
            <input type="password" autoComplete="off" value={ftp.password} onChange={(e) => setFtp({ ...ftp, password: e.target.value })} className={pole} />
          </label>
          <label className={etykieta}>
            <span>Katalog strony</span>
            <input value={ftp.remotePath} onChange={(e) => setFtp({ ...ftp, remotePath: e.target.value })} className={pole} placeholder="/public_html" />
          </label>
        </div>
        <NarzedziaZrodlaPlikow
          dostep={dostep}
          wykryty={wykryty}
          onWykryty={setWykryty}
          sciezka={ftp.remotePath}
          onSciezka={(s) => setFtpSurowy({ ...ftp, remotePath: s })}
          testuj={(d) => testZrodlaPlikowZaKlientaAction(props.subscriptionId, d)}
          listuj={(d) => katalogiZrodlaZaKlientaAction(props.subscriptionId, d)}
          onDaneBazy={(b) =>
            // Hasła nie dostajemy (obsługa go nie widzi) — worker odczyta je z pliku konfiguracyjnego na węźle.
            setBazy((stare) => [
              { host: b.host, port: String(b.port ?? 3306), database: b.nazwa, username: b.uzytkownik, password: "" },
              ...stare.filter((x) => x.database.trim() && x.database.trim() !== b.nazwa),
            ])
          }
        />
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Ustawienia zaawansowane</summary>
          <div className={`${etykieta} mt-2 max-w-xs`}>
            <span>Protokół</span>
            <Select
              aria-label="Protokół"
              value={protokol}
              onChange={(v) => setProtokol(v as "auto" | "sftp" | "ftp" | "ftps")}
              className={pole}
              options={[
                { value: "auto", label: "Automatycznie (SFTP → FTPS → FTP)" },
                { value: "sftp", label: "SFTP" },
                { value: "ftps", label: "FTPS" },
                { value: "ftp", label: "FTP" },
              ]}
            />
          </div>
        </details>
      </section>

      <section className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Bazy danych MySQL</h2>
          <button type="button" onClick={() => setBazy([...bazy, { host: "", port: "3306", database: "", username: "", password: "" }])} className="text-xs text-cyan-300 hover:underline">
            + Dodaj bazę
          </button>
        </div>
        {bazy.length === 0 ? <p className="text-xs text-muted-foreground">Bez baz.</p> : null}
        {bazy.map((b, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-6">
            {(["host", "port", "database", "username", "password"] as const).map((k) => (
              <input
                key={k}
                aria-label={{ host: "Host bazy", port: "Port bazy", database: "Nazwa bazy", username: "Użytkownik bazy", password: "Hasło bazy" }[k]}
                placeholder={{ host: "Host", port: "Port", database: "Nazwa bazy", username: "Użytkownik (puste = z wp-config)", password: "Hasło" }[k]}
                type={k === "password" ? "password" : "text"}
                autoComplete="off"
                value={b[k]}
                onChange={(e) => setBazy(bazy.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                className={pole}
              />
            ))}
            <button type="button" onClick={() => setBazy(bazy.filter((_, j) => j !== i))} className="text-xs text-rose-300 hover:underline">
              Usuń
            </button>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Skrzynki pocztowe (IMAP)</h2>
          <button type="button" onClick={() => setSkrzynki([...skrzynki, { email: "", host: "", password: "" }])} className="text-xs text-cyan-300 hover:underline">
            + Dodaj skrzynkę
          </button>
        </div>
        {skrzynki.length === 0 ? <p className="text-xs text-muted-foreground">Bez poczty.</p> : null}
        {skrzynki.map((s, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-4">
            {(["email", "host", "password"] as const).map((k) => (
              <input
                key={k}
                aria-label={{ email: "Adres skrzynki", host: "Serwer IMAP", password: "Hasło skrzynki" }[k]}
                placeholder={{ email: "biuro@domena.pl", host: "Serwer IMAP starego dostawcy", password: "Hasło" }[k]}
                type={k === "password" ? "password" : "text"}
                autoComplete="off"
                value={s[k]}
                onChange={(e) => setSkrzynki(skrzynki.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                className={pole}
              />
            ))}
            <button type="button" onClick={() => setSkrzynki(skrzynki.filter((_, j) => j !== i))} className="text-xs text-rose-300 hover:underline">
              Usuń
            </button>
          </div>
        ))}
        {skrzynki.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={zalozSkrzynki} onChange={(e) => setZalozSkrzynki(e.target.checked)} />
            Załóż brakujące skrzynki u nas z tym samym hasłem
          </label>
        ) : null}
      </section>

      <label className={`${etykieta} block`}>
        <span>Uwagi dla klienta (zobaczy je na stronie zgody)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${pole} min-h-[64px]`} />
      </label>

      {test ? (
        <section className={`space-y-1 rounded-xl border p-3 text-xs ${test.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-amber-500/30 bg-amber-500/10 text-amber-100"}`}>
          <p className="font-semibold">
            {test.ok
              ? "Dostępy działają."
              : `${test.checks.filter((c) => c.status !== "ok" && c.status !== "reachable").length} ${plForm(
                  test.checks.filter((c) => c.status !== "ok" && c.status !== "reachable").length,
                  "źródło wymaga",
                  "źródła wymagają",
                  "źródeł wymaga",
                )} poprawy.`}
          </p>
          {test.checks.map((c, i) => (
            <p key={i}>
              {c.target}: {c.message}
            </p>
          ))}
        </section>
      ) : null}
      {blad ? <p className="text-sm text-rose-300">{blad}</p> : null}
      {brakWykrycia ? (
        <p className="text-xs text-amber-200">Przed wysłaniem kliknij „Test połączenia” przy plikach — ustalimy, czym kopiować (SFTP/FTPS/FTP).</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={testuj}
          disabled={busy !== null || !maZrodlo}
          className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:border-white/30 disabled:opacity-50"
        >
          {busy === "test" ? "Sprawdzam…" : "Test wszystkich dostępów"}
        </button>
        <button
          type="button"
          onClick={wyslij}
          disabled={busy !== null || !maZrodlo || powod.trim().length < 5 || brakWykrycia}
          className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy === "wyslij" ? "Wysyłam…" : "Wyślij klientowi prośbę o zgodę"}
        </button>
      </div>
    </div>
  );
}
