"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, badgeClass, dhaka, fileToDataUrl } from "@/lib/client";
import type { ChatMessage } from "@/components/ChatPanel";

type ConversationRow = {
  conversationId: number;
  userId: number;
  name: string;
  email: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadForAdmin: number;
};

export default function AdminChatsPage() {
  const [list, setList] = useState<ConversationRow[]>([]);
  const [search, setSearch] = useState("");
  const [activeUser, setActiveUser] = useState<number | null>(null);
  const [customer, setCustomer] = useState<{ id: number; name: string; email: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [order, setOrder] = useState<{ code: string; status: string } | null>(null);
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"admin" | "ai">("admin");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const res = await api<{ conversations: ConversationRow[] }>(
      `/api/admin/chats${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    );
    if (res.ok) setList(res.conversations ?? []);
    else setError(res.error ?? "চ্যাট লোড করা যায়নি।");
  }, [search]);

  const loadThread = useCallback(async (userId: number) => {
    const res = await api<{
      customer: { id: number; name: string; email: string };
      messages: ChatMessage[];
      order: { code: string; status: string } | null;
    }>(`/api/admin/chats?userId=${userId}`);
    if (res.ok) {
      setCustomer(res.customer);
      setMessages(res.messages);
      setOrder(res.order);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    }
  }, []);

  useEffect(() => {
    void loadList();
    const timer = setInterval(loadList, 15000);
    return () => clearInterval(timer);
  }, [loadList]);

  useEffect(() => {
    if (activeUser) void loadThread(activeUser);
  }, [activeUser, loadThread]);

  const send = async () => {
    if (!activeUser || (!body.trim() && !attachment)) return;
    setBusy(true);
    const res = await api<{ messages: ChatMessage[] }>("/api/admin/chats", {
      body: { userId: activeUser, body: body.trim(), mode, attachment },
    });
    setBusy(false);
    if (res.ok) {
      setMessages(res.messages);
      setBody("");
      setAttachment(null);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
      void loadList();
    }
  };

  const resend = async () => {
    if (!activeUser) return;
    const orders = await api<{ orders: Array<{ id: number; customerId: number; orderCode: string }> }>("/api/admin/orders");
    if (!orders.ok) return;
    const target = orders.orders.find((o) => o.customerId === activeUser);
    if (!target) return;
    setBusy(true);
    await api("/api/admin/deliveries", { body: { orderId: target.id, action: "RESEND" } });
    setBusy(false);
    await loadThread(activeUser);
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
      <div className="card max-h-[80vh] overflow-y-auto p-3">
        <h1 className="mb-2 text-sm font-black uppercase tracking-wide">💬 Customer Chats</h1>
        <input className="input mb-2" placeholder="নাম / ইমেইল সার্চ..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {error && (
          <p className="tiny mb-2 rounded-lg bg-amber-400/15 p-2 text-amber-100">
            ⚠️ {error}{" "}
            <button className="underline" onClick={() => void loadList()}>
              আবার চেষ্টা
            </button>
          </p>
        )}
        {list.length === 0 && <p className="tiny muted p-2">কোনো কথোপকথন নেই।</p>}
        {list.map((c) => (
          <button
            key={c.conversationId}
            onClick={() => setActiveUser(c.userId)}
            className={`mb-1 w-full rounded-xl px-3 py-2 text-left transition ${
              activeUser === c.userId ? "bg-[#b8ff2e]/15 border border-[#b8ff2e]/40" : "hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-bold">{c.name}</span>
              {c.unreadForAdmin > 0 && <span className="badge badge-pending ml-auto">{c.unreadForAdmin}</span>}
            </div>
            <p className="tiny muted truncate">{c.lastMessagePreview ?? "—"}</p>
            <p className="tiny muted">{dhaka(c.lastMessageAt)}</p>
          </button>
        ))}
      </div>

      <div className="card flex h-[80vh] flex-col overflow-hidden">
        {!activeUser ? (
          <div className="grid flex-1 place-items-center muted">একজন কাস্টমার নির্বাচন করুন</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/30 px-4 py-3">
              <div>
                <p className="text-sm font-black">{customer?.name}</p>
                <p className="tiny muted">{customer?.email}</p>
              </div>
              {order && (
                <span className={`${badgeClass(order.status)} ml-2`}>
                  {order.code} · {order.status.replaceAll("_", " ")}
                </span>
              )}
              <button className="btn btn-ghost btn-sm ml-auto" onClick={resend} disabled={busy}>
                🔁 RESEND MULTI
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
              {messages.map((m) => {
                const fromCustomer = m.senderType === "customer";
                return (
                  <div key={m.id} className={`flex ${fromCustomer ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`chat-bubble ${
                        fromCustomer ? "bubble-ai" : m.senderType === "admin" ? "bubble-admin" : "bubble-customer"
                      }`}
                    >
                      <p className="mb-1 text-[0.65rem] font-extrabold uppercase tracking-wider opacity-70">
                        {fromCustomer ? "👤 Customer" : m.senderType === "admin" ? `🛡 ${m.senderName}` : `🤖 ${m.senderName}`}
                      </p>
                      {m.body}
                      {m.attachmentUrl && (
                        <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.attachmentUrl} alt="attachment" className="max-h-52 rounded-lg border border-white/15" />
                        </a>
                      )}
                      <p className="mt-1 text-[0.6rem] opacity-60">{dhaka(m.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-white/10 bg-black/30 p-3">
              <div className="mb-2 flex gap-2">
                {(["admin", "ai"] as const).map((m) => (
                  <button key={m} className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode(m)}>
                    {m === "admin" ? "🛡 Admin reply" : "🤖 AI reply"}
                  </button>
                ))}
                <label className="btn btn-ghost btn-sm cursor-pointer">
                  📎 Attach
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setAttachment(await fileToDataUrl(f));
                    }}
                  />
                </label>
                {attachment && <span className="badge badge-ok">ছবি যুক্ত</span>}
              </div>
              <div className="flex gap-2">
                <textarea
                  className="textarea min-h-[46px] flex-1"
                  rows={1}
                  placeholder={mode === "ai" ? "কাস্টমারের প্রশ্ন লিখুন — AI উত্তর তৈরি করে পাঠাবে" : "Admin হিসেবে মেসেজ লিখুন..."}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button className="btn btn-primary" onClick={send} disabled={busy}>
                  ➤
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
