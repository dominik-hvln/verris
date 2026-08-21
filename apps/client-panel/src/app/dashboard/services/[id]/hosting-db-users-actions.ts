'use server';

import { apiFetch, ApiError } from '@/lib/api';

type Result = { ok: true } | { ok: false; error: string };
function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Błąd';
}

export async function fetchDbUsersAction(
  subscriptionId: string,
  db: string,
): Promise<{ users: string[]; fetchError: string | null }> {
  return apiFetch(`/services/${subscriptionId}/hosting-db-users?db=${encodeURIComponent(db)}`);
}

export async function createDbUserAction(input: {
  subscriptionId: string;
  db: string;
  user: string;
  password: string;
}): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  try {
    const res = await apiFetch<{ username: string }>(
      `/services/${input.subscriptionId}/hosting-db-users`,
      {
        method: 'POST',
        body: JSON.stringify({ db: input.db, user: input.user, password: input.password }),
      },
    );
    return { ok: true, username: res.username };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function removeDbUserAction(input: {
  subscriptionId: string;
  db: string;
  user: string;
}): Promise<Result> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-db-users/remove`, {
      method: 'POST',
      body: JSON.stringify({ db: input.db, user: input.user }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function changeDbUserPasswordAction(input: {
  subscriptionId: string;
  db: string;
  user: string;
  password: string;
}): Promise<Result> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-db-users/password`, {
      method: 'POST',
      body: JSON.stringify({ db: input.db, user: input.user, password: input.password }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}
