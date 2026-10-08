/**
 * PB-47 — JEDYNE miejsce liczenia uprawnień operatora (STAFF). Operator może mieć kilka ról
 * (StaffRoleAssignment) — uprawnienia są sumą wszystkich. Pole User.staffRoleId zostaje dla zgodności
 * z gałęziami i danymi sprzed PB-47 i też wchodzi do sumy (przypisanie ról ustawia je na pierwszą rolę).
 *
 * Czytają stąd: StaffPermissionsGuard, StaffRolesService.myAccess (bramkowanie UI paneli),
 * TicketsService (załączniki), UsersAdminService (flaga konta wewnętrznego).
 */
export interface RolaOperatora {
  id: string;
  name: string;
  permissions: string[];
}

interface WierszOperatora {
  staffRole?: RolaOperatora | null;
  staffRoleAssignments?: { role: RolaOperatora | null }[] | null;
}

interface UserDelegate {
  findUnique(args: unknown): Promise<WierszOperatora | null>;
}

const ROLA = { select: { id: true, name: true, permissions: true } } as const;

/** Role operatora bez powtórzeń: najpierw staffRoleId, potem przypisania. */
export function roleZWiersza(row: WierszOperatora | null | undefined): RolaOperatora[] {
  const out = new Map<string, RolaOperatora>();
  const dodaj = (r: RolaOperatora | null | undefined) => {
    if (!r) return;
    const klucz = r.id ?? `bez-id-${out.size}`;
    if (!out.has(klucz)) out.set(klucz, r);
  };
  dodaj(row?.staffRole);
  for (const a of row?.staffRoleAssignments ?? []) dodaj(a.role);
  return [...out.values()];
}

export function sumaUprawnien(role: RolaOperatora[]): string[] {
  return [...new Set(role.flatMap((r) => r.permissions ?? []))];
}

/** Role i suma uprawnień operatora. Brak konta → puste listy. */
export async function dostepOperatora(
  prisma: unknown,
  userId: string,
): Promise<{ role: RolaOperatora[]; uprawnienia: string[] }> {
  const repo = (prisma as { user: UserDelegate }).user;
  const row = await repo.findUnique({
    where: { id: userId },
    select: { staffRole: ROLA, staffRoleAssignments: { select: { role: ROLA } } },
  });
  const role = roleZWiersza(row);
  return { role, uprawnienia: sumaUprawnien(role) };
}

export async function uprawnieniaOperatora(prisma: unknown, userId: string): Promise<string[]> {
  return (await dostepOperatora(prisma, userId)).uprawnienia;
}
