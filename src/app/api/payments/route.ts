import { getCurrentUser, guarded, requireUser } from "@/lib/auth";
import { saveDataUrl } from "@/lib/files";
import { submitPayment } from "@/lib/orders";
import { assertSameOrigin, clientKey, fail, int, ok, rateLimit, readJson, str } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { ok as okResp } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("Authentication required", 401);
  const s = await getSettings();
  return okResp({
    bkashNumber: s.bkash_number,
    nagadNumber: s.nagad_number,
    instructions: s.payment_instructions,
    currency: s.currency_symbol,
  });
}

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const user = await requireUser();
    if (!rateLimit(clientKey(req, `pay:${user.id}`), 8, 60_000)) {
      return fail("অনেকবার সাবমিট হয়েছে, একটু পরে চেষ্টা করুন।", 429);
    }

    const body = await readJson<{
      orderId?: number;
      kind?: string;
      method?: string;
      transactionId?: string;
      senderNumber?: string;
      screenshot?: string;
    }>(req);
    if (!body) return fail("Invalid request");

    const orderId = int(body.orderId, 0);
    const kind = str(body.kind, 10).toUpperCase() === "SOURCE" ? "SOURCE" : "MAIN";
    const methodRaw = str(body.method, 10).toLowerCase();
    const method = methodRaw === "nagad" ? "nagad" : "bkash";
    const transactionId = str(body.transactionId, 60);
    const senderNumber = str(body.senderNumber, 25);

    if (!orderId) return fail("Order নির্বাচন করুন।");
    if (transactionId.length < 4) return fail("অনুগ্রহ করে Transaction ID দিন।");
    if (senderNumber.length < 6) return fail("অনুগ্রহ করে টাকা পাঠানো Sender Number দিন。");
    if (!/^[0-9+\-\s]{6,20}$/.test(senderNumber)) return fail("সঠিক Sender Number দিন।");

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
      return fail("পেমেন্ট স্ক্রিনশট আপলোড করুন।");
    }

    const result = await submitPayment({
      user,
      orderId,
      kind,
      method,
      transactionId,
      senderNumber,
      screenshotFileId,
    });
    if (!result.ok) return fail(result.error);

    return ok({ payment: { id: result.payment.id, status: result.payment.status } });
  });
}
