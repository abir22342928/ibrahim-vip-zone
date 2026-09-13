"use client";

import { useEffect, useState } from "react";
import { api, dhaka } from "@/lib/client";

type LogRow = {
  id: number;
  adminName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
};

export default function AdminAuditPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ logs: LogRow[] }>("/api/admin/audit").then((res) => {
      if (res.ok) setRows(res.logs ?? []);
      else setError(res.error ?? "অডিট লগ লোড করা যায়নি।");
    });
  }, []);

  const filtered = filter
    ? rows.filter((r) => `${r.action} ${r.adminName} ${r.detail ?? ""}`.toLowerCase().includes(filter.toLowerCase()))
    : rows;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h1 className="text-lg font-black">📜 Audit Logs</h1>
        <p className="tiny muted">প্রতিটি গুরুত্বপূর্ণ Admin অ্যাকশন স্থায়ীভাবে সংরক্ষিত থাকে।</p>
        <input className="input mt-3" placeholder="সার্চ..." value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>

      {error && (
        <div className="card border border-amber-400/40 p-3 text-sm text-amber-100">⚠️ {error}</div>
      )}

      <div className="card table-wrap p-2">
        <table className="data">
          <thead>
            <tr>
              <th>Time</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Target</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="tiny muted whitespace-nowrap">{dhaka(r.createdAt)}</td>
                <td className="tiny">{r.adminName ?? "system"}</td>
                <td>
                  <span className="badge badge-info">{r.action}</span>
                </td>
                <td className="tiny muted">
                  {r.targetType ?? "—"}
                  {r.targetId ? ` #${r.targetId}` : ""}
                </td>
                <td className="tiny muted">{r.detail ?? "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center muted">
                  কোনো লগ নেই।
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
