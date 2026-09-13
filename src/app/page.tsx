import Link from "next/link";
import { ensureSeeded } from "@/db/seed";
import { getCurrentUser } from "@/lib/auth";
import { getMultiState } from "@/lib/multi";
import { getPublicSettings } from "@/lib/settings";
import { toBnDigits } from "@/lib/format";
import SiteHeader from "@/components/SiteHeader";
import TodayMulti from "@/components/TodayMulti";
import ChatWidget from "@/components/ChatWidget";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureSeeded();
  const [state, settings, user] = await Promise.all([
    getMultiState(),
    getPublicSettings(),
    getCurrentUser(),
  ]);

  const steps = [
    { n: 1, t: "অ্যাকাউন্ট খুলুন", d: "৩০ সেকেন্ডে সাইন আপ করে লগইন করুন।" },
    { n: 2, t: "আজকের মাল্টি অর্ডার করুন", d: `ডিসকাউন্ট প্রাইস ৳${toBnDigits(state.priceDiscount)} — কোনো হিডেন চার্জ নেই।` },
    { n: 3, t: "পেমেন্ট করুন", d: "bKash/Nagad-এ পেমেন্ট করে Transaction ID ও Screenshot দিন।" },
    { n: 4, t: "Source Commission", d: `Admin অনুমোদনের পর ৳${toBnDigits(state.sourceCommission)} সোর্স কমিশন ক্লিয়ার করুন।` },
    { n: 5, t: "Multi ডেলিভারি", d: "দুই ধাপ অনুমোদনের পর প্রোটেক্টেড মাল্টি অটোমেটিক চ্যাটে চলে আসবে।" },
  ];

  return (
    <div className="min-h-screen pb-24">
      <SiteHeader brandName={settings.brandName} user={user ? { id: user.id, name: user.name, role: user.role } : null} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: "url(/images/hero-stadium.jpg)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/70 to-[#05070a]" />
        <div className="relative mx-auto max-w-5xl px-4 pb-8 pt-10 text-center sm:pt-14">
          <span className="badge badge-ok mb-3">🔥 {settings.brandTagline}</span>
          <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-5xl">
            {settings.heroHeadline}
            <span className="block bg-gradient-to-r from-[#b8ff2e] to-[#35e08b] bg-clip-text text-transparent">
              ৳{toBnDigits(state.priceDiscount)} মাত্র
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm muted sm:text-base">{settings.heroSubline}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <a href="#today" className="btn btn-primary">
              ⚽ আজকের মাল্টি দেখুন
            </a>
            {!user && (
              <Link href="/signup" className="btn btn-ghost">
                ফ্রি অ্যাকাউন্ট খুলুন
              </Link>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto -mt-4 max-w-5xl space-y-6 px-4">
        <TodayMulti state={state} isLoggedIn={Boolean(user)} />

        {/* Steps */}
        <section className="card p-4">
          <h2 className="section-title mb-3">কীভাবে কাজ করে</h2>
          <ol className="space-y-3">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#b8ff2e]/15 text-sm font-black text-[#b8ff2e]">
                  {toBnDigits(s.n)}
                </span>
                <div>
                  <p className="text-sm font-bold">{s.t}</p>
                  <p className="tiny muted">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing detail */}
        <section className="grid gap-3 sm:grid-cols-3">
          {[
            { title: "মাল্টি প্রাইস", value: `৳${toBnDigits(state.priceDiscount)}`, note: "আজকের ডিসকাউন্ট প্রাইস" },
            { title: "সোর্স কমিশন", value: `৳${toBnDigits(state.sourceCommission)}`, note: "Main payment অনুমোদনের পর" },
            { title: "অতিরিক্ত ফি", value: "৳০", note: "কোনো হিডেন চার্জ নেই" },
          ].map((c) => (
            <div key={c.title} className="card p-4">
              <p className="label mb-1">{c.title}</p>
              <p className="text-2xl font-black text-[#b8ff2e]">{c.value}</p>
              <p className="tiny muted mt-1">{c.note}</p>
            </div>
          ))}
        </section>

        {/* Refund / recovery */}
        <section className="card p-4">
          <h2 className="section-title mb-2">🛡 Refund / Recovery</h2>
          <p className="text-sm muted">{settings.refundPolicy}</p>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="text-sm font-bold text-[#b8ff2e]">Recovery Policy</p>
            <p className="tiny muted mt-1">{settings.recoveryPolicy}</p>
          </div>
        </section>

        {/* Support */}
        <section className="card p-4">
          <h2 className="section-title mb-2">🎧 কাস্টমার সাপোর্ট</h2>
          <p className="text-sm muted">
            যেকোনো সমস্যায় AI Assistant-এ মেসেজ দিন অথবা সরাসরি Admin-এর সাথে যোগাযোগ করুন।
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a href={settings.telegramLink} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              ✈️ {settings.telegramUsername}
            </a>
            <Link href="/chat" className="btn btn-primary btn-sm">
              💬 AI Assistant
            </Link>
            <span className="tiny muted">🕘 {settings.supportHours}</span>
          </div>
        </section>

        <footer className="pb-6 pt-2 text-center">
          <p className="text-sm font-black tracking-tight">{settings.brandName}</p>
          <p className="tiny muted mt-1">
            © {new Date().getFullYear()} {settings.brandName}. সব তথ্য সার্ভার-সাইড ভেরিফাই করা হয়।
          </p>
          <p className="tiny muted mt-1">১৮+ | দায়িত্বশীলভাবে ব্যবহার করুন। কোনো ফলাফলের নিশ্চয়তা দেওয়া হয় না।</p>
          <Link
            href="/admin/login"
            className="mt-3 inline-block text-[0.65rem] text-white/25 transition hover:text-white/60"
          >
            Admin Login
          </Link>
        </footer>
      </main>

      <ChatWidget aiName={settings.aiName} />
    </div>
  );
}
