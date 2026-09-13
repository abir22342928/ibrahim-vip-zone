"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type Props = {
  brandName: string;
  user: { id: number; name: string; role: string } | null;
};

export default function SiteHeader({ brandName, user }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  const logout = async () => {
    setBusy(true);
    await api("/api/auth/logout", { body: {} });
    setBusy(false);
    setMenu(false);
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 glass-dark">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#b8ff2e] to-[#35e08b] text-xl shadow-lg">
            ⚽
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black leading-tight tracking-tight">{brandName}</span>
            <span className="block text-[0.6rem] uppercase tracking-[0.2em] text-[#b8ff2e]">daily football multi</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {user ? (
            <>
              <Link href="/orders" className="btn btn-ghost btn-sm hidden sm:inline-flex">
                📦 Orders
              </Link>
              <Link href="/chat" className="btn btn-ghost btn-sm">
                💬 চ্যাট
              </Link>
              <div className="relative">
                <button className="btn btn-primary btn-sm" onClick={() => setMenu((v) => !v)}>
                  {user.name.split(" ")[0]} ▾
                </button>
                {menu && (
                  <div className="glass-dark absolute right-0 mt-2 w-44 overflow-hidden rounded-xl p-1 text-sm shadow-2xl">
                    <Link href="/orders" className="block rounded-lg px-3 py-2 hover:bg-white/10" onClick={() => setMenu(false)}>
                      📦 Orders
                    </Link>
                    <Link href="/account" className="block rounded-lg px-3 py-2 hover:bg-white/10" onClick={() => setMenu(false)}>
                      👤 My Account
                    </Link>
                    <Link href="/chat" className="block rounded-lg px-3 py-2 hover:bg-white/10" onClick={() => setMenu(false)}>
                      💬 AI Assistant
                    </Link>
                    {user.role === "admin" && (
                      <Link href="/admin" className="block rounded-lg px-3 py-2 hover:bg-white/10" onClick={() => setMenu(false)}>
                        🛡 Admin Panel
                      </Link>
                    )}
                    <button
                      onClick={logout}
                      disabled={busy}
                      className="block w-full rounded-lg px-3 py-2 text-left text-red-300 hover:bg-red-500/10"
                    >
                      ⎋ লগআউট
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">
                লগইন
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm">
                সাইন আপ
              </Link>
            </>
          )}

          <Link
            href="/admin/login"
            aria-label="Admin login"
            className="inline-flex items-center rounded-lg px-2 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-white/40 transition hover:bg-white/5 hover:text-[#b8ff2e]"
          >
            Admin
          </Link>
        </div>
      </div>
    </header>
  );
}
