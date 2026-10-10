import { getRolesCatalog, getRoles } from "./actions";
import { RolesClient } from "./roles-client";
import { NieWczytano } from "@/components/nie-wczytano";
import { wynik } from "@/components/blad-strony";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  // Fala 1B — bez katalogu albo ról lista byłaby pusta i wyglądała jak „brak ról”; komunikat z ponowieniem.
  const w = await wynik(Promise.all([getRolesCatalog(), getRoles()]));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Role</h1>
        <p className="mt-2 text-sm text-muted-foreground">Uprawnienia ról się sumują; rolę systemową zmieniasz na jej kopii.</p>
      </header>
      {w.ok ? <RolesClient catalog={w.dane[0].permissions} initialRoles={w.dane[1]} /> : <NieWczytano co="ról i uprawnień" />}
    </div>
  );
}
