import { db } from "@/db";
import { claims, deliveries, multis, orders, payments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureSeeded } from "@/db/seed";
import { guarded, requireUser } from "@/lib/auth";
import { addMessage } from "@/lib/chat";
import { createOrderForToday } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { toBnDigits } from "@/lib/format";
import { assertSameOrigin, clientKey, fail, ok, rateLimit } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return guarded(async () => {
    const user = await requireUser();
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
        multiTitle: multis.title,
        multiId: multis.id,
      })
      .from(orders)
      .leftJoin(multis, eq(multis.id, orders.multiId))
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt));

    const pay = await db
      .select()
      .from(payments)
      .where(eq(payments.userId, user.id))
      .orderBy(desc(payments.createdAt));

    const myClaims = await db
      .select()
      .from(claims)
      .where(eq(claims.userId, user.id))
      .orderBy(desc(claims.createdAt));

    const userDeliveries = await db
      .select({
        orderId: deliveries.orderId,
        multiId: deliveries.multiId,
        protectedImageFileId: multis.protectedImageFileId,
        protectedDescription: multis.protectedDescription,
        title: multis.title,
      })
      .from(deliveries)
      .innerJoin(multis, eq(multis.id, deliveries.multiId))
      .where(eq(deliveries.userId, user.id));

    return ok({
      orders: rows.map((o) => {
        const isAuthorized =
          o.mainPaymentStatus === "APPROVED" &&
          o.sourcePaymentStatus === "APPROVED" &&
          Boolean(o.deliveredAt);
        const grant = isAuthorized
          ? userDeliveries.find((d) => d.orderId === o.id)
          : null;

        return {
          ...o,
          createdAt: o.createdAt.toISOString(),
          deliveredAt: o.deliveredAt?.toISOString() ?? null,
          deliveredContent: grant
            ? {
                imageUrl: grant.protectedImageFileId
                  ? `/api/files/${grant.protectedImageFileId}`
                  : null,
                description: grant.protectedDescription,
                title: grant.title,
              }
            : null,
          payments: pay
            .filter((p) => p.orderId === o.id)
            .map((p) => ({
              id: p.id,
              kind: p.kind,
              method: p.method,
              transactionId: p.transactionId,
              amount: p.amount,
              status: p.status,
              adminNote: p.adminNote,
              screenshotUrl: p.screenshotFileId ? `/api/files/${p.screenshotFileId}` : null,
              createdAt: p.createdAt.toISOString(),
            })),
          claims: myClaims
            .filter((c) => c.orderId === o.id)
            .map((c) => ({
              id: c.id,
              status: c.status,
              message: c.message,
              adminNote: c.adminNote,
              createdAt: c.createdAt.toISOString(),
            })),
        };
      }),
    });
  });
}

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const user = await requireUser();
    if (!rateLimit(clientKey(req, `order:${user.id}`), 10, 60_000)) {
      return fail("একটু পরে আবার চেষ্টা করুন।", 429);
    }
    await ensureSeeded();

    const result = await createOrderForToday(user);
    if (!result.ok) return fail(result.error, 400);

    const s = await getSettings();
    if (result.created) {
      await addMessage({
        userId: user.id,
        senderType: "ai",
        senderName: s.ai_name,
        body: `আপনার অর্ডার তৈরি হয়েছে ✅\nOrder ID: ${result.order.orderCode}\nAmount: ${s.currency_symbol}${toBnDigits(result.order.priceAmount)}\n\nনিচের নম্বরে পেমেন্ট করুন:\n• bKash: ${s.bkash_number}\n• Nagad: ${s.nagad_number}\n\n${s.payment_instructions}`,
        orderId: result.order.id,
        meta: { intent: "payment_number" },
      });
    }

    return ok({
      order: {
        id: result.order.id,
        orderCode: result.order.orderCode,
        status: result.order.status,
        priceAmount: result.order.priceAmount,
        sourceCommissionAmount: result.order.sourceCommissionAmount,
      },
      created: result.created,
    });
  });
}
