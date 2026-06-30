"use server";

import { revalidatePath } from "next/cache";
import { adminApi } from "@/lib/api";

export interface PermItem {
  key: string;
  area: string;
  label: string;
}
export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  memberCount: number;
}
export interface OperatorRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  staffRoleId: string | null;
  loginBlocked?: boolean;
}
type Result = { ok: true } | { ok: false; error: string };
function err(e: unknown): string {
  return e instanceof Error ? e.message : "Nieznany błąd";
}

export async function getRolesCatalog(): Promise<{ permissions: PermItem[] }> {
  return adminApi("/admin/staff-roles/catalog");
}
export async function getRoles(): Promise<RoleRow[]> {
  return adminApi("/admin/staff-roles");
}
export async function getOperators(): Promise<OperatorRow[]> {
  return adminApi("/admin/staff-roles/operators");
}

export interface ActivityRow {
  id: string;
  action: string;
  createdAt: string;
  actor: string | null;
  target: string | null;
  ip: string | null;
}
export async function getOperatorActivity(): Promise<ActivityRow[]> {
  return adminApi("/admin/staff-roles/activity");
}

export async function createRole(input: { name: string; description?: string; permissions: string[] }): Promise<Result> {
  try {
    await adminApi("/admin/staff-roles", { method: "POST", body: input });
    revalidatePath("/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
export async function updateRole(id: string, input: { name?: string; description?: string; permissions?: string[] }): Promise<Result> {
  try {
    await adminApi(`/admin/staff-roles/${id}`, { method: "PATCH", body: input });
    revalidatePath("/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
export async function deleteRole(id: string): Promise<Result> {
  try {
    await adminApi(`/admin/staff-roles/${id}`, { method: "DELETE" });
    revalidatePath("/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
export async function createOperator(input: { email: string; firstName?: string; lastName?: string; roleId?: string | null }): Promise<Result> {
  try {
    await adminApi("/admin/staff-roles/operators", { method: "POST", body: input });
    revalidatePath("/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function setOperatorActive(userId: string, active: boolean): Promise<Result> {
  try {
    await adminApi(`/admin/staff-roles/operators/${userId}/active`, { method: "POST", body: { active } });
    revalidatePath("/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function assignOperatorRole(userId: string, roleId: string | null): Promise<Result> {
  try {
    await adminApi(`/admin/staff-roles/operators/${userId}/assign`, { method: "POST", body: { roleId } });
    revalidatePath("/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
