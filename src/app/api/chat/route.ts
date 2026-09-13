import { db } from "@/db";
import { messages } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureSeeded } from "@/db/seed";
import { getCurrentUser } from "@/lib/auth";
import { addMessage, getOrCreateConversation, listMessages, markCustomerRead } from "@/lib/chat";
import { getMultiState } from "@/lib/multi";
import { getOrderContext } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { handlePaymentFlowMessage } from "@/lib/payment-flow";
import {
  canUseLlm,
  composeReply,
  tryLlmReply,
  type AiContext,
  type Intent,
  type LlmHistoryItem,
} from "@/lib/ai";
import { assertSameOrigin, clientKey, fail, ok, rateLimit, readJson, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const user = await getCurrentUser();
  const settings = await getSettings();
  if (!user) {
    return ok({
      guest: true,
      aiName: settings.ai_name,
      messages: [
        {
          id: 0,
          senderType: "ai",
          senderName: settings.ai_name,
          body: settings.ai_welcome,
          attachmentUrl: null,
          attachmentLabel: null,
          orderId: null,
          createdAt: new Date().toISOString(),
        },
      ],
      order: null,
    });
  }

  const conversationId = await getOrCreateConversation(user.id);
  const history = await listMessages(conversationId);
  if (history.length === 0) {
    await addMessage({
      userId: user.id,
      conversationId,
      senderType: "ai",
      senderName: settings.ai_name,
      body: settings.ai_welcome,
    });
  }
  await markCustomerRead(conversationId);
  const order = await getOrderContext(user.id);
  return ok({
    guest: false,
    aiName: settings.ai_name,
    messages: history.length === 0 ? await listMessages(conversationId) : history,
    order,
  });
}

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  if (!rateLimit(clientKey(req, "chat"), 40, 60_000)) return fail("একটু ধীরে মেসেজ পাঠান।", 429);
  await ensureSeeded();

  const body = await readJson<{ message?: string }>(req);
  const text = str(body?.message, 1500);
  if (!text) return fail("মেসেজ লিখুন।");

  const user = await getCurrentUser();
  const settings = await getSettings();
  const multiState = await getMultiState();
  const order = user ? await getOrderContext(user.id) : null;

  let lastIntent: Intent | null = null;
  let conversationId: number | null = null;
  let llmHistory: LlmHistoryItem[] = [];

  if (user) {
    conversationId = await getOrCreateConversation(user.id);

    // Record the customer's message first so it is never lost in history.
    await addMessage({
      userId: user.id,
      conversationId,
      senderType: "customer",
      senderName: user.name,
      body: text,
      orderId: order?.id ?? null,
    });

    // Guided payment flow: if the customer is mid-collection (screenshot already
    // uploaded), interpret the message as TrxID / sender number.
    const flow = await handlePaymentFlowMessage(user, text);
    if (flow.handled) {
      const all = await listMessages(conversationId);
      return ok({
        guest: false,
        messages: all,
        actions: [],
        order: await getOrderContext(user.id),
      });
    }

    const recent = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(16);

    const lastAi = recent.find((m) => m.senderType === "ai" && m.meta && "intent" in (m.meta ?? {}));
    lastIntent = (lastAi?.meta?.intent as Intent | undefined) ?? null;

    // Chronological conversation history for the LLM (never exposed client-side).
    llmHistory = [...recent]
      .reverse()
      .filter((m) => m.senderType === "customer" || m.senderType === "ai")
      .map((m) => ({
        role: (m.senderType === "customer" ? "user" : "assistant") as "user" | "assistant",
        content: m.body,
      }))
      .slice(-12);
  }

  const ctx: AiContext = {
    settings,
    multiState,
    order,
    userName: user?.name?.split(" ")[0] ?? "",
    isLoggedIn: Boolean(user),
    lastIntent,
  };

  const rule = composeReply(text, ctx);

  // Use OpenAI for natural, conversational intents when configured. The rule
  // engine remains authoritative for critical business answers and always
  // supplies the structured actions/attachments.
  let finalBody = rule.body;
  if (canUseLlm(rule.intent)) {
    const llm = await tryLlmReply(text, ctx, llmHistory);
    if (llm) finalBody = llm;
  }

  if (!user || !conversationId) {
    return ok({
      guest: true,
      reply: {
        id: Date.now(),
        senderType: "ai",
        senderName: settings.ai_name,
        body: `${finalBody}\n\n(চ্যাট হিস্ট্রি ও অর্ডার সেভ রাখতে লগইন করুন।)`,
        attachmentUrl: rule.attachFileId ? `/api/files/${rule.attachFileId}` : null,
        attachmentLabel: rule.attachLabel ?? null,
        orderId: null,
        createdAt: new Date().toISOString(),
      },
      actions: rule.actions ?? [],
    });
  }

  await addMessage({
    userId: user.id,
    conversationId,
    senderType: "ai",
    senderName: settings.ai_name,
    body: finalBody,
    attachmentFileId: rule.attachFileId ?? null,
    attachmentLabel: rule.attachLabel ?? null,
    orderId: order?.id ?? null,
    meta: { intent: rule.intent },
  });

  const all = await listMessages(conversationId);
  return ok({
    guest: false,
    messages: all,
    actions: rule.actions ?? [],
    order: await getOrderContext(user.id),
  });
}
