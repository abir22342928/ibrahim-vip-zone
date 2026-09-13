"use client";

import { useCallback, useEffect, useState } from "react";
import { api, badgeClass, bn, dhaka } from "@/lib/client";

type PaymentRow = {
  id: number;
  kind: "MAIN" | "SOURCE";
  method: string;
  amount: number;
  status: string;
  transactionId: string;
  senderNumber: string | null;
  isFlaggedDuplicate: boolean;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  screenshotUrl: string | null;
  orderId: number;
  orderCode: string;
  orderStatus: string;
  customerId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
};

export default function PaymentsView({ kind }: { kind: "MAIN" | "SOURCE" }) {
  const [status, setStatus] = useState<string>("PENDING");
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ payments: PaymentRow[] }>(`/api/admin/payments?kind=${kind}&status=${status}`);
      if (res.ok) setRows(res.payments ?? []);
      else setError(res.error ?? "পেমেন্ট লোড করা যায়নি।");
    } catch (err) {
      setError((err as Error)?.message ?? "পেমেন্ট লোড করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }, [kind, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: number, decision: "APPROVE" | "REJECT" | "REQUEST_INFO") => {
    setBusyId(id);
    setMessage(null);
    const res = await api<{ delivered: boolean }>("/api/admin/payments", {
      body: { paymentId: id, decision, note: notes[id] ?? "" },
    });
    setBusyId(null);
    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    setMessage(
      decision === "APPROVE"
        ? res.delivered
          ? "✅ অনুমোদিত — Protected Multi কাস্টমারের চ্যাটে ডেলিভার হয়েছে।"
          : "✅ পেমেন্ট অনুমোদিত হয়েছে।"
        : "সিদ্ধান্ত সংরক্ষণ করা হয়েছে।",
    );
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h1 className="text-lg font-black">
          {kind === "MAIN" ? "💳 MAIN PAYMENT" : "💵 SOURCE PAYMENT"} ভেরিফিকেশন
        </h1>
        <p className="tiny muted">
          {kind === "MAIN"
            ? "Main Payment অনুমোদনের পর কাস্টমার স্বয়ংক্রিয়ভাবে Source Commission নির্দেশনা পাবে।"
            : "শুধুমাত্র Source Payment অনুমোদিত হলেই Protected Multi ডেলিভারির যোগ্য হয়।"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["PENDING", "APPROVED", "REJECTED", "INFO_REQUESTED", ""].map((s) => (
            <button
              key={s || "ALL"}
              className={`btn btn-sm ${status === s ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setStatus(s)}
            >
              {s || "ALL"}
            </button>
          ))}
        </div>
      </div>

      {message && <div className="card p-3 text-sm text-emerald-200">{message}</div>}
      {error && (
        <div className="card border border-amber-400/40 p-3 text-sm text-amber-100">
          ⚠️ {error}{" "}
          <button className="underline" onClick={() => void load()}>
            আবার চেষ্টা করুন
          </button>
        </div>
      )}
      {loading && <div className="shimmer h-28 rounded-2xl" />}
      {!loading && rows.length === 0 && <div className="card p-5 text-center muted">কোনো পেমেন্ট পাওয়া যায়নি।</div>}

      {rows.map((p) => (
        <div key={p.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-info">{p.kind}</span>
            <span className={badgeClass(p.status)}>{p.status}</span>
            {p.isFlaggedDuplicate && <span className="badge badge-bad">⚠ DUPLICATE TRX</span>}
            <span className="font-mono text-sm font-bold">{p.orderCode}</span>
            <span className="tiny muted ml-auto">{dhaka(p.createdAt)}</span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
            {p.screenshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.screenshotUrl}
                alt="payment proof"
                onClick={() => setZoom(p.screenshotUrl)}
                className="h-40 w-full cursor-zoom-in rounded-xl border border-white/10 object-cover sm:w-[180px]"
              />
            ) : (
              <div className="grid h-40 place-items-center rounded-xl border border-white/10 bg-black/30 muted">
                স্ক্রিনশট নেই
              </div>
            )}

            <div className="space-y-1 text-sm">
              <p>
                <b>👤 {p.customerName}</b> <span className="muted">({p.customerEmail})</span>
              </p>
              {p.customerPhone && <p className="muted tiny">📞 {p.customerPhone}</p>}
              <p>
                💰 <b className="text-[#b8ff2e]">৳{bn(p.amount.toLocaleString("en-US"))}</b> · {p.method.toUpperCase()}
              </p>
              <p>
                🔖 TrxID: <span className="font-mono">{p.transactionId}</span>
              </p>
              {p.senderNumber && <p className="muted tiny">📱 Sender: {p.senderNumber}</p>}
              <p className="tiny muted">Order status: {p.orderStatus.replaceAll("_", " ")}</p>
              {p.adminNote && <p className="tiny muted">📝 {p.adminNote}</p>}

              {p.status === "PENDING" && (
                <>
                  <input
                    className="input mt-2"
                    placeholder="নোট (ঐচ্ছিক — কাস্টমারকে জানানো হবে)"
                    value={notes[p.id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="btn btn-primary btn-sm" disabled={busyId === p.id} onClick={() => decide(p.id, "APPROVE")}>
                      ✅ APPROVE
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={busyId === p.id} onClick={() => decide(p.id, "REJECT")}>
                      ❌ REJECT
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={busyId === p.id} onClick={() => decide(p.id, "REQUEST_INFO")}>
                      ℹ️ REQUEST INFO
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ))}

      {zoom && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="proof" className="max-h-full max-w-full rounded-2xl" />
        </div>
      )}
    </div>
  );
}
