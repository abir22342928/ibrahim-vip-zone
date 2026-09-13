import { guarded, requireAdmin } from "@/lib/auth";
import { getAdminDashboardData } from "@/lib/admin-data";
import { ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return guarded(async () => {
    await requireAdmin();
    // Always returns valid, zero-safe data (never throws).
    const { stats, multi } = await getAdminDashboardData();
    return ok({ stats, multi });
  });
}
