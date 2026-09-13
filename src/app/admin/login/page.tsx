import { redirect } from "next/navigation";
import { ensureSeeded } from "@/db/seed";
import { getCurrentUser } from "@/lib/auth";
import AdminLoginForm from "@/components/admin/AdminLoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  await ensureSeeded();
  const user = await getCurrentUser();
  if (user?.role === "admin") redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <AdminLoginForm />
    </main>
  );
}
