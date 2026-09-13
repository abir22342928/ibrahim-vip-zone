"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, badgeClass, bn, dhaka } from "@/lib/client";

type CustomerRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isBlocked: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  orderCount: number;
  paidTotal: number;
  messageCount: number;
};

type Detail = {
  customer: CustomerRow;
  orders: Array<{ id: number; orderCode: string; status: string; createdAt: string; deliveredAt: string | null }>;
  payments: Array<{ id: number; kind: string; amount: number; status: string; transactionId: string; screenshotUrl: string | null }>;
  claims: Array<{ id: number; orderId: number; status: string; createdAt: string }>;
};

export default function AdminCustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await api<{ customers: CustomerRow[] }>(
      `/api/admin/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    );
    if (res.ok) setRows(res.customers ?? []);
    else setError(res.error ?? "কাস্টমার লোড করা যায়নি।");
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: number) => {
    const res = await api<Detail>(`/api/admin/customers?id=${id}`);
    if (res.ok) setDetail(res as unknown as Detail);
  };

  const toggleBlock = async (id: number, blocked: boolean) => {
    setBusy(true);
    await api("/api/admin/customers", { body: { id, action: blocked ? "UNBLOCK" : "BLOCK" } });
    setBusy(false);
    await load();
    if (detail) await open(id);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h1 className="text-lg font-black">👥 Customers</h1>
        <p className="tiny muted">পাসওয়ার্ড কখনোই দেখা যায় না — শুধুমাত্র hashed আকারে সংরক্ষিত।</p>
        <input className="input mt-3" placeholder="নাম / ইমেইল / ফোন সার্চ..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

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
              <th>Customer</th>
              <th>Contact</th>
              <th>Orders</th>
              <th>Paid</th>
              <th>Msg</th>
              <th>Joined</th>
              <th>Last login</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.name}</b>
                  {c.role === "admin" && <span className="badge badge-info ml-1">ADMIN</span>}
                  {c.isBlocked && <span className="badge badge-bad ml-1">BLOCKED</span>}
                </td>
                <td className="tiny muted">
                  {c.email}
                  {c.phone ? <div>{c.phone}</div> : null}
                </td>
                <td>{bn(c.orderCount)}</td>
                <td className="text-[#b8ff2e]">৳{bn(c.paidTotal.toLocaleString("en-US"))}</td>
                <td>{bn(c.messageCount)}</td>
                <td className="tiny muted">{dhaka(c.createdAt)}</td>
                <td className="tiny muted">{dhaka(c.lastLoginAt)}</td>
                <td>
                  <div className="flex gap-1">
                    <button className="btn btn-ghost btn-sm" onClick={() => open(c.id)}>
                      দেখুন
                    </button>
                    <Link className="btn btn-ghost btn-sm" href="/admin/chats">
                      💬
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/75 sm:items-center sm:p-4" onClick={() => setDetail(null)}>
          <div className="glass-dark max-h-[90vh] w-full overflow-y-auto rounded-t-3xl p-4 sm:max-w-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black">{detail.customer.name}</h2>
                <p className="tiny muted">{detail.customer.email}</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setDetail(null)}>
                ✕
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <button
                className={`btn btn-sm ${detail.customer.isBlocked ? "btn-primary" : "btn-danger"}`}
                disabled={busy}
                onClick={() => toggleBlock(detail.customer.id, detail.customer.isBlocked)}
              >
                {detail.customer.isBlocked ? "✅ Unblock" : "🚫 Block"}
              </button>
              <Link href="/admin/chats" className="btn btn-ghost btn-sm">
                💬 চ্যাট খুলুন
              </Link>
            </div>

            <h3 className="label">Orders</h3>
            <div className="mb-3 space-y-1">
              {detail.orders.length === 0 && <p className="tiny muted">কোনো অর্ডার নেই।</p>}
              {detail.orders.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-xs">
                  <span className="font-mono">{o.orderCode}</span>
                  <span className={badgeClass(o.status)}>{o.status.replaceAll("_", " ")}</span>
                  <span className="muted ml-auto">{dhaka(o.createdAt)}</span>
                </div>
              ))}
            </div>

            <h3 className="label">Payments</h3>
            <div className="mb-3 space-y-1">
              {detail.payments.length === 0 && <p className="tiny muted">কোনো পেমেন্ট নেই।</p>}
              {detail.payments.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-xs">
                  <span className="badge badge-info">{p.kind}</span>
                  <span className="font-mono">{p.transactionId}</span>
                  <span>৳{bn(p.amount)}</span>
                  <span className={badgeClass(p.status)}>{p.status}</span>
                  {p.screenshotUrl && (
                    <a href={p.screenshotUrl} target="_blank" rel="noreferrer" className="ml-auto underline">
                      স্ক্রিনশট
                    </a>
                  )}
                </div>
              ))}
            </div>

            <h3 className="label">Refund / Recovery</h3>
            <div className="space-y-1">
              {detail.claims.length === 0 && <p className="tiny muted">কোনো ক্লেইম নেই।</p>}
              {detail.claims.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-xs">
                  <span className={badgeClass(c.status)}>{c.status}</span>
                  <span className="muted ml-auto">{dhaka(c.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
