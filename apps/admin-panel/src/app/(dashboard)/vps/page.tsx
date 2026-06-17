import { Server } from "lucide-react";
import { fetchVpsAvailability, fetchVpsPlans, fetchHetznerServerTypes } from "./actions";
import { VpsPlansClient } from "./vps-plans-client";

export const dynamic = "force-dynamic";

export default async function AdminVpsPage() {
  const [available, plans, serverTypes] = await Promise.all([
    fetchVpsAvailability(),
    fetchVpsPlans(),
    fetchHetznerServerTypes(),
  ]);

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Server className="h-6 w-6 text-violet-300" /> VPS / Cloud
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Plany VPS odsprzedawane przez Hetzner Cloud. Typy serwerów pobierane są z katalogu
          Hetznera (auto-uzupełnianie specyfikacji).
        </p>
      </header>
      <VpsPlansClient available={available} plans={plans} serverTypes={serverTypes} />
    </div>
  );
}
