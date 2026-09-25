'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';

export interface IamOverview {
  permissions: string[];
  members: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    customerPermissions: string[];
    subaccountLabel: string | null;
    subaccountDisabledAt: string | null;
    subaccountServiceIds: string[];
    createdAt: string;
  }>;
  invites: Array<{
    id: string;
    email: string;
    permissions: string[];
    serviceIds: string[];
    label: string | null;
    status: string;
    expiresAt: string;
    createdAt: string;
  }>;
  /** PB-20 — osoby z własnym kontem Verris (deweloper, agencja). */
  memberships: Array<{
    id: string;
    email: string;
    name: string | null;
    permissions: string[];
    serviceIds: string[];
    label: string | null;
    createdAt: string;
  }>;
  services: { id: string; name: string }[];
}

/** PB-20 — zakres z formularza: „całe konto” = [] (także gdy lista usług przyszła, bo przełącznik był na „całe”). */
function zakresZFormularza(formData: FormData): string[] {
  if (String(formData.get('zakres') ?? 'caly') !== 'wybrane') return [];
  const ids = formData.getAll('serviceIds').map(String).filter(Boolean);
  if (ids.length === 0) throw new Error('Zaznacz co najmniej jedną usługę albo wybierz „Całe konto”.');
  return ids;
}

export async function getIamOverview(): Promise<IamOverview> {
  return apiFetch<IamOverview>('/users/iam');
}

export interface IamAuditEntry {
  id: string;
  action: string;
  createdAt: string;
  details: unknown;
  actor: { id: string; email: string | null; name: string | null } | null;
}

export async function getIamAudit(): Promise<{ entries: IamAuditEntry[] }> {
  return apiFetch<{ entries: IamAuditEntry[] }>('/users/iam/audit');
}

export type IamActionResult = { ok: true } | { ok: false; error: string };

export async function inviteSubaccountAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim();
  const permissions = formData.getAll('permissions').map(String);
  if (!email || permissions.length === 0) {
    throw new Error('Podaj e-mail i wybierz co najmniej jedno uprawnienie.');
  }
  const serviceIds = zakresZFormularza(formData);
  try {
    await apiFetch('/users/iam/invites', {
      method: 'POST',
      body: JSON.stringify({ email, label: label || undefined, permissions, serviceIds }),
    });
  } catch (err) {
    throw new Error(normalizeError(err, 'Nie udało się wysłać zaproszenia.'));
  }
  // redirect() poza try: rzuca NEXT_REDIRECT, a catch zamieniał go w błąd formularza.
  revalidatePath('/dashboard/iam');
  redirect('/dashboard/iam?notice=invite-sent');
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  try {
    await apiFetch(`/users/iam/invites/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (err) {
    throw new Error(normalizeError(err, 'Nie udało się odwołać zaproszenia.'));
  }
  revalidatePath('/dashboard/iam');
  redirect('/dashboard/iam?notice=invite-revoked');
}

export async function updateMemberAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const label = String(formData.get('label') ?? '').trim();
  const permissions = formData.getAll('permissions').map(String);
  if (!id || permissions.length === 0) {
    throw new Error('Wybierz co najmniej jedno uprawnienie.');
  }
  const serviceIds = zakresZFormularza(formData);
  // PB-20 — ten sam formularz dla subkonta i dla osoby z własnym kontem (członkostwo).
  const konto = String(formData.get('rodzaj') ?? '') === 'konto';
  const sciezka = konto ? `/users/iam/memberships/${encodeURIComponent(id)}` : `/users/iam/members/${encodeURIComponent(id)}`;
  try {
    await apiFetch(sciezka, {
      method: 'PATCH',
      body: JSON.stringify({
        permissions,
        label: label || undefined,
        serviceIds,
      }),
    });
  } catch (err) {
    throw new Error(normalizeError(err, 'Nie udało się zaktualizować uprawnień.'));
  }
  revalidatePath('/dashboard/iam');
  redirect('/dashboard/iam?notice=permissions-saved');
}

export async function disableMemberAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const konto = String(formData.get('rodzaj') ?? '') === 'konto';
  try {
    await apiFetch(konto ? `/users/iam/memberships/${encodeURIComponent(id)}` : `/users/iam/members/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (err) {
    throw new Error(normalizeError(err, 'Nie udało się wyłączyć dostępu.'));
  }
  revalidatePath('/dashboard/iam');
  redirect('/dashboard/iam?notice=member-disabled');
}

export async function acceptInviteAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  let accepted = false;
  try {
    await apiFetch('/users/iam/invites/accept', {
      method: 'POST',
      unauthenticated: true,
      body: JSON.stringify({ token, firstName, lastName, password }),
    });
    accepted = true;
  } catch (err) {
    throw new Error(normalizeError(err, 'Nie udało się aktywować subkonta.'));
  }
  if (accepted) redirect('/login?invite=accepted');
}

function normalizeError(err: unknown, fallback: string): string {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback;
}

// ---- PB-20 — zaproszenie na adres z kontem i przełącznik kont ----

export interface InfoZaproszenia {
  email: string;
  ownerEmail: string;
  maKonto: boolean;
  wybraneUslugi: boolean;
}

export async function infoZaproszenia(token: string): Promise<InfoZaproszenia | null> {
  if (!token) return null;
  try {
    return await apiFetch<InfoZaproszenia>(`/users/iam/invites/info?token=${encodeURIComponent(token)}`, { unauthenticated: true });
  } catch {
    return null;
  }
}

export async function przyjmijWlasnymKontemAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  try {
    await apiFetch('/users/iam/invites/accept-existing', { method: 'POST', body: JSON.stringify({ token }) });
  } catch (err) {
    throw new Error(normalizeError(err, 'Nie udało się przyjąć zaproszenia.'));
  }
  // Nowe konto pojawia się w przełączniku kont w menu bocznym.
  redirect('/dashboard');
}
