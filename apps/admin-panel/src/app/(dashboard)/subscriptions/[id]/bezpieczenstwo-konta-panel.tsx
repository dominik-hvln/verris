"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Checkbox } from "@/components/checkbox";
import { potwierdz } from "@/components/potwierdz";
import { Pomoc } from "@/components/pomoc";
import { POLE, kiedy } from "@/components/kolejka-poczty";
import { brakUprawnienia, type DostepDoAkcji } from "@/lib/akcje/wezel";
import { plForm } from "@/lib/pl";
import { odczytBezpieczenstwaAction, zapisBezpieczenstwaAction, type OdczytBezpieczenstwa, type Wynik, type ZapisBezpieczenstwa } from "./bezpieczenstwo-konta-actions";

/**
 * F3.2 (D5, G-12) — sekcja „Bezpieczeństwo” w zakładce „Konto” karty usługi:
 * - „Zablokowało mi IP” (#blokady-ip) — adresy klienta z logowań i zgłoszeń, sprawdzenie na serwerze i odblokowanie
 *   (IP_UNBLOCK: tylko adres klienta z numerem jego zgłoszenia; IP_BLOCKS_NODE/ADMIN — dowolny);
 * - złośliwe pliki i kwarantanna (#malware-konta) — wynik skanera (ACCOUNT_DIAGNOSTICS_VIEW), przeniesienie do
 *   kwarantanny i przywrócenie (ACCOUNT_ACTIONS, odwracalne: kopia zostaje na koncie);
 * - trafienia WAF (#waf-konta) — ostatnie zablokowane i wykryte żądania domen konta, tylko odczyt.
 * Powód obowiązkowy przy zmianach; klient widzi w aktywności „obsługa Verris (zgłoszenie #…)”.
 */
type Blokada = { ip: string; jail: string; powod: string; od: string | null; do: string | null; stala: boolean };
export type StanIp = {
  adresy: Array<{ ip: string; zrodla: Array<"logowanie" | "zgloszenie">; ostatnio: string; zgloszenia: string[] }>;
  wToku: boolean;
  sprawdzenie: { ip: string; wToku: boolean; kiedy: string; blokady: Blokada[]; blad: string | null } | null;
  operacja: { tryb: string; ip: string; wToku: boolean; kiedy: string; odblokowano: number | null; blad: string | null } | null;
};
export type StanMalware = {
  wToku: boolean;
  sprawdzono: string | null;
  ostatniSkan: string | null;
  razem: number | null;
  znaleziska: Array<{ sygnatura: string; sciezka: string; doKwarantanny: boolean }>;
  kwarantanna: Array<{ id: string; czas: string; sygnatura: string; sciezka: string }>;
  odrzucone: Array<{ pozycja: string; powod: string }>;
  blad: string | null;
};
type Trafienie = { czas: string | null; domena: string; ip: string; metoda: string; sciezka: string; regula: string; opis: string; zablokowano: boolean; status: string };
export type StanWaf = {
  tryb: "ON" | "DETECTION" | "OFF";
  zastosowano: string | null;
  wToku: boolean;
  /** Noc 11→12.10 — kiedy zlecono trwający odczyt i czy serwer już go podjął (API: stanTrafien). */
  zlecono?: string | null;
  czekaNaSerwer?: boolean;
  wczytano: string | null;
  razem: number | null;
  trafienia: Trafienie[];
  reguly: Array<{ regula: string; opis: string; razy: number; zablokowano: number; ostatnio: string | null; domeny: string[] }>;
  blad: string | null;
};

const MIN_POWOD = 10;
const ODSWIEZANIE_MS = 5000;
const TRYB_WAF: Record<StanWaf["tryb"], string> = { ON: "blokuje", DETECTION: "tylko wykrywa", OFF: "wyłączony" };
const BLAD_POLACZENIA = "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę.";
const przycisk = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";

