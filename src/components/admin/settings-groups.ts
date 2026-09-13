export type FieldType = "text" | "textarea" | "time" | "number" | "toggle";

export type SettingField = {
  key: string;
  label: string;
  type?: FieldType;
  hint?: string;
};

export type SettingsGroup = {
  id: string;
  title: string;
  icon: string;
  description: string;
  fields: SettingField[];
};

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "payment",
    title: "Payment Settings",
    icon: "🏦",
    description: "bKash / Nagad পেমেন্ট নাম্বার ও নির্দেশনা কনফিগার করুন। AI ও চেকআউটে সাথে সাথে কার্যকর হবে।",
    fields: [
      { key: "bkash_number", label: "bKash number" },
      { key: "nagad_number", label: "Nagad number" },
      { key: "payment_instructions", label: "Payment instructions", type: "textarea" },
    ],
  },
  {
    id: "pricing",
    title: "Pricing Settings",
    icon: "💰",
    description: "আজকের মাল্টির আসল দাম, ডিসকাউন্ট প্রাইস ও সোর্স কমিশন — ডিফল্ট ৳1550 / ৳1450।",
    fields: [
      { key: "price_original", label: "Original price (strike-through)", type: "number" },
      { key: "price_discount", label: "Discount price (আজকের বিক্রয় মূল্য)", type: "number" },
      { key: "source_commission", label: "Source commission", type: "number" },
      { key: "today_odds", label: "Today's Multi Odds / Rate (যেমন: 6.40)", type: "text", hint: "খালি রাখলে AI জানাবে: 'আজকের Multi-এর odds এখনো আপডেট করা হয়নি।'" },
      { key: "currency_symbol", label: "Currency symbol" },
      { key: "extra_fee_note", label: "Extra fee সংক্রান্ত উত্তর", type: "textarea" },
    ],
  },
  {
    id: "countdown",
    title: "Countdown Settings",
    icon: "⏱️",
    description: "Daily Multi শুরু ও শেষের সময় — সার্ভার টাইম (Asia/Dhaka) অথরিটেটিভ, কাস্টমার ফোনের ঘড়ি বদলে বাইপাস করা যাবে না।",
    fields: [
      { key: "daily_start_time", label: "Daily Multi start time (HH:mm)", type: "time" },
      { key: "daily_expiry_time", label: "Daily Multi expiry time (HH:mm)", type: "time" },
      { key: "timezone", label: "Timezone", hint: "ডিফল্ট Asia/Dhaka — সার্ভার টাইম অথরিটেটিভ" },
      { key: "multi_available", label: "Daily Multi availability (true/false)", type: "toggle" },
      { key: "show_public_multi_image", label: "হোমপেজে প্রিভিউ ইমেজ দেখাবে (true/false)", type: "toggle" },
      { key: "sold_out_text", label: "Sold out text" },
    ],
  },
  {
    id: "ai",
    title: "AI Settings",
    icon: "🤖",
    description: "AI অ্যাসিস্ট্যান্টের নাম, ওয়েলকাম মেসেজ, ফ্রি ফ্রি ও বিজনেস নীতি — AI ডাটাবেজ থেকে ডায়নামিক্যালি পড়ে।",
    fields: [
      { key: "ai_name", label: "AI assistant name" },
      { key: "ai_welcome", label: "Welcome message", type: "textarea" },
      { key: "ai_win_statement", label: "“আজকের মাল্টি কি জিতবে?” উত্তর", type: "textarea" },
      { key: "source_commission_explanation", label: "Source Commission ব্যাখ্যা", type: "textarea" },
      { key: "refund_policy", label: "Refund policy", type: "textarea" },
      { key: "recovery_policy", label: "Recovery policy", type: "textarea" },
      { key: "ai_faq", label: "Business FAQ", type: "textarea" },
      { key: "guarantee_policy_allowed", label: "গ্যারান্টি দাবির অনুমতি (true/false)", type: "toggle" },
    ],
  },
  {
    id: "support",
    title: "Support / Telegram",
    icon: "🎧",
    description: "কাস্টমার সাপোর্ট কনট্যাক্ট — AI এই কনফিগারড নাম্বার/ইউজারনেম ব্যবহার করে।",
    fields: [
      { key: "telegram_username", label: "Telegram username / Support display name" },
      { key: "telegram_link", label: "Telegram link" },
      { key: "support_hours", label: "Support hours" },
    ],
  },
];
