import { db } from "@/db";
import { multis, type Multi, type MultiKind } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getSettings } from "@/lib/settings";
import { resolveWindow } from "@/lib/format";

export async function getActiveMulti(kind: MultiKind = "daily"): Promise<Multi | null> {
  const rows = await db
    .select()
    .from(multis)
    .where(and(eq(multis.kind, kind), eq(multis.status, "active")))
    .orderBy(desc(multis.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export function publicImageUrl(multi: Multi | null): string | null {
  if (!multi) return null;
  if (multi.publicImageFileId) return `/api/files/${multi.publicImageFileId}`;
  if (multi.publicImagePath) return multi.publicImagePath;
  return null;
}

export type MultiState = {
  serverNow: string;
  multi: {
    id: number;
    title: string;
    publicNote: string | null;
    imageUrl: string | null;
    hasProtectedContent: boolean;
  } | null;
  priceOriginal: number;
  priceDiscount: number;
  sourceCommission: number;
  currency: string;
  startsAt: string | null;
  expiresAt: string | null;
  isLive: boolean;
  isBeforeStart: boolean;
  isExpired: boolean;
  availabilityText: string;
  soldOutText: string;
  todayOdds: string | null;
};

/** Authoritative, server-computed availability for today's Multi. */
export async function getMultiState(): Promise<MultiState> {
  const s = await getSettings();
  const multi = await getActiveMulti("daily");
  const now = new Date();

  const fallback = resolveWindow(s.daily_start_time, s.daily_expiry_time, now, s.timezone);
  const start = multi?.publishAt ? new Date(multi.publishAt) : fallback.start;
  const end = multi?.expiresAt ? new Date(multi.expiresAt) : fallback.end;

  const adminAvailable = s.multi_available === "true" && (multi?.isAvailable ?? false);
  const isBeforeStart = now.getTime() < start.getTime();
  const isExpired = now.getTime() >= end.getTime();
  const isLive = Boolean(multi) && adminAvailable && !isBeforeStart && !isExpired;

  const showImage = s.show_public_multi_image === "true";

  return {
    serverNow: now.toISOString(),
    multi: multi
      ? {
          id: multi.id,
          title: multi.title,
          publicNote: multi.publicNote,
          imageUrl: showImage ? publicImageUrl(multi) : null,
          hasProtectedContent: Boolean(multi.protectedImageFileId || multi.protectedDescription),
        }
      : null,
    priceOriginal: multi?.priceOriginal ?? (Number.parseInt(s.price_original, 10) || 0),
    priceDiscount: multi?.priceDiscount ?? (Number.parseInt(s.price_discount, 10) || 0),
    sourceCommission: Number.parseInt(s.source_commission, 10) || 0,
    currency: s.currency_symbol,
    startsAt: start.toISOString(),
    expiresAt: end.toISOString(),
    isLive,
    isBeforeStart,
    isExpired,
    availabilityText: adminAvailable ? "AVAILABLE" : "PAUSED",
    soldOutText: s.sold_out_text,
    todayOdds: s.today_odds?.trim() || null,
  };
}
