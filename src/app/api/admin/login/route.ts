import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeeded } from "@/db/seed";
import { createSession, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  assertSameOrigin,
  clientKey,
  fail,
  ok,
  rateLimit,
  readJson,
  str,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time string comparison (avoids trivial timing attacks). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Dedicated, server-side Admin login.
 *
 * Credentials come from the ADMIN_EMAIL / ADMIN_PASSWORD environment
 * variables (falling back to the seeded defaults). They are NEVER exposed to
 * the browser — this route reads them only on the server.
 */
export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  if (!rateLimit(clientKey(req, "admin-login"), 10, 60_000)) {
    return fail("অনেকবার চেষ্টা হয়েছে, একটু পরে আবার করুন।", 429);
  }

  await ensureSeeded();

  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = str(body?.email, 160).toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return fail("Admin email or password is incorrect.", 401);
  }

  const adminEmail = (process.env.ADMIN_EMAIL || "admin@ibrahimvipzone.com").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@12345";
  const adminName = (process.env.ADMIN_NAME || "Ibrahim (Admin)").trim();
  const adminPhone = (process.env.ADMIN_PHONE || "").trim() || null;

  if (!safeEqual(email, adminEmail) || !safeEqual(password, adminPassword)) {
    return fail("Admin email or password is incorrect.", 401);
  }

  // Keep a single admin row in the database synchronized with the env-var
  // credentials (sessions + audit logs reference the users table). This also
  // migrates the legacy seeded admin email to the configured ADMIN_EMAIL.
  let admin =
    (await db.select().from(users).where(eq(users.email, adminEmail)).limit(1))[0] ??
    (await db.select().from(users).where(eq(users.role, "admin")).limit(1))[0];

  if (admin) {
    await db
      .update(users)
      .set({
        name: adminName,
        email: adminEmail,
        phone: adminPhone,
        passwordHash: await hashPassword(adminPassword),
        role: "admin",
      })
      .where(eq(users.id, admin.id))
      .catch(() => undefined);
    admin = (await db.select().from(users).where(eq(users.id, admin.id)).limit(1))[0];
  } else {
    admin = (
      await db
        .insert(users)
        .values({
          name: adminName,
          email: adminEmail,
          phone: adminPhone,
          passwordHash: await hashPassword(adminPassword),
          role: "admin",
          lastLoginAt: new Date(),
        })
        .returning()
    )[0];
  }

  if (!admin) {
    return fail("Unable to create Admin session. Please try again.", 500);
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, admin.id));
  await createSession(admin.id, req.headers.get("user-agent"));

  await logAudit(
    {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      phone: admin.phone,
      role: admin.role,
      isBlocked: admin.isBlocked,
      createdAt: admin.createdAt,
      lastLoginAt: admin.lastLoginAt,
    },
    "ADMIN_LOGIN",
    { targetType: "user", targetId: admin.id, detail: "Admin signed in" },
  );

  return ok({ user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
}
