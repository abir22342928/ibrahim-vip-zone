import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { files, multis, settings, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { SETTING_DEFAULTS, invalidateSettingsCache } from "@/lib/settings";
import { resolveWindow } from "@/lib/format";

const globalSeed = globalThis as typeof globalThis & { __fmSeedPromise?: Promise<void> };

async function readImage(relPath: string): Promise<{ base64: string; size: number } | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), relPath));
    return { base64: buf.toString("base64"), size: buf.length };
  } catch {
    return null;
  }
}

async function doSeed() {
  // Settings defaults
  const existing = await db.select({ key: settings.key }).from(settings);
  const known = new Set(existing.map((r) => r.key));
  const missing = Object.entries(SETTING_DEFAULTS).filter(([key]) => !known.has(key));
  if (missing.length > 0) {
    await db
      .insert(settings)
      .values(missing.map(([key, value]) => ({ key, value })))
      .onConflictDoNothing();
    invalidateSettingsCache();
  }

  // Admin account (credentials come from environment variables)
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@ibrahimvipzone.com").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@12345";
  const adminName = (process.env.ADMIN_NAME || "Ibrahim (Admin)").trim();
  const adminPhone = (process.env.ADMIN_PHONE || "").trim() || null;
  const adminRows = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  if (adminRows.length === 0) {
    await db.insert(users).values({
      name: adminName,
      email: adminEmail,
      phone: adminPhone,
      passwordHash: await hashPassword(adminPassword),
      role: "admin",
    });
  }

  // Demo customer so the flow can be tested end to end
  const demoEmail = "customer@demo.com";
  const demoRows = await db.select({ id: users.id }).from(users).where(eq(users.email, demoEmail)).limit(1);
  if (demoRows.length === 0) {
    await db.insert(users).values({
      name: "Demo Customer",
      email: demoEmail,
      phone: "01700000000",
      passwordHash: await hashPassword("Customer@123"),
      role: "customer",
    });
  }

  // Today's Multi (public preview + protected vault content)
  const activeDaily = await db
    .select({ id: multis.id })
    .from(multis)
    .where(and(eq(multis.kind, "daily"), eq(multis.status, "active")))
    .limit(1);

  if (activeDaily.length === 0) {
    const preview = await readImage("public/images/multi-preview.jpg");
    const vault = await readImage("assets/seed/vault-multi.jpg");

    let publicFileId: number | null = null;
    let vaultFileId: number | null = null;

    if (preview) {
      const [row] = await db
        .insert(files)
        .values({
          filename: "today-multi-preview.jpg",
          mimeType: "image/jpeg",
          size: preview.size,
          data: preview.base64,
          visibility: "public",
        })
        .returning({ id: files.id });
      publicFileId = row.id;
    }
    if (vault) {
      const [row] = await db
        .insert(files)
        .values({
          filename: "protected-multi.jpg",
          mimeType: "image/jpeg",
          size: vault.size,
          data: vault.base64,
          visibility: "vault",
        })
        .returning({ id: files.id });
      vaultFileId = row.id;
    }

    const window = resolveWindow(
      SETTING_DEFAULTS.daily_start_time,
      SETTING_DEFAULTS.daily_expiry_time,
      new Date(),
      SETTING_DEFAULTS.timezone,
    );

    await db.insert(multis).values({
      kind: "daily",
      title: "Today's Premium Football Multi",
      publicNote: "৪ ম্যাচের বাছাই করা প্রিমিয়াম মাল্টি — সীমিত সময়ের অফার।",
      publicImageFileId: publicFileId,
      publicImagePath: publicFileId ? null : "/images/multi-preview.jpg",
      protectedImageFileId: vaultFileId,
      protectedDescription:
        "🔒 PROTECTED MULTI\n\n১) Match A — Over 1.5 Goals\n২) Match B — Home Win\n৩) Match C — Both Teams To Score\n৪) Match D — Draw No Bet\n\nTotal Odds: 6.40\nStake পরামর্শ: আপনার ব্যাংকরোলের সর্বোচ্চ ৫%।\n\n⚠️ এই কনটেন্ট শুধুমাত্র আপনার অ্যাকাউন্টের জন্য। শেয়ার করা নিষেধ।",
      status: "active",
      isAvailable: true,
      publishAt: window.start,
      expiresAt: window.end,
      // Prices stay null so the admin Pricing Settings stay authoritative.
      priceOriginal: null,
      priceDiscount: null,
    });
  }

  // Recovery multi (used when admin approves a recovery claim)
  const activeRecovery = await db
    .select({ id: multis.id })
    .from(multis)
    .where(and(eq(multis.kind, "recovery"), eq(multis.status, "active")))
    .limit(1);
  if (activeRecovery.length === 0) {
    const vault = await readImage("assets/seed/vault-multi.jpg");
    let vaultFileId: number | null = null;
    if (vault) {
      const [row] = await db
        .insert(files)
        .values({
          filename: "recovery-multi.jpg",
          mimeType: "image/jpeg",
          size: vault.size,
          data: vault.base64,
          visibility: "vault",
        })
        .returning({ id: files.id });
      vaultFileId = row.id;
    }
    await db.insert(multis).values({
      kind: "recovery",
      title: "Recovery Multi",
      publicNote: "Recovery অনুমোদিত কাস্টমারদের জন্য।",
      protectedImageFileId: vaultFileId,
      protectedDescription:
        "🔁 RECOVERY MULTI\n\n১) Match R1 — Over 1.5 Goals\n২) Match R2 — Home Win\n\nTotal Odds: 3.10\nএটি আপনার Recovery হিসেবে দেওয়া হয়েছে।",
      status: "active",
      isAvailable: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
  }
}

export async function ensureSeeded(): Promise<void> {
  if (!globalSeed.__fmSeedPromise) {
    globalSeed.__fmSeedPromise = doSeed().catch((error) => {
      console.error("[seed] failed", error);
      globalSeed.__fmSeedPromise = undefined;
    });
  }
  await globalSeed.__fmSeedPromise;
}
