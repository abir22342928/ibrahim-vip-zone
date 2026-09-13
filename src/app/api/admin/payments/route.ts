import { db } from "@/db";
import { orders, payments, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { guarded, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { decidePayment, type PaymentDecision } from "@/lib/orders";
import { assertSameOrigin, fail, int, ok, readJson, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return guarded(async () => {
    await requireAdmin();
    const url = new URL(req.url);
    const kindParam = str(url.searchParams.get("kind"), 10).toUpperCase();
    const statusParam = str(url.searchParams.get("status"), 20).toUpperCase();

    const conditions = [];
    if (kindParam === "MAIN" || kindParam === "SOURCE") conditions.push(eq(payments.kind, kindParam));
    if (["PENDING", "APPROVED", "REJECTED", "INFO_REQUESTED"].includes(statusParam)) {
      conditions.push(eq(payments.status, statusParam as "PENDING"));
    }

    const rows = await db
      .select({
        id: payments.id,
        kind: payments.kind,
        method: payments.method,
        amount: payments.amount,
        status: payments.status,
        transactionId: payments.transactionId,
        senderNumber: payments.senderNumber,
        isFlaggedDuplicate: payments.isFlaggedDuplicate,
        adminNote: payments.adminNote,
        createdAt: payments.createdAt,
        reviewedAt: payments.reviewedAt,
        screenshotFileId: payments.screenshotFileId,
        orderId: orders.id,
        orderCode: orders.orderCode,
        orderStatus: orders.status,
        customerId: users.id,
        customerName: users.name,
        customerEmail: users.email,
        customerPhone: users.phone,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .innerJoin(users, eq(users.id, payments.userId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(payments.createdAt))
      .limit(200);

    return ok({
      payments: rows.map((r) => ({
        ...r,
        screenshotUrl: r.screenshotFileId ? `/api/files/${r.screenshotFileId}` : null,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
      })),
    });
  });
}

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const admin = await requireAdmin();
    const body = await readJson<{ paymentId?: number; decision?: string; note?: string }>(req);
    const paymentId = int(body?.paymentId, 0);
    const decisionRaw = str(body?.decision, 20).toUpperCase();
    const note = str(body?.note, 500);
    if (!paymentId) return fail("Payment id required");
    if (!["APPROVE", "REJECT", "REQUEST_INFO"].includes(decisionRaw)) return fail("Unknown decision");

    const result = await decidePayment(admin, paymentId, decisionRaw as PaymentDecision, note || undefined);
    if (!result.ok) return fail(result.error ?? "Failed", 400);

    await logAudit(admin, `PAYMENT_${decisionRaw}`, {
      targetType: "payment",
      targetId: paymentId,
      detail: note || undefined,
      meta: { delivered: result.delivered },
    });

    return ok({ delivered: result.delivered });
  });
}
