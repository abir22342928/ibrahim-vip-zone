"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Countdown from "@/components/Countdown";
import { api, bn } from "@/lib/client";
import type { MultiState } from "@/lib/multi";

type Props = {
  state: MultiState;
  isLoggedIn: boolean;
};

export default function TodayMulti({ state, isLoggedIn }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(state.isExpired || !state.isLive);

  const buy = useCallback(async () => {
    setError(null);
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    setBusy(true);
    const res = await api<{ order: { orderCode: string } }>("/api/orders", { body: {} });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setExpired(true);
      return;
    }
    router.push("/chat");
  }, [isLoggedIn, router]);

  const discount =
    state.priceOriginal > state.priceDiscount
      ? Math.round(((state.priceOriginal - state.priceDiscount) / state.priceOriginal) * 100)
      : 0;

  return (
    <section id="today" className="card neon-edge overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#b8ff2e]" />
          <h2 className="section-title">আজকের মাল্টি</h2>
        </div>
        <span className={`badge ${expired ? "badge-bad" : "badge-ok"}`}>
          {expired ? "SOLD OUT" : "LIVE NOW"}
        </span>
      </div>

      <div className="p-4">
        <div className="relative mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          {state.multi?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.multi.imageUrl}
              alt={state.multi.title}
              className={`h-52 w-full object-cover sm:h-64 ${expired ? "opacity-40 grayscale" : ""}`}
            />
          ) : (
            <div className="grid h-52 w-full place-items-center text-5xl sm:h-64">🔒</div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3">
            <p className="text-sm font-extrabold">{state.multi?.title ?? "আজকের মাল্টি প্রস্তুত হচ্ছে"}</p>
            {state.multi?.publicNote && <p className="tiny muted">{state.multi.publicNote}</p>}
          </div>
          {expired && (
            <div className="absolute inset-0 grid place-items-center">
              <span className="rotate-[-8deg] rounded-xl border-2 border-red-400/70 bg-black/70 px-4 py-2 text-lg font-black tracking-widest text-red-300">
                {state.soldOutText}
              </span>
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <p className="label mb-0">রেগুলার প্রাইস</p>
            <p className="text-lg font-bold text-white/45 line-through">
              ৳{bn(state.priceOriginal.toLocaleString("en-US"))}
            </p>
          </div>
          <div>
            <p className="label mb-0 text-[#b8ff2e]">আজকের ডিসকাউন্ট প্রাইস</p>
            <p className="text-3xl font-black leading-none text-[#b8ff2e]">
              ৳{bn(state.priceDiscount.toLocaleString("en-US"))}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {state.todayOdds ? (
              <span className="badge badge-info text-sm">Odds: {state.todayOdds}</span>
            ) : null}
            {discount > 0 && (
              <span className="badge badge-ok text-sm">-{bn(discount)}% OFF</span>
            )}
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="mb-2 text-center text-[0.7rem] font-bold uppercase tracking-[0.15em] text-white/55">
            {expired ? "আজকের সেল শেষ" : "অফার শেষ হতে বাকি"}
          </p>
          <Countdown
            targetIso={state.expiresAt}
            serverNowIso={state.serverNow}
            onExpire={() => {
              setExpired(true);
              router.refresh();
            }}
          />
          <p className="tiny muted mt-2 text-center">⏱ সার্ভার টাইম (Asia/Dhaka) অনুযায়ী গণনা করা হচ্ছে</p>
        </div>

        {error && <p className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>}

        <button className="btn btn-primary w-full text-base" onClick={buy} disabled={busy || expired}>
          {expired ? "🔒 TODAY'S MULTI EXPIRED" : busy ? "প্রসেস হচ্ছে..." : "🛒 BUY TODAY'S MULTI"}
        </button>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { icon: "🔒", label: "সিকিউর ভল্ট" },
            { icon: "✅", label: "ম্যানুয়াল ভেরিফিকেশন" },
            { icon: "💬", label: "২৪/৭ সাপোর্ট" },
          ].map((f) => (
            <div key={f.label} className="rounded-xl border border-white/10 bg-white/5 px-2 py-2">
              <div className="text-lg">{f.icon}</div>
              <div className="tiny muted">{f.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
