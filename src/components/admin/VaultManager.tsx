"use client";

import { useCallback, useEffect, useState } from "react";
import { api, badgeClass, bn, dhaka, fileToDataUrl } from "@/lib/client";

type MultiRow = {
  id: number;
  kind: string;
  title: string;
  protectedImageUrl: string | null;
  protectedDescription: string | null;
  status: string;
  isAvailable: boolean;
  createdAt: string;
  deliveryCount: number;
};

const emptyForm = {
  title: "",
  protectedDescription: "",
  protectedImage: null as string | null,
};

export default function VaultManager() {
  const [daily, setDaily] = useState<MultiRow[]>([]);
  const [recovery, setRecovery] = useState<MultiRow[]>([]);
  const [kind, setKind] = useState<"daily" | "recovery">("daily");
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    const [d, r] = await Promise.all([
      api<{ multis: MultiRow[] }>("/api/admin/multi?kind=daily"),
      api<{ multis: MultiRow[] }>("/api/admin/multi?kind=recovery"),
    ]);
    if (d.ok) setDaily(d.multis ?? []);
    else setError(d.error ?? "Vault লোড করা যায়নি।");
    if (r.ok) setRecovery(r.multis ?? []);
    else setError(r.error ?? "Vault লোড করা যায়নি।");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    setError(null);
    setMessage(null);
    if (!form.title.trim()) {
      setError("Multi title দিন।");
      return;
    }
    if (!form.protectedImage) {
      setError("অনুগ্রহ করে Protected Multi Image নির্বাচন করুন।");
      return;
    }
    setBusy(true);
    const res = await api("/api/admin/multi", {
      body: {
        kind,
        title: form.title.trim(),
        protectedImage: form.protectedImage,
        protectedDescription: form.protectedDescription.trim() || undefined,
        publish: true,
      },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "সংরক্ষণে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
      return;
    }
    setMessage("✅ নতুন Protected Multi ভার্সন তৈরি হয়েছে। পুরনো ভার্সন আর্কাইভ হয়েছে।");
    setForm({ ...emptyForm });
    await load();
  };

  const purge = async (id: number, k: "daily" | "recovery") => {
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await api(`/api/admin/multi?id=${id}&purge=1`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setMessage("Protected Multi ডিলিট হয়েছে।");
    await load();
  };

  const activeDaily = daily.find((m) => m.status === "active");
  const activeRecovery = recovery.find((m) => m.status === "active");

  const renderProtected = (m: MultiRow | undefined, label: string, k: "daily" | "recovery") => {
    if (!m) {
      return (
        <div className="grid h-40 place-items-center rounded-xl border border-dashed border-white/15 bg-black/30 muted tiny">
          {label} এখনো আপলোড করা হয়নি
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="badge badge-ok">{label}</span>
          <b className="text-sm">{m.title}</b>
          <span className="tiny muted ml-auto">v{bn(m.id)} · 🚚 {bn(m.deliveryCount)}</span>
        </div>
        {m.protectedImageUrl ? (
          reveal[m.id] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.protectedImageUrl} alt="protected multi" className="max-h-64 w-full rounded-xl border border-white/10 object-cover" />
          ) : (
            <button className="btn btn-ghost h-40 w-full" onClick={() => setReveal({ ...reveal, [m.id]: true })}>
              👁 Protected ইমেজ দেখতে ক্লিক করুন
            </button>
          )
        ) : (
          <div className="grid h-28 place-items-center rounded-xl border border-white/10 bg-black/30 muted tiny">Protected ইমেজ নেই</div>
        )}
        {m.protectedDescription && (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
            {m.protectedDescription}
          </pre>
        )}
        <button className="btn btn-danger btn-sm" onClick={() => purge(m.id, k)} disabled={busy}>
          🗑 Delete current Multi
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="card neon-edge p-4">
        <h1 className="text-lg font-black">🔒 MULTI VAULT</h1>
        <p className="tiny muted">
          সম্পূর্ণ প্রাইভেট ও Admin-only। Protected Multi শুধুমাত্র তখনই কাস্টমারকে ডেলিভারি হয় যখন{" "}
          <b className="text-[#b8ff2e]">MAIN_PAYMENT_APPROVED</b> এবং{" "}
          <b className="text-[#b8ff2e]">SOURCE_PAYMENT_APPROVED</b> — দুটোই সার্ভার-সাইডে নিশ্চিত হয়। কোনো পাবলিক URL নেই।
        </p>
      </div>

      <div className="card p-4">
        <h2 className="section-title mb-3">আজকের Protected Multi</h2>
        {renderProtected(activeDaily, "TODAY'S MULTI (ACTIVE)", "daily")}
      </div>

      <div className="card p-4">
        <h2 className="section-title mb-3">Recovery Protected Multi</h2>
        {renderProtected(activeRecovery, "RECOVERY MULTI (ACTIVE)", "recovery")}
      </div>

      <div className="card p-4">
        <h2 className="section-title mb-3">নতুন Protected Multi ভার্সন তৈরি করুন</h2>
        <div className="mb-3 flex gap-2">
          {(["daily", "recovery"] as const).map((k) => (
            <button key={k} className={`btn btn-sm ${kind === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setKind(k)}>
              {k === "daily" ? "Today's Multi" : "Recovery Multi"}
            </button>
          ))}
        </div>

        <label className="label">Title</label>
        <input
          className="input mb-3"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Protected Multi title"
        />

        <label className="label">🔒 Protected image *</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="input mb-2"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) {
              setForm((prev) => ({ ...prev, protectedImage: null }));
              setError("অনুগ্রহ করে Protected Multi Image নির্বাচন করুন।");
              return;
            }
            try {
              const data = await fileToDataUrl(f);
              setForm((prev) => ({ ...prev, protectedImage: data }));
              setError(null);
            } catch (err) {
              setForm((prev) => ({ ...prev, protectedImage: null }));
              setError("অনুগ্রহ করে Protected Multi Image নির্বাচন করুন।");
            }
          }}
        />
        {form.protectedImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.protectedImage} alt="protected" className="mb-2 h-28 w-full rounded-xl object-cover" />
        )}

        <label className="label">🔒 Protected description</label>
        <textarea
          className="textarea mb-3"
          rows={5}
          value={form.protectedDescription}
          onChange={(e) => setForm({ ...form, protectedDescription: e.target.value })}
          placeholder="ম্যাচ সিলেকশন, odds, stake পরামর্শ..."
        />

        {error && <p className="mb-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">{error}</p>}
        {message && <p className="mb-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-200">{message}</p>}

        <button className="btn btn-primary w-full" onClick={publish} disabled={busy}>
          {busy ? "সেভ হচ্ছে..." : "💾 SAVE / PUBLISH"}
        </button>
      </div>

      <div className="card p-4">
        <h2 className="section-title mb-3">All Multi ভার্সন</h2>
        <div className="space-y-2">
          {[...daily, ...recovery]
            .sort((a, b) => b.id - a.id)
            .map((m) => (
              <div key={`${m.kind}-${m.id}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
                <span className="badge badge-info">{m.kind.toUpperCase()}</span>
                <span className={badgeClass(m.status === "active" ? "APPROVED" : "INFO")}>{m.status.toUpperCase()}</span>
                <b>{m.title}</b>
                <span className="muted">🚚 {bn(m.deliveryCount)}</span>
                <span className="muted ml-auto">{dhaka(m.createdAt)}</span>
                <button className="btn btn-danger btn-sm" onClick={() => purge(m.id, m.kind as "daily" | "recovery")} disabled={busy}>
                  🗑
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
