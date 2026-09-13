import { db } from "@/db";
import { deliveries, multis, orders, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { guarded, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { deliverMulti, maybeDeliverMulti } from "@/lib/orders";
import { assertSameOrigin, fail, int, ok, readJson, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return guarded(async () => {
    await requireAdmin();
    const rows = await db
      .select({
        id: deliveries.id,
        kind: deliveries.kind,
        note: deliveries.note,
        createdAt: deliveries.createdAt,
        orderCode: orders.orderCode,
        orderId: orders.id,
        customerName: users.name,
        customerId: users.id,
        multiTitle: multis.title,
        multiId: multis.id,
      })
      .from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId))
      .innerJoin(users, eq(users.id, deliveries.userId))
      .innerJoin(multis, eq(multis.id, deliveries.multiId))
      .orderBy(desc(deliveries.createdAt))
      .limit(200);
    return ok({ deliveries: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) });
  });
}

/** Manual (re)send — the only way the same Multi can be sent twice. */
export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const admin = await requireAdmin();
    const body = await readJson<{ orderId?: number; action?: string }>(req);
    const orderId = int(body?.orderId, 0);
    const action = str(body?.action, 20).toUpperCase() || "RESEND";
    if (!orderId) return fail("Order id required");

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return fail("Order not found", 404);

    if (action === "DELIVER") {
      const res = await maybeDeliverMulti(orderId, admin);
      await logAudit(admin, "MULTI_DELIVERED_MANUAL", {
        targetType: "order",
        targetId: orderId,
        meta: res as unknown as Record<string, unknown>,
      });
      if (!res.delivered) return fail(`Delivery blocked: ${res.reason}`, 400);
      return ok({ delivered: true });
    }

    if (order.mainPaymentStatus !== "APPROVED" || order.sourcePaymentStatus !== "APPROVED") {
      return fail("দুইটি পেমেন্ট অনুমোদিত না হলে Multi পাঠানো যাবে না।", 400);
    }
    const multiId = order.recoveryMultiId ?? order.multiId;
    if (!multiId) return fail("This order has no Multi attached", 400);
    const [multi] = await db.select().from(multis).where(eq(multis.id, multiId)).limit(1);
    if (!multi) return fail("Multi not found", 404);

    const res = await deliverMulti({
      order,
      multi,
      kind: "RESEND",
      actor: admin,
      intro: "Admin আপনার Multi আবার পাঠিয়েছেন 👇",
      force: true,
    });

    await logAudit(admin, "MULTI_RESENT", {
      targetType: "order",
      targetId: orderId,
      detail: multi.title,
      meta: { multiId: multi.id },
    });

    return ok({ delivered: res.delivered });
  });
}
