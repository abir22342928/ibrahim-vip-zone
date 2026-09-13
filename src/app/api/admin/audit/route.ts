import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { guarded, requireAdmin } from "@/lib/auth";
import { ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return guarded(async () => {
    await requireAdmin();
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(250);
    return ok({
      logs: rows.map((r) => ({
        id: r.id,
        adminName: r.adminName,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        detail: r.detail,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });
}
