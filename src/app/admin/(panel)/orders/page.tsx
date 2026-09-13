"use client";

import { useCallback, useEffect, useState } from "react";
import { api, badgeClass, bn, dhaka } from "@/lib/client";

type OrderRow = {
  id: number;
  orderCode: string;
  status: string;
  priceAmount: number;
  sourceCommissionAmount: number;
  mainPaymentStatus: string;
  sourcePaymentStatus: string;
  createdAt: string;
  deliveredAt: string | null;
  customerId: number;
  customerName: string;
  customerEmail: string;
  multiTitle: string | null;
};

const STATUSES = [
  "",
  "PENDING_PAYMENT",
  "MAIN_PAYMENT_PENDING",
  "MAIN_PAYMENT_APPROVED",
  "SOURCE_PAYMENT_PENDING",
  "FULL_PAYMENT_APPROVED",
  "MULTI_DELIVERED",
  "REFUND_REVIEW",
  "REFUND_APPROVED",
  "RECOVERY_DELIVERED",
];

export default function AdminOrdersPage() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await api<{ orders: OrderRow[] }>(`/api/admin/orders${status ? `?status=${status}` : ""}`);
    if (res.ok) setRows(res.orders ?? []);
    else setError(res.error ?? "অর্ডার লোড করা যায়নি।");
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const deliver = async (orderId: number, action: "DELIVER" | "RESEND") => {
    setBusy(orderId);
    setMessage(null);
    const res = await api<{ delivered: boolean }>("/api/admin/deliveries", { body: { orderId, action } });
    setBusy(null);
    setMessage(res.ok ? (res.delivered ? "✅ Multi ডেলিভার হয়েছে।" : "ডেলিভারি হয়নি।") : res.error);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h1 className="text-lg font-black">🧾 Orders</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button key={s || "ALL"} className={`btn btn-sm ${status === s ? "btn-primary" : "btn-ghost"}`} onClick={() => setStatus(s)}>
              {s ? s.replaceAll("_", " ") : "ALL"}
            </button>
          ))}
        </div>
      </div>

      {message && <div className="card p-3 text-sm">{message}</div>}
      {error && (
        <div className="card border border-amber-400/40 p-3 text-sm text-amber-100">
          ⚠️ {error}{" "}
          <button className="underline" onClick={() => void load()}>
            আবার চেষ্টা করুন
          </button>
        </div>
      )}

      <div className="card table-wrap p-2">
        <table className="data">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Main</th>
              <th>Source</th>
              <th>Amounts</th>
              <th>Created</th>
              <th>Delivered</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="font-mono text-xs">{o.orderCode}</td>
                <td>
                  <b>{o.customerName}</b>
                  <div className="tiny muted">{o.customerEmail}</div>
                </td>
                <td>
                  <span className={badgeClass(o.status)}>{o.status.replaceAll("_", " ")}</span>
                </td>
                <td>
                  <span className={badgeClass(o.mainPaymentStatus)}>{o.mainPaymentStatus}</span>
                </td>
                <td>
                  <span className={badgeClass(o.sourcePaymentStatus)}>{o.sourcePaymentStatus}</span>
                </td>
                <td className="tiny">
                  ৳{bn(o.priceAmount)} + ৳{bn(o.sourceCommissionAmount)}
                </td>
                <td className="tiny muted">{dhaka(o.createdAt)}</td>
                <td className="tiny muted">{o.deliveredAt ? dhaka(o.deliveredAt) : "—"}</td>
                <td>
                  <div className="flex gap-1">
                    {!o.deliveredAt && o.mainPaymentStatus === "APPROVED" && o.sourcePaymentStatus === "APPROVED" && (
                      <button className="btn btn-primary btn-sm" disabled={busy === o.id} onClick={() => deliver(o.id, "DELIVER")}>
                        🚚 Deliver
                      </button>
                    )}
                    {o.deliveredAt && (
                      <button className="btn btn-ghost btn-sm" disabled={busy === o.id} onClick={() => deliver(o.id, "RESEND")}>
                        🔁 Resend
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
