"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PaymentModal, RefundModal } from "@/components/ChatPanel";
import { api, badgeClass, bn, dhaka } from "@/lib/client";

type PaymentDTO = {
  id: number;
  kind: "MAIN" | "SOURCE";
  method: string;
  transactionId: string;
  amount: number;
  status: string;
  adminNote: string | null;
  screenshotUrl: string | null;
  createdAt: string;
};

type ClaimDTO = { id: number; status: string; message: string | null; adminNote: string | null; createdAt: string };

type OrderDTO = {
  id: number;
  orderCode: string;
  status: string;
  priceAmount: number;
  sourceCommissionAmount: number;
  mainPaymentStatus: string;
  sourcePaymentStatus: string;
  createdAt: string;
  deliveredAt: string | null;
  multiTitle: string | null;
  payments: PaymentDTO[];
  claims: ClaimDTO[];
};

export default function AccountView({
  user,
}: {
  user: { id: number; name: string; email: string; phone: string | null; createdAt: string; lastLoginAt: string | null };
}) {
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState<{ order: OrderDTO; kind: "MAIN" | "SOURCE" } | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ orders: OrderDTO[] }>("/api/orders");
    if (res.ok) setOrders(res.orders);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changePassword = async () => {
    setPwMsg(null);
    const res = await api<{ message?: string }>("/api/auth/password", {
      method: "PUT",
      body: { currentPassword: pw.current, password: pw.next },
    });
    setPwMsg(res.ok ? (res.message ?? "পাসওয়ার্ড আপডেট হয়েছে।") : res.error);
    if (res.ok) setPw({ current: "", next: "" });
  };

  const totalSpent = orders
    .flatMap((o) => o.payments)
    .filter((p) => p.status === "APPROVED")
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
      <section className="card p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#b8ff2e] to-[#35e08b] text-2xl font-black text-black">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black">{user.name}</h1>
            <p className="tiny muted truncate">{user.email}</p>
            {user.phone && <p className="tiny muted">📞 {user.phone}</p>}
            <p className="tiny muted mt-1">
              যোগ দিয়েছেন {dhaka(user.createdAt)} • সর্বশেষ লগইন {dhaka(user.lastLoginAt)}
            </p>
          </div>
          <Link href="/chat" className="btn btn-primary btn-sm">
            💬 চ্যাট
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-white/10 bg-black/30 p-2">
            <p className="text-lg font-black text-[#b8ff2e]">{bn(orders.length)}</p>
            <p className="tiny muted">মোট অর্ডার</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-2">
            <p className="text-lg font-black text-[#b8ff2e]">{bn(orders.filter((o) => o.deliveredAt).length)}</p>
            <p className="tiny muted">ডেলিভারি</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-2">
            <p className="text-lg font-black text-[#b8ff2e]">৳{bn(totalSpent.toLocaleString("en-US"))}</p>
            <p className="tiny muted">পরিশোধিত</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">আমার অর্ডার</h2>
          <div className="flex items-center gap-2">
            <Link href="/orders" className="btn btn-ghost btn-sm">
              📦 সব অর্ডার
            </Link>
            <button className="btn btn-ghost btn-sm" onClick={() => setRefundOpen(true)}>
              🧾 Refund/Recovery
            </button>
          </div>
        </div>

        {loading && <div className="shimmer h-24 rounded-2xl" />}
        {!loading && orders.length === 0 && (
          <div className="card p-5 text-center">
            <p className="muted text-sm">এখনো কোনো অর্ডার নেই।</p>
            <Link href="/" className="btn btn-primary btn-sm mt-3">
              আজকের মাল্টি দেখুন
            </Link>
          </div>
        )}

        {orders.map((o) => {
          const canPayMain = ["PENDING_PAYMENT", "MAIN_PAYMENT_REJECTED"].includes(o.status);
          const canPaySource = ["MAIN_PAYMENT_APPROVED", "SOURCE_PAYMENT_REJECTED"].includes(o.status);
          return (
            <div key={o.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold">{o.orderCode}</span>
                <span className={badgeClass(o.status)}>{o.status.replaceAll("_", " ")}</span>
                <span className="tiny muted ml-auto">{dhaka(o.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm">{o.multiTitle ?? "Today's Multi"}</p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-white/10 bg-black/25 p-2">
                  <p className="tiny muted">Main Payment</p>
                  <p className="font-bold">৳{bn(o.priceAmount.toLocaleString("en-US"))}</p>
                  <span className={badgeClass(o.mainPaymentStatus)}>{o.mainPaymentStatus}</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-2">
                  <p className="tiny muted">Source Commission</p>
                  <p className="font-bold">৳{bn(o.sourceCommissionAmount.toLocaleString("en-US"))}</p>
                  <span className={badgeClass(o.sourcePaymentStatus)}>{o.sourcePaymentStatus}</span>
                </div>
              </div>

              {o.payments.length > 0 && (
                <div className="mt-3 space-y-1">
                  {o.payments.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-xs">
                      <span className="badge badge-info">{p.kind}</span>
                      <span className="font-mono">{p.transactionId}</span>
                      <span className="muted">{p.method.toUpperCase()}</span>
                      <span className={badgeClass(p.status)}>{p.status}</span>
                      {p.screenshotUrl && (
                        <a href={p.screenshotUrl} target="_blank" rel="noreferrer" className="underline">
                          স্ক্রিনশট
                        </a>
                      )}
                      {p.adminNote && <span className="muted">📝 {p.adminNote}</span>}
                    </div>
                  ))}
                </div>
              )}

              {o.claims.length > 0 && (
                <div className="mt-2 space-y-1">
                  {o.claims.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-xs">
                      <span className="badge badge-pending">CLAIM</span>
                      <span className={badgeClass(c.status)}>{c.status}</span>
                      <span className="muted">{dhaka(c.createdAt)}</span>
                      {c.adminNote && <span className="muted">📝 {c.adminNote}</span>}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {canPayMain && (
                  <button className="btn btn-primary btn-sm" onClick={() => setPayTarget({ order: o, kind: "MAIN" })}>
                    📤 Main Payment জমা দিন
                  </button>
                )}
                {canPaySource && (
                  <button className="btn btn-primary btn-sm" onClick={() => setPayTarget({ order: o, kind: "SOURCE" })}>
                    📤 Source Commission জমা দিন
                  </button>
                )}
                {o.deliveredAt && (
                  <Link href="/chat" className="btn btn-ghost btn-sm">
                    🔒 ডেলিভারি করা Multi দেখুন
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="card p-4">
        <h2 className="section-title mb-3">🔐 পাসওয়ার্ড পরিবর্তন</h2>
        <label className="label">বর্তমান পাসওয়ার্ড</label>
        <input
          type="password"
          className="input mb-3"
          value={pw.current}
          onChange={(e) => setPw({ ...pw, current: e.target.value })}
        />
        <label className="label">নতুন পাসওয়ার্ড</label>
        <input
          type="password"
          className="input mb-3"
          value={pw.next}
          onChange={(e) => setPw({ ...pw, next: e.target.value })}
        />
        {pwMsg && <p className="mb-2 rounded-lg bg-white/10 px-3 py-2 text-xs">{pwMsg}</p>}
        <button className="btn btn-ghost w-full" onClick={changePassword} disabled={!pw.current || pw.next.length < 6}>
          আপডেট করুন
        </button>
      </section>

      {payTarget && (
        <PaymentModal
          order={{
            id: payTarget.order.id,
            code: payTarget.order.orderCode,
            status: payTarget.order.status,
            mainPaymentStatus: payTarget.order.mainPaymentStatus,
            sourcePaymentStatus: payTarget.order.sourcePaymentStatus,
            priceAmount: payTarget.order.priceAmount,
            sourceCommissionAmount: payTarget.order.sourceCommissionAmount,
          }}
          kind={payTarget.kind}
          onClose={() => setPayTarget(null)}
          onDone={async () => {
            setPayTarget(null);
            await load();
          }}
        />
      )}
      {refundOpen && (
        <RefundModal
          onClose={() => setRefundOpen(false)}
          onDone={async () => {
            setRefundOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}
