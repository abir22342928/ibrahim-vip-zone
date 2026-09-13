import { ensureSeeded } from "@/db/seed";
import { requireUser, guarded } from "@/lib/auth";
import { saveDataUrl } from "@/lib/files";
import { handlePaymentScreenshot } from "@/lib/payment-flow";
import { getOrCreateConversation, listMessages, markCustomerRead } from "@/lib/chat";
import { getOrderContext } from "@/lib/orders";
import { assertSameOrigin, clientKey, fail, ok, rateLimit, readJson, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dedicated screenshot upload endpoint. Uploads the image to PERSISTENT database
 * storage (never a temp sandbox path), posts it as a customer chat attachment,
 * and drives the guided payment flow (ask for Transaction ID next).
 */
export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const user = await requireUser();
    if (!rateLimit(clientKey(req, `upload:${user.id}`), 12, 60_000)) {
      return fail("অনেকবার আপলোড হয়েছে, একটু পরে চেষ্টা করুন।", 429);
    }
    await ensureSeeded();

    const body = await readJson<{
      screenshot?: string;
      method?: string;
      kind?: string;
    }>(req);
    if (!body) return fail("Invalid request");

    const methodRaw = str(body.method, 10).toLowerCase();
    const method = methodRaw === "nagad" ? "nagad" : "bkash";
    const kind = str(body.kind, 10).toUpperCase() === "SOURCE" ? "SOURCE" : "MAIN";

    let screenshotFileId: number | null = null;
    if (typeof body.screenshot === "string" && body.screenshot.startsWith("data:")) {
      const saved = await saveDataUrl({
        dataUrl: body.screenshot,
        filename: `payment-${kind.toLowerCase()}-${Date.now()}.img`,
        visibility: "private",
        ownerUserId: user.id,
        uploadedBy: user.id,
      });
      if (!saved.ok) return fail(saved.error);
      screenshotFileId = saved.fileId;
    } else {
      return fail("অনুগ্রহ করে Payment Screenshot দিন。");
    }

    await handlePaymentScreenshot(user, screenshotFileId, method, kind);

    const conversationId = await getOrCreateConversation(user.id);
    await markCustomerRead(conversationId);
    const messages = await listMessages(conversationId);
    const order = await getOrderContext(user.id);

    return ok({ messages, order });
  });
}
