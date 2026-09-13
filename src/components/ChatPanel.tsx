"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, badgeClass, bn, fileToDataUrl } from "@/lib/client";

export type ChatMessage = {
  id: number;
  senderType: "customer" | "ai" | "admin" | "system";
  senderName: string | null;
  body: string;
  attachmentUrl: string | null;
  attachmentLabel: string | null;
  orderId: number | null;
  createdAt: string;
};

type OrderCtx = {
  id: number;
  code: string;
  status: string;
  mainPaymentStatus: string;
  sourcePaymentStatus: string;
  priceAmount: number;
  sourceCommissionAmount: number;
} | null;

type ChatResponse = {
  guest: boolean;
  aiName: string;
  messages: ChatMessage[];
  order: OrderCtx;
};

type Props = { variant?: "widget" | "page"; onClose?: () => void };

const QUICK_PROMPTS = [
  "আজকের মাল্টি নিব",
  "আজকের মাল্টির দাম কত?",
  "বিকাশ নাম্বার দেন",
  "আজকের মাল্টি কি জিতবে?",
  "আজকের Multi-এর odds কত?",
  "Admin এর সাথে কথা বলতে চাই",
];

export default function ChatPanel({ variant = "widget", onClose }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [order, setOrder] = useState<OrderCtx>(null);
  const [guest, setGuest] = useState(true);
  const [aiName, setAiName] = useState("IBRAHIM VIP ZONE");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<Array<{ label: string; action: string }>>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    });
  }, []);

  const load = useCallback(async () => {
    const res = await api<ChatResponse>("/api/chat");
    if (res.ok) {
      setMessages(res.messages ?? []);
      setOrder(res.order ?? null);
      setGuest(Boolean(res.guest));
      setAiName(res.aiName ?? "IBRAHIM VIP ZONE");
    }
    setLoading(false);
    scrollToEnd(false);
  }, [scrollToEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll so admin replies land in the customer's chat automatically.
  useEffect(() => {
    if (guest) return;
    const timer = setInterval(async () => {
      const res = await api<ChatResponse>("/api/chat");
      if (res.ok) {
        setMessages((prev) => {
          if (prev.length !== res.messages.length) {
            scrollToEnd();
            return res.messages;
          }
          return prev;
        });
        setOrder(res.order ?? null);
      }
    }, 9000);
    return () => clearInterval(timer);
  }, [guest, scrollToEnd]);

  const send = useCallback(
    async (text: string) => {
      const value = text.trim();
      if (!value || sending) return;
      setSending(true);
      setInput("");
      const optimistic: ChatMessage = {
        id: -Date.now(),
        senderType: "customer",
        senderName: "You",
        body: value,
        attachmentUrl: null,
        attachmentLabel: null,
        orderId: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      scrollToEnd();

      const res = await api<{ guest: boolean; messages?: ChatMessage[]; reply?: ChatMessage; actions?: Array<{ label: string; action: string }>; order?: OrderCtx }>(
        "/api/chat",
        { body: { message: value } },
      );
      if (res.ok) {
        if (res.messages) setMessages(res.messages);
        else if (res.reply) setMessages((prev) => [...prev, res.reply as ChatMessage]);
        setActions(res.actions ?? []);
        if (res.order !== undefined) setOrder(res.order ?? null);
      } else {
        setNotice(res.error);
      }
      setSending(false);
      scrollToEnd();
    },
    [scrollToEnd, sending],
  );

  const paymentKind: "MAIN" | "SOURCE" =
    order && (order.status === "MAIN_PAYMENT_APPROVED" || order.status === "SOURCE_PAYMENT_REJECTED" || order.status === "SOURCE_PAYMENT_PENDING")
      ? "SOURCE"
      : "MAIN";

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (guest) {
        router.push("/login?next=/chat");
        return;
      }
      try {
        const screenshot = await fileToDataUrl(file);
        setUploading(true);
        setNotice(null);
        const res = await api<{ messages?: ChatMessage[]; order?: OrderCtx }>("/api/chat/upload", {
          body: { screenshot, method: paymentKind === "SOURCE" ? "nagad" : "bkash", kind: paymentKind },
        });
        setUploading(false);
        if (res.ok) {
          if (res.messages) setMessages(res.messages);
          if (res.order !== undefined) setOrder(res.order ?? null);
          scrollToEnd();
        } else {
          setNotice(res.error || "ফাইল আপলোড করা যায়নি।");
        }
      } catch (err) {
        setUploading(false);
        setNotice((err as Error)?.message || "ফাইল আপলোড করা যায়নি।");
      }
    },
    [guest, router, paymentKind, scrollToEnd],
  );

  const createOrder = useCallback(async () => {
    if (guest) {
      router.push("/login");
      return;
    }
    setSending(true);
    const res = await api<{ order: { id: number; orderCode: string } }>("/api/orders", { body: {} });
    setSending(false);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    await load();
    setPayOpen(true);
  }, [guest, load, router]);

  const handleAction = useCallback(
    async (action: string) => {
      switch (action) {
        case "BUY":
          await createOrder();
          break;
        case "SUBMIT_PAYMENT":
          if (guest) router.push("/login");
          else if (!order) await createOrder();
          else setPayOpen(true);
          break;
        case "ASK_PRICE":
          await send("আজকের মাল্টির দাম কত?");
          break;
        case "ASK_NUMBER":
          await send("পেমেন্ট নাম্বার দিন");
          break;
        case "SUPPORT":
          await send("Admin এর সাথে কথা বলতে চাই");
          break;
        case "REFUND":
          if (guest) router.push("/login");
          else setRefundOpen(true);
          break;
        case "LOGIN":
          router.push("/login");
          break;
        case "ORDERS":
          router.push("/orders");
          break;
        case "ACCOUNT":
          router.push("/account");
          break;
        default:
          break;
      }
    },
    [createOrder, guest, order, router, send],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-black/40 px-4 py-3">
        <div className="relative">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#b8ff2e] to-[#35e08b] text-lg">
            ⚽
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-black bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{aiName}</p>
          <p className="tiny muted">অনলাইন • সাধারণত সাথে সাথে রিপ্লাই দেয়</p>
        </div>
        {order && (
          <span className={badgeClass(order.status)} title={order.code}>
            {order.status.replaceAll("_", " ")}
          </span>
        )}
        {onClose && (
          <button onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Close chat">
            ✕
          </button>
        )}
      </div>

      {/* messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-4"
        style={{ scrollBehavior: "smooth" }}
      >
        {loading && <div className="shimmer h-16 rounded-2xl" />}
        {messages.map((m) => {
          const mine = m.senderType === "customer";
          const bubble =
            m.senderType === "customer"
              ? "bubble-customer"
              : m.senderType === "admin"
                ? "bubble-admin"
                : "bubble-ai";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`chat-bubble ${bubble}`}>
                {!mine && (
                  <p className="mb-1 text-[0.65rem] font-extrabold uppercase tracking-wider opacity-70">
                    {m.senderType === "admin" ? `👤 ${m.senderName ?? "Admin / Support"}` : `🤖 ${m.senderName ?? aiName}`}
                  </p>
                )}
                {m.body}
                {m.attachmentUrl && (
                  <a
                    href={m.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block overflow-hidden rounded-xl border border-white/15"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.attachmentUrl} alt={m.attachmentLabel ?? "attachment"} className="max-h-64 w-full object-cover" />
                    {m.attachmentLabel && (
                      <span className="block bg-black/60 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-white/80">
                        {m.attachmentLabel}
                      </span>
                    )}
                  </a>
                )}
                <p className="mt-1 text-[0.6rem] opacity-55">
                  {new Date(m.createdAt).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Dhaka",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start">
            <div className="chat-bubble bubble-ai flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-white/60" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-white/60 [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-white/60 [animation-delay:240ms]" />
            </div>
          </div>
        )}
      </div>

      {notice && (
        <div className="mx-3 mb-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          {notice}
          <button className="ml-2 underline" onClick={() => setNotice(null)}>
            ঠিক আছে
          </button>
        </div>
      )}

      {/* actions */}
      <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-3 py-2">
        {(actions.length > 0
          ? actions
          : [
              { label: "🛒 আজকের মাল্টি নিন", action: "BUY" },
              { label: "📤 পেমেন্ট জমা দিন", action: "SUBMIT_PAYMENT" },
              { label: "📦 আমার অর্ডার", action: "ORDERS" },
              { label: "🧾 Refund/Recovery", action: "REFUND" },
              { label: "🎧 Support", action: "SUPPORT" },
            ]
        ).map((a) => (
          <button
            key={a.action + a.label}
            onClick={() => handleAction(a.action)}
            className="btn btn-ghost btn-sm whitespace-nowrap"
          >
            {a.label}
          </button>
        ))}
      </div>

      {messages.length <= 2 && (
        <div className="flex gap-2 overflow-x-auto px-3 pb-2">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="whitespace-nowrap rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-end gap-2 border-t border-white/10 bg-black/40 p-3"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void handleFileUpload(e)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="btn btn-ghost shrink-0 px-3"
          aria-label="Attach payment screenshot"
          title="📎 File / Screenshot"
        >
          {uploading ? "⏳" : "📎"}
        </button>
        <textarea
          className="textarea max-h-28 min-h-[46px] flex-1 resize-none py-3"
          rows={1}
          placeholder="বাংলা / Banglish / English — যেকোনো ভাষায় লিখুন..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
          ➤
        </button>
      </form>

      {payOpen && order && (
        <PaymentModal
          order={order}
          kind={paymentKind}
          onClose={() => setPayOpen(false)}
          onDone={async () => {
            setPayOpen(false);
            await load();
            scrollToEnd();
          }}
        />
      )}
      {refundOpen && (
        <RefundModal
          onClose={() => setRefundOpen(false)}
          onDone={async () => {
            setRefundOpen(false);
            await load();
          }}
        />
      )}
      {variant === "page" && guest && (
        <div className="border-t border-white/10 bg-black/40 px-3 py-2 text-center text-xs muted">
          চ্যাট হিস্ট্রি সেভ রাখতে{" "}
          <a href="/login" className="font-bold text-[#b8ff2e] underline">
            লগইন
          </a>{" "}
          করুন।
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PaymentModal({
  order,
  kind,
  onClose,
  onDone,
}: {
  order: NonNullable<OrderCtx>;
  kind: "MAIN" | "SOURCE";
  onClose: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = useState<"bkash" | "nagad">("bkash");
  const [txn, setTxn] = useState("");
  const [sender, setSender] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<{ bkashNumber: string; nagadNumber: string; instructions: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ bkashNumber: string; nagadNumber: string; instructions: string }>("/api/payments").then((res) => {
      if (res.ok) setNumbers({ bkashNumber: res.bkashNumber, nagadNumber: res.nagadNumber, instructions: res.instructions });
    });
  }, []);

  const amount = kind === "MAIN" ? order.priceAmount : order.sourceCommissionAmount;

  const [fieldErrors, setFieldErrors] = useState<{ screenshot?: string; txn?: string; sender?: string; method?: string }>({});

  const submit = async () => {
    setError(null);
    setFieldErrors({});

    const errors: { screenshot?: string; txn?: string; sender?: string; method?: string } = {};
    if (!method) errors.method = "অনুগ্রহ করে Payment Method নির্বাচন করুন।";
    if (!screenshot) errors.screenshot = "অনুগ্রহ করে Payment Screenshot দিন।";
    if (txn.trim().length < 4) errors.txn = "অনুগ্রহ করে Transaction ID দিন।";
    if (sender.trim().length < 6) errors.sender = "অনুগ্রহ করে টাকা পাঠানো Sender Number দিন।";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setBusy(true);
    const res = await api("/api/payments", {
      body: { orderId: order.id, kind, method, transactionId: txn.trim(), senderNumber: sender.trim(), screenshot },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="glass-dark max-h-[92vh] w-full overflow-y-auto rounded-t-3xl p-4 sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="section-title">{kind === "MAIN" ? "Main Payment" : "Source Commission"} জমা দিন</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="card card-tight mb-3 p-3 text-sm">
          <p className="muted tiny">Order ID</p>
          <p className="font-mono font-bold">{order.code}</p>
          <p className="mt-2 muted tiny">পরিমাণ</p>
          <p className="text-xl font-black text-[#b8ff2e]">৳{bn(amount.toLocaleString("en-US"))}</p>
          {numbers && (
            <div className="mt-3 space-y-1 text-sm">
              <p>
                📱 <b>bKash:</b> <span className="font-mono">{numbers.bkashNumber}</span>
              </p>
              <p>
                📱 <b>Nagad:</b> <span className="font-mono">{numbers.nagadNumber}</span>
              </p>
              <p className="tiny muted mt-1">{numbers.instructions}</p>
            </div>
          )}
        </div>

        <label className="label">পেমেন্ট মাধ্যম</label>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(["bkash", "nagad"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`btn ${method === m ? "btn-primary" : "btn-ghost"}`}
            >
              {m === "bkash" ? "bKash" : "Nagad"}
            </button>
          ))}
        </div>

        <label className="label">🔢 Transaction ID (Required)</label>
        <input
          className="input mb-1"
          value={txn}
          onChange={(e) => setTxn(e.target.value)}
          placeholder="Transaction ID লিখুন"
        />
        {fieldErrors.txn && <p className="mb-2 text-xs text-red-300">{fieldErrors.txn}</p>}

        <label className="label">📱 Sender Number (যে নম্বর থেকে টাকা পাঠিয়েছেন) (Required)</label>
        <input
          className="input mb-1"
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          placeholder="যে নম্বর থেকে টাকা পাঠিয়েছেন"
        />
        {fieldErrors.sender && <p className="mb-2 text-xs text-red-300">{fieldErrors.sender}</p>}

        <label className="label">📎 Payment Screenshot / Receipt (Required)</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="input mb-1 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-white"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) {
              setScreenshot(null);
              setFieldErrors((prev) => ({ ...prev, screenshot: "অনুগ্রহ করে Payment Screenshot দিন।" }));
              return;
            }
            try {
              setScreenshot(await fileToDataUrl(file));
              setFieldErrors((prev) => ({ ...prev, screenshot: undefined }));
              setError(null);
            } catch (err) {
              setScreenshot(null);
              setFieldErrors((prev) => ({ ...prev, screenshot: (err as Error).message }));
            }
          }}
        />
        {fieldErrors.screenshot && <p className="mb-2 text-xs text-red-300">{fieldErrors.screenshot}</p>}
        {screenshot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={screenshot} alt="preview" className="mb-3 max-h-44 w-full rounded-xl object-cover" />
        )}

        {error && <p className="mb-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">{error}</p>}

        <button className="btn btn-primary w-full" onClick={submit} disabled={busy}>
          {busy ? "জমা হচ্ছে..." : "সাবমিট করুন"}
        </button>
        <p className="tiny muted mt-2 text-center">
          Admin যাচাই করার পরেই আপনার Multi ডেলিভারি হবে। ভুল তথ্য দিলে পেমেন্ট বাতিল হতে পারে।
        </p>
      </div>
    </div>
  );
}

export function RefundModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [orders, setOrders] = useState<Array<{ id: number; orderCode: string; status: string; deliveredAt: string | null }>>([]);
  const [orderId, setOrderId] = useState<number | "">("");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ orders: Array<{ id: number; orderCode: string; status: string; deliveredAt: string | null }> }>("/api/orders").then(
      (res) => {
        if (res.ok) {
          const delivered = res.orders.filter((o) => o.deliveredAt);
          setOrders(delivered);
          if (delivered[0]) setOrderId(delivered[0].id);
        }
      },
    );
  }, []);

  const submit = async () => {
    setError(null);
    if (!orderId) {
      setError("Order নির্বাচন করুন।");
      return;
    }
    if (!screenshot) {
      setError("Loss screenshot আপলোড করুন।");
      return;
    }
    setBusy(true);
    const res = await api("/api/refunds", { body: { orderId, message, screenshot } });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="glass-dark max-h-[92vh] w-full overflow-y-auto rounded-t-3xl p-4 sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="section-title">Refund / Recovery রিকোয়েস্ট</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        {orders.length === 0 ? (
          <p className="muted text-sm">
            ডেলিভারি হওয়া কোনো অর্ডার পাওয়া যায়নি। Multi ডেলিভারি হওয়ার পরেই Refund/Recovery রিকোয়েস্ট করা যাবে।
          </p>
        ) : (
          <>
            <label className="label">Order</label>
            <select className="select mb-3" value={orderId} onChange={(e) => setOrderId(Number(e.target.value))}>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderCode} — {o.status}
                </option>
              ))}
            </select>

            <label className="label">Loss Screenshot</label>
            <input
              type="file"
              accept="image/*"
              className="input mb-3 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-white"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setScreenshot(await fileToDataUrl(file));
                  setError(null);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
            {screenshot && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={screenshot} alt="loss" className="mb-3 max-h-44 w-full rounded-xl object-cover" />
            )}

            <label className="label">আপনার বক্তব্য (ঐচ্ছিক)</label>
            <textarea className="textarea mb-3" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />

            {error && <p className="mb-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">{error}</p>}
            <button className="btn btn-primary w-full" onClick={submit} disabled={busy}>
              {busy ? "পাঠানো হচ্ছে..." : "রিকোয়েস্ট পাঠান"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
