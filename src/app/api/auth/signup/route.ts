import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeeded } from "@/db/seed";
import { createSession, hashPassword } from "@/lib/auth";
import { addMessage, getOrCreateConversation } from "@/lib/chat";
import { getSettings } from "@/lib/settings";
import { assertSameOrigin, clientKey, fail, isEmail, ok, rateLimit, readJson, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  if (!rateLimit(clientKey(req, "signup"), 8, 60_000)) return fail("অনেকবার চেষ্টা হয়েছে, একটু পরে আবার করুন।", 429);
  await ensureSeeded();

  const body = await readJson<{ name?: string; email?: string; phone?: string; password?: string }>(req);
  if (!body) return fail("Invalid request");

  const name = str(body.name, 80);
  const email = str(body.email, 160).toLowerCase();
  const phone = str(body.phone, 30);
  const password = typeof body.password === "string" ? body.password : "";

  if (name.length < 2) return fail("আপনার নাম লিখুন (কমপক্ষে ২ অক্ষর)।");
  if (!isEmail(email)) return fail("সঠিক ইমেইল দিন।");
  if (password.length < 6) return fail("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
  if (phone && !/^[0-9+\-\s]{6,20}$/.test(phone)) return fail("সঠিক ফোন নাম্বার দিন।");

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return fail("এই ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে। লগইন করুন।");

  const [user] = await db
    .insert(users)
    .values({
      name,
      email,
      phone: phone || null,
      passwordHash: await hashPassword(password),
      role: "customer",
      lastLoginAt: new Date(),
    })
    .returning();

  const settings = await getSettings();
  const conversationId = await getOrCreateConversation(user.id);
  await addMessage({
    userId: user.id,
    conversationId,
    senderType: "ai",
    senderName: settings.ai_name,
    body: settings.ai_welcome,
  });

  await createSession(user.id, req.headers.get("user-agent"));
  return ok({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}
