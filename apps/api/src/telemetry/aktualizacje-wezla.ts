import {
  CVE_RE,
  MAKS_CVE_NA_POPRAWKE,
  MAKS_POPRAWEK_W_RAPORCIE,
  WAGI_ALARMU,
  WAGI_POPRAWEK,
  type AktualizacjaCustomBuild,
  type PoprawkaDnf,
  type StanAktualizacjiWezla,
  type WagaPoprawki,
} from '@verris/contracts';

/**
 * 21.10 — weryfikator aktualizacji bezpieczeństwa. Raport agenta verris-lve (blok `aktualizacje`) czyścimy wpis po wpisie:
 * nieprawidłowa poprawka albo CVE odpada, reszta raportu zostaje (jeden zły wiersz z dnf nie może ukryć pozostałych).
 */
const tekst = (v: unknown, max: number, wzorzec?: RegExp): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v) && (!wzorzec || wzorzec.test(v)) ? v : null;

const ADVISORY_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{2,63}$/;
const PAKIET_RE = /^[A-Za-z0-9][A-Za-z0-9+._:~^-]{0,199}$/;
const WERSJA_RE = /^[0-9A-Za-z][0-9A-Za-z.+_~-]{0,39}$/;
const ALT_PHP_RE = /^\d\.\d{1,2}$/;

function poprawka(v: unknown): PoprawkaDnf | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const advisory = tekst(o.advisory, 64, ADVISORY_RE);
  const pakiet = tekst(o.pakiet, 200, PAKIET_RE);
  if (!advisory || !pakiet) return null;
  const waga: WagaPoprawki = (WAGI_POPRAWEK as readonly string[]).includes(o.waga as string) ? (o.waga as WagaPoprawki) : 'Unknown';
  const cve = Array.from(new Set((Array.isArray(o.cve) ? o.cve : []).filter((c): c is string => typeof c === 'string' && CVE_RE.test(c))))
    .sort()
    .slice(0, MAKS_CVE_NA_POPRAWKE);
  return { advisory, waga, pakiet, cve };
}

function skladnik(v: unknown): AktualizacjaCustomBuild | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const nazwa = tekst(o.nazwa, 80);
  const z = tekst(o.z, 40, WERSJA_RE);
  const na = tekst(o.na, 40, WERSJA_RE);
  return nazwa && z && na ? { nazwa, z, na } : null;
}

/** Raport z agenta → stan do zapisu (null = blok nieczytelny w całości, np. bez `dnf`). */
export function oczyscRaportAktualizacji(raw: unknown, teraz = new Date()): StanAktualizacjiWezla | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const dnfRaw = r.dnf && typeof r.dnf === 'object' ? (r.dnf as Record<string, unknown>) : null;
  if (!dnfRaw) return null;
  const sprawdzonoRaw = typeof r.sprawdzono === 'string' ? new Date(r.sprawdzono) : null;
  const sprawdzono = sprawdzonoRaw && !Number.isNaN(sprawdzonoRaw.getTime()) ? sprawdzonoRaw.toISOString() : teraz.toISOString();

  const poprawki = (Array.isArray(dnfRaw.poprawki) ? dnfRaw.poprawki : [])
    .slice(0, MAKS_POPRAWEK_W_RAPORCIE)
    .map(poprawka)
    .filter((p): p is PoprawkaDnf => p !== null);
  const bladDnf = tekst(dnfRaw.blad, 300);

  let custombuild: StanAktualizacjiWezla['custombuild'] = null;
  if (r.custombuild && typeof r.custombuild === 'object') {
    const cb = r.custombuild as Record<string, unknown>;
    const aktualizacje = (Array.isArray(cb.aktualizacje) ? cb.aktualizacje : [])
      .slice(0, MAKS_POPRAWEK_W_RAPORCIE)
      .map(skladnik)
      .filter((s): s is AktualizacjaCustomBuild => s !== null);
    const bladCb = tekst(cb.blad, 300);
    custombuild = { aktualizacje, ...(bladCb ? { blad: bladCb } : {}) };
  }

  const altPhp: Record<string, string> = {};
  if (r.altPhp && typeof r.altPhp === 'object' && !Array.isArray(r.altPhp)) {
    for (const [k, v] of Object.entries(r.altPhp as Record<string, unknown>).slice(0, 20)) {
      const w = tekst(v, 40, WERSJA_RE);
      if (ALT_PHP_RE.test(k) && w) altPhp[k] = w;
    }
  }

  return { sprawdzono, dnf: { poprawki, ...(bladDnf ? { blad: bladDnf } : {}) }, custombuild, altPhp };
}

