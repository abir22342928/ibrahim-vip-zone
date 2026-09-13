"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PaymentModal, RefundModal } from "@/components/ChatPanel";
import { api, badgeClass, bn, dhaka } from "@/lib/client";

export type DeliveredContent = {
  imageUrl: string | null;
  description: string | null;
  title: string | null;
};

export type PaymentDTO = {
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

export type ClaimDTO = {
  id: number;
  status: string;
  message: string | null;
  adminNote: string | null;
  createdAt: string;
};

export type OrderItem = {
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
  deliveredContent: DeliveredContent | null;
  payments: PaymentDTO[];
  claims: ClaimDTO[];
};

export default function OrdersView() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [viewingMulti, setViewingMulti] = useState<DeliveredContent | null>(null);
  const [payTarget, setPayTarget] = useState<{
    order: OrderItem;
    kind: "MAIN" | "SOURCE";
  } | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ orders: OrderItem[] }>("/api/orders");
      if (res.ok) {
        setOrders(res.orders ?? []);
      } else {
        setError(res.error || "অর্ডার হিস্ট্রি লোড করা যায়নি।");
      }
    } catch (err) {
      setError((err as Error)?.message || "নেটওয়ার্ক সমস্যা হয়েছে।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 pb-24 sm:pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight">📦 আমার অর্ডার সমূহ (My Orders)</h1>
          <p className="tiny muted mt-0.5">
            আপনার সকল অর্ডার, পেমেন্ট ও ডেলিভারি করা মাল্টি এখানে সংরক্ষিত থাকবে।
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/chat" className="btn btn-ghost btn-sm">
            💬 চ্যাট
          </Link>
          <button className="btn btn-primary btn-sm" onClick={() => setRefundOpen(true)}>
            🧾 Refund / Recovery
          </button>
        </div>
      </div>

      {error && (
        <div className="card border border-amber-400/40 p-4">
          <p className="text-sm text-amber-100">⚠️ {error}</p>
          <button className="btn btn-ghost btn-sm mt-2" onClick={() => void load()}>
            🔄 আবার চেষ্টা করুন
          </button>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          <div className="shimmer h-36 rounded-2xl" />
          <div className="shimmer h-36 rounded-2xl" />
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="card p-8 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-3xl">
            ⚽
          </div>
          <h2 className="text-base font-bold">এখনো কোনো অর্ডার নেই</h2>
          <p className="tiny muted mt-1">
            আজকের প্রিমিয়াম মাল্টি নিতে চাইলে হোমপেজ থেকে অর্ডার শুরু করুন।
          </p>
          <Link href="/" className="btn btn-primary btn-sm mt-4">
            🛒 আজকের মাল্টি দেখুন
          </Link>
        </div>
      )}

      {/* Orders list */}
      <div className="space-y-3">
        {orders.map((o) => {
          const isFullyApproved =
            o.mainPaymentStatus === "APPROVED" && o.sourcePaymentStatus === "APPROVED";
          const isDelivered = Boolean(o.deliveredAt);
          const canPayMain = ["PENDING_PAYMENT", "MAIN_PAYMENT_REJECTED"].includes(o.status);
          const canPaySource = [
            "MAIN_PAYMENT_APPROVED",
            "SOURCE_PAYMENT_REJECTED",
            "SOURCE_PAYMENT_PENDING",
          ].includes(o.status);

          return (
            <div
              key={o.id}
              className="card p-4 transition hover:border-white/20"
            >
              {/* Top row */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-black text-[#b8ff2e]">
                    #{o.orderCode}
                  </span>
                  <span className={badgeClass(o.status)}>
                    {o.status.replaceAll("_", " ")}
                  </span>
                </div>
                <span className="tiny muted">{dhaka(o.createdAt)}</span>
              </div>

              {/* Multi Info */}
              <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold">
                    ⚽ {o.multiTitle ?? "Today's VIP Multi"}
                  </h3>
                  <p className="tiny muted mt-0.5">
                    মূল্য: ৳{bn(o.priceAmount.toLocaleString("en-US"))} + Source Commission: ৳
                    {bn(o.sourceCommissionAmount.toLocaleString("en-US"))}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-[#b8ff2e]">
                    ৳{bn((o.priceAmount + o.sourceCommissionAmount).toLocaleString("en-US"))}
                  </span>
                </div>
              </div>

              {/* Status summary grid */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                  <p className="tiny muted">Main Payment</p>
                  <p className="mt-1 font-bold">
                    {o.mainPaymentStatus === "APPROVED" ? (
                      <span className="text-emerald-400">✅ Approved</span>
                    ) : o.mainPaymentStatus === "REJECTED" ? (
                      <span className="text-red-400">❌ Rejected</span>
                    ) : (
                      <span className="text-amber-400">⏳ Pending</span>
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                  <p className="tiny muted">Source Commission</p>
                  <p className="mt-1 font-bold">
                    {o.sourcePaymentStatus === "APPROVED" ? (
                      <span className="text-emerald-400">✅ Approved</span>
                    ) : o.sourcePaymentStatus === "REJECTED" ? (
                      <span className="text-red-400">❌ Rejected</span>
                    ) : (
                      <span className="text-amber-400">⏳ Pending</span>
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                  <p className="tiny muted">Delivery Status</p>
                  <p className="mt-1 font-bold">
                    {isDelivered ? (
                      <span className="text-emerald-400">✅ Delivered</span>
                    ) : (
                      <span className="text-white/45">🔒 Locked</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Actions row */}
              <div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
                {isDelivered && o.deliveredContent ? (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setViewingMulti(o.deliveredContent)}
                  >
                    🔐 View Delivered Multi
                  </button>
                ) : null}

                {canPayMain && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setPayTarget({ order: o, kind: "MAIN" })}
                  >
                    💳 Main Payment জমা দিন
                  </button>
                )}

                {canPaySource && o.mainPaymentStatus === "APPROVED" && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setPayTarget({ order: o, kind: "SOURCE" })}
                  >
                    💰 Source Commission জমা দিন
                  </button>
                )}

                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelectedOrder(o)}
                >
                  📋 Details
                </button>

                <Link href="/chat" className="btn btn-ghost btn-sm ml-auto">
                  💬 চ্যাটে যান
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: View Delivered Multi */}
      {viewingMulti && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setViewingMulti(null)}
        >
          <div
            className="glass-dark max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#b8ff2e]/20 text-lg">
                  🔒
                </span>
                <h3 className="section-title">{viewingMulti.title ?? "Delivered Multi"}</h3>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setViewingMulti(null)}
              >
                ✕
              </button>
            </div>

            {viewingMulti.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewingMulti.imageUrl}
                alt="Delivered Multi"
                className="mb-4 max-h-80 w-full rounded-2xl border border-white/10 object-contain"
              />
            ) : null}

            {viewingMulti.description ? (
              <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/40 p-3 text-xs leading-relaxed">
                {viewingMulti.description}
              </pre>
            ) : null}

            <p className="tiny muted mt-3 text-center">
              ⚠️ এই Multi শুধুমাত্র আপনার ব্যক্তিগত ব্যবহারের জন্য। শেয়ার করা সম্পূর্ণ নিষেধ।
            </p>
          </div>
        </div>
      )}

      {/* Modal: Order Details */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="glass-dark max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <span className="font-mono text-sm font-black text-[#b8ff2e]">
                  #{selectedOrder.orderCode}
                </span>
                <p className="tiny muted">{dhaka(selectedOrder.createdAt)}</p>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedOrder(null)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <p className="tiny muted">ম্যাচ / প্যাকেজ</p>
                <p className="text-base font-bold">
                  ⚽ {selectedOrder.multiTitle ?? "Today's VIP Multi"}
                </p>
                <div className="mt-2 flex justify-between">
                  <span className="muted">Main Price:</span>
                  <b>৳{bn(selectedOrder.priceAmount.toLocaleString("en-US"))}</b>
                </div>
                <div className="flex justify-between">
                  <span className="muted">Source Commission:</span>
                  <b>
                    ৳{bn(selectedOrder.sourceCommissionAmount.toLocaleString("en-US"))}
                  </b>
                </div>
                <div className="mt-1 flex justify-between border-t border-white/10 pt-1 text-[#b8ff2e]">
                  <span>মোট:</span>
                  <b>
                    ৳
                    {bn(
                      (
                        selectedOrder.priceAmount +
                        selectedOrder.sourceCommissionAmount
                      ).toLocaleString("en-US")
                    )}
                  </b>
                </div>
              </div>

              {/* Payment Timeline */}
              <div>
                <p className="label mb-2">পেমেন্ট টাইমলাইন (Payment Timeline)</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5">
                    <span className="text-xl">
                      {selectedOrder.mainPaymentStatus === "APPROVED"
                        ? "✅"
                        : selectedOrder.mainPaymentStatus === "REJECTED"
                        ? "❌"
                        : "⏳"}
                    </span>
                    <div className="flex-1">
                      <p className="font-bold">১. Main Payment</p>
                      <p className="tiny muted">
                        স্ট্যাটাস: {selectedOrder.mainPaymentStatus}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5">
                    <span className="text-xl">
                      {selectedOrder.sourcePaymentStatus === "APPROVED"
                        ? "✅"
                        : selectedOrder.sourcePaymentStatus === "REJECTED"
                        ? "❌"
                        : "⏳"}
                    </span>
                    <div className="flex-1">
                      <p className="font-bold">২. Source Commission</p>
                      <p className="tiny muted">
                        স্ট্যাটাস: {selectedOrder.sourcePaymentStatus}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5">
                    <span className="text-xl">
                      {selectedOrder.deliveredAt ? "✅" : "🔒"}
                    </span>
                    <div className="flex-1">
                      <p className="font-bold">৩. Multi Delivery</p>
                      <p className="tiny muted">
                        {selectedOrder.deliveredAt
                          ? `ডেলিভারি সম্পন্ন: ${dhaka(selectedOrder.deliveredAt)}`
                          : "উভয় পেমেন্ট অনুমোদনের পর আনলক হবে"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* If delivered content is available */}
              {selectedOrder.deliveredContent ? (
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/20 p-3">
                  <p className="font-bold text-emerald-300">
                    🎉 আপনার Multi ডেলিভারি করা হয়েছে!
                  </p>
                  <button
                    className="btn btn-primary btn-sm mt-2 w-full"
                    onClick={() => {
                      setViewingMulti(selectedOrder.deliveredContent);
                      setSelectedOrder(null);
                    }}
                  >
                    🔐 View Delivered Multi
                  </button>
                </div>
              ) : null}

              {/* Transactions list */}
              {selectedOrder.payments.length > 0 ? (
                <div>
                  <p className="label mb-1">পেমেন্ট রেকর্ডস (Transactions)</p>
                  <div className="space-y-1 text-xs">
                    {selectedOrder.payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-2"
                      >
                        <span className="badge badge-info">{p.kind}</span>
                        <span className="font-mono">{p.transactionId}</span>
                        <span>{p.method.toUpperCase()}</span>
                        <span>৳{bn(p.amount)}</span>
                        <span className={badgeClass(p.status)}>{p.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
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

      {/* Refund Modal */}
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
