import { db } from "@/db";
import { settings } from "@/db/schema";
import { inArray } from "drizzle-orm";

export const SETTING_DEFAULTS: Record<string, string> = {
  brand_name: "IBRAHIM VIP ZONE",
  brand_tagline: "প্রিমিয়াম ডেইলি ফুটবল মাল্টি",
  hero_headline: "আজকের ফুটবল মাল্টি",
  hero_subline:
    "প্রতিদিন একটি করে বাছাই করা প্রিমিয়াম ফুটবল মাল্টি। সীমিত সময়ের জন্য ডিসকাউন্ট প্রাইসে।",

  currency_symbol: "৳",
  price_original: "3000",
  price_discount: "1550",
  source_commission: "1450",

  bkash_number: "01700-000000",
  nagad_number: "01800-000000",
  payment_instructions:
    "Send Money অপশনে টাকা পাঠাবেন। পেমেন্ট করার পর Transaction ID এবং Screenshot চ্যাটে পাঠিয়ে দিন। আমরা যাচাই করে দ্রুত জানাব।",
  extra_fee_note: "না, অতিরিক্ত কোনো চার্জ বা ফি নেই।",

  source_commission_explanation:
    "আমাদের Multi নির্দিষ্ট একটি source-এর মাধ্যমে আসে। সেই source-এর জন্য নির্ধারিত commission পরিশোধ করতে হয়। Source Commission clear করার পরেই আপনার আজকের Multi delivery করা হবে।",

  today_odds: "6.40",

  refund_policy:
    "আজকের মাল্টি লস হলে আপনি Loss Screenshot সহ Refund/Recovery রিকোয়েস্ট করতে পারবেন। Admin যাচাই করে Refund অথবা Recovery Multi অনুমোদন করবেন।",
  recovery_policy:
    "Recovery অনুমোদিত হলে আপনাকে পরবর্তী Recovery Multi সম্পূর্ণ ফ্রি-তে আপনার অ্যাকাউন্টে ডেলিভারি করা হবে।",

  telegram_username: "ইব্রাহিম ভাই",
  telegram_link: "https://t.me/ibrahimvai",
  support_hours: "প্রতিদিন সকাল ১০টা - রাত ১২টা",

  ai_name: "IBRAHIM VIP ZONE",
  ai_welcome:
    "আসসালামু আলাইকুম! আমি আপনাকে সাহায্য করার জন্য আছি। আজকের মাল্টি, দাম, পেমেন্ট বা রিফান্ড — যেকোনো কিছু জিজ্ঞেস করতে পারেন।",
  ai_win_statement:
    "আমরা আশা করছি আজকের মাল্টিটা জিতবে। আপনি চাইলে আজকের মাল্টি নিতে পারেন।",
  ai_faq:
    "প্রশ্ন: মাল্টি কখন দেওয়া হয়?\nউত্তর: প্রতিদিন নির্দিষ্ট সময়ে আজকের মাল্টি পাবলিশ করা হয় এবং কাউন্টডাউন শেষ হলে সেল বন্ধ হয়ে যায়।\n\nপ্রশ্ন: পেমেন্ট ভেরিফাই হতে কত সময় লাগে?\nউত্তর: সাধারণত ৫-৩০ মিনিটের মধ্যে Admin যাচাই করে জানিয়ে দেন।",

  timezone: "Asia/Dhaka",
  daily_start_time: "10:00",
  daily_expiry_time: "22:30",
  multi_available: "true",
  show_public_multi_image: "true",

  sold_out_text: "TODAY'S MULTI EXPIRED / SOLD OUT",
  guarantee_policy_allowed: "false",
};

type Cache = { data: Map<string, string>; expires: number };

const globalCache = globalThis as typeof globalThis & { __fmSettingsCache?: Cache };

async function loadAll(): Promise<Map<string, string>> {
  const now = Date.now();
  const cached = globalCache.__fmSettingsCache;
  if (cached && cached.expires > now) return cached.data;

  const rows = await db.select().from(settings);
  const map = new Map<string, string>(Object.entries(SETTING_DEFAULTS));
  for (const row of rows) map.set(row.key, row.value);
  globalCache.__fmSettingsCache = { data: map, expires: now + 5_000 };
  return map;
}

export function invalidateSettingsCache() {
  globalCache.__fmSettingsCache = undefined;
}

export type SettingsMap = Record<string, string>;

export async function getSettings(): Promise<SettingsMap> {
  const map = await loadAll();
  return Object.fromEntries(map.entries());
}

export async function getSetting(key: string): Promise<string> {
  const map = await loadAll();
  return map.get(key) ?? SETTING_DEFAULTS[key] ?? "";
}

export async function getNumberSetting(key: string): Promise<number> {
  const raw = await getSetting(key);
  const n = Number.parseInt(raw.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function setSettings(values: Record<string, string>, updatedBy?: number) {
  const entries = Object.entries(values).filter(([key]) => key.length > 0 && key.length <= 64);
  for (const [key, value] of entries) {
    await db
      .insert(settings)
      .values({ key, value: String(value ?? ""), updatedBy: updatedBy ?? null })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: String(value ?? ""), updatedAt: new Date(), updatedBy: updatedBy ?? null },
      });
  }
  invalidateSettingsCache();
}

export async function getSettingsSubset(keys: string[]): Promise<SettingsMap> {
  const rows = await db.select().from(settings).where(inArray(settings.key, keys));
  const out: SettingsMap = {};
  for (const key of keys) out[key] = SETTING_DEFAULTS[key] ?? "";
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/** Public, non-sensitive settings used by client components. */
export async function getPublicSettings() {
  const s = await getSettings();
  return {
    brandName: s.brand_name,
    brandTagline: s.brand_tagline,
    heroHeadline: s.hero_headline,
    heroSubline: s.hero_subline,
    currency: s.currency_symbol,
    priceOriginal: Number.parseInt(s.price_original, 10) || 0,
    priceDiscount: Number.parseInt(s.price_discount, 10) || 0,
    sourceCommission: Number.parseInt(s.source_commission, 10) || 0,
    telegramUsername: s.telegram_username,
    telegramLink: s.telegram_link,
    supportHours: s.support_hours,
    aiName: s.ai_name,
    aiWelcome: s.ai_welcome,
    refundPolicy: s.refund_policy,
    recoveryPolicy: s.recovery_policy,
    soldOutText: s.sold_out_text,
    bkashNumber: s.bkash_number,
    nagadNumber: s.nagad_number,
    paymentInstructions: s.payment_instructions,
    todayOdds: s.today_odds || "",
  };
}

export type PublicSettings = Awaited<ReturnType<typeof getPublicSettings>>;
