import { guarded, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { SETTING_DEFAULTS, getSettings, setSettings } from "@/lib/settings";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return guarded(async () => {
    await requireAdmin();
    const settings = await getSettings();
    return ok({ settings, keys: Object.keys(SETTING_DEFAULTS) });
  });
}

export async function PUT(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  return guarded(async () => {
    const admin = await requireAdmin();
    const body = await readJson<{ values?: Record<string, string> }>(req);
    const values = body?.values;
    if (!values || typeof values !== "object") return fail("No settings provided");

    const allowed = new Set(Object.keys(SETTING_DEFAULTS));
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (!allowed.has(key)) continue;
      if (typeof value !== "string") continue;
      clean[key] = value.slice(0, 4000);
    }
    if (Object.keys(clean).length === 0) return fail("No valid settings provided");

    // Guard numeric settings
    for (const key of ["price_original", "price_discount", "source_commission"]) {
      if (clean[key] !== undefined) {
        const n = Number.parseInt(clean[key].replace(/[^\d]/g, ""), 10);
        if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return fail(`Invalid value for ${key}`);
        clean[key] = String(n);
      }
    }
    for (const key of ["daily_start_time", "daily_expiry_time"]) {
      if (clean[key] !== undefined && !/^\d{1,2}:\d{2}$/.test(clean[key])) {
        return fail(`${key} must be in HH:mm format`);
      }
    }

    await setSettings(clean, admin.id);
    await logAudit(admin, "SETTINGS_UPDATED", {
      targetType: "settings",
      detail: Object.keys(clean).join(", "),
    });
    return ok({ settings: await getSettings() });
  });
}
