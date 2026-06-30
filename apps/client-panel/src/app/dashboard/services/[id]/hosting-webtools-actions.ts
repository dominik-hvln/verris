'use server';

import { apiFetch, ApiError } from '@/lib/api';

export type Redirect = { from: string; to: string; type: '301' | '302' };
export type WebToolsState = {
  redirects: Redirect[];
  hotlink: { enabled: boolean; extensions: string; allow: string[] };
  blockedIps: string[];
  protectedDirs: string[];
  forceHttps?: boolean;
  wwwMode?: "none" | "www" | "nonwww";
};
type Result = { ok: true } | { ok: false; error: string };
function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Błąd';
}

export async function fetchWebToolsAction(
  subscriptionId: string,
): Promise<{ state: WebToolsState; fetchError: string | null }> {
  return apiFetch(`/services/${subscriptionId}/hosting-webtools`);
}

export async function saveWebToolsAction(
  subscriptionId: string,
  state: Partial<WebToolsState>,
): Promise<Result> {
  try {
    await apiFetch(`/services/${subscriptionId}/hosting-webtools`, {
      method: 'POST',
      body: JSON.stringify(state),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function setDirProtectionAction(input: {
  subscriptionId: string;
  dir: string;
  realm?: string;
  user: string;
  password: string;
}): Promise<Result> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-dir-protection`, {
      method: 'POST',
      body: JSON.stringify({ dir: input.dir, realm: input.realm, user: input.user, password: input.password }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function removeDirProtectionAction(subscriptionId: string, dir: string): Promise<Result> {
  try {
    await apiFetch(`/services/${subscriptionId}/hosting-dir-protection/remove`, {
      method: 'POST',
      body: JSON.stringify({ dir }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}
