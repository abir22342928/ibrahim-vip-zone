import { ensureSeeded } from "@/db/seed";
import { getMultiState } from "@/lib/multi";
import { getPublicSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth";
import { ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const [state, settings, user] = await Promise.all([
    getMultiState(),
    getPublicSettings(),
    getCurrentUser(),
  ]);
  return ok({
    state,
    settings: {
      brandName: settings.brandName,
      brandTagline: settings.brandTagline,
      heroHeadline: settings.heroHeadline,
      heroSubline: settings.heroSubline,
      currency: settings.currency,
      telegramUsername: settings.telegramUsername,
      telegramLink: settings.telegramLink,
      supportHours: settings.supportHours,
      aiName: settings.aiName,
      refundPolicy: settings.refundPolicy,
      recoveryPolicy: settings.recoveryPolicy,
    },
    user: user ? { id: user.id, name: user.name, role: user.role } : null,
  });
}
