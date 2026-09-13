"use client";

import { useEffect, useState } from "react";
import ChatPanel from "@/components/ChatPanel";

export default function ChatWidget({ aiName = "IBRAHIM VIP ZONE" }: { aiName?: string }) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setHint(false), 9000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {!open && (
        <div className="fixed bottom-4 right-4 z-[70] flex items-center gap-2">
          {hint && (
            <div className="glass-dark float-y hidden max-w-[190px] rounded-2xl px-3 py-2 text-xs sm:block">
              <b className="text-[#b8ff2e]">{aiName}</b>
              <br />
              দাম, পেমেন্ট বা মাল্টি নিয়ে যেকোনো প্রশ্ন করুন 👋
            </div>
          )}
          <button
            onClick={() => setOpen(true)}
            className="pulse-ring grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#b8ff2e] to-[#35e08b] text-2xl shadow-2xl"
            aria-label="Open AI assistant"
          >
            💬
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[75] flex items-end justify-end bg-black/60 sm:p-4">
          <div className="glass-dark neon-edge flex h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl sm:h-[640px] sm:max-w-[420px] sm:rounded-3xl">
            <ChatPanel variant="widget" onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
