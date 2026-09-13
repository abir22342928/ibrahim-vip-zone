import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ensureSeeded } from "@/db/seed";
import { getCurrentUser } from "@/lib/auth";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  await ensureSeeded();
  const user = await getCurrentUser();
  // Server-side authorization: any non-admin (including a logged-in customer)
  // is denied and sent to the dedicated admin login page.
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") redirect("/admin/login");

  return (
    <div className="min-h-screen">
      <AdminSidebar adminName={user.name} adminEmail={user.email} />
      <main className="lg:pl-64">
        <AdminErrorBoundary>
          <div className="mx-auto max-w-6xl px-3 py-4 sm:px-5">{children}</div>
        </AdminErrorBoundary>
      </main>
    </div>
  );
}
