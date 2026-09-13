import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { ensureSeeded } from "@/db/seed";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await ensureSeeded();
  const user = await getCurrentUser();
  if (user) redirect("/");
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") ? next : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <AuthForm mode="signup" next={safeNext} />
    </main>
  );
}
