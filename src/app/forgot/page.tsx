import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <AuthForm mode="forgot" />
    </main>
  );
}
