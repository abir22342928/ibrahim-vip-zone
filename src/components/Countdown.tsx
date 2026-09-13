"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bn } from "@/lib/client";

type Props = {
  targetIso: string | null;
  serverNowIso: string;
  onExpire?: () => void;
  compact?: boolean;
};

/**
 * Server-authoritative countdown: the browser clock is only used to measure
 * elapsed time, the baseline always comes from the server response.
 */
export default function Countdown({ targetIso, serverNowIso, onExpire, compact }: Props) {
  const offsetRef = useRef<number>(0);
  const firedRef = useRef(false);
  const [remaining, setRemaining] = useState<number>(0);

  const target = useMemo(() => (targetIso ? new Date(targetIso).getTime() : 0), [targetIso]);

  useEffect(() => {
    offsetRef.current = Date.now() - new Date(serverNowIso).getTime();
    firedRef.current = false;

    const tick = () => {
      if (!target) {
        setRemaining(0);
        return;
      }
      const serverNow = Date.now() - offsetRef.current;
      const diff = Math.max(0, target - serverNow);
      setRemaining(diff);
      if (diff <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpire?.();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target, serverNowIso, onExpire]);

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  if (compact) {
    return (
      <span className="font-mono font-bold text-[#d9ff7a] tabular-nums">
        {bn(pad(hours))}:{bn(pad(minutes))}:{bn(pad(seconds))}
      </span>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2">
      {[
        { value: hours, label: "ঘণ্টা" },
        { value: minutes, label: "মিনিট" },
        { value: seconds, label: "সেকেন্ড" },
      ].map((part) => (
        <div key={part.label} className="count-box flex-1">
          <div className="count-num">{bn(pad(part.value))}</div>
          <div className="count-label">{part.label}</div>
        </div>
      ))}
    </div>
  );
}
