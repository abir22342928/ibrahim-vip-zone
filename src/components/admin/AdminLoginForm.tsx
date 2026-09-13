"use client";

import Link from "next/link";
import { useState } from "react";

export default function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;

    // Client-side validation first (clear feedback even offline).
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError("❌ ইমেইল ও পাসওয়ার্ড দিন।");
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        user?: { role?: string };
      };

      if (!res.ok || data.ok === false) {
        setError(`❌ ${data.error ?? "Admin email or password is incorrect."}`);
        setBusy(false);
        return;
      }

      if (data.user?.role !== "admin") {
        // Defensive: a non-admin must never land in the panel.
        await fetch("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
        setError("❌ এই অ্যাকাউন্টে Admin অ্যাক্সেস নেই।");
        setBusy(false);
        return;
      }

      // Full page navigation so the server re-renders /admin with the freshly
      // set session cookie. This guarantees the dashboard (not the login form)
      // is shown and avoids soft-navigation / cookie-timing races.
      window.location.assign("/admin");
    } catch {
      setError("❌ Unable to connect to Admin authentication service.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-6" noValidate>
      <div className="mb-5 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#b8ff2e] to-[#35e08b] text-2xl">
          🛡
        </div>
        <h1 className="text-xl font-black">Admin Login</h1>
        <p className="tiny muted mt-1">IBRAHIM VIP ZONE — সিকিউর অ্যাডমিন প্যানেল</p>
      </div>

      <label htmlFor="admin-email" className="label">
        Admin Email
      </label>
      <input
        id="admin-email"
        className="input mb-3"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        enterKeyHint="next"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Admin email address"
        autoComplete="username"
      />

      <label htmlFor="admin-password" className="label">
        Password
      </label>
      <input
        id="admin-password"
        className="input mb-4"
        type="password"
        enterKeyHint="go"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        autoComplete="current-password"
      />

      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm font-medium text-red-200">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "⏳ যাচাই হচ্ছে..." : "🔐 Admin Login"}
      </button>

      <p className="tiny muted mt-4 text-center">
        <Link href="/" className="underline">
          ← ওয়েবসাইটে ফিরে যান
        </Link>
      </p>
    </form>
  );
}
