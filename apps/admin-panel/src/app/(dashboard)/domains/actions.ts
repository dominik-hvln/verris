"use server";

import { adminApi, AdminApiError } from "@/lib/api";

/**
 * F2.7 — operacje na domenie z karty /domains/[id] i z listy nieudanych zamówień
 * (apps/api/src/domains/domeny.admin.controller.ts). Ścieżki z białej listy — przeglądarka nie poda dowolnej trasy API.
 */
export type AkcjaDomeny = "blokada" | "kod-epp" | "ns" | "odnow" | "odnow-na-koszt-verris";

const TRASA: Record<AkcjaDomeny, { sciezka: string; metoda: "POST" | "PUT"; uprawnienie: string }> = {
  blokada: { sciezka: "blokada", metoda: "POST", uprawnienie: "DOMAINS_MANAGE" },
  "kod-epp": { sciezka: "kod-epp", metoda: "POST", uprawnienie: "DOMAINS_MANAGE" },
  ns: { sciezka: "ns", metoda: "PUT", uprawnienie: "DOMAINS_MANAGE" },
  odnow: { sciezka: "odnow", metoda: "POST", uprawnienie: "DOMAINS_MANAGE" },
  "odnow-na-koszt-verris": { sciezka: "odnow-na-koszt-verris", metoda: "POST", uprawnienie: "DOMAINS_MANAGE i BILLING_MANAGE" },
};

export type Wynik<T = unknown> = { ok: true; wynik: T } | { ok: false; error: string };

const id = (v: string) => encodeURIComponent(v);
const zPowodem = (dane: { powod: string; zgloszenie?: string } & Record<string, unknown>) => {
  const { zgloszenie, ...reszta } = dane;
  return { ...reszta, powod: dane.powod.trim(), ...(zgloszenie?.trim() ? { zgloszenie: zgloszenie.trim() } : {}) };
};

export async function akcjaDomenyAction(
  domainId: string,
  akcja: AkcjaDomeny,
  dane: { powod: string; zgloszenie?: string } & Record<string, unknown>,
): Promise<Wynik> {
  const t = Object.hasOwn(TRASA, akcja) ? TRASA[akcja] : undefined;
  if (!t) return { ok: false, error: "Nieznana akcja." };
  try {
    return { ok: true, wynik: await adminApi(`/admin/domains/${id(domainId)}/${t.sciezka}`, { method: t.metoda, body: zPowodem(dane) }) };
  } catch (err) {
    return { ok: false, error: komunikat(err, t.uprawnienie) };
  }
}

export async function synchronizujDomeneAction(domainId: string): Promise<Wynik<{ odeszla: boolean; zmiany: Record<string, { z: unknown; na: unknown }> }>> {
  try {
    return { ok: true, wynik: await adminApi(`/admin/domains/${id(domainId)}/synchronizuj`, { method: "POST" }) };
  } catch (err) {
    return { ok: false, error: komunikat(err, "DOMAINS_MANAGE") };
  }
}

export async function wycenaOdnowieniaAction(domainId: string, lata: number): Promise<Wynik<{ priceAmount: string; currency: string; expiresAt: string | null }>> {
  const n = Math.min(Math.max(Math.floor(lata) || 1, 1), 10);
  try {
    return { ok: true, wynik: await adminApi(`/admin/domains/${id(domainId)}/odnowienie-wycena?lata=${n}`) };
  } catch (err) {
    return { ok: false, error: komunikat(err, "DOMAINS_MANAGE") };
  }
}

export async function abonentDomenyAction(domainId: string): Promise<Wynik<Record<string, string | null>>> {
  try {
    return { ok: true, wynik: await adminApi(`/admin/domains/${id(domainId)}/abonent`) };
  } catch (err) {
    return { ok: false, error: komunikat(err, "CUSTOMERS_VIEW") };
  }
}

export async function ponowZamowienieAction(orderId: string, dane: { powod: string; zgloszenie?: string; authCode?: string }): Promise<Wynik<{ id: string; status: string }>> {
  const { authCode, ...reszta } = dane;
  try {
    return {
      ok: true,
      wynik: await adminApi(`/admin/domains/zamowienia/${id(orderId)}/ponow`, {
        method: "POST",
        body: { ...zPowodem(reszta), ...(authCode?.trim() ? { authCode: authCode.trim() } : {}) },
      }),
    };
  } catch (err) {
    return { ok: false, error: komunikat(err, "DOMAINS_MANAGE") };
  }
}

export async function sprawdzTransferyAction(): Promise<Wynik<{ zakonczone: number; nieudane: number }>> {
  try {
    return { ok: true, wynik: await adminApi(`/admin/domains/zamowienia/sprawdz-transfery`, { method: "POST" }) };
  } catch (err) {
    return { ok: false, error: komunikat(err, "DOMAINS_MANAGE") };
  }
}

/**
 * 403 strażnika uprawnień → nazwa brakującego uprawnienia; inna odmowa API (np. „domenę konta zespołu zmienia
 * administrator”) zostaje swoją treścią.
 */
function komunikat(err: unknown, uprawnienie: string): string {
  if (err instanceof AdminApiError && err.status === 403 && /uprawnie|^forbidden$/i.test(err.message)) {
    return `Twoja rola nie ma uprawnienia ${uprawnienie}.`;
  }
  if (err instanceof AdminApiError || err instanceof Error) return err.message;
  return "Nie udało się. Spróbuj ponownie.";
}
