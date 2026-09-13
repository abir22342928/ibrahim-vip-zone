import { redirect } from "next/navigation";
import { ensureSeeded } from "@/db/seed";
import { getCurrentUser } from "@/lib/auth";
import { getPublicSettings } from "@/lib/settings";
import AccountView from "@/components/AccountView";
import SiteHeader from "@/components/SiteHeader";
import ChatWidget from "@/components/ChatWidget";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  await ensureSeeded();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const settings = await getPublicSettings();

  return (
    <div className="min-h-screen pb-24">
      <SiteHeader brandName={settings.brandName} user={{ id: user.id, name: user.name, role: user.role }} />
      <AccountView
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        }}
      />
      <ChatWidget aiName={settings.aiName} />
    </div>
  );
}
