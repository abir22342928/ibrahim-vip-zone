"use client";

import { useCallback, useEffect, useState } from "react";
import { api, badgeClass, bn, dhaka, fileToDataUrl } from "@/lib/client";

type MultiRow = {
  id: number;
  kind: string;
  title: string;
  publicNote: string | null;
  publicImageUrl: string | null;
  protectedImageUrl: string | null;
  protectedDescription: string | null;
  status: string;
  isAvailable: boolean;
  publishAt: string | null;
  expiresAt: string | null;
  priceOriginal: number | null;
  priceDiscount: number | null;
  createdAt: string;
  deliveryCount: number;
};

const emptyForm = {
  title: "",
  publicNote: "",
  protectedDescription: "",
  publishAt: "",
  expiresAt: "",
  priceOriginal: "",
  priceDiscount: "",
  odds: "",
  publicImage: null as string | null,
  protectedImage: null as string | null,
};

export default function MultiManager({ kind }: { kind: "daily" | "recovery" }) {
  const [rows, setRows] = useState<MultiRow[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    const res = await api<{ multis: MultiRow[] }>(`/api/admin/multi?kind=${kind}`);
    if (res.ok) setRows(res.multis ?? []);
    else setError(res.error ?? "Multi লোড করা যায়নি।");
  }, [kind]);

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

    let publishAtIso: string | undefined = undefined;
    if (form.publishAt) {
      const d = new Date(form.publishAt);
      if (!Number.isNaN(d.getTime())) publishAtIso = d.toISOString();
    }

    let expiresAtIso: string | undefined = undefined;
    if (form.expiresAt) {
      const d = new Date(form.expiresAt);
      if (!Number.isNaN(d.getTime())) expiresAtIso = d.toISOString();
    }

    setBusy(true);
    const res = await api("/api/admin/multi", {
      body: {
        kind,
        title: form.title.trim(),
        publicNote: form.publicNote.trim() || undefined,
        protectedDescription: form.protectedDescription.trim() || undefined,
        publicImage: form.publicImage || undefined,
        protectedImage: form.protectedImage,
        publishAt: publishAtIso,
        expiresAt: expiresAtIso,
        priceOriginal: form.priceOriginal ? Number(form.priceOriginal) : undefined,
        priceDiscount: form.priceDiscount ? Number(form.priceDiscount) : undefined,
        odds: form.odds ? form.odds.trim() : undefined,
        publish: true,
      },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "সংরক্ষণে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
      return;
    }
    setMessage("✅ নতুন Multi সফলভাবে সেভ ও পাবলিশ হয়েছে।");
    setForm({ ...emptyForm });
    await load();
  };

  const act = async (
    id: number,
    action: "activate" | "archive" | "toggle" | "purge",
    current?: MultiRow,
  ) => {
    setBusy(true);
    setMessage(null);
    setError(null);
    let res;
    if (action === "purge") {
      res = await api(`/api/admin/multi?id=${id}&purge=1`, { method: "DELETE" });
    } else if (action === "toggle") {
      res = await api("/api/admin/multi", { method: "PATCH", body: { id, isAvailable: !current?.isAvailable } });
    } else {
      res = await api("/api/admin/multi", {
        method: "PATCH",
        body: { id, status: action === "activate" ? "active" : "archived" },
      });
    }
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setMessage("সংরক্ষণ হয়েছে।");
    await load();
  };

  const isDaily = kind === "daily";

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h1 className="text-lg font-black">{isDaily ? "⚽ TODAY'S MULTI" : "🔁 RECOVERY MULTI"}</h1>
        <p className="tiny muted">
          {isDaily
            ? "আজকের মাল্টির পাবলিক প্রিভিউ, শুরুর/শেষের সময়, দাম ও প্রোটেক্টেড কনটেন্ট ম্যানেজ করুন।"
            : "Recovery Multi ম্যানেজ করুন — Recovery অনুমোদিত কাস্টমারকে এটি ডেলিভারি হয়।"}
        </p>
      </div>

      <div className="card p-4">
        <h2 className="section-title mb-3">নতুন {isDaily ? "Daily" : "Recovery"} Multi আপলোড / Replace</h2>
        <label className="label">Title</label>
        <input
          className="input mb-3"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder={isDaily ? "যেমন: Friday Premium Multi" : "Recovery Multi"}
        />

        <label className="label">পাবলিক নোট (হোমপেজে দেখাবে)</label>
        <input
          className="input mb-3"
          value={form.publicNote}
          onChange={(e) => setForm({ ...form, publicNote: e.target.value })}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">পাবলিক প্রিভিউ ইমেজ</label>
            <input
              type="file"
              accept="image/*"
              className="input mb-2"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const data = await fileToDataUrl(f);
                  setForm((prev) => ({ ...prev, publicImage: data }));
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
            {form.publicImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.publicImage} alt="preview" className="mb-2 h-28 w-full rounded-xl object-cover" />
            )}
          </div>
          <div>
            <label className="label">🔒 Protected Multi ইমেজ (Vault) *</label>
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
          </div>
        </div>

        <label className="label">🔒 Protected Multi Description</label>
        <textarea
          className="textarea mb-3"
          rows={5}
          value={form.protectedDescription}
          onChange={(e) => setForm({ ...form, protectedDescription: e.target.value })}
          placeholder="ম্যাচ সিলেকশন, odds, stake পরামর্শ..."
        />

        {isDaily && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Publish time (আপনার ডিভাইস টাইম)</label>
              <input
                type="datetime-local"
                className="input mb-3"
                value={form.publishAt}
                onChange={(e) => setForm({ ...form, publishAt: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Expiry / Sold-out time</label>
              <input
                type="datetime-local"
                className="input mb-3"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Original price (ঐচ্ছিক)</label>
              <input
                className="input mb-3"
                value={form.priceOriginal}
                onChange={(e) => setForm({ ...form, priceOriginal: e.target.value })}
                placeholder="ডিফল্ট: Pricing Settings"
              />
            </div>
            <div>
              <label className="label">Discount price (ঐচ্ছিক)</label>
              <input
                className="input mb-3"
                value={form.priceDiscount}
                onChange={(e) => setForm({ ...form, priceDiscount: e.target.value })}
                placeholder="ডিফল্ট: Pricing Settings"
              />
            </div>
            <div>
              <label className="label">Odds / Rate (ঐচ্ছিক)</label>
              <input
                className="input mb-3"
                value={form.odds}
                onChange={(e) => setForm({ ...form, odds: e.target.value })}
                placeholder="যেমন: 6.40"
              />
            </div>
          </div>
        )}

        {error && <p className="mb-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">{error}</p>}
        {message && <p className="mb-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-200">{message}</p>}

        <button className="btn btn-primary w-full" onClick={publish} disabled={busy}>
          {busy ? "সেভ হচ্ছে..." : "💾 SAVE / PUBLISH"}
        </button>
      </div>

      <h2 className="section-title">Multi ভার্সন হিস্ট্রি</h2>
      {rows.map((m) => (
        <div key={m.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={badgeClass(m.status === "active" ? "APPROVED" : "INFO")}>{m.status.toUpperCase()}</span>
            <span className={`badge ${m.isAvailable ? "badge-ok" : "badge-bad"}`}>{m.isAvailable ? "AVAILABLE" : "PAUSED"}</span>
            <b className="text-sm">{m.title}</b>
            <span className="tiny muted ml-auto">v{bn(m.id)} · {dhaka(m.createdAt)}</span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="label">Public preview</p>
              {m.publicImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.publicImageUrl} alt="public" className="h-32 w-full rounded-xl object-cover" />
              ) : (
                <div className="grid h-32 place-items-center rounded-xl border border-white/10 bg-black/30 muted tiny">নেই</div>
              )}
            </div>
            <div>
              <p className="label">🔒 Protected (vault)</p>
              {m.protectedImageUrl ? (
                reveal[m.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.protectedImageUrl} alt="protected" className="h-32 w-full rounded-xl object-cover" />
                ) : (
                  <button className="btn btn-ghost h-32 w-full" onClick={() => setReveal({ ...reveal, [m.id]: true })}>
                    👁 দেখতে ক্লিক করুন
                  </button>
                )
              ) : (
                <div className="grid h-32 place-items-center rounded-xl border border-white/10 bg-black/30 muted tiny">নেই</div>
              )}
            </div>
          </div>

          {m.protectedDescription && (
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
              {m.protectedDescription}
            </pre>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs muted">
            <span>🚚 ডেলিভারি: {bn(m.deliveryCount)}</span>
            <span>⏱ {dhaka(m.publishAt)} → {dhaka(m.expiresAt)}</span>
            {m.priceDiscount && <span>💰 ৳{bn(m.priceDiscount)}</span>}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {m.status !== "active" && (
              <button className="btn btn-primary btn-sm" onClick={() => act(m.id, "activate")} disabled={busy}>
                ▶ ACTIVATE
              </button>
            )}
            {m.status === "active" && (
              <button className="btn btn-ghost btn-sm" onClick={() => act(m.id, "archive")} disabled={busy}>
                ⏸ ARCHIVE / UNPUBLISH
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => act(m.id, "toggle", m)} disabled={busy}>
              {m.isAvailable ? "🚫 Sale বন্ধ" : "✅ Sale চালু"}
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => act(m.id, "purge")} disabled={busy}>
              🗑 DELETE (vault ফাইল মুছবে)
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
