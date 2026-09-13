"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type Mode = "login" | "signup" | "forgot";

export default function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [stage, setStage] = useState<"request" | "reset">("request");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);

    if (mode === "login") {
      const res = await api<{ user: { role: string } }>("/api/auth/login", { body: { email, password } });
      setBusy(false);
      if (!res.ok) return setError(res.error);
      // Customer login success must go to Homepage "/" by default.
      // If customer came from a protected page with ?next=, honor that target unless it's /chat.
      const customerTarget = next && next !== "/chat" ? next : "/";
      router.push(res.user.role === "admin" ? "/admin" : customerTarget);
      router.refresh();
      return;
    }

    if (mode === "signup") {
      const res = await api("/api/auth/signup", { body: { name, email, phone, password } });
      setBusy(false);
      if (!res.ok) return setError(res.error);
      const customerTarget = next && next !== "/chat" ? next : "/";
      router.push(customerTarget);
      router.refresh();
      return;
    }

    if (stage === "request") {
      const res = await api<{ resetToken?: string; message?: string }>("/api/auth/password", { body: { email } });
      setBusy(false);
      if (!res.ok) return setError(res.error);
      setStage("reset");
      if (res.resetToken) {
        setToken(res.resetToken);
        setInfo(`রিসেট কোড: ${res.resetToken} — নিচে নতুন পাসওয়ার্ড দিন।`);
      } else {
        setInfo(res.message ?? "রিসেট কোড তৈরি হয়েছে।");
      }
      return;
    }

    const res = await api<{ message?: string }>("/api/auth/password", {
      method: "PUT",
      body: { token, password },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setInfo("পাসওয়ার্ড পরিবর্তন হয়েছে। এখন লগইন করুন।");
    setTimeout(() => router.push("/login"), 1200);
  };

  return (
    <form onSubmit={submit} className="card w-full max-w-md p-5">
      <div className="mb-4 text-center">
        <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#b8ff2e] to-[#35e08b] text-2xl">
          ⚽
        </div>
        <h1 className="text-xl font-black">
          {mode === "login" ? "লগইন করুন" : mode === "signup" ? "নতুন অ্যাকাউন্ট" : "পাসওয়ার্ড রিসেট"}
        </h1>
        <p className="tiny muted mt-1">
          {mode === "signup"
            ? "অ্যাকাউন্ট খুললে আপনার চ্যাট ও অর্ডার হিস্ট্রি সবসময় সেভ থাকবে।"
            : "আপনার সব ডেটা নিরাপদভাবে সংরক্ষিত থাকে।"}
        </p>
      </div>

      {mode === "signup" && (
        <>
          <label className="label">আপনার নাম</label>
          <input className="input mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: রাকিব হাসান" required />
        </>
      )}

      {(mode !== "forgot" || stage === "request") && (
        <>
          <label className="label">ইমেইল</label>
          <input
            className="input mb-3"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
            autoComplete="email"
          />
        </>
      )}

      {mode === "signup" && (
        <>
          <label className="label">ফোন নাম্বার (ঐচ্ছিক)</label>
          <input className="input mb-3" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
        </>
      )}

      {mode === "forgot" && stage === "reset" && (
        <>
          <label className="label">রিসেট কোড</label>
          <input className="input mb-3" value={token} onChange={(e) => setToken(e.target.value)} required />
        </>
      )}

      {(mode !== "forgot" || stage === "reset") && (
        <>
          <label className="label">{mode === "forgot" ? "নতুন পাসওয়ার্ড" : "পাসওয়ার্ড"}</label>
          <input
            className="input mb-3"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="কমপক্ষে ৬ অক্ষর"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </>
      )}

      {error && <p className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>}
      {info && <p className="mb-3 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200 break-all">{info}</p>}

      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? "অপেক্ষা করুন..." : mode === "login" ? "লগইন" : mode === "signup" ? "সাইন আপ" : stage === "request" ? "রিসেট কোড নিন" : "পাসওয়ার্ড সেট করুন"}
      </button>

      <div className="mt-4 space-y-1 text-center text-sm">
        {mode === "login" && (
          <>
            <p className="muted">
              অ্যাকাউন্ট নেই?{" "}
              <Link href="/signup" className="font-bold text-[#b8ff2e]">
                সাইন আপ করুন
              </Link>
            </p>
            <p className="muted">
              <Link href="/forgot" className="underline">
                পাসওয়ার্ড ভুলে গেছেন?
              </Link>
            </p>
          </>
        )}
        {mode === "signup" && (
          <p className="muted">
            আগে থেকেই অ্যাকাউন্ট আছে?{" "}
            <Link href="/login" className="font-bold text-[#b8ff2e]">
              লগইন
            </Link>
          </p>
        )}
        {mode === "forgot" && (
          <p className="muted">
            <Link href="/login" className="underline">
              লগইন পেজে ফিরে যান
            </Link>
          </p>
        )}
        <p className="tiny muted pt-2">
          <Link href="/">← হোমপেজ</Link>
        </p>
      </div>
    </form>
  );
}
