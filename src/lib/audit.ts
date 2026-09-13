import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";

export async function logAudit(
  admin: SessionUser | null,
  action: string,
  options?: {
    targetType?: string;
    targetId?: string | number;
    detail?: string;
    meta?: Record<string, unknown>;
  },
) {
  try {
    await db.insert(auditLogs).values({
      adminId: admin?.id ?? null,
      adminName: admin?.name ?? "system",
      action,
      targetType: options?.targetType ?? null,
      targetId: options?.targetId != null ? String(options.targetId) : null,
      detail: options?.detail ?? null,
      meta: options?.meta ?? null,
    });
  } catch (error) {
    console.error("[audit] failed", error);
  }
}
