import { ensureSeeded } from "@/db/seed";
import { getCurrentUser } from "@/lib/auth";
import { getPublicSettings } from "@/lib/settings";
import ChatPanel from "@/components/ChatPanel";
import SiteHeader from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  await ensureSeeded();
  const [user, settings] = await Promise.all([getCurrentUser(), getPublicSettings()]);

  return (
    <div className="flex h-screen flex-col">
      <SiteHeader brandName={settings.brandName} user={user ? { id: user.id, name: user.name, role: user.role } : null} />
      <div className="mx-auto flex w-full max-w-3xl flex-1 overflow-hidden p-0 sm:p-4">
        <div className="card flex w-full flex-col overflow-hidden sm:rounded-3xl">
          <ChatPanel variant="page" />
        </div>
      </div>
    </div>
  );
}