export function BezpieczenstwoKontaPanel({ subscriptionId, dostep }: { subscriptionId: string; dostep: DostepDoAkcji }) {
  const brakIp = brakUprawnienia(["IP_UNBLOCK", "IP_BLOCKS_NODE"], dostep);
  const brakPodgladu = brakUprawnienia("ACCOUNT_DIAGNOSTICS_VIEW", dostep);
  const brakAkcji = brakUprawnienia("ACCOUNT_ACTIONS", dostep);
  const [ip, setIp] = useState<StanIp | null>(null);
  const [malware, setMalware] = useState<StanMalware | null>(null);
  const [waf, setWaf] = useState<StanWaf | null>(null);
  const [adres, setAdres] = useState("");
  const [powod, setPowod] = useState("");
  const [zgloszenie, setZgloszenie] = useState("");
  const [pliki, setPliki] = useState<Set<string>>(new Set());
  const [wpisy, setWpisy] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  const pokaz = useCallback((co: OdczytBezpieczenstwa, r: Wynik) => {
    if (!r.ok) return setMsg({ ok: false, tekst: r.error });
    if (co === "blokady-ip") setIp(r.wynik as StanIp);
    else if (co === "malware") setMalware(r.wynik as StanMalware);
    else setWaf(r.wynik as StanWaf);
  }, []);
  const pobierz = useCallback(
    (co: OdczytBezpieczenstwa): Promise<Wynik> => odczytBezpieczenstwaAction(subscriptionId, co).catch(() => ({ ok: false as const, error: BLAD_POLACZENIA })),
    [subscriptionId],
  );
  const odczyt = useCallback(async (co: OdczytBezpieczenstwa) => pokaz(co, await pobierz(co)), [pobierz, pokaz]);

  useEffect(() => {
    const wczytaj = (co: OdczytBezpieczenstwa) => void pobierz(co).then((r) => pokaz(co, r));
    if (!brakIp) wczytaj("blokady-ip");
    if (!brakPodgladu) {
      wczytaj("malware");
      wczytaj("waf");
    }
  }, [brakIp, brakPodgladu, pobierz, pokaz]);

  const trwaIp = !!ip?.wToku;
  const trwaWaf = !!waf?.wToku;
  useEffect(() => {
    if (!trwaIp && !trwaWaf) return;
    const t = setInterval(() => {
      if (trwaIp) void odczyt("blokady-ip");
      if (trwaWaf) void odczyt("waf");
    }, ODSWIEZANIE_MS);
    return () => clearInterval(t);
  }, [trwaIp, trwaWaf, odczyt]);

  const zapisz = (co: ZapisBezpieczenstwa, dane: { ip?: string; sciezki?: string[]; wpisy?: string[] } = {}) =>
    start(async () => {
      setMsg(null);
      let r: Wynik;
      try {
        r = await zapisBezpieczenstwaAction(subscriptionId, co, { ...dane, powod, zgloszenie });
      } catch {
        r = { ok: false, error: BLAD_POLACZENIA };
      }
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      if (co === "sprawdz-ip" || co === "odblokuj-ip") setIp(r.wynik as StanIp);
      else if (co === "wczytaj-waf") setWaf(r.wynik as StanWaf);
      else setMalware(r.wynik as StanMalware);
      if (co === "odblokuj-ip" || co === "kwarantanna" || co === "przywroc") {
        setPowod("");
        setZgloszenie("");
        setPliki(new Set());
        setWpisy(new Set());
      }
      if (co === "odblokuj-ip") setMsg({ ok: true, tekst: "Odblokowanie zlecone — serwer zdejmie blokadę w ciągu minuty." });
      if (co === "kwarantanna") setMsg({ ok: true, tekst: "Kwarantanna zlecona — pliki znikną ze strony w ciągu minuty, kopie zostaną na koncie." });
      if (co === "przywroc") setMsg({ ok: true, tekst: "Przywrócenie zlecone — pliki wrócą na swoje miejsce w ciągu minuty." });
    });

  // Okno potwierdzenia PRZED transition (React 19: okno otwarte w środku async transition się nie pokazuje).
  const odblokuj = async () => {
    const a = adres.trim();
    if (!(await potwierdz(`Odblokować adres ${a} na serwerze konta? Blokada zniknie ze wszystkich usług (poczta, FTP, SSH, panel). Klient zobaczy w aktywności wpis „obsługa Verris”.`, { akcja: "Odblokuj" }))) return;
    zapisz("odblokuj-ip", { ip: a });
  };
  const doKwarantanny = async () => {
    const lista = [...pliki];
    const podglad = lista.slice(0, 8).map((p) => `• ${p}`).join("\n") + (lista.length > 8 ? `\n…i ${lista.length - 8} kolejnych` : "");
    const ile = `${lista.length} ${plForm(lista.length, "plik", "pliki", "plików")}`;
    if (!(await potwierdz(`Przenieść do kwarantanny ${ile}? Znikną ze strony (strona może przestać działać, jeśli plik był potrzebny), ale kopie zostaną na koncie i da się je przywrócić.\n\n${podglad}`, { akcja: "Do kwarantanny", niebezpieczne: true, tytul: "Kwarantanna plików" }))) return;
    zapisz("kwarantanna", { sciezki: lista });
  };
  const przywroc = async () => {
    const lista = [...wpisy];
    const ile = `${lista.length} ${plForm(lista.length, "plik", "pliki", "plików")}`;
    if (!(await potwierdz(`Przywrócić ${ile} z kwarantanny na oryginalne miejsce? Jeśli to złośliwy kod, strona znów będzie zagrożona.`, { akcja: "Przywróć", niebezpieczne: true }))) return;
    zapisz("przywroc", { wpisy: lista });
  };

  const powodOk = powod.trim().length >= MIN_POWOD;
  const sprawdzenie = ip?.sprawdzenie && ip.sprawdzenie.ip === adres.trim() ? ip.sprawdzenie : null;
  const przelacz = (s: Set<string>, v: string, set: (x: Set<string>) => void) => {
    const n = new Set(s);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    set(n);
  };

  return (
    <div className="space-y-5 rounded-2xl border border-white/10 bg-black/35 p-5" role="region" aria-labelledby="bezpieczenstwo-konta-naglowek">
      <div>
        <h2 id="bezpieczenstwo-konta-naglowek" className="text-sm font-semibold text-white">
          Bezpieczeństwo konta
        </h2>
        <p className="text-xs text-muted-foreground">Blokady adresów IP, złośliwe pliki i zapora WAF. Zmiany z powodem; klient widzi wpis „obsługa Verris”.</p>
      </div>

      <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Powód do dziennika (obowiązkowy przy zmianach, min. {MIN_POWOD} znaków)</span>
          <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} disabled={pending} placeholder="np. klient nie odbiera poczty, blokada po zmianie hasła" className={POLE} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Numer zgłoszenia klienta</span>
          <input value={zgloszenie} onChange={(e) => setZgloszenie(e.target.value)} maxLength={64} disabled={pending} placeholder="#ab12cd34" className={`${POLE} font-mono`} />
        </label>
      </div>

      <section id="blokady-ip" className="scroll-mt-24 space-y-2 border-t border-white/10 pt-4" data-sekcja="blokady-ip">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Zablokowało mi IP</h3>
          <Pomoc id="blokady-ip" />
        </div>
        {brakIp ? (
          <p className="text-xs text-muted-foreground">{brakIp}.</p>
        ) : (
          <>
            {ip?.adresy.length ? (
              <div className="flex flex-wrap gap-1.5" aria-label="Adresy klienta">
                {ip.adresy.map((a) => (
                  <button key={a.ip} type="button" data-adres={a.ip} className={przycisk} disabled={pending} onClick={() => setAdres(a.ip)} title={`ostatnio ${kiedy(a.ostatnio)}`}>
                    <span className="font-mono">{a.ip}</span>{" "}
                    <span className="text-muted-foreground">
                      {[a.zrodla.includes("logowanie") ? "logowanie" : null, ...a.zgloszenia.map((z) => `zgłoszenie #${z.slice(0, 8)}`)].filter(Boolean).join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            ) : ip ? (
              <p className="text-xs text-muted-foreground">Brak adresów z logowań klienta i jego zgłoszeń (90 dni) — poproś o adres w zgłoszeniu.</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <input value={adres} onChange={(e) => setAdres(e.target.value)} maxLength={45} disabled={pending} placeholder="Adres IP klienta, np. 83.12.44.201" aria-label="Adres IP" className={`${POLE} max-w-xs font-mono`} />
              <button type="button" data-akcja="sprawdz-ip" className={przycisk} disabled={pending || !adres.trim() || trwaIp} onClick={() => zapisz("sprawdz-ip", { ip: adres })}>
                {trwaIp ? "Sprawdzanie…" : "Sprawdź"}
              </button>
              <button type="button" data-akcja="odblokuj-ip" className={przycisk} disabled={pending || !adres.trim() || !powodOk || trwaIp} title={powodOk ? undefined : "Najpierw wpisz powód"} onClick={() => void odblokuj()}>
                Odblokuj
              </button>
            </div>
            {sprawdzenie ? (
              <div className="text-xs" data-sprawdzenie={sprawdzenie.ip}>
                {sprawdzenie.wToku ? (
                  <p className="text-muted-foreground">Sprawdzam na serwerze…</p>
                ) : sprawdzenie.blad ? (
                  <p className="text-rose-200">Sprawdzenie nie powiodło się: {sprawdzenie.blad}</p>
                ) : sprawdzenie.blokady.length ? (
                  <ul className="space-y-0.5 text-rose-200">
                    {sprawdzenie.blokady.map((b) => (
                      <li key={b.jail}>
                        Zablokowany: {b.powod} — od {kiedy(b.od)}, {b.stala ? "na stałe" : `do ${kiedy(b.do)}`}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-emerald-300">Adres nie jest zablokowany na serwerze konta (stan z {kiedy(sprawdzenie.kiedy)}).</p>
                )}
              </div>
            ) : null}
            {ip?.operacja ? (
              <p className="text-xs text-muted-foreground" data-operacja-ip="wynik">
                Ostatnie odblokowanie {ip.operacja.ip} ({kiedy(ip.operacja.kiedy)}):{" "}
                {ip.operacja.wToku
                  ? "w toku…"
                  : ip.operacja.blad
                    ? `nie powiodło się — ${ip.operacja.blad}`
                    : ip.operacja.odblokowano
                      ? `zdjęto ${ip.operacja.odblokowano} ${plForm(ip.operacja.odblokowano, "blokadę", "blokady", "blokad")}.`
                      : "adres nie był zablokowany."}
              </p>
            ) : null}
          </>
        )}
      </section>

      <section id="malware-konta" className="scroll-mt-24 space-y-2 border-t border-white/10 pt-4" data-sekcja="malware">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Złośliwe pliki i kwarantanna</h3>
          <Pomoc id="kwarantanna" />
        </div>
        {brakPodgladu ? (
          <p className="text-xs text-muted-foreground">{brakPodgladu}.</p>
        ) : malware ? (
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">
              Wyniki z {kiedy(malware.sprawdzono)} · ostatni pełny skan {kiedy(malware.ostatniSkan)}
              {malware.wToku ? " · operacja w toku" : ""} · skan zlecisz w „Akcjach na koncie”.
            </p>
            {malware.blad ? <p className="text-rose-200">Ostatnie zadanie nie powiodło się: {malware.blad}</p> : null}
            {malware.znaleziska.length ? (
              <>
                <ul className="space-y-1 font-mono">
                  {malware.znaleziska.map((z) => (
                    <li key={z.sciezka} className="flex items-start gap-2 break-all">
                      {z.doKwarantanny && !brakAkcji ? (
                        <Checkbox checked={pliki.has(z.sciezka)} onChange={() => przelacz(pliki, z.sciezka, setPliki)} disabled={pending} aria-label={`Zaznacz ${z.sciezka}`} className="mt-0.5" />
                      ) : null}
                      <span>
                        <span className="text-rose-200">{z.sygnatura}</span> {z.sciezka}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  data-akcja="kwarantanna"
                  className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
                  disabled={!!brakAkcji || pending || !powodOk || pliki.size === 0 || malware.wToku}
                  title={brakAkcji ?? (powodOk ? undefined : "Najpierw wpisz powód")}
                  onClick={() => void doKwarantanny()}
                >
                  Przenieś do kwarantanny ({pliki.size})
                </button>
              </>
            ) : malware.sprawdzono ? (
              <p className="text-emerald-300">Skaner nic nie wykrył.</p>
            ) : (
              <p className="text-muted-foreground">Konto nie było jeszcze skanowane.</p>
            )}
            {malware.kwarantanna.length ? (
              <div className="space-y-1 pt-2" data-kwarantanna="lista">
                <p className="text-neutral-300">W kwarantannie ({malware.kwarantanna.length}) — klient może je usunąć na stałe albo przywrócić:</p>
                <ul className="space-y-1 font-mono">
                  {malware.kwarantanna.map((w) => (
                    <li key={w.id} className="flex items-start gap-2 break-all">
                      {!brakAkcji ? <Checkbox checked={wpisy.has(w.id)} onChange={() => przelacz(wpisy, w.id, setWpisy)} disabled={pending} aria-label={`Zaznacz ${w.sciezka}`} className="mt-0.5" /> : null}
                      <span>
                        {kiedy(w.czas)} · {w.sciezka}
                      </span>
                    </li>
                  ))}
                </ul>
                <button type="button" data-akcja="przywroc" className={przycisk} disabled={!!brakAkcji || pending || !powodOk || wpisy.size === 0 || malware.wToku} title={brakAkcji ?? (powodOk ? undefined : "Najpierw wpisz powód")} onClick={() => void przywroc()}>
                  Przywróć zaznaczone ({wpisy.size})
                </button>
              </div>
            ) : null}
            {malware.odrzucone.length ? (
              <ul className="text-amber-200">
                {malware.odrzucone.map((o) => (
                  <li key={o.pozycja} className="break-all">
                    Pominięto {o.pozycja}: {o.powod}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Wczytywanie…</p>
        )}
      </section>

      <section id="waf-konta" className="scroll-mt-24 space-y-2 border-t border-white/10 pt-4" data-sekcja="waf">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Trafienia WAF</h3>
          <Pomoc id="trafienia-waf" />
        </div>
        {brakPodgladu ? (
          <p className="text-xs text-muted-foreground">{brakPodgladu}.</p>
        ) : waf ? (
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-neutral-300" data-tryb-waf={waf.tryb}>
                Zapora: {TRYB_WAF[waf.tryb] ?? waf.tryb} (zmienia administrator)
              </span>
              <button type="button" data-akcja="wczytaj-waf" className={przycisk} disabled={pending || trwaWaf} onClick={() => zapisz("wczytaj-waf")}>
                {trwaWaf ? "Wczytywanie…" : "Wczytaj z serwera"}
              </button>
              <span className="text-muted-foreground">
                {waf.wczytano ? `stan z ${kiedy(waf.wczytano)}${waf.razem !== null ? ` · ${waf.razem} ${plForm(waf.razem, "trafienie", "trafienia", "trafień")}` : ""}` : "jeszcze nie wczytano"}
              </span>
            </div>
            {/* Noc 11→12.10 — sam napis „Wczytywanie…” na przycisku nie mówił, od kiedy i na co panel czeka. */}
            {trwaWaf ? (
              <p className="text-muted-foreground" data-waf="stan-zadania">
                {waf.czekaNaSerwer ? "Czeka, aż serwer podejmie odczyt" : "Serwer czyta dziennik"}
                {waf.zlecono ? ` (zlecono ${kiedy(waf.zlecono)})` : ""}…{waf.wczytano ? " Do końca widać poprzedni odczyt." : ""}
              </p>
            ) : null}
            {waf.blad ? <p className="text-rose-200">Ostatni odczyt nie powiódł się: {waf.blad}</p> : null}
            {waf.reguly.length ? (
              <table className="w-full text-left" data-waf="reguly">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1">Reguła</th>
                    <th className="px-2 py-1">Razy</th>
                    <th className="px-2 py-1">Zablokowano</th>
                    <th className="px-2 py-1">Ostatnio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white">
                  {waf.reguly.map((r) => (
                    <tr key={r.regula}>
                      <td className="px-2 py-1">
                        <span className="font-mono">{r.regula}</span> {r.opis}
                      </td>
                      <td className="px-2 py-1">{r.razy}</td>
                      <td className="px-2 py-1">{r.zablokowano}</td>
                      <td className="px-2 py-1">{kiedy(r.ostatnio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : waf.wczytano ? (
              <p className="text-emerald-300">Brak trafień reguł dla domen konta w ostatnim dzienniku.</p>
            ) : null}
            {waf.trafienia.length ? (
              <details>
                <summary className="cursor-pointer text-neutral-300">Ostatnie żądania ({waf.trafienia.length})</summary>
                <ul className="mt-1 space-y-0.5 font-mono" data-waf="trafienia">
                  {waf.trafienia.slice(0, 100).map((t, i) => (
                    <li key={`${t.czas}-${i}`} className="break-all">
                      {kiedy(t.czas)} {t.zablokowano ? "zablokowano" : "wykryto"} {t.metoda} {t.domena}
                      {t.sciezka} · {t.regula} · {t.ip}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Wczytywanie…</p>
        )}
      </section>

      {msg ? (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}
        </p>
      ) : null}
    </div>
  );
}
