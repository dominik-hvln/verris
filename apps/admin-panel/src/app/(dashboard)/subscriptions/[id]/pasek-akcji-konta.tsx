"use client";

import { useId, useState, useTransition } from "react";
import { Select } from "@/components/select";
import { Checkbox } from "@/components/checkbox";
import { potwierdz } from "@/components/potwierdz";
import { Pomoc } from "@/components/pomoc";
import { brakUprawnienia, type DostepDoAkcji } from "@/lib/akcje/wezel";
import { akcjaKontaAction, odczytDlaPaskaAction, type AkcjaPaska, type OdczytPaska, type Wynik } from "./pasek-akcji-konta-actions";

/**
 * F2.2 (D2/D3, 10.10) — pasek akcji konta: operatorskie lustro tras klienta bez wchodzenia na konto. Każda akcja
 * z obowiązkowym powodem (min. 10 znaków) i opcjonalnym numerem zgłoszenia; klient widzi w aktywności „obsługa
 * Verris (zgłoszenie #…)”. Hasła: operator ustawia losowe, którego nikt nie zna — klient dostaje mail z linkiem
 * do ustawienia własnego. Uprawnienia jak w API: ACCOUNT_ACTIONS (L2), DNS — DNS_MANAGE (L3); bez nich przycisk
 * jest wyszarzony z informacją, czego brakuje.
 */
type Rodzaj = "skrzynka" | "ftp" | "baza" | "ssl" | "php" | "kopia" | "skan" | "dns";

export const PRZYCISKI_PASKA: ReadonlyArray<{ id: Rodzaj; nazwa: string; perm: "ACCOUNT_ACTIONS" | "DNS_MANAGE" }> = [
  { id: "skrzynka", nazwa: "Reset hasła skrzynki", perm: "ACCOUNT_ACTIONS" },
  { id: "ftp", nazwa: "Reset hasła FTP", perm: "ACCOUNT_ACTIONS" },
  { id: "baza", nazwa: "Reset hasła bazy", perm: "ACCOUNT_ACTIONS" },
  { id: "ssl", nazwa: "Wystaw SSL", perm: "ACCOUNT_ACTIONS" },
  { id: "php", nazwa: "Zmień PHP", perm: "ACCOUNT_ACTIONS" },
  { id: "kopia", nazwa: "Kopia teraz", perm: "ACCOUNT_ACTIONS" },
  { id: "skan", nazwa: "Skan malware", perm: "ACCOUNT_ACTIONS" },
  { id: "dns", nazwa: "Edytuj DNS", perm: "DNS_MANAGE" },
];

const TYPY_DNS = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "NS", "CAA"] as const;
const MIN_POWOD = 10;

type Rekord = { name: string; type: string; value: string; ttl: number | null };
type Malware = {
  wToku: boolean;
  sprawdzono: string | null;
  ostatniSkan: string | null;
  razem: number;
  znaleziska: Array<{ sygnatura: string; sciezka: string }>;
  blad: string | null;
};
type Dane = {
  skrzynki?: string[];
  ftp?: string[];
  bazy?: string[];
  php?: { wersja: string | null; dostepne: string[] };
  domeny?: string[];
  dns?: { domain: string | null; records: Rekord[]; fetchError: string | null };
  malware?: Malware;
};

const POLE = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white";

/** Akcje na jednym z elementów konta: komunikat, gdy konto ich nie ma, i podpowiedź przy wyszarzonym „Wykonaj”. */
const BRAK_CELU: Partial<Record<Rodzaj, { lista: string; przycisk: string }>> = {
  skrzynka: { lista: "Konto nie ma skrzynek.", przycisk: "Konto nie ma skrzynek — nie ma hasła do zresetowania." },
  ftp: { lista: "Konto nie ma dodatkowych kont FTP.", przycisk: "Konto nie ma dodatkowych kont FTP — nie ma hasła do zresetowania." },
  baza: { lista: "Konto nie ma baz danych.", przycisk: "Konto nie ma baz danych — nie ma hasła do zresetowania." },
  ssl: { lista: "Konto nie ma domen.", przycisk: "Konto nie ma domen — nie ma dla czego wystawić certyfikatu." },
  php: { lista: "Brak innych wersji do wyboru.", przycisk: "Brak innych wersji PHP do wyboru." },
};
const kiedy = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL") : "—");

