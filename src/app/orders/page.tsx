import { redirect } from "next/navigation";
import { ensureSeeded } from "@/db/seed";
import { getCurrentUser } from "@/lib/auth";
import { getPublicSettings } from "@/lib/settings";
import OrdersView from "@/components/OrdersView";
import SiteHeader from "@/components/SiteHeader";
import ChatWidget from "@/components/ChatWidget";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  await ensureSeeded();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/orders");
  const settings = await getPublicSettings();

  return (
    <div className="min-h-screen pb-24">
      <SiteHeader
        brandName={settings.brandName}
        user={{ id: user.id, name: user.name, role: user.role }}
      />
      <OrdersView />
      <ChatWidget aiName={settings.aiName} />
    </div>
  );
}
