"use client";

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export async function api<T = Record<string, unknown>>(
  url: string,
  options?: { method?: string; body?: unknown },
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: options?.method ?? (options?.body ? "POST" : "GET"),
      headers: options?.body ? { "content-type": "application/json" } : undefined,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // Not a JSON response (e.g. proxy HTML or plain text)
      }
    }

    if (!res.ok || data.ok === false) {
      if (typeof data.error === "string" && data.error.trim()) {
        return { ok: false, error: data.error.trim() };
      }
      if (text.includes("sandbox was not found") || res.status === 502 || res.status === 504 || text.includes("Bad Gateway")) {
        return { ok: false, error: "Protected Multi Image upload করা যায়নি। অনুগ্রহ করে আবার image নির্বাচন করুন।" };
      }
      if (text && text.length > 0 && text.length < 200 && !text.includes("<html") && !text.includes("<!DOCTYPE")) {
        return { ok: false, error: text.trim() };
      }
      return { ok: false, error: `রিকোয়েস্ট ব্যর্থ হয়েছে (${res.status})। আবার চেষ্টা করুন।` };
    }
    return data as ApiResult<T>;
  } catch {
    return { ok: false, error: "নেটওয়ার্ক সমস্যা হয়েছে। আবার চেষ্টা করুন।" };
  }
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("অনুগ্রহ করে Protected Multi Image নির্বাচন করুন।"));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error("ছবির সাইজ অনেক বড় (সর্বোচ্চ ২০MB)। অনুগ্রহ করে ছোট ছবি নির্বাচন করুন।"));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("ছবি পড়া যায়নি। আবার চেষ্টা করুন।"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      if (!result.startsWith("data:image/")) {
        reject(new Error("অনুগ্রহ করে Protected Multi Image নির্বাচন করুন।"));
        return;
      }

      // If file is already small (< 500KB) or window/canvas is not available, return as-is
      if (file.size <= 500 * 1024 || typeof window === "undefined" || typeof document === "undefined") {
        resolve(result);
        return;
      }

      // Optimize/compress larger images via client-side canvas so request payload stays < 1MB
      try {
        const img = new Image();
        img.onerror = () => resolve(result);
        img.onload = () => {
          try {
            const MAX_DIM = 1920;
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;
            if (width > MAX_DIM || height > MAX_DIM) {
              if (width > height) {
                height = Math.round((height * MAX_DIM) / width);
                width = MAX_DIM;
              } else {
                width = Math.round((width * MAX_DIM) / height);
                height = MAX_DIM;
              }
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(result);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            const optimized = canvas.toDataURL("image/jpeg", 0.85);
            resolve(optimized);
          } catch {
            resolve(result);
          }
        };
        img.src = result;
      } catch {
        resolve(result);
      }
    };
    reader.readAsDataURL(file);
  });
}

const BN = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export function bn(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BN[Number(d)]);
}

export function money(amount: number, currency = "৳"): string {
  return `${currency}${amount.toLocaleString("en-US")}`;
}

export function dhaka(dateIso: string | null | undefined): string {
  if (!dateIso) return "—";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function badgeClass(status: string): string {
  if (status.includes("REJECT")) return "badge badge-bad";
  if (status.includes("PENDING") || status.includes("REVIEW") || status.includes("INFO"))
    return "badge badge-pending";
  if (status.includes("APPROVED") || status.includes("DELIVERED") || status === "active")
    return "badge badge-ok";
  return "badge badge-info";
}