/** Komunikat po udanej akcji — hasła nie ma; mówimy, czy klient dostał mail. */
export function komunikatPoAkcji(rodzaj: Rodzaj, wynik: unknown): string {
  const w = (wynik ?? {}) as { mailDoKlienta?: boolean; klient?: string };
  switch (rodzaj) {
    case "skrzynka":
    case "ftp":
    case "baza":
      return w.mailDoKlienta
        ? `Hasło zresetowane. Klient dostał mail (${w.klient ?? "adres konta"}) z linkiem do ustawienia nowego.`
        : `Hasło zresetowane, ale maila nie udało się wysłać — poproś klienta (${w.klient ?? "adres konta"}), by ustawił hasło w panelu.`;
    case "ssl":
      return "Certyfikat zlecony — wystawienie trwa do kilku minut; stan w zakładce SSL konta.";
    case "php":
      return "Zmiana PHP zlecona — serwer zastosuje ją w ciągu minuty (stan w zakładce PHP konta).";
    case "kopia":
      return "Kopia zlecona — pojawi się na liście kopii po zakończeniu.";
    case "skan":
      return "Skan zlecony — wynik po kilku minutach, „Odśwież wynik”.";
    case "dns":
      return "Strefa DNS zmieniona.";
  }
}

export function PasekAkcjiKonta({ subscriptionId, dostep }: { subscriptionId: string; dostep: DostepDoAkcji }) {
  const [aktywna, setAktywna] = useState<Rodzaj | null>(null);
  const [dane, setDane] = useState<Dane>({});
  const [bladDanych, setBladDanych] = useState<string | null>(null);
  const [powod, setPowod] = useState("");
  const [zgloszenie, setZgloszenie] = useState("");
  const [cel, setCel] = useState(""); // skrzynka / login FTP / baza / domena / wersja PHP
  const [uzytkownik, setUzytkownik] = useState("");
  const [www, setWww] = useState(true);
  const [rekord, setRekord] = useState<{ name: string; type: string; value: string; ttl: string }>({ name: "", type: "A", value: "", ttl: "3600" });
  const [edytowany, setEdytowany] = useState<Rekord | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  const wczytaj = async (co: OdczytPaska, domena?: string): Promise<unknown | null> => {
    let r: Wynik;
    try {
      r = await odczytDlaPaskaAction(subscriptionId, co, domena);
    } catch {
      r = { ok: false, error: "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę." };
    }
    if (!r.ok) {
      setBladDanych(r.error);
      return null;
    }
    const f = (r.wynik as { fetchError?: string | null }).fetchError;
    setBladDanych(f ? `Odczyt z serwera nie powiódł się: ${f}` : null);
    return r.wynik;
  };

  const wczytajDns = (domena?: string) =>
    start(async () => {
      const w = (await wczytaj("dns", domena)) as (Dane["dns"] & { domeny: string[] }) | null;
      if (w) setDane((d) => ({ ...d, domeny: w.domeny, dns: { domain: w.domain, records: w.records, fetchError: w.fetchError } }));
    });

  const wczytajMalware = () =>
    start(async () => {
      const w = (await wczytaj("malware")) as Malware | null;
      if (w) setDane((d) => ({ ...d, malware: w }));
    });

  const otworz = (r: Rodzaj) => {
    // Weryfikacja 11.10 — powód dotyczy jednej akcji: po przełączeniu nie przechodzi do następnej (do dziennika trafiłby
    // opis resetu skrzynki przy zmianie PHP). Numer zgłoszenia zostaje — to zwykle ta sama sprawa klienta.
    if (r !== aktywna) setPowod("");
    setAktywna(r);
    setMsg(null);
    setBladDanych(null);
    setCel("");
    setUzytkownik("");
    setEdytowany(null);
    start(async () => {
      if (r === "skrzynka") {
        const w = (await wczytaj("poczta")) as { skrzynki: Array<{ email: string }> } | null;
        if (w) setDane((d) => ({ ...d, skrzynki: w.skrzynki.map((s) => s.email) }));
      } else if (r === "ftp") {
        const w = (await wczytaj("ftp")) as { konta: Array<{ username: string }> } | null;
        if (w) setDane((d) => ({ ...d, ftp: w.konta.map((k) => k.username) }));
      } else if (r === "baza") {
        const w = (await wczytaj("bazy")) as { bazy: string[] } | null;
        if (w) setDane((d) => ({ ...d, bazy: w.bazy }));
      } else if (r === "ssl") {
        const w = (await wczytaj("domeny")) as { domeny: string[] } | null;
        if (w) setDane((d) => ({ ...d, domeny: w.domeny }));
      } else if (r === "php") {
        const w = (await wczytaj("php")) as { wersja: string | null; dostepneWersje: string[] } | null;
        if (w) setDane((d) => ({ ...d, php: { wersja: w.wersja, dostepne: w.dostepneWersje } }));
      } else if (r === "skan") {
        const w = (await wczytaj("malware")) as Malware | null;
        if (w) setDane((d) => ({ ...d, malware: w }));
      } else if (r === "dns") {
        const w = (await wczytaj("dns")) as (Dane["dns"] & { domeny: string[] }) | null;
        if (w) setDane((d) => ({ ...d, domeny: w.domeny, dns: { domain: w.domain, records: w.records, fetchError: w.fetchError } }));
      }
    });
  };

  const wykonaj = async (akcja: AkcjaPaska, pola: Record<string, unknown>, pytanie: string, niebezpieczne = false) => {
    if (!(await potwierdz(`${pytanie} Klient zobaczy w aktywności konta wpis „obsługa Verris”.`, { akcja: "Wykonaj", niebezpieczne }))) return;
    start(async () => {
      let r: Wynik;
      try {
        r = await akcjaKontaAction(subscriptionId, akcja, { ...pola, powod, zgloszenie });
      } catch {
        r = { ok: false, error: "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę." };
      }
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      setMsg({ ok: true, tekst: komunikatPoAkcji(aktywna ?? "kopia", r.wynik) });
      setPowod("");
      setZgloszenie("");
      if (akcja === "skan") setDane((d) => ({ ...d, malware: r.wynik as Malware }));
      if (akcja.startsWith("dns")) {
        setEdytowany(null);
        setRekord({ name: "", type: "A", value: "", ttl: "3600" });
        const w = (await wczytaj("dns", dane.dns?.domain ?? undefined)) as (Dane["dns"] & { domeny: string[] }) | null;
        if (w) setDane((d) => ({ ...d, dns: { domain: w.domain, records: w.records, fetchError: w.fetchError } }));
      }
    });
  };

  const powodOk = powod.trim().length >= MIN_POWOD;
  const blokada = pending || !powodOk;
  const przycisk = (on: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs disabled:opacity-50 ${on ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/5 text-neutral-300 hover:text-white"}`;
  const wybor = (wartosci: string[] | undefined, puste: string) =>
    wartosci === undefined ? null : wartosci.length === 0 ? (
      <p className="text-xs text-muted-foreground">{puste}</p>
    ) : (
      <Select value={cel} onChange={setCel} options={wartosci.map((v) => ({ value: v, label: v }))} disabled={pending} placeholder="Wybierz…" wrapperClassName="w-full max-w-md" />
    );
  const domenaDns = dane.dns?.domain ?? "";
  const phpDoWyboru = dane.php?.dostepne.filter((v) => v !== dane.php?.wersja);
  // Lista celów aktywnej akcji (undefined — jeszcze nie wczytana albo akcja bez listy).
  const cele: Partial<Record<Rodzaj, string[] | undefined>> = { skrzynka: dane.skrzynki, ftp: dane.ftp, baza: dane.bazy, ssl: dane.domeny, php: phpDoWyboru };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-5" role="region" aria-labelledby="akcje-konta-naglowek">
      <div className="flex items-center gap-2">
        <h2 id="akcje-konta-naglowek" className="text-sm font-semibold text-white">
          Akcje na koncie
        </h2>
        <Pomoc id="akcje-konta" />
      </div>
      <p className="text-xs text-muted-foreground">
        Bez wchodzenia na konto klienta. Powód zapisuje się w dzienniku; klient widzi wpis „obsługa Verris” z numerem zgłoszenia. Nowych haseł nikt nie
        widzi — klient ustawia je sam.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5" role="toolbar" aria-label="Akcje na koncie klienta">
        {PRZYCISKI_PASKA.map((p) => {
          const brak = brakUprawnienia(p.perm, dostep);
          return (
            <button
              key={p.id}
              type="button"
              data-akcja={p.id}
              disabled={!!brak || pending}
              title={brak ?? undefined}
              aria-pressed={aktywna === p.id}
              onClick={() => otworz(p.id)}
              className={przycisk(aktywna === p.id)}
            >
              {p.nazwa}
            </button>
          );
        })}
      </div>

      {aktywna ? (
        <div className="mt-4 space-y-3" data-formularz={aktywna}>
          {bladDanych ? (
            <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {bladDanych}
            </p>
          ) : null}

          {aktywna === "skrzynka" ? wybor(dane.skrzynki, BRAK_CELU.skrzynka!.lista) : null}
          {aktywna === "ftp" ? wybor(dane.ftp, BRAK_CELU.ftp!.lista) : null}
          {aktywna === "baza" ? (
            <>
              {wybor(dane.bazy, BRAK_CELU.baza!.lista)}
              <input
                value={uzytkownik}
                onChange={(e) => setUzytkownik(e.target.value)}
                placeholder="użytkownik bazy, pełna nazwa (np. u1_wp)"
                aria-label="Użytkownik bazy"
                maxLength={64}
                disabled={pending}
                className={`${POLE} max-w-md font-mono`}
              />
              <p className="text-xs text-amber-200" data-ostrzezenie="baza">
                Strona korzystająca z tego użytkownika straci połączenie z bazą, dopóki klient nie wpisze nowego hasła w jej konfiguracji.
              </p>
            </>
          ) : null}
          {aktywna === "ssl" ? (
            <>
              {wybor(dane.domeny, BRAK_CELU.ssl!.lista)}
              <label className="flex items-center gap-2 text-xs text-neutral-200">
                <Checkbox checked={www} onChange={(e) => setWww(e.target.checked)} disabled={pending} />
                Także www.
              </label>
            </>
          ) : null}
          {aktywna === "php" ? (
            <>
              {dane.php ? <p className="text-xs text-muted-foreground">Teraz: {dane.php.wersja ?? "domyślna serwera"}</p> : null}
              {wybor(phpDoWyboru, BRAK_CELU.php!.lista)}
            </>
          ) : null}
          {aktywna === "kopia" ? <p className="text-xs text-muted-foreground">Pełna kopia konta: pliki, bazy i poczta.</p> : null}
          {aktywna === "skan" ? <WynikSkanu m={dane.malware} odswiez={wczytajMalware} pending={pending} /> : null}
          {aktywna === "dns" ? (
            <div className="space-y-3">
              {dane.domeny && dane.domeny.length > 1 ? (
                <Select
                  value={domenaDns}
                  onChange={(d) => wczytajDns(d)}
                  options={dane.domeny.map((d) => ({ value: d, label: d }))}
                  disabled={pending}
                  wrapperClassName="w-64"
                />
              ) : null}
              {dane.dns?.records.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-white">
                    <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1">Nazwa</th>
                        <th className="px-2 py-1">Typ</th>
                        <th className="px-2 py-1">Wartość</th>
                        <th className="px-2 py-1">TTL</th>
                        <th className="px-2 py-1" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {dane.dns.records.map((r, i) => (
                        <tr key={`${r.type}-${r.name}-${i}`} data-rekord={`${r.type} ${r.name}`}>
                          <td className="px-2 py-1 font-mono break-all">{r.name}</td>
                          <td className="px-2 py-1 font-mono">{r.type}</td>
                          <td className="px-2 py-1 font-mono break-all">{r.value}</td>
                          <td className="px-2 py-1 font-mono">{r.ttl ?? "—"}</td>
                          <td className="space-x-2 whitespace-nowrap px-2 py-1 text-right">
                            {(TYPY_DNS as readonly string[]).includes(r.type) ? (
                              <button
                                type="button"
                                className="text-cyan-300 hover:underline disabled:opacity-50"
                                disabled={pending}
                                onClick={() => {
                                  setEdytowany(r);
                                  setRekord({ name: r.name, type: r.type, value: r.value, ttl: String(r.ttl ?? 3600) });
                                }}
                              >
                                Zmień
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="text-rose-300 hover:underline disabled:opacity-50"
                              disabled={blokada}
                              title={powodOk ? undefined : "Najpierw wpisz powód"}
                              onClick={() =>
                                void wykonaj(
                                  "dns-usun",
                                  { domain: domenaDns, name: r.name, type: r.type, value: r.value },
                                  `Usunąć rekord ${r.type} ${r.name} → ${r.value} ze strefy ${domenaDns}?`,
                                  true,
                                )
                              }
                            >
                              Usuń
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : dane.dns ? (
                <p className="text-xs text-muted-foreground">Strefa nie ma rekordów.</p>
              ) : null}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_110px_2fr_90px]">
                <input
                  value={rekord.name}
                  onChange={(e) => setRekord({ ...rekord, name: e.target.value })}
                  placeholder="nazwa (@, www, _dmarc)"
                  aria-label="Nazwa rekordu"
                  disabled={pending}
                  className={`${POLE} font-mono`}
                />
                <Select
                  value={rekord.type}
                  onChange={(t) => setRekord({ ...rekord, type: t })}
                  options={TYPY_DNS.map((t) => ({ value: t, label: t }))}
                  disabled={pending}
                  aria-label="Typ rekordu"
                />
                <input
                  value={rekord.value}
                  onChange={(e) => setRekord({ ...rekord, value: e.target.value })}
                  placeholder="wartość"
                  aria-label="Wartość rekordu"
                  disabled={pending}
                  className={`${POLE} font-mono`}
                />
                <input
                  value={rekord.ttl}
                  onChange={(e) => setRekord({ ...rekord, ttl: e.target.value.replace(/\D/g, "") })}
                  placeholder="TTL"
                  aria-label="TTL"
                  disabled={pending}
                  className={`${POLE} font-mono`}
                />
              </div>
              {edytowany ? (
                <p className="text-xs text-muted-foreground">
                  Zmieniasz rekord {edytowany.type} {edytowany.name} → {edytowany.value}.{" "}
                  <button type="button" className="text-cyan-300 hover:underline" onClick={() => setEdytowany(null)}>
                    Anuluj zmianę
                  </button>
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="block space-y-1">
            <span className="text-xs text-neutral-400">Powód do dziennika (obowiązkowy, min. {MIN_POWOD} znaków)</span>
            <input
              value={powod}
              onChange={(e) => setPowod(e.target.value)}
              maxLength={500}
              disabled={pending}
              placeholder="np. klient nie pamięta hasła, zgłoszenie telefoniczne"
              className={POLE}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-neutral-400">Numer zgłoszenia klienta (jeśli jest)</span>
            <input value={zgloszenie} onChange={(e) => setZgloszenie(e.target.value)} maxLength={64} disabled={pending} placeholder="#ab12cd34" className={`${POLE} max-w-xs font-mono`} />
          </label>

          <PrzyciskWykonaj
            rodzaj={aktywna}
            cel={cel}
            uzytkownik={uzytkownik}
            www={www}
            rekord={rekord}
            edytowany={edytowany}
            domenaDns={domenaDns}
            blokada={blokada}
            pending={pending}
            powodOk={powodOk}
            bezCelu={cele[aktywna]?.length === 0}
            wykonaj={wykonaj}
          />
          {msg ? (
            <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
              {msg.tekst}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PrzyciskWykonaj(p: {
  rodzaj: Rodzaj;
  cel: string;
  uzytkownik: string;
  www: boolean;
  rekord: { name: string; type: string; value: string; ttl: string };
  edytowany: Rekord | null;
  domenaDns: string;
  blokada: boolean;
  pending: boolean;
  powodOk: boolean;
  /** Konto nie ma elementów, na których działa akcja (np. dodatkowych kont FTP). */
  bezCelu: boolean;
  wykonaj: (akcja: AkcjaPaska, pola: Record<string, unknown>, pytanie: string, niebezpieczne?: boolean) => Promise<void>;
}) {
  const podpowiedzId = useId();
  const ttl = p.rekord.ttl ? Number(p.rekord.ttl) : undefined;
  const [napis, akcja, pola, pytanie, brakuje]: [string, AkcjaPaska, Record<string, unknown>, string, boolean] = (() => {
    switch (p.rodzaj) {
      case "skrzynka":
        return ["Resetuj hasło", "haslo-skrzynki", { email: p.cel }, `Zresetować hasło skrzynki ${p.cel}? Programy pocztowe klienta przestaną się logować do czasu ustawienia nowego.`, !p.cel];
      case "ftp":
        return ["Resetuj hasło", "haslo-ftp", { username: p.cel }, `Zresetować hasło konta FTP ${p.cel}?`, !p.cel];
      case "baza":
        return ["Resetuj hasło", "haslo-bazy", { db: p.cel, user: p.uzytkownik.trim() }, `Zresetować hasło użytkownika ${p.uzytkownik.trim()} bazy ${p.cel}? Strona straci połączenie z bazą do czasu wpisania nowego hasła.`, !p.cel || !p.uzytkownik.trim()];
      case "ssl":
        return ["Wystaw certyfikat", "ssl", { domain: p.cel, includeWww: p.www }, `Wystawić ponownie certyfikat Let's Encrypt dla ${p.cel}${p.www ? " i www" : ""}?`, !p.cel];
      case "php":
        return ["Zmień wersję", "php", { version: p.cel }, `Zmienić wersję PHP konta na ${p.cel}?`, !p.cel];
      case "kopia":
        return ["Zrób kopię", "kopia", {}, "Zlecić pełną kopię konta teraz?", false];
      case "skan":
        return ["Skanuj teraz", "skan", {}, "Zlecić skan konta na złośliwe oprogramowanie?", false];
      case "dns": {
        const next = { name: p.rekord.name.trim(), type: p.rekord.type, value: p.rekord.value.trim(), ...(ttl ? { ttl } : {}) };
        const pusty = !next.name || !next.value || !p.domenaDns;
        if (p.edytowany) {
          return [
            "Zapisz zmianę",
            "dns-zmien",
            { domain: p.domenaDns, old: { name: p.edytowany.name, type: p.edytowany.type, value: p.edytowany.value }, next },
            `Zmienić rekord ${p.edytowany.type} ${p.edytowany.name} w strefie ${p.domenaDns}? Zła wartość może wyłączyć stronę albo pocztę klienta.`,
            pusty,
          ];
        }
        return ["Dodaj rekord", "dns-dodaj", { domain: p.domenaDns, ...next }, `Dodać rekord ${next.type} ${next.name} → ${next.value} do strefy ${p.domenaDns}?`, pusty];
      }
    }
  })();
  // Weryfikacja 11.10 — wyszarzony przycisk wyglądał na aktywny (cyjan z przezroczystością), a klik „nic nie robił”:
  // teraz szary z podpowiedzią, czego brakuje. Kolejność: brak celu na koncie, brak wyboru, brak powodu.
  const podpowiedz = p.pending
    ? null
    : p.bezCelu
      ? (BRAK_CELU[p.rodzaj]?.przycisk ?? null)
      : brakuje
        ? p.rodzaj === "dns"
          ? "Uzupełnij nazwę i wartość rekordu."
          : p.rodzaj === "baza"
            ? "Wybierz bazę i wpisz użytkownika."
            : "Najpierw wybierz z listy."
        : !p.powodOk
          ? `Najpierw wpisz powód (min. ${MIN_POWOD} znaków).`
          : null;
  return (
    <div className="space-y-1">
      <button
        type="button"
        data-wykonaj={akcja}
        disabled={p.blokada || brakuje || p.bezCelu}
        title={podpowiedz ?? undefined}
        aria-describedby={podpowiedz ? podpowiedzId : undefined}
        onClick={() => void p.wykonaj(akcja, pola, pytanie, akcja.startsWith("haslo") || akcja.startsWith("dns"))}
        className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
      >
        {napis}
      </button>
      {podpowiedz ? (
        <p id={podpowiedzId} data-podpowiedz={akcja} className="text-xs text-muted-foreground">
          {podpowiedz}
        </p>
      ) : null}
    </div>
  );
}

function WynikSkanu({ m, odswiez, pending }: { m?: Malware; odswiez: () => void; pending: boolean }) {
  if (!m) return null;
  return (
    <div className="space-y-2 text-xs text-white" data-skan="wynik">
      <p className="text-muted-foreground">
        Ostatni pełny skan: {kiedy(m.ostatniSkan)} · wyniki z {kiedy(m.sprawdzono)}
        {m.wToku ? " · skan w toku" : ""}{" "}
        <button type="button" onClick={odswiez} disabled={pending} className="text-cyan-300 hover:underline disabled:opacity-50">
          Odśwież wynik
        </button>
      </p>
      {m.blad ? <p className="text-rose-200">Ostatnie zadanie nie powiodło się: {m.blad}</p> : null}
      {m.znaleziska.length ? (
        <ul className="space-y-1 font-mono">
          {m.znaleziska.map((z) => (
            <li key={z.sciezka} className="break-all">
              <span className="text-rose-200">{z.sygnatura}</span> {z.sciezka}
            </li>
          ))}
        </ul>
      ) : m.sprawdzono ? (
        <p className="text-emerald-300">Nic nie wykryto.</p>
      ) : (
        <p className="text-muted-foreground">Konto nie było jeszcze skanowane.</p>
      )}
    </div>
  );
}
