import { db } from "@/db";
import { claims, conversations, messages, orders, payments, users } from "@/db/schema";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { guarded, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { assertSameOrigin, fail, int, ok, readJson, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return guarded(async () => {
    await requireAdmin();
    const url = new URL(req.url);
    const id = int(url.searchParams.get("id"), 0);
    const q = str(url.searchParams.get("search"), 80);

    if (id) {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!user) return fail("Customer not found", 404);
      const userOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.userId, id))
        .orderBy(desc(orders.createdAt));
      const userPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.userId, id))
        .orderBy(desc(payments.createdAt));
      const userClaims = await db.select().from(claims).where(eq(claims.userId, id));
      const [conv] = await db.select().from(conversations).where(eq(conversations.userId, id)).limit(1);
      return ok({
        customer: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isBlocked: user.isBlocked,
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        },
        orders: userOrders.map((o) => ({
          ...o,
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString(),
          deliveredAt: o.deliveredAt?.toISOString() ?? null,
        })),
        payments: userPayments.map((p) => ({
          id: p.id,
          orderId: p.orderId,
          kind: p.kind,
          method: p.method,
          amount: p.amount,
          status: p.status,
          transactionId: p.transactionId,
          screenshotUrl: p.screenshotFileId ? `/api/files/${p.screenshotFileId}` : null,
          createdAt: p.createdAt.toISOString(),
        })),
        claims: userClaims.map((cl) => ({
          id: cl.id,
          orderId: cl.orderId,
          status: cl.status,
          message: cl.message,
          createdAt: cl.createdAt.toISOString(),
        })),
        conversationId: conv?.id ?? null,
      });
    }

    const where = q
      ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`), ilike(users.phone, `%${q}%`))
      : undefined;

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        isBlocked: users.isBlocked,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        orderCount: sql<number>`(select count(*)::int from ${orders} where ${orders.userId} = ${users.id})`,
        paidTotal: sql<number>`(select coalesce(sum(${payments.amount}),0)::int from ${payments} where ${payments.userId} = ${users.id} and ${payments.status} = 'APPROVED')`,
        messageCount: sql<number>`(select count(*)::int from ${messages} where ${messages.userId} = ${users.id})`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(200);

    return ok({
      customers: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
      })),
    });
  });
}

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const admin = await requireAdmin();
    const body = await readJson<{ id?: number; action?: string }>(req);
    const id = int(body?.id, 0);
    const action = str(body?.action, 20).toUpperCase();
    if (!id) return fail("Customer id required");
    if (action !== "BLOCK" && action !== "UNBLOCK") return fail("Unknown action");
    await db.update(users).set({ isBlocked: action === "BLOCK" }).where(eq(users.id, id));
    await logAudit(admin, action === "BLOCK" ? "CUSTOMER_BLOCKED" : "CUSTOMER_UNBLOCKED", {
      targetType: "user",
      targetId: id,
    });
    return ok();
  });
}
