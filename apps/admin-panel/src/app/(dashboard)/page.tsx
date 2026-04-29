import { fetchAdminDashboardOverview } from "@/lib/admin-overview-data";
import { AdminDashboardReal } from "@/components/admin-dashboard-real";

export const dynamic = "force-dynamic";

export default async function AdminDashboardHomePage() {
  try {
    const overview = await fetchAdminDashboardOverview();
    return <AdminDashboardReal o={overview} />;
  } catch {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-100 space-y-2">
        <p className="font-semibold">Nie udało się wczytać pulpitu.</p>
        <p>Sprawdź, czy API Nest działa i czy w `.env.local` jest ustawione `API_URL` (np. `http://localhost:3000`).</p>
        <p className="text-xs text-rose-200/90">
          Endpoint `GET /admin/dashboard/overview` wymaga JWT administratora — po zalogowaniu cookie `admin_auth_token` musi być ustawiane przez panel.
        </p>
      </div>
    );
  }
}
