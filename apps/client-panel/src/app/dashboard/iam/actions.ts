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
    createdAt: string;
  }>;
  invites: Array<{
    id: string;
    email: string;
    permissions: string[];
    label: string | null;
    status: string;
    expiresAt: string;
    createdAt: string;
  }>;
}

export async function getIamOverview(): Promise<IamOverview> {
  return apiFetch<IamOverview>('/users/iam');
}

export type IamActionResult = { ok: true } | { ok: false; error: string };

export async function inviteSubaccountAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim();
  const permissions = formData.getAll('permissions').map(String);
  if (!email || permissions.length === 0) {
    throw new Error('Podaj e-mail i wybierz co najmniej jedno uprawnienie.');
  }
  try {
    await apiFetch('/users/iam/invites', {
      method: 'POST',
      body: JSON.stringify({ email, label: label || undefined, permissions }),
    });
    revalidatePath('/dashboard/iam');
  } catch (err) {
    throw new Error(normalizeError(err, 'Nie udało się wysłać zaproszenia.'));
  }
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  try {
    await apiFetch(`/users/iam/invites/${id}`, { method: 'DELETE' });
    revalidatePath('/dashboard/iam');
  } catch (err) {
    throw new Error(normalizeError(err, 'Nie udało się odwołać zaproszenia.'));
  }
}

export async function updateMemberAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const label = String(formData.get('label') ?? '').trim();
  const permissions = formData.getAll('permissions').map(String);
  if (!id || permissions.length === 0) {
    throw new Error('Wybierz co najmniej jedno uprawnienie.');
  }
  try {
    await apiFetch(`/users/iam/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        permissions,
        label: label || undefined,
      }),
    });
    revalidatePath('/dashboard/iam');
  } catch (err) {
    throw new Error(normalizeError(err, 'Nie udało się zaktualizować uprawnień.'));
  }
}

export async function disableMemberAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  try {
    await apiFetch(`/users/iam/members/${id}`, { method: 'DELETE' });
    revalidatePath('/dashboard/iam');
  } catch (err) {
    throw new Error(normalizeError(err, 'Nie udało się wyłączyć subkonta.'));
  }
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
