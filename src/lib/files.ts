import { db } from "@/db";
import { deliveries, files, multis, type FileVisibility } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth";

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export type UploadInput = {
  dataUrl: string;
  filename?: string;
  visibility: FileVisibility;
  ownerUserId?: number | null;
  uploadedBy?: number | null;
};

export type UploadResult =
  | { ok: true; fileId: number; mimeType: string; size: number }
  | { ok: false; error: string };

/** Validates + stores an image inside the database (no public URL or direct path is ever exposed). */
export async function saveDataUrl(input: UploadInput): Promise<UploadResult> {
  const raw = (input.dataUrl ?? "").trim();
  if (!raw) {
    return { ok: false, error: "অনুগ্রহ করে Protected Multi Image নির্বাচন করুন।" };
  }

  let mimeType = "image/jpeg";
  let base64 = "";

  const commaIdx = raw.indexOf(",");
  if (raw.startsWith("data:") && commaIdx !== -1) {
    const meta = raw.slice(5, commaIdx).toLowerCase();
    base64 = raw.slice(commaIdx + 1).replace(/\s/g, "");
    const semiIdx = meta.indexOf(";");
    mimeType = (semiIdx !== -1 ? meta.slice(0, semiIdx) : meta).trim();
  } else {
    base64 = raw.replace(/\s/g, "");
  }

  if (base64.length < 64) {
    return { ok: false, error: "অনুগ্রহ করে Protected Multi Image নির্বাচন করুন।" };
  }

  const head = Buffer.from(base64.slice(0, 64), "base64");
  if (head.length < 8) {
    return { ok: false, error: "অনুগ্রহ করে Protected Multi Image নির্বাচন করুন।" };
  }

  // Detect image type from magic bytes so format is accurate
  const isJpg = head[0] === 0xff && head[1] === 0xd8;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isGif = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46;
  const isWebp =
    head.length >= 12 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50;

  if (!isJpg && !isPng && !isGif && !isWebp) {
    return { ok: false, error: "অনুগ্রহ করে Protected Multi Image নির্বাচন করুন (শুধুমাত্র JPG, PNG, WEBP বা GIF)।" };
  }

  if (isJpg) mimeType = "image/jpeg";
  else if (isPng) mimeType = "image/png";
  else if (isGif) mimeType = "image/gif";
  else if (isWebp) mimeType = "image/webp";

  const size = Math.floor((base64.length * 3) / 4);
  if (size > MAX_FILE_BYTES) {
    return { ok: false, error: "ছবির সাইজ অনেক বড় (সর্বোচ্চ ১০MB)। অনুগ্রহ করে ছোট ছবি দিন।" };
  }

  const safeName = (input.filename ?? "upload")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);

  const [row] = await db
    .insert(files)
    .values({
      filename: safeName || "upload",
      mimeType,
      size,
      data: base64,
      visibility: input.visibility,
      ownerUserId: input.ownerUserId ?? null,
      uploadedBy: input.uploadedBy ?? null,
    })
    .returning({ id: files.id });

  return { ok: true, fileId: row.id, mimeType, size };
}

export async function saveBufferFile(params: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  visibility: FileVisibility;
}): Promise<number> {
  const [row] = await db
    .insert(files)
    .values({
      filename: params.filename,
      mimeType: params.mimeType,
      size: params.buffer.length,
      data: params.buffer.toString("base64"),
      visibility: params.visibility,
    })
    .returning({ id: files.id });
  return row.id;
}

/**
 * Server-side authorization for a stored file.
 * - public  : anyone
 * - private : owner or admin (payment screenshots, loss proofs)
 * - vault   : admin only, OR a customer who owns a delivery grant for the Multi
 *             that references this exact protected file.
 */
export async function canAccessFile(
  fileId: number,
  user: SessionUser | null,
): Promise<{ allowed: boolean; file?: typeof files.$inferSelect }> {
  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file) return { allowed: false };

  if (file.visibility === "public") return { allowed: true, file };
  if (!user) return { allowed: false };
  if (user.role === "admin") return { allowed: true, file };

  if (file.visibility === "private") {
    return { allowed: file.ownerUserId === user.id, file };
  }

  // vault
  const grants = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .innerJoin(multis, eq(multis.id, deliveries.multiId))
    .where(
      and(
        eq(deliveries.userId, user.id),
        or(eq(multis.protectedImageFileId, fileId), eq(multis.publicImageFileId, fileId)),
      ),
    )
    .limit(1);
  return { allowed: grants.length > 0, file };
}
