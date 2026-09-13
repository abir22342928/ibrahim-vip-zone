import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeeded } from "@/db/seed";
import { createSession, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { assertSameOrigin, clientKey, fail, ok, rateLimit, readJson, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  if (!rateLimit(clientKey(req, "login"), 12, 60_000)) return fail("অনেকবার চেষ্টা হয়েছে, একটু পরে আবার করুন।", 429);
  await ensureSeeded();

  const body = await readJson<{ email?: string; password?: string }>(req);
  if (!body) return fail("Invalid request");
  const email = str(body.email, 160).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return fail("ইমেইল ও পাসওয়ার্ড দিন।");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return fail("ইমেইল বা পাসওয়ার্ড ভুল।", 401);
  if (user.isBlocked) return fail("আপনার অ্যাকাউন্টটি ব্লক করা হয়েছে। সাপোর্টে যোগাযোগ করুন।", 403);

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return fail("ইমেইল বা পাসওয়ার্ড ভুল।", 401);

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id, req.headers.get("user-agent"));

  if (user.role === "admin") {
    await logAudit(
      { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, isBlocked: user.isBlocked, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt },
      "ADMIN_LOGIN",
      { targetType: "user", targetId: user.id, detail: "Admin signed in" },
    );
  }

  return ok({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}
