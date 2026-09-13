"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Countdown from "@/components/Countdown";
import { api, bn, dhaka } from "@/lib/client";
import type { AdminStats, AdminDashboardData } from "@/lib/admin-data";
import type { MultiState } from "@/lib/multi";

export default function DashboardView({
  initialStats,
  initialMulti,
}: {
  initialStats: AdminStats;
  initialMulti: MultiState;
}) {
  // Data arrives from the server via props, so the dashboard renders real
  // values immediately — even if every client-side request fails it can never
  // be blank. The fetch below only updates the numbers live.
  const [stats, setStats] = useState<AdminStats>(initialStats ?? { ...({} as AdminStats) });
  const [multi, setMulti] = useState<MultiState | null>(initialMulti ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await api<AdminDashboardData>("/api/admin/stats");
        if (!active) return;
        if (res.ok) {
          setStats(res.stats ?? initialStats);
          setMulti(res.multi ?? initialMulti);
          setError(null);
        } else {
          setError(res.error ?? "স্ট্যাটস রিফ্রেশ করা যায়নি।");
        }
      } catch (err) {
        if (active) setError((err as Error)?.message ?? "স্ট্যাটস রিফ্রেশ করা যায়নি।");
      }
    };
    const timer = setInterval(() => void load(), 20000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [initialStats, initialMulti]);

  const cards: Array<{ label: string; value: number; tone?: string; href?: string }> = [
    { label: "Total Customers", value: stats.totalCustomers ?? 0, href: "/admin/customers" },
    { label: "Today's Customers", value: stats.newCustomersToday ?? 0, href: "/admin/customers" },
    { label: "Pending Main Payments", value: stats.mainPending ?? 0, tone: "pending", href: "/admin/payments/main" },
    { label: "Approved Main Payments", value: stats.mainApproved ?? 0, tone: "ok", href: "/admin/payments/main" },
    { label: "Pending Source Payments", value: stats.sourcePending ?? 0, tone: "pending", href: "/admin/payments/source" },
    { label: "Approved Source Payments", value: stats.sourceApproved ?? 0, tone: "ok", href: "/admin/payments/source" },
    { label: "Today's Orders", value: stats.todayOrders ?? 0, href: "/admin/orders" },
    { label: "Delivered Multis", value: stats.deliveries ?? 0, tone: "ok", href: "/admin/orders" },
    { label: "Pending Refund Requests", value: stats.pendingClaims ?? 0, tone: "pending", href: "/admin/refunds" },
    { label: "Pending Recovery Requests", value: stats.pendingClaims ?? 0, tone: "pending", href: "/admin/recovery" },
  ];

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-black">IBRAHIM VIP ZONE — Admin Dashboard</h1>
            <p className="tiny muted">রিয়েল-টাইম বিজনেস ওভারভিউ (Asia/Dhaka)</p>
          </div>
          <div className="text-right">
            <p className="tiny muted">মোট অনুমোদিত পেমেন্ট</p>
            <p className="text-2xl font-black text-[#b8ff2e]">
              ৳{bn(((stats.revenue ?? 0)).toLocaleString("en-US"))}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="card border border-amber-400/40 p-4">
          <p className="text-sm text-amber-100">
            ⚠️ {error} — সর্বশেষ তথ্য দেখানো হচ্ছে।
          </p>
        </div>
      )}

      {multi && multi.multi && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            {multi.multi.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={multi.multi.imageUrl} alt="multi" className="h-16 w-24 rounded-xl object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{multi.multi.title ?? "কোনো অ্যাক্টিভ মাল্টি নেই"}</p>
              <p className="tiny muted">
                শুরু {dhaka(multi.startsAt)} • শেষ {dhaka(multi.expiresAt)}
              </p>
              <span className={`badge ${multi.isLive ? "badge-ok" : "badge-bad"} mt-1`}>
                {multi.isLive ? "LIVE" : multi.isExpired ? "EXPIRED" : "NOT LIVE"}
              </span>
            </div>
            <div className="min-w-[180px]">
              <p className="tiny muted mb-1 text-center">Expiry countdown</p>
              <Countdown targetIso={multi.expiresAt} serverNowIso={multi.serverNow} />
            </div>
            <Link href="/admin/multi-vault" className="btn btn-primary btn-sm">
              🔒 Multi Vault
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => {
          const inner = (
            <div className="card h-full p-3">
              <p className="tiny muted">{c.label}</p>
              <p
                className={`mt-1 text-2xl font-black ${
                  c.tone === "pending" ? "text-amber-300" : c.tone === "ok" ? "text-emerald-300" : "text-white"
                }`}
              >
                {bn(String(c.value ?? 0))}
              </p>
            </div>
          );
          return c.href ? (
            <Link key={c.label} href={c.href}>
              {inner}
            </Link>
          ) : (
            <div key={c.label}>{inner}</div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/payments/main" className="card p-4 hover:bg-white/5">
          <p className="text-sm font-bold">💳 পেমেন্ট ভেরিফিকেশন</p>
          <p className="tiny muted">Main ও Source payment অনুমোদন / বাতিল করুন</p>
        </Link>
        <Link href="/admin/chats" className="card p-4 hover:bg-white/5">
          <p className="text-sm font-bold">💬 কাস্টমার চ্যাট</p>
          <p className="tiny muted">AI বা Admin হিসেবে সরাসরি রিপ্লাই দিন</p>
        </Link>
      </div>
    </div>
  );
}
