import { db } from "@/db";
import { deliveries, files, multis, type MultiKind } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { guarded, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { saveDataUrl } from "@/lib/files";
import { getSettings } from "@/lib/settings";
import { resolveWindow } from "@/lib/format";
import { assertSameOrigin, fail, int, ok, readJson, str } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MultiPayload = {
  id?: number;
  kind?: string;
  title?: string;
  publicNote?: string;
  protectedDescription?: string;
  publicImage?: string;
  protectedImage?: string;
  publishAt?: string;
  expiresAt?: string;
  priceOriginal?: number;
  priceDiscount?: number;
  odds?: string;
  isAvailable?: boolean;
  publish?: boolean;
  status?: string;
};

export async function GET(req: Request) {
  return guarded(async () => {
    await requireAdmin();
    const url = new URL(req.url);
    const kindParam = str(url.searchParams.get("kind"), 12).toLowerCase();
    const kind: MultiKind = kindParam === "recovery" ? "recovery" : "daily";

    const rows = await db
      .select({
        id: multis.id,
        kind: multis.kind,
        title: multis.title,
        publicNote: multis.publicNote,
        publicImageFileId: multis.publicImageFileId,
        publicImagePath: multis.publicImagePath,
        protectedImageFileId: multis.protectedImageFileId,
        protectedDescription: multis.protectedDescription,
        status: multis.status,
        isAvailable: multis.isAvailable,
        publishAt: multis.publishAt,
        expiresAt: multis.expiresAt,
        priceOriginal: multis.priceOriginal,
        priceDiscount: multis.priceDiscount,
        createdAt: multis.createdAt,
        deliveryCount: sql<number>`(select count(*)::int from ${deliveries} where ${deliveries.multiId} = ${multis.id})`,
      })
      .from(multis)
      .where(eq(multis.kind, kind))
      .orderBy(desc(multis.createdAt))
      .limit(60);

    return ok({
      multis: rows.map((m) => ({
        ...m,
        publicImageUrl: m.publicImageFileId ? `/api/files/${m.publicImageFileId}` : m.publicImagePath,
        protectedImageUrl: m.protectedImageFileId ? `/api/files/${m.protectedImageFileId}` : null,
        publishAt: m.publishAt?.toISOString() ?? null,
        expiresAt: m.expiresAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  });
}

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const admin = await requireAdmin();
    const body = await readJson<MultiPayload>(req);
    if (!body) return fail("Invalid request");

    const kind: MultiKind = str(body.kind, 12).toLowerCase() === "recovery" ? "recovery" : "daily";
    const title = str(body.title, 140) || (kind === "recovery" ? "Recovery Multi" : "Today's Multi");
    const s = await getSettings();

    let publicImageFileId: number | null = null;
    let protectedImageFileId: number | null = null;

    // Resolve public image
    if (typeof body.publicImage === "string" && (body.publicImage.startsWith("data:") || body.publicImage.length > 100)) {
      const saved = await saveDataUrl({
        dataUrl: body.publicImage,
        filename: `multi-public-${Date.now()}.img`,
        visibility: "public",
        uploadedBy: admin.id,
      });
      if (!saved.ok) return fail(saved.error);
      publicImageFileId = saved.fileId;
    } else if (typeof body.publicImage === "string") {
      const m = body.publicImage.match(/\/api\/files\/(\d+)/);
      if (m) publicImageFileId = Number(m[1]);
    }

    // Resolve protected vault image
    if (typeof body.protectedImage === "string" && (body.protectedImage.startsWith("data:") || body.protectedImage.length > 100)) {
      const saved = await saveDataUrl({
        dataUrl: body.protectedImage,
        filename: `multi-vault-${Date.now()}.img`,
        visibility: "vault",
        uploadedBy: admin.id,
      });
      if (!saved.ok) return fail(saved.error);
      protectedImageFileId = saved.fileId;
    } else if (typeof body.protectedImage === "string") {
      const m = body.protectedImage.match(/\/api\/files\/(\d+)/);
      if (m) protectedImageFileId = Number(m[1]);
    }

    // A valid protected image is required for every Multi
    if (!protectedImageFileId) {
      return fail("অনুগ্রহ করে Protected Multi Image নির্বাচন করুন।");
    }

    const fallbackWindow = resolveWindow(s.daily_start_time, s.daily_expiry_time, new Date(), s.timezone);
    const parseSafeDate = (val: unknown): Date | null => {
      if (!val || typeof val !== "string") return null;
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const publishAt = parseSafeDate(body.publishAt) ?? (kind === "daily" ? fallbackWindow.start : null);
    const expiresAt = parseSafeDate(body.expiresAt) ?? (kind === "daily" ? fallbackWindow.end : null);
    const shouldPublish = body.publish !== false;

    if (shouldPublish) {
      await db
        .update(multis)
        .set({ status: "archived", archivedAt: new Date() })
        .where(and(eq(multis.kind, kind), eq(multis.status, "active")));

      if (body.odds && typeof body.odds === "string" && body.odds.trim()) {
        const { setSettings } = await import("@/lib/settings");
        await setSettings({ today_odds: body.odds.trim() }, admin.id);
      }
    }

    const [created] = await db
      .insert(multis)
      .values({
        kind,
        title,
        publicNote: str(body.publicNote, 500) || null,
        publicImageFileId,
        protectedImageFileId,
        protectedDescription: str(body.protectedDescription, 4000) || null,
        status: shouldPublish ? "active" : "draft",
        isAvailable: body.isAvailable !== false,
        publishAt,
        expiresAt,
        priceOriginal: int(body.priceOriginal, 0) || null,
        priceDiscount: int(body.priceDiscount, 0) || null,
        createdBy: admin.id,
      })
      .returning();

    await logAudit(admin, "MULTI_UPLOADED", {
      targetType: "multi",
      targetId: created.id,
      detail: `${kind} · ${title}`,
      meta: { published: shouldPublish },
    });

    return ok({ multi: { id: created.id } });
  });
}

export async function PATCH(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const admin = await requireAdmin();
    const body = await readJson<MultiPayload>(req);
    const id = int(body?.id, 0);
    if (!id) return fail("Multi id required");
    const [existing] = await db.select().from(multis).where(eq(multis.id, id)).limit(1);
    if (!existing) return fail("Multi not found", 404);

    const patch: Record<string, unknown> = {};
    if (typeof body?.title === "string") patch.title = str(body.title, 140);
    if (typeof body?.publicNote === "string") patch.publicNote = str(body.publicNote, 500);
    if (typeof body?.protectedDescription === "string")
      patch.protectedDescription = str(body.protectedDescription, 4000);
    if (typeof body?.isAvailable === "boolean") patch.isAvailable = body.isAvailable;
    const parseSafeDate = (val: unknown): Date | null => {
      if (!val || typeof val !== "string") return null;
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    if (typeof body?.publishAt === "string") {
      const d = parseSafeDate(body.publishAt);
      if (d) patch.publishAt = d;
    }
    if (typeof body?.expiresAt === "string") {
      const d = parseSafeDate(body.expiresAt);
      if (d) patch.expiresAt = d;
    }
    if (typeof body?.priceOriginal === "number") patch.priceOriginal = body.priceOriginal;
    if (typeof body?.priceDiscount === "number") patch.priceDiscount = body.priceDiscount;

    if (typeof body?.protectedImage === "string" && (body.protectedImage.startsWith("data:") || body.protectedImage.length > 100)) {
      const saved = await saveDataUrl({
        dataUrl: body.protectedImage,
        filename: `multi-vault-${Date.now()}.img`,
        visibility: "vault",
        uploadedBy: admin.id,
      });
      if (!saved.ok) return fail(saved.error);
      patch.protectedImageFileId = saved.fileId;
    } else if (typeof body?.protectedImage === "string") {
      const m = body.protectedImage.match(/\/api\/files\/(\d+)/);
      if (m) patch.protectedImageFileId = Number(m[1]);
    }
    if (typeof body?.publicImage === "string" && (body.publicImage.startsWith("data:") || body.publicImage.length > 100)) {
      const saved = await saveDataUrl({
        dataUrl: body.publicImage,
        filename: `multi-public-${Date.now()}.img`,
        visibility: "public",
        uploadedBy: admin.id,
      });
      if (!saved.ok) return fail(saved.error);
      patch.publicImageFileId = saved.fileId;
      patch.publicImagePath = null;
    } else if (typeof body?.publicImage === "string") {
      const m = body.publicImage.match(/\/api\/files\/(\d+)/);
      if (m) {
        patch.publicImageFileId = Number(m[1]);
        patch.publicImagePath = null;
      }
    }

    const status = str(body?.status, 12).toLowerCase();
    if (status === "active") {
      await db
        .update(multis)
        .set({ status: "archived", archivedAt: new Date() })
        .where(and(eq(multis.kind, existing.kind), eq(multis.status, "active")));
      patch.status = "active";
      patch.archivedAt = null;
    } else if (status === "archived") {
      patch.status = "archived";
      patch.archivedAt = new Date();
    } else if (status === "draft") {
      patch.status = "draft";
    }

    await db.update(multis).set(patch).where(eq(multis.id, id));
    await logAudit(admin, "MULTI_UPDATED", { targetType: "multi", targetId: id, meta: patch as Record<string, unknown> });
    return ok();
  });
}

/** Archives a Multi (history is preserved). `purge=1` also destroys the vault image bytes. */
export async function DELETE(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const admin = await requireAdmin();
    const url = new URL(req.url);
    const id = int(url.searchParams.get("id"), 0);
    const purge = url.searchParams.get("purge") === "1";
    if (!id) return fail("Multi id required");

    const [existing] = await db.select().from(multis).where(eq(multis.id, id)).limit(1);
    if (!existing) return fail("Multi not found", 404);

    await db
      .update(multis)
      .set({ status: "archived", isAvailable: false, archivedAt: new Date() })
      .where(eq(multis.id, id));

    if (purge && existing.protectedImageFileId) {
      await db.delete(files).where(eq(files.id, existing.protectedImageFileId));
    }

    await logAudit(admin, purge ? "MULTI_DELETED" : "MULTI_ARCHIVED", {
      targetType: "multi",
      targetId: id,
      detail: existing.title,
    });
    return ok();
  });
}
