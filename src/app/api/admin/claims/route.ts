import { db } from "@/db";
import { claims, multis, orders, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { guarded, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { addMessage } from "@/lib/chat";
import { canTransition, deliverRecoveryForOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { assertSameOrigin, fail, int, ok, readJson, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return guarded(async () => {
    await requireAdmin();
    const rows = await db
      .select({
        id: claims.id,
        status: claims.status,
        message: claims.message,
        adminNote: claims.adminNote,
        createdAt: claims.createdAt,
        decidedAt: claims.decidedAt,
        screenshotFileId: claims.screenshotFileId,
        orderId: orders.id,
        orderCode: orders.orderCode,
        orderStatus: orders.status,
        customerId: users.id,
        customerName: users.name,
        customerEmail: users.email,
        multiTitle: multis.title,
        multiId: multis.id,
      })
      .from(claims)
      .innerJoin(orders, eq(orders.id, claims.orderId))
      .innerJoin(users, eq(users.id, claims.userId))
      .leftJoin(multis, eq(multis.id, claims.multiId))
      .orderBy(desc(claims.createdAt))
      .limit(200);

    return ok({
      claims: rows.map((c) => ({
        ...c,
        screenshotUrl: c.screenshotFileId ? `/api/files/${c.screenshotFileId}` : null,
        createdAt: c.createdAt.toISOString(),
        decidedAt: c.decidedAt?.toISOString() ?? null,
      })),
    });
  });
}

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const admin = await requireAdmin();
    const body = await readJson<{
      claimId?: number;
      decision?: string;
      note?: string;
      recoveryMultiId?: number;
    }>(req);
    const claimId = int(body?.claimId, 0);
    const decision = str(body?.decision, 24).toUpperCase();
    const note = str(body?.note, 600);
    const recoveryMultiId = int(body?.recoveryMultiId, 0) || undefined;
    if (!claimId) return fail("Claim id required");
    if (!["APPROVE_REFUND", "APPROVE_RECOVERY", "REJECT", "REQUEST_INFO"].includes(decision)) {
      return fail("Unknown decision");
    }

    const [claim] = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1);
    if (!claim) return fail("Claim not found", 404);
    const [order] = await db.select().from(orders).where(eq(orders.id, claim.orderId)).limit(1);
    if (!order) return fail("Order not found", 404);

    const s = await getSettings();
    let claimStatus: typeof claim.status = claim.status;
    let aiBody = "";
    let delivered = false;

    if (decision === "APPROVE_REFUND") {
      claimStatus = "REFUND_APPROVED";
      if (canTransition(order.status, "REFUND_APPROVED")) {
        await db
          .update(orders)
          .set({ status: "REFUND_APPROVED", updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
      aiBody = `আপনার Refund অনুমোদিত হয়েছে ✅ (Order ${order.orderCode})।\n\n${s.refund_policy}${
        note ? `\n\nAdmin নোট: ${note}` : ""
      }`;
    } else if (decision === "APPROVE_RECOVERY") {
      claimStatus = "RECOVERY_APPROVED";
      if (canTransition(order.status, "RECOVERY_APPROVED")) {
        await db
          .update(orders)
          .set({ status: "RECOVERY_APPROVED", updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
      aiBody = `আপনার Recovery অনুমোদিত হয়েছে ✅ (Order ${order.orderCode})।\n\n${s.recovery_policy}${
        note ? `\n\nAdmin নোট: ${note}` : ""
      }`;
      await addMessage({
        userId: claim.userId,
        senderType: "ai",
        senderName: s.ai_name,
        body: aiBody,
        orderId: order.id,
        meta: { intent: "recovery" },
      });
      const result = await deliverRecoveryForOrder(order.id, admin, recoveryMultiId ?? null);
      delivered = result.delivered;
      if (!delivered && result.reason === "no-recovery-multi") {
        await addMessage({
          userId: claim.userId,
          senderType: "ai",
          senderName: s.ai_name,
          body: "Recovery Multi প্রস্তুত হলে আপনার চ্যাটে অটোমেটিক পাঠিয়ে দেওয়া হবে।",
          orderId: order.id,
        });
      }
      aiBody = "";
    } else if (decision === "REJECT") {
      claimStatus = "REJECTED";
      if (canTransition(order.status, "REFUND_REJECTED")) {
        await db
          .update(orders)
          .set({ status: "REFUND_REJECTED", updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
      aiBody = `দুঃখিত, আপনার Refund/Recovery রিকোয়েস্টটি অনুমোদন করা যায়নি (Order ${order.orderCode})।${
        note ? `\nকারণ: ${note}` : ""
      }`;
    } else {
      claimStatus = "INFO_REQUESTED";
      aiBody = `আপনার Refund/Recovery রিকোয়েস্ট যাচাইয়ের জন্য আরও তথ্য প্রয়োজন (Order ${order.orderCode})।${
        note ? `\n${note}` : ""
      }`;
    }

    await db
      .update(claims)
      .set({ status: claimStatus, adminNote: note || null, decidedBy: admin.id, decidedAt: new Date() })
      .where(eq(claims.id, claimId));

    if (aiBody) {
      await addMessage({
        userId: claim.userId,
        senderType: "ai",
        senderName: s.ai_name,
        body: aiBody,
        orderId: order.id,
        meta: { intent: "refund" },
      });
    }

    await logAudit(admin, `CLAIM_${decision}`, {
      targetType: "claim",
      targetId: claimId,
      detail: note || undefined,
      meta: { orderId: order.id, delivered },
    });

    return ok({ delivered });
  });
}
