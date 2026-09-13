import { getCurrentUser } from "@/lib/auth";
import { canAccessFile } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every stored asset (payment proofs, vault multis, previews) is served through
 * this authorization gate. There is no publicly reachable storage path.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const fileId = Number.parseInt(id, 10);
  if (!Number.isFinite(fileId)) return new Response("Not found", { status: 404 });

  const user = await getCurrentUser();
  const { allowed, file } = await canAccessFile(fileId, user);
  if (!file) return new Response("Not found", { status: 404 });
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const bytes = Buffer.from(file.data, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": file.mimeType,
      "content-length": String(bytes.length),
      "cache-control":
        file.visibility === "public" ? "public, max-age=300" : "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "content-disposition": `inline; filename="${file.filename}"`,
    },
  });
}
