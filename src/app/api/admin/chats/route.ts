import { db } from "@/db";
import { conversations, users } from "@/db/schema";
import { desc, eq, ilike, or } from "drizzle-orm";
import { guarded, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { addMessage, getOrCreateConversation, listMessages, markAdminRead } from "@/lib/chat";
import { saveDataUrl } from "@/lib/files";
import { getSettings } from "@/lib/settings";
import { getMultiState } from "@/lib/multi";
import { getOrderContext } from "@/lib/orders";
import { canUseLlm, composeReply, tryLlmReply, type AiContext } from "@/lib/ai";
import { assertSameOrigin, fail, int, ok, readJson, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return guarded(async () => {
    await requireAdmin();
    const url = new URL(req.url);
    const userId = int(url.searchParams.get("userId"), 0);
    const search = str(url.searchParams.get("search"), 80);

    if (userId) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return fail("Customer not found", 404);
      const conversationId = await getOrCreateConversation(userId);
      await markAdminRead(conversationId);
      const msgs = await listMessages(conversationId);
      const order = await getOrderContext(userId);
      return ok({
        customer: { id: user.id, name: user.name, email: user.email, phone: user.phone },
        conversationId,
        messages: msgs,
        order,
      });
    }

    const rows = await db
      .select({
        conversationId: conversations.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        lastMessageAt: conversations.lastMessageAt,
        lastMessagePreview: conversations.lastMessagePreview,
        unreadForAdmin: conversations.unreadForAdmin,
      })
      .from(conversations)
      .innerJoin(users, eq(users.id, conversations.userId))
      .where(search ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`)) : undefined)
      .orderBy(desc(conversations.lastMessageAt))
      .limit(150);

    return ok({
      conversations: rows.map((r) => ({ ...r, lastMessageAt: r.lastMessageAt.toISOString() })),
    });
  });
}

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const admin = await requireAdmin();
    const body = await readJson<{
      userId?: number;
      body?: string;
      mode?: string;
      attachment?: string;
    }>(req);
    const userId = int(body?.userId, 0);
    const text = str(body?.body, 3000);
    const mode = str(body?.mode, 10).toLowerCase() === "ai" ? "ai" : "admin";
    if (!userId) return fail("Customer required");
    if (!text && !body?.attachment) return fail("মেসেজ লিখুন।");

    const s = await getSettings();
    const conversationId = await getOrCreateConversation(userId);

    let attachmentFileId: number | null = null;
    if (typeof body?.attachment === "string" && body.attachment.startsWith("data:")) {
      const saved = await saveDataUrl({
        dataUrl: body.attachment,
        filename: `admin-attach-${Date.now()}.img`,
        visibility: "private",
        ownerUserId: userId,
        uploadedBy: admin.id,
      });
      if (!saved.ok) return fail(saved.error);
      attachmentFileId = saved.fileId;
    }

    let finalBody = text;
    let attachmentFileIdForReply: number | null = null;
    let attachmentLabelForReply: string | null = null;
    if (mode === "ai") {
      const multiState = await getMultiState();
      const order = await getOrderContext(userId);
      const ctx: AiContext = {
        settings: s,
        multiState,
        order,
        userName: "",
        isLoggedIn: true,
        lastIntent: null,
      };
      const reply = composeReply(text, ctx);
      finalBody = reply.body;
      attachmentFileIdForReply = reply.attachFileId ?? null;
      attachmentLabelForReply = reply.attachLabel ?? null;
      if (canUseLlm(reply.intent)) {
        const llm = await tryLlmReply(text, ctx, []);
        if (llm) finalBody = llm;
      }
    }

    await addMessage({
      userId,
      conversationId,
      senderType: mode === "ai" ? "ai" : "admin",
      senderName: mode === "ai" ? s.ai_name : `${admin.name} (Support)`,
      body: finalBody,
      attachmentFileId: attachmentFileIdForReply ?? attachmentFileId,
      attachmentLabel: attachmentFileIdForReply ? attachmentLabelForReply : attachmentFileId ? "Attachment" : null,
      meta: mode === "ai" ? { intent: "admin-ai" } : null,
    });

    await logAudit(admin, "ADMIN_MESSAGE_SENT", {
      targetType: "user",
      targetId: userId,
      detail: finalBody.slice(0, 160),
      meta: { mode },
    });

    const msgs = await listMessages(conversationId);
    return ok({ messages: msgs });
  });
}
