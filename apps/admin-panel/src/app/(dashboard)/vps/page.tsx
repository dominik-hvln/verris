import { Server } from "lucide-react";
import { fetchVpsAvailability, fetchVpsPlans, fetchHetznerServerTypes, fetchVpsSnapshotSettings } from "./actions";
import { VpsPlansClient } from "./vps-plans-client";
import { SnapshotSettingsForm } from "./snapshot-settings-form";
import { wynik } from "@/components/blad-strony";
import { NieWczytano } from "@/components/nie-wczytano";

export const dynamic = "force-dynamic";

export default async function AdminVpsPage() {
  const [available, plans, serverTypes, snapshotSettings] = await Promise.all([
    fetchVpsAvailability(),
    wynik(fetchVpsPlans()),
    fetchHetznerServerTypes(),
    wynik(fetchVpsSnapshotSettings()),
  ]);

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <header>
        <h1 className="flex items-center gap-2 text-[28px] lg:text-[34px]">
          <Server className="h-6 w-6 text-violet-300" /> VPS / Cloud
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Plany VPS odsprzedawane przez Hetzner Cloud. Typy serwerów pobierane są z katalogu
          Hetznera (auto-uzupełnianie specyfikacji).
        </p>
      </header>
      {plans.ok ? <VpsPlansClient available={available} plans={plans.dane} serverTypes={serverTypes} /> : <NieWczytano co="planów VPS" />}
      {snapshotSettings.ok ? <SnapshotSettingsForm initial={snapshotSettings.dane} /> : <NieWczytano co="ustawień snapshotów" />}
    </div>
  );
}
