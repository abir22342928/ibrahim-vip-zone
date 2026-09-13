import { db } from "@/db";
import {
  claims,
  deliveries,
  multis,
  orders,
  payments,
  type DeliveryKind,
  type Multi,
  type Order,
  type OrderStatus,
  type PaymentKind,
  type PaymentMethod,
} from "@/db/schema";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { addMessage } from "@/lib/chat";
import { getSettings } from "@/lib/settings";
import { getActiveMulti, getMultiState } from "@/lib/multi";
import { toBnDigits } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";

const TERMINAL: OrderStatus[] = ["REFUND_APPROVED", "RECOVERY_DELIVERED", "REFUND_REJECTED"];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["MAIN_PAYMENT_PENDING"],
  MAIN_PAYMENT_PENDING: ["MAIN_PAYMENT_APPROVED", "MAIN_PAYMENT_REJECTED"],
  MAIN_PAYMENT_REJECTED: ["MAIN_PAYMENT_PENDING"],
  MAIN_PAYMENT_APPROVED: ["SOURCE_PAYMENT_PENDING"],
  SOURCE_PAYMENT_PENDING: ["SOURCE_PAYMENT_APPROVED", "SOURCE_PAYMENT_REJECTED"],
  SOURCE_PAYMENT_REJECTED: ["SOURCE_PAYMENT_PENDING"],
  SOURCE_PAYMENT_APPROVED: ["FULL_PAYMENT_APPROVED"],
  FULL_PAYMENT_APPROVED: ["MULTI_DELIVERED"],
  MULTI_DELIVERED: ["REFUND_REVIEW"],
  REFUND_REVIEW: ["REFUND_APPROVED", "REFUND_REJECTED", "RECOVERY_APPROVED"],
  REFUND_APPROVED: [],
  REFUND_REJECTED: ["REFUND_REVIEW"],
  RECOVERY_APPROVED: ["RECOVERY_DELIVERED"],
  RECOVERY_DELIVERED: ["REFUND_REVIEW"],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export async function setOrderStatus(orderId: number, from: OrderStatus, to: OrderStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid order transition ${from} -> ${to}`);
  }
  await db.update(orders).set({ status: to, updatedAt: new Date() }).where(eq(orders.id, orderId));
}

function orderCode(): string {
  const d = new Date();
  const stamp = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `IVZ-${stamp}-${rand}`;
}

export async function getLatestOpenOrder(userId: number): Promise<Order | null> {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(5);
  return rows.find((o) => !TERMINAL.includes(o.status)) ?? rows[0] ?? null;
}

export async function listUserOrders(userId: number) {
  return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
}

export type CreateOrderResult =
  | { ok: true; order: Order; created: boolean }
  | { ok: false; error: string };

export async function createOrderForToday(user: SessionUser): Promise<CreateOrderResult> {
  const state = await getMultiState();
  if (!state.multi) return { ok: false, error: "আজকের মাল্টি এখনো পাবলিশ করা হয়নি।" };
  if (state.isBeforeStart) return { ok: false, error: "আজকের মাল্টির সেল এখনো শুরু হয়নি।" };
  if (state.isExpired || !state.isLive) {
    return { ok: false, error: "আজকের মাল্টির সময় শেষ হয়ে গেছে (SOLD OUT)।" };
  }

  const existing = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, user.id), eq(orders.multiId, state.multi.id)))
    .orderBy(desc(orders.createdAt))
    .limit(1);

  if (existing[0] && !TERMINAL.includes(existing[0].status)) {
    return { ok: true, order: existing[0], created: false };
  }

  const [order] = await db
    .insert(orders)
    .values({
      orderCode: orderCode(),
      userId: user.id,
      multiId: state.multi.id,
      status: "PENDING_PAYMENT",
      priceAmount: state.priceDiscount,
      sourceCommissionAmount: state.sourceCommission,
    })
    .returning();

  return { ok: true, order, created: true };
}

export type SubmitPaymentInput = {
  user: SessionUser;
  orderId: number;
  kind: PaymentKind;
  method: PaymentMethod;
  transactionId: string;
  screenshotFileId: number | null;
  senderNumber?: string | null;
};

export async function submitPayment(input: SubmitPaymentInput) {
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order || order.userId !== input.user.id) {
    return { ok: false as const, error: "Order not found" };
  }

  if (input.kind === "MAIN") {
    if (!["PENDING_PAYMENT", "MAIN_PAYMENT_REJECTED", "MAIN_PAYMENT_PENDING"].includes(order.status)) {
      return { ok: false as const, error: "এই অর্ডারের মূল পেমেন্ট ইতিমধ্যে প্রসেস হয়েছে।" };
    }
  } else {
    if (
      !["MAIN_PAYMENT_APPROVED", "SOURCE_PAYMENT_REJECTED", "SOURCE_PAYMENT_PENDING"].includes(
        order.status,
      )
    ) {
      return {
        ok: false as const,
        error: "Source Commission জমা দেওয়ার আগে মূল পেমেন্ট Admin অনুমোদন করতে হবে।",
      };
    }
  }

  const transactionKey = input.transactionId.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (transactionKey.length < 4) {
    return { ok: false as const, error: "সঠিক Transaction ID দিন (কমপক্ষে ৪ অক্ষর)।" };
  }

  const clash = await db
    .select({ id: payments.id, orderId: payments.orderId, status: payments.status, kind: payments.kind })
    .from(payments)
    .where(eq(payments.transactionKey, transactionKey))
    .limit(10);

  // Any previous use of this transaction id is suspicious; an already approved
  // one is hard-blocked so a single payment can never unlock two steps/orders.
  const usedBefore = clash.length > 0;
  const alreadyApproved = clash.some((c) => c.status === "APPROVED");
  const pendingSameSlot = clash.some(
    (c) => c.orderId === order.id && c.kind === input.kind && c.status === "PENDING",
  );
  if (alreadyApproved || pendingSameSlot) {
    return {
      ok: false as const,
      error: "এই Transaction ID আগে ব্যবহার করা হয়েছে। অনুগ্রহ করে সঠিক Transaction ID দিন।",
    };
  }

  const amount = input.kind === "MAIN" ? order.priceAmount : order.sourceCommissionAmount;

  const [payment] = await db
    .insert(payments)
    .values({
      orderId: order.id,
      userId: input.user.id,
      kind: input.kind,
      method: input.method,
      transactionId: input.transactionId,
      transactionKey,
      amount,
      senderNumber: input.senderNumber ?? null,
      screenshotFileId: input.screenshotFileId,
      status: "PENDING",
      isFlaggedDuplicate: usedBefore,
    })
    .returning();

  const nextStatus: OrderStatus = input.kind === "MAIN" ? "MAIN_PAYMENT_PENDING" : "SOURCE_PAYMENT_PENDING";
  await db
    .update(orders)
    .set({
      status: nextStatus,
      updatedAt: new Date(),
      ...(input.kind === "MAIN"
        ? { mainPaymentStatus: "PENDING" as const }
        : { sourcePaymentStatus: "PENDING" as const }),
    })
    .where(eq(orders.id, order.id));

  const body =
    `আপনার payment information সফলভাবে জমা হয়েছে ✅\nTransaction ID: ${input.transactionId}` +
    (input.senderNumber ? `\nSender Number: ${input.senderNumber}` : "") +
    `\n\nআমাদের Admin এখন payment যাচাই করবেন। যাচাই শেষ হলে আপনাকে Chat-এ জানানো হবে।`;

  const settingsMap = await getSettings();
  await addMessage({
    userId: input.user.id,
    senderType: "customer",
    body: `${input.kind === "MAIN" ? "Main" : "Source"} Payment submitted — Method: ${input.method.toUpperCase()}, TrxID: ${input.transactionId}, Sender: ${input.senderNumber ?? "-"}, Amount: ${settingsMap.currency_symbol}${amount}`,
    attachmentFileId: input.screenshotFileId,
    attachmentLabel: "Payment screenshot",
    orderId: order.id,
  });
  await addMessage({
    userId: input.user.id,
    senderType: "ai",
    senderName: settingsMap.ai_name,
    body,
    orderId: order.id,
  });

  return { ok: true as const, payment };
}

export type PaymentDecision = "APPROVE" | "REJECT" | "REQUEST_INFO";

export async function decidePayment(
  admin: SessionUser,
  paymentId: number,
  decision: PaymentDecision,
  note?: string,
) {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment) return { ok: false as const, error: "Payment not found" };
  const [order] = await db.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
  if (!order) return { ok: false as const, error: "Order not found" };

  const s = await getSettings();
  const status = decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "INFO_REQUESTED";

  await db
    .update(payments)
    .set({ status, adminNote: note ?? null, reviewedBy: admin.id, reviewedAt: new Date() })
    .where(eq(payments.id, paymentId));

  let aiBody = "";
  let nextOrderStatus: OrderStatus = order.status;

  if (payment.kind === "MAIN") {
    if (decision === "APPROVE") {
      nextOrderStatus = "MAIN_PAYMENT_APPROVED";
      await db
        .update(orders)
        .set({ mainPaymentStatus: "APPROVED", status: nextOrderStatus, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      aiBody = `আপনার Main Payment Approved হয়েছে ✅\n\nদয়া করে Source Commission Payment করুন।\n\nআপনি কোন মাধ্যমে পেমেন্ট করতে চান?\n1️⃣ bKash (${s.bkash_number})\n2️⃣ Nagad (${s.nagad_number})\n\nSource Commission: ${s.currency_symbol}${toBnDigits(order.sourceCommissionAmount)}\nপেমেন্ট করার পর Transaction ID ও Screenshot পাঠিয়ে দিন।`;
    } else if (decision === "REJECT") {
      nextOrderStatus = "MAIN_PAYMENT_REJECTED";
      await db
        .update(orders)
        .set({ mainPaymentStatus: "REJECTED", status: nextOrderStatus, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      aiBody = `আপনার payment বর্তমানে Approved হয়নি। অনুগ্রহ করে payment তথ্য আবার যাচাই করুন অথবা Support-এ যোগাযোগ করুন।${
        note ? `\nকারণ: ${note}` : ""
      }`;
    } else {
      aiBody = `আপনার পেমেন্ট যাচাইয়ের জন্য আরও কিছু তথ্য প্রয়োজন (Order ${order.orderCode})।${
        note ? `\n${note}` : ""
      }`;
    }
  } else {
    if (decision === "APPROVE") {
      await db
        .update(orders)
        .set({ sourcePaymentStatus: "APPROVED", status: "SOURCE_PAYMENT_APPROVED", updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await db
        .update(orders)
        .set({ status: "FULL_PAYMENT_APPROVED", updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      aiBody = `আপনার Source Commission Payment Approved হয়েছে ✅\n\nআপনার আজকের Multi এখন প্রস্তুত।\n\nআপনার Multi আপনার Orders/Inbox-এ পাঠানো হয়েছে। ❤️`;
    } else if (decision === "REJECT") {
      await db
        .update(orders)
        .set({ sourcePaymentStatus: "REJECTED", status: "SOURCE_PAYMENT_REJECTED", updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      aiBody = `আপনার payment বর্তমানে Approved হয়নি। অনুগ্রহ করে payment তথ্য আবার যাচাই করুন অথবা Support-এ যোগাযোগ করুন।${
        note ? `\nকারণ: ${note}` : ""
      }`;
    } else {
      aiBody = `Source Commission যাচাইয়ের জন্য আরও তথ্য প্রয়োজন (Order ${order.orderCode})।${
        note ? `\n${note}` : ""
      }`;
    }
  }

  await addMessage({
    userId: order.userId,
    senderType: "ai",
    senderName: s.ai_name,
    body: aiBody,
    orderId: order.id,
  });

  const delivery = await maybeDeliverMulti(order.id, admin);
  return { ok: true as const, delivered: delivery.delivered };
}

async function getMultiById(id: number | null): Promise<Multi | null> {
  if (!id) return null;
  const rows = await db.select().from(multis).where(eq(multis.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Delivers the protected Multi only when BOTH payments are approved.
 * Uses a unique delivery grant so the same Multi can never be double-delivered.
 */
export async function maybeDeliverMulti(orderId: number, actor?: SessionUser | null) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { delivered: false, reason: "order-missing" };
  if (order.mainPaymentStatus !== "APPROVED" || order.sourcePaymentStatus !== "APPROVED") {
    return { delivered: false, reason: "payments-not-approved" };
  }
  const multi = await getMultiById(order.multiId);
  if (!multi) return { delivered: false, reason: "multi-missing" };

  return deliverMulti({
    order,
    multi,
    kind: "PURCHASE",
    actor: actor ?? null,
    intro: "আপনার পেমেন্ট সম্পূর্ণভাবে যাচাই হয়েছে ✅ আপনার আজকের Multi এখন প্রস্তুত। আপনার Multi আপনার Orders/Inbox-এ পাঠানো হয়েছে। ❤️",
  });
}

export async function deliverMulti(params: {
  order: Order;
  multi: Multi;
  kind: DeliveryKind;
  actor: SessionUser | null;
  intro: string;
  force?: boolean;
}) {
  const { order, multi, kind } = params;

  const inserted = await db
    .insert(deliveries)
    .values({
      userId: order.userId,
      orderId: order.id,
      multiId: multi.id,
      kind,
      deliveredBy: params.actor?.id ?? null,
      note: params.actor ? `by ${params.actor.name}` : "auto",
    })
    .onConflictDoNothing()
    .returning({ id: deliveries.id });

  if (inserted.length === 0 && !params.force) {
    return { delivered: false, reason: "already-delivered" };
  }

  const s = await getSettings();
  await addMessage({
    userId: order.userId,
    senderType: "ai",
    senderName: s.ai_name,
    body: `${params.intro}\n\n🔒 ${multi.title}`,
    attachmentFileId: multi.protectedImageFileId,
    attachmentLabel: kind === "RECOVERY" ? "Recovery Multi" : "Protected Multi",
    orderId: order.id,
    meta: { multiId: multi.id, deliveryKind: kind },
  });
  if (multi.protectedDescription) {
    await addMessage({
      userId: order.userId,
      senderType: "ai",
      senderName: s.ai_name,
      body: multi.protectedDescription,
      orderId: order.id,
      meta: { multiId: multi.id, kind: "multi-description" },
    });
  }

  const nextStatus: OrderStatus = kind === "RECOVERY" ? "RECOVERY_DELIVERED" : "MULTI_DELIVERED";
  const current = order.status;
  if (canTransition(current, nextStatus)) {
    await db
      .update(orders)
      .set({ status: nextStatus, deliveredAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, order.id));
  } else {
    await db
      .update(orders)
      .set({ deliveredAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, order.id));
  }

  return { delivered: true, reason: "delivered" };
}

export async function deliverRecoveryForOrder(
  orderId: number,
  actor: SessionUser | null,
  multiId?: number | null,
) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { delivered: false, reason: "order-missing" };

  let recovery: Multi | null = null;
  if (multiId) {
    const rows = await db
      .select()
      .from(multis)
      .where(and(eq(multis.id, multiId), eq(multis.kind, "recovery")))
      .limit(1);
    recovery = rows[0] ?? null;
  }
  if (!recovery) recovery = await getActiveMulti("recovery");
  if (!recovery) return { delivered: false, reason: "no-recovery-multi" };
  if (recovery.expiresAt && recovery.expiresAt.getTime() < Date.now()) {
    return { delivered: false, reason: "recovery-expired" };
  }
  await db.update(orders).set({ recoveryMultiId: recovery.id }).where(eq(orders.id, order.id));
  return deliverMulti({
    order,
    multi: recovery,
    kind: "RECOVERY",
    actor,
    intro: "আপনার Recovery অনুমোদিত হয়েছে ✅ আপনার Recovery Multi নিচে দেওয়া হলো।",
  });
}

/** Compact order context handed to the AI engine (database-grounded facts only). */
export async function getOrderContext(userId: number) {
  const order = await getLatestOpenOrder(userId);
  if (!order) return null;

  const [pendingMain, latestClaim] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(payments)
      .where(
        and(eq(payments.orderId, order.id), eq(payments.kind, "MAIN"), ne(payments.status, "REJECTED")),
      ),
    db
      .select({ status: claims.status })
      .from(claims)
      .where(eq(claims.orderId, order.id))
      .orderBy(desc(claims.createdAt))
      .limit(1),
  ]);

  return {
    id: order.id,
    code: order.orderCode,
    status: order.status,
    mainPaymentStatus: order.mainPaymentStatus,
    sourcePaymentStatus: order.sourcePaymentStatus,
    priceAmount: order.priceAmount,
    sourceCommissionAmount: order.sourceCommissionAmount,
    hasMainSubmission: (pendingMain[0]?.c ?? 0) > 0,
    multiId: order.multiId,
    delivered: Boolean(order.deliveredAt),
    claimStatus: latestClaim[0]?.status ?? null,
  };
}

export type OrderContext = Awaited<ReturnType<typeof getOrderContext>>;
