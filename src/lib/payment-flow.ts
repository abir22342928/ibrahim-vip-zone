import { db } from "@/db";
import { messages } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getOrCreateConversation, addMessage } from "@/lib/chat";
import { createOrderForToday, submitPayment } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import type { SessionUser } from "@/lib/auth";
import type { PaymentKind, PaymentMethod } from "@/db/schema";

export type PaymentStage = "awaiting_screenshot" | "awaiting_trxid" | "awaiting_sender";

/** Detect the current payment-collection stage from the conversation meta. */
export async function getPaymentStage(userId: number): Promise<PaymentStage | null> {
  const convId = await getOrCreateConversation(userId);
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, convId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(20);

  // Scan back through the conversation to find the current payment stage.
  for (const m of rows) {
    const meta = (m.meta ?? {}) as Record<string, unknown>;
    if (meta.paymentStage) return meta.paymentStage as PaymentStage;
    // If we reach a customer payment-screenshot message without a stage, await trxid.
    if (m.senderType === "customer" && m.attachmentFileId && meta.kind === "payment-screenshot") {
      return "awaiting_trxid";
    }
  }
  return null;
}

/**
 * Returns the most recent un-finished payment-flow context for a conversation:
 * { screenshotFileId, method, kind } as stored in message meta.
 */
export async function getPendingPaymentContext(userId: number): Promise<{
  screenshotFileId: number | null;
  method: PaymentMethod | null;
  kind: PaymentKind;
} | null> {
  const convId = await getOrCreateConversation(userId);
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, convId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(20);

  for (const m of rows) {
    const meta = (m.meta ?? {}) as Record<string, unknown>;
    if (meta.kind === "payment-screenshot" || meta.paymentStage === "awaiting_trxid") {
      return {
        screenshotFileId: (meta.screenshotFileId as number) ?? null,
        method: (meta.method as PaymentMethod) ?? null,
        kind: (meta.paymentKind as PaymentKind) ?? "MAIN",
      };
    }
  }
  return null;
}

const isPhoneNumber = (s: string) => /^[0-9+\-\s]{6,20}$/.test(s.trim());

/**
 * Guidance for a customer message given the current stage.
 * Returns the AI reply body (handled by caller / chat route).
 */
export async function handlePaymentFlowMessage(
  user: SessionUser,
  text: string,
): Promise<{ handled: boolean; aiBody?: string; orderCode?: string }> {
  const s = await getSettings();
  const stage = await getPaymentStage(user.id);

  // 1) awaiting transaction id after a screenshot upload
  if (stage === "awaiting_trxid") {
    const ctx = await getPendingPaymentContext(user.id);
    if (!ctx?.screenshotFileId) {
      return {
        handled: true,
        aiBody: "অনুগ্রহ করে প্রথমে আপনার Payment Screenshot upload করুন।",
      };
    }

    // The customer just sent the transaction id text.
    const transactionId = text.trim();
    if (transactionId.length < 4) {
      return { handled: true, aiBody: "অনুগ্রহ করে সঠিক Transaction ID দিন।" };
    }

    // Ask for sender number next (if not already known).
    await addMessage({
      userId: user.id,
      senderType: "ai",
      senderName: s.ai_name,
      body: "ধন্যবাদ ❤️ এখন যে নম্বর থেকে টাকা পাঠিয়েছেন সেটি দিন।",
      meta: {
        paymentStage: "awaiting_sender",
        screenshotFileId: ctx.screenshotFileId,
        method: ctx.method,
        paymentKind: ctx.kind,
        transactionId,
      },
    });
    return { handled: true, aiBody: "ধন্যবাদ ❤️ এখন যে নম্বর থেকে টাকা পাঠিয়েছেন সেটি দিন。" };
  }

  // 2) awaiting sender number
  if (stage === "awaiting_sender") {
    const senderNumber = text.trim();
    if (!isPhoneNumber(senderNumber)) {
      return {
        handled: true,
        aiBody: "অনুগ্রহ করে সঠিক Sender Number দিন (যেমন: 017XXXXXXXX)।",
      };
    }

    // Find context stored on the previous AI meta.
    const convId = await getOrCreateConversation(user.id);
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(5);
    let screenshotFileId: number | null = null;
    let method: PaymentMethod | null = null;
    let paymentKind: PaymentKind = "MAIN";
    let transactionId = "";
    for (const m of rows) {
      const meta = (m.meta ?? {}) as Record<string, unknown>;
      if (meta.transactionId) {
        transactionId = String(meta.transactionId);
        screenshotFileId = (meta.screenshotFileId as number) ?? null;
        method = (meta.method as PaymentMethod) ?? null;
        paymentKind = (meta.paymentKind as PaymentKind) ?? "MAIN";
        break;
      }
    }

    if (!screenshotFileId || !transactionId) {
      return {
        handled: true,
        aiBody: "পেমেন্ট তথ্য খুঁজে পাওয়া যায়নি। অনুগ্রহ করে আবার screenshot upload করুন।",
      };
    }

    // Create/find an order and submit the payment as PENDING.
    let order = (await createOrderForToday(user));
    if (!order.ok) return { handled: true, aiBody: order.error };

    const result = await submitPayment({
      user,
      orderId: order.order.id,
      kind: paymentKind,
      method: method ?? "bkash",
      transactionId,
      senderNumber,
      screenshotFileId,
    });

    if (!result.ok) return { handled: true, aiBody: result.error };

    const aiBody = `আপনার Payment তথ্য সফলভাবে জমা হয়েছে ✅\nOrder ID: #${order.order.orderCode}\n\nAdmin যাচাই করছেন। যাচাই শেষ হলে আপনাকে জানানো হবে।`;
    await addMessage({
      userId: user.id,
      senderType: "ai",
      senderName: s.ai_name,
      body: aiBody,
      orderId: order.order.id,
      meta: { paymentStage: null, intent: "payment_done" },
    });

    return { handled: true, aiBody, orderCode: order.order.orderCode };
  }

  return { handled: false };
}

/** After a screenshot is uploaded, post the customer message + AI guidance. */
export async function handlePaymentScreenshot(
  user: SessionUser,
  screenshotFileId: number,
  method: PaymentMethod,
  kind: PaymentKind,
) {
  const s = await getSettings();
  await addMessage({
    userId: user.id,
    senderType: "customer",
    senderName: user.name,
    body: "📎 Payment Screenshot",
    attachmentFileId: screenshotFileId,
    attachmentLabel: "Payment screenshot",
    meta: { kind: "payment-screenshot", screenshotFileId, method, paymentKind: kind },
  });
  await addMessage({
    userId: user.id,
    senderType: "ai",
    senderName: s.ai_name,
    body: "আপনার Payment Screenshot পেয়েছি ✅\nএখন অনুগ্রহ করে আপনার Transaction ID দিন।",
    meta: { paymentStage: "awaiting_trxid", screenshotFileId, method, paymentKind: kind },
  });
}
