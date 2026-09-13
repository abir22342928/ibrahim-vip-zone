import { getAdminDashboardData } from "@/lib/admin-data";
import DashboardView from "@/components/admin/DashboardView";

export const dynamic = "force-dynamic";

/**
 * The Admin Dashboard is rendered SERVER-SIDE. Data is fetched during render
 * (never via a client-only fetch), so the HTML always contains real values and
 * the dashboard can never appear blank — even with an empty database or a
 * broken client-side request. A client component only adds live updates.
 */
export default async function AdminDashboardPage() {
  const { stats, multi } = await getAdminDashboardData();
  return <DashboardView initialStats={stats} initialMulti={multi} />;
}