/** Stan z bazy (Server.aktualizacje) → ten sam kształt; cokolwiek nieczytelnego = brak danych. */
export function stanAktualizacjiZBazy(json: unknown): StanAktualizacjiWezla | null {
  return oczyscRaportAktualizacji(json);
}

const kluczPoprawki = (p: PoprawkaDnf) => `${p.advisory}|${p.pakiet}`;
const kluczSkladnika = (s: AktualizacjaCustomBuild) => `${s.nazwa}|${s.na}`;

/**
 * Co jest nowe względem poprzedniego raportu: poprawki o wadze alarmowej (Critical/Important) i składniki CustomBuild
 * z nową wersją docelową. Błąd narzędzia w poprzednim raporcie = brak wiedzy, więc wszystko liczy się jako nowe.
 */
export function noweDoAlarmu(
  poprzedni: StanAktualizacjiWezla | null,
  obecny: StanAktualizacjiWezla,
): { poprawki: PoprawkaDnf[]; custombuild: AktualizacjaCustomBuild[] } {
  const bylyP = new Set(poprzedni && !poprzedni.dnf.blad ? poprzedni.dnf.poprawki.map(kluczPoprawki) : []);
  const bylyS = new Set(poprzedni?.custombuild && !poprzedni.custombuild.blad ? poprzedni.custombuild.aktualizacje.map(kluczSkladnika) : []);
  return {
    poprawki: obecny.dnf.poprawki.filter((p) => WAGI_ALARMU.includes(p.waga) && !bylyP.has(kluczPoprawki(p))),
    custombuild: (obecny.custombuild?.aktualizacje ?? []).filter((s) => !bylyS.has(kluczSkladnika(s))),
  };
}

const MAKS_W_TRESCI = 8;

/** Treść alarmu o nowych poprawkach (po polsku, bez nazw dostawców zaplecza). */
export function trescAlarmuPoprawek(wezel: string, poprawki: PoprawkaDnf[]): { tytul: string; tresc: string } {
  const advisory = Array.from(new Set(poprawki.map((p) => p.advisory)));
  const krytyczne = poprawki.some((p) => p.waga === 'Critical');
  const tytul = `Węzeł ${wezel}: ${advisory.length === 1 ? 'nowa poprawka' : `${advisory.length} nowe poprawki`} bezpieczeństwa${krytyczne ? ' (krytyczne)' : ''}`;
  const linie = poprawki.slice(0, MAKS_W_TRESCI).map((p) => {
    const cve = p.cve.length ? ` — ${p.cve.slice(0, 4).join(', ')}${p.cve.length > 4 ? ` i ${p.cve.length - 4} innych` : ''}` : '';
    return `• ${p.advisory} (${p.waga}): ${p.pakiet}${cve}`;
  });
  if (poprawki.length > MAKS_W_TRESCI) linie.push(`• …i ${poprawki.length - MAKS_W_TRESCI} kolejnych`);
  return { tytul, tresc: `${linie.join('\n')}\n\nZainstalujesz je w panelu admina: Węzły → Aktualizacje bezpieczeństwa.` };
}

export function trescAlarmuCustomBuild(wezel: string, skladniki: AktualizacjaCustomBuild[]): { tytul: string; tresc: string } {
  const linie = skladniki.slice(0, MAKS_W_TRESCI).map((s) => `• ${s.nazwa}: ${s.z} → ${s.na}`);
  if (skladniki.length > MAKS_W_TRESCI) linie.push(`• …i ${skladniki.length - MAKS_W_TRESCI} kolejnych`);
  return {
    tytul: `Węzeł ${wezel}: nowe wersje składników serwera (${skladniki.length})`,
    tresc: `${linie.join('\n')}\n\nZainstalujesz je w panelu admina: Węzły → Aktualizacje bezpieczeństwa (z CustomBuild).`,
  };
}
