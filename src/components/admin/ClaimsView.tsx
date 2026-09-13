"use client";

import { useCallback, useEffect, useState } from "react";
import { api, badgeClass, dhaka } from "@/lib/client";

type ClaimRow = {
  id: number;
  status: string;
  message: string | null;
  adminNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  screenshotUrl: string | null;
  orderId: number;
  orderCode: string;
  orderStatus: string;
  customerId: number;
  customerName: string;
  customerEmail: string;
  multiTitle: string | null;
};

type RecoveryMulti = { id: number; title: string; status: string };

export default function ClaimsView({ mode }: { mode: "refund" | "recovery" }) {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [recoveryMultis, setRecoveryMultis] = useState<RecoveryMulti[]>([]);
  const [selectedRecovery, setSelectedRecovery] = useState<number | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ claims: ClaimRow[] }>("/api/admin/claims");
      if (res.ok) setRows(res.claims ?? []);
      else setError(res.error ?? "রিকোয়েস্ট লোড করা যায়নি।");
    } catch (err) {
      setError((err as Error)?.message ?? "রিকোয়েস্ট লোড করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (mode === "recovery") {
      void api<{ multis: RecoveryMulti[] }>("/api/admin/multi?kind=recovery").then((res) => {
        if (res.ok) {
          setRecoveryMultis(res.multis);
          const active = res.multis.find((m) => m.status === "active");
          setSelectedRecovery(active?.id ?? "");
        }
      });
    }
  }, [load, mode]);

  const decide = async (id: number, decision: string) => {
    setBusy(id);
    setMessage(null);
    const body: Record<string, unknown> = { claimId: id, decision, note: notes[id] ?? "" };
    if (decision === "APPROVE_RECOVERY" && selectedRecovery) {
      body.recoveryMultiId = Number(selectedRecovery);
    }
    const res = await api<{ delivered: boolean }>("/api/admin/claims", { body });
    setBusy(null);
    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    setMessage(
      decision === "APPROVE_RECOVERY"
        ? res.delivered
          ? "✅ Recovery অনুমোদিত এবং Recovery Multi ডেলিভার হয়েছে।"
          : "✅ Recovery অনুমোদিত (Recovery Multi সেট করা নেই — Multi Vault থেকে যুক্ত করুন)।"
        : decision === "APPROVE_REFUND"
          ? "✅ Refund অনুমোদিত হয়েছে।"
          : "সিদ্ধান্ত সংরক্ষণ করা হয়েছে।",
    );
    await load();
  };

  const pending = rows.filter((c) => c.status === "LOSS_REVIEW_PENDING" || c.status === "INFO_REQUESTED");

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h1 className="text-lg font-black">
          {mode === "refund" ? "↩️ REFUND REQUESTS" : "🔁 RECOVERY REQUESTS"}
        </h1>
        <p className="tiny muted">
          {mode === "refund"
            ? "কাস্টমারের লস ক্লেইম যাচাই করে Refund অনুমোদন করুন।"
            : "Recovery অনুমোদন করলে নির্বাচিত Recovery Multi কাস্টমারকে ডেলিভারি হবে (ডুপ্লিকেট ডেলিভারি প্রোটেক্টেড)।"}
        </p>
        {mode === "recovery" && (
          <div className="mt-3">
            <label className="label">Recovery Multi নির্বাচন করুন</label>
            <select
              className="select"
              value={selectedRecovery}
              onChange={(e) => setSelectedRecovery(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">— ডিফল্ট (Active Recovery Multi) —</option>
              {recoveryMultis.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} {m.status === "active" ? "(active)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
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
      {!loading && pending.length === 0 && (
        <div className="card p-5 text-center muted">কোনো pending ক্লেইম নেই।</div>
      )}

      {pending.map((c) => (
        <div key={c.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={badgeClass(c.status)}>{c.status.replaceAll("_", " ")}</span>
            <span className="font-mono text-sm font-bold">{c.orderCode}</span>
            <span className="tiny muted ml-auto">{dhaka(c.createdAt)}</span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
            {c.screenshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.screenshotUrl}
                alt="loss proof"
                onClick={() => setZoom(c.screenshotUrl)}
                className="h-40 w-full cursor-zoom-in rounded-xl border border-white/10 object-cover sm:w-[180px]"
              />
            ) : (
              <div className="grid h-40 place-items-center rounded-xl border border-white/10 bg-black/30 muted">স্ক্রিনশট নেই</div>
            )}
            <div className="space-y-1 text-sm">
              <p>
                <b>👤 {c.customerName}</b> <span className="muted">({c.customerEmail})</span>
              </p>
              <p className="tiny muted">🎯 Multi: {c.multiTitle ?? "—"}</p>
              <p className="tiny muted">Order status: {c.orderStatus.replaceAll("_", " ")}</p>
              {c.message && <p className="rounded-lg bg-white/5 px-2 py-1">💬 {c.message}</p>}
              {c.adminNote && <p className="tiny muted">📝 {c.adminNote}</p>}

              <input
                className="input mt-2"
                placeholder="Admin নোট (কাস্টমারকে জানানো হবে)"
                value={notes[c.id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {mode === "refund" ? (
                  <button className="btn btn-primary btn-sm" disabled={busy === c.id} onClick={() => decide(c.id, "APPROVE_REFUND")}>
                    💸 APPROVE REFUND
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={busy === c.id} onClick={() => decide(c.id, "APPROVE_RECOVERY")}>
                    🔁 APPROVE RECOVERY + DELIVER
                  </button>
                )}
                <button className="btn btn-danger btn-sm" disabled={busy === c.id} onClick={() => decide(c.id, "REJECT")}>
                  ❌ REJECT
                </button>
                <button className="btn btn-ghost btn-sm" disabled={busy === c.id} onClick={() => decide(c.id, "REQUEST_INFO")}>
                  ℹ️ REQUEST INFO
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {rows.filter((c) => c.status === "REFUND_APPROVED" || c.status === "RECOVERY_APPROVED" || c.status === "REJECTED").length >
        0 && (
        <div className="card p-4">
          <h2 className="section-title mb-3">Resolved</h2>
          <div className="space-y-2">
            {rows
              .filter((c) => c.status === "REFUND_APPROVED" || c.status === "RECOVERY_APPROVED" || c.status === "REJECTED")
              .map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
                  <span className={badgeClass(c.status)}>{c.status.replaceAll("_", " ")}</span>
                  <span className="font-mono">{c.orderCode}</span>
                  <span className="muted ml-auto">
                    👤 {c.customerName} · {dhaka(c.decidedAt)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="proof" className="max-h-full max-w-full rounded-2xl" />
        </div>
      )}
    </div>
  );
}
