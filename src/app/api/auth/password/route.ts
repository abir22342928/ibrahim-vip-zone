import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { hashPassword, newToken, verifyPassword, getCurrentUser } from "@/lib/auth";
import { assertSameOrigin, clientKey, fail, ok, rateLimit, readJson, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Request a reset token. */
export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  if (!rateLimit(clientKey(req, "forgot"), 6, 60_000)) return fail("একটু পরে আবার চেষ্টা করুন।", 429);

  const body = await readJson<{ email?: string }>(req);
  const email = str(body?.email, 160).toLowerCase();
  if (!email) return fail("ইমেইল দিন।");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    // Do not leak account existence.
    return ok({ message: "যদি এই ইমেইলে অ্যাকাউন্ট থাকে, রিসেট কোড তৈরি হয়েছে।" });
  }

  const token = newToken(16);
  await db
    .update(users)
    .set({ resetToken: token, resetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000) })
    .where(eq(users.id, user.id));

  // No mail provider is configured in this environment, so the token is returned
  // directly to the requester (and is single-use + expires in 30 minutes).
  return ok({
    message: "রিসেট কোড তৈরি হয়েছে। নিচের কোড দিয়ে নতুন পাসওয়ার্ড সেট করুন।",
    resetToken: token,
  });
}

/** Reset with token, or change password while logged in. */
export async function PUT(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  if (!rateLimit(clientKey(req, "reset"), 10, 60_000)) return fail("একটু পরে আবার চেষ্টা করুন।", 429);

  const body = await readJson<{ token?: string; password?: string; currentPassword?: string }>(req);
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 6) return fail("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");

  const token = str(body?.token, 80);
  if (token) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.resetToken, token), gt(users.resetTokenExpiresAt, new Date())))
      .limit(1);
    if (!user) return fail("রিসেট কোডটি ভুল বা মেয়াদোত্তীর্ণ।", 400);
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password), resetToken: null, resetTokenExpiresAt: null })
      .where(eq(users.id, user.id));
    await db.delete(sessions).where(eq(sessions.userId, user.id));
    return ok({ message: "পাসওয়ার্ড পরিবর্তন হয়েছে। এখন লগইন করুন।" });
  }

  const current = await getCurrentUser();
  if (!current) return fail("Authentication required", 401);
  const [user] = await db.select().from(users).where(eq(users.id, current.id)).limit(1);
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return fail("বর্তমান পাসওয়ার্ড ভুল।", 400);
  }
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
  return ok({ message: "পাসওয়ার্ড আপডেট হয়েছে।" });
}
