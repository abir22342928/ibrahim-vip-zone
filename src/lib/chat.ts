import { db } from "@/db";
import { conversations, messages, type SenderType } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";

export async function getOrCreateConversation(userId: number): Promise<number> {
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [row] = await db
    .insert(conversations)
    .values({ userId })
    .onConflictDoNothing()
    .returning({ id: conversations.id });
  if (row) return row.id;

  const again = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .limit(1);
  return again[0].id;
}

export type NewMessage = {
  userId: number;
  conversationId?: number;
  senderType: SenderType;
  senderName?: string | null;
  body: string;
  attachmentFileId?: number | null;
  attachmentLabel?: string | null;
  orderId?: number | null;
  meta?: Record<string, unknown> | null;
};

export async function addMessage(input: NewMessage) {
  const conversationId = input.conversationId ?? (await getOrCreateConversation(input.userId));
  const [row] = await db
    .insert(messages)
    .values({
      conversationId,
      userId: input.userId,
      senderType: input.senderType,
      senderName: input.senderName ?? null,
      body: input.body,
      attachmentFileId: input.attachmentFileId ?? null,
      attachmentLabel: input.attachmentLabel ?? null,
      orderId: input.orderId ?? null,
      meta: input.meta ?? null,
    })
    .returning();

  const preview = input.body.slice(0, 140);
  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
      unreadForAdmin:
        input.senderType === "customer"
          ? sql`${conversations.unreadForAdmin} + 1`
          : conversations.unreadForAdmin,
      unreadForCustomer:
        input.senderType === "admin" || input.senderType === "system"
          ? sql`${conversations.unreadForCustomer} + 1`
          : conversations.unreadForCustomer,
    })
    .where(eq(conversations.id, conversationId));

  return row;
}

export type ChatMessageDTO = {
  id: number;
  senderType: SenderType;
  senderName: string | null;
  body: string;
  attachmentUrl: string | null;
  attachmentLabel: string | null;
  orderId: number | null;
  createdAt: string;
};

export async function listMessages(conversationId: number): Promise<ChatMessageDTO[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id));

  return rows.map((m) => ({
    id: m.id,
    senderType: m.senderType,
    senderName: m.senderName,
    body: m.body,
    attachmentUrl: m.attachmentFileId ? `/api/files/${m.attachmentFileId}` : null,
    attachmentLabel: m.attachmentLabel,
    orderId: m.orderId,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function markCustomerRead(conversationId: number) {
  await db
    .update(conversations)
    .set({ unreadForCustomer: 0 })
    .where(eq(conversations.id, conversationId));
}

export async function markAdminRead(conversationId: number) {
  await db.update(conversations).set({ unreadForAdmin: 0 }).where(eq(conversations.id, conversationId));
}
