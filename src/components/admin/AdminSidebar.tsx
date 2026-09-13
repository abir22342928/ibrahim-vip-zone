"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type NavItem = { href: string; label: string; icon: string; exact?: boolean };
type NavSection = { title: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  { title: "Overview", items: [{ href: "/admin", label: "Dashboard", icon: "📊", exact: true }] },
  {
    title: "Business",
    items: [
      { href: "/admin/customers", label: "Customers", icon: "👥" },
      { href: "/admin/orders", label: "Orders", icon: "🧾" },
      { href: "/admin/payments/main", label: "Main Payments", icon: "💳" },
      { href: "/admin/payments/source", label: "Source Payments", icon: "💵" },
      { href: "/admin/refunds", label: "Refund Requests", icon: "↩️" },
      { href: "/admin/recovery", label: "Recovery", icon: "🔁" },
    ],
  },
  {
    title: "Content",
    items: [
      { href: "/admin/daily-multi", label: "Today's Multi", icon: "⚽" },
      { href: "/admin/multi-vault", label: "Multi Vault", icon: "🔒" },
    ],
  },
  {
    title: "Support",
    items: [
      { href: "/admin/chats", label: "Customer Chats", icon: "💬" },
      { href: "/admin/settings/support", label: "Support", icon: "🎧" },
      { href: "/admin/settings/support", label: "Telegram Support", icon: "✈️" },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/admin/settings/payment", label: "Payment Settings", icon: "🏦" },
      { href: "/admin/settings/pricing", label: "Pricing Settings", icon: "💰" },
      { href: "/admin/settings/countdown", label: "Countdown Settings", icon: "⏱️" },
      { href: "/admin/settings/ai", label: "AI Settings", icon: "🤖" },
    ],
  },
  {
    title: "System",
    items: [{ href: "/admin/audit-logs", label: "Audit Logs", icon: "📜" }],
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export default function AdminSidebar({
  adminName,
  adminEmail,
}: {
  adminName: string;
  adminEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    await api("/api/auth/logout", { body: {} });
    setBusy(false);
    setOpen(false);
    router.push("/admin/login");
    router.refresh();
  };

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-3">
      {SECTIONS.map((s) => (
        <div key={s.title} className="mb-4">
          <p className="px-3 pb-1 text-[0.62rem] font-black uppercase tracking-[0.18em] text-white/35">
            {s.title}
          </p>
          <div className="space-y-0.5">
            {s.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    active ? "bg-[#b8ff2e] text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-2.5 px-1 pb-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#b8ff2e] to-[#35e08b] text-sm font-black text-black">
          {adminName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{adminName}</p>
          <p className="truncate text-[0.65rem] text-white/45">{adminEmail}</p>
        </div>
      </div>
      <button className="btn btn-danger w-full" onClick={logout} disabled={busy}>
        ⎋ Logout
      </button>
    </div>
  );

  const brandLink = (
    <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#b8ff2e] to-[#35e08b] text-xl shadow-lg">
        ⚽
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black leading-tight">IBRAHIM VIP ZONE</span>
        <span className="block text-[0.6rem] uppercase tracking-[0.2em] text-[#b8ff2e]">Admin Panel</span>
      </span>
    </Link>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-[#070c10] lg:flex">
        <div className="border-b border-white/10 px-4 py-4">{brandLink}</div>
        {nav}
        {footer}
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-[#070c10]/95 px-3 py-3 backdrop-blur lg:hidden">
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} aria-label="Open menu">
          ☰
        </button>
        <span className="truncate text-sm font-black">IBRAHIM VIP ZONE</span>
        <span className="badge badge-info ml-auto">ADMIN</span>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#070c10]">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3">
              {brandLink}
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close menu">
                ✕
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}
    </>
  );
}
