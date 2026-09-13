import { db } from "@/db";
import { multis, orders, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { guarded, requireAdmin } from "@/lib/auth";
import { int, ok, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return guarded(async () => {
    await requireAdmin();
    const url = new URL(req.url);
    const status = str(url.searchParams.get("status"), 40);
    const limit = Math.min(int(url.searchParams.get("limit"), 100), 300);

    const rows = await db
      .select({
        id: orders.id,
        orderCode: orders.orderCode,
        status: orders.status,
        priceAmount: orders.priceAmount,
        sourceCommissionAmount: orders.sourceCommissionAmount,
        mainPaymentStatus: orders.mainPaymentStatus,
        sourcePaymentStatus: orders.sourcePaymentStatus,
        createdAt: orders.createdAt,
        deliveredAt: orders.deliveredAt,
        customerId: users.id,
        customerName: users.name,
        customerEmail: users.email,
        multiTitle: multis.title,
        multiId: multis.id,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .leftJoin(multis, eq(multis.id, orders.multiId))
      .orderBy(desc(orders.createdAt))
      .limit(limit);

    const filtered = status ? rows.filter((r) => r.status === status) : rows;

    return ok({
      orders: filtered.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
      })),
    });
  });
}
