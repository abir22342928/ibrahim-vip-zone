import { cookies } from "next/headers";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = "fm_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const derived = await scrypt(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export async function createSession(userId: number, userAgent?: string | null) {
  const id = newToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.insert(sessions).values({ id, userId, userAgent: userAgent ?? null, expiresAt });
  const jar = await cookies();
  // The session cookie's `Secure` flag must be true over HTTPS. Honor the
  // configured COOKIE_SECURE env var (production), with the NODE_ENV check as
  // a fallback so nothing regresses.
  const secure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
  return id;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token));
    jar.delete(SESSION_COOKIE);
  }
}

export type SessionUser = Pick<
  User,
  "id" | "name" | "email" | "phone" | "role" | "isBlocked" | "createdAt" | "lastLoginAt"
>;

export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        isBlocked: users.isBlocked,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date())))
      .limit(1);
    const user = rows[0];
    if (!user || user.isBlocked) return null;
    return user;
  } catch (error) {
    // Never let a transient DB error take down the whole page. Treat it as
    // unauthenticated so the caller can redirect gracefully.
    console.error("[auth] getCurrentUser failed", error);
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Authentication required", 401);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Authentication required", 401);
  if (user.role !== "admin") throw new AuthError("Admin access required", 403);
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/** Wrap a route handler body: converts AuthError into a proper HTTP response. */
export async function guarded(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[api-error]", error);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
