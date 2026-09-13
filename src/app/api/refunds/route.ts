import { db } from "@/db";
import { claims, orders } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { guarded, requireUser } from "@/lib/auth";
import { addMessage } from "@/lib/chat";
import { saveDataUrl } from "@/lib/files";
import { canTransition } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { assertSameOrigin, clientKey, fail, int, ok, rateLimit, readJson, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const user = await requireUser();
    if (!rateLimit(clientKey(req, `claim:${user.id}`), 6, 60_000)) {
      return fail("একটু পরে আবার চেষ্টা করুন।", 429);
    }

    const body = await readJson<{ orderId?: number; message?: string; screenshot?: string }>(req);
    const orderId = int(body?.orderId, 0);
    const message = str(body?.message, 1200);
    if (!orderId) return fail("Order নির্বাচন করুন।");

    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, user.id)))
      .limit(1);
    if (!order) return fail("Order পাওয়া যায়নি।", 404);
    if (!order.deliveredAt) return fail("Multi ডেলিভারি হওয়ার পরেই Refund/Recovery রিকোয়েস্ট করা যাবে।");

    const open = await db
      .select({ id: claims.id })
      .from(claims)
      .where(and(eq(claims.orderId, order.id), eq(claims.status, "LOSS_REVIEW_PENDING")))
      .limit(1);
    if (open.length > 0) return fail("এই অর্ডারের জন্য একটি রিকোয়েস্ট ইতিমধ্যে রিভিউতে আছে।");

    let screenshotFileId: number | null = null;
    if (typeof body?.screenshot === "string" && body.screenshot.startsWith("data:")) {
      const saved = await saveDataUrl({
        dataUrl: body.screenshot,
        filename: `loss-${Date.now()}.img`,
        visibility: "private",
        ownerUserId: user.id,
        uploadedBy: user.id,
      });
      if (!saved.ok) return fail(saved.error);
      screenshotFileId = saved.fileId;
    } else {
      return fail("Loss screenshot আপলোড করুন।");
    }

    const [claim] = await db
      .insert(claims)
      .values({
        userId: user.id,
        orderId: order.id,
        multiId: order.multiId,
        message,
        screenshotFileId,
        status: "LOSS_REVIEW_PENDING",
      })
      .returning();

    if (canTransition(order.status, "REFUND_REVIEW")) {
      await db
        .update(orders)
        .set({ status: "REFUND_REVIEW", updatedAt: new Date() })
        .where(eq(orders.id, order.id));
    }

    const s = await getSettings();
    await addMessage({
      userId: user.id,
      senderType: "customer",
      senderName: user.name,
      body: `Refund/Recovery রিকোয়েস্ট জমা দিয়েছি (Order ${order.orderCode}).${message ? `\n${message}` : ""}`,
      attachmentFileId: screenshotFileId,
      attachmentLabel: "Loss screenshot",
      orderId: order.id,
    });
    await addMessage({
      userId: user.id,
      senderType: "ai",
      senderName: s.ai_name,
      body: `আপনার Refund/Recovery রিকোয়েস্টটি পেয়েছি ✅ (Order ${order.orderCode})। বর্তমানে এটি LOSS_REVIEW_PENDING অবস্থায় আছে। Admin যাচাই করে Refund অথবা Recovery-এর সিদ্ধান্ত জানাবেন।\n\n${s.refund_policy}`,
      orderId: order.id,
      meta: { intent: "refund" },
    });

    return ok({ claim: { id: claim.id, status: claim.status } });
  });
}
