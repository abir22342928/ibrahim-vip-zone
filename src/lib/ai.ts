import { toBnDigits } from "@/lib/format";
import type { SettingsMap } from "@/lib/settings";
import type { OrderContext } from "@/lib/orders";
import type { MultiState } from "@/lib/multi";

/* ------------------------------------------------------------------ */
/* Text normalisation (Bangla + Banglish + English + typos)            */
/* ------------------------------------------------------------------ */

const BN_TO_EN_DIGIT: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

const SYNONYMS: Record<string, string> = {
  kt: "koto", kto: "koto", kotoo: "koto", kut: "koto", koto: "koto",
  daam: "dam", dame: "dam", damm: "dam", dm: "dam",
  tk: "taka", tka: "taka", tak: "taka", tkaa: "taka",
  nmbr: "number", nombor: "number", nomber: "number", nambar: "number",
  namber: "number", numbr: "number", no: "number", num: "number", nmbar: "number",
  bikash: "bkash", bkas: "bkash", bakash: "bkash", bkash: "bkash",
  nogod: "nagad", nogod4: "nagad", nagat: "nagad", nagod: "nagad",
  paymnt: "payment", pemnt: "payment", peyment: "payment", paymen: "payment",
  trx: "transaction", trxid: "transaction", txn: "transaction", trnx: "transaction",
  screensot: "screenshot", screnshot: "screenshot", ss: "screenshot", sshot: "screenshot",
  multii: "multi", malti: "multi", maltee: "multi", molti: "multi", multy: "multi",
  refund: "refund", refnd: "refund", rifund: "refund", ferot: "ferot",
  recovery: "recovery", recovary: "recovery", rikovari: "recovery", ricovery: "recovery",
  komisan: "commission", comision: "commission", komishon: "commission",
  commision: "commission", comission: "commission",
  admn: "admin", admen: "admin",
  hlp: "help", plz: "please", pls: "please",
  vai: "bhai", bai: "bhai", vhai: "bhai",
  kine: "kinbo", kinte: "kinbo", nibo: "kinbo", nite: "kinbo",
  jitbe: "jitbe", jitba: "jitbe", jitbo: "jitbe", jetbe: "jitbe",
  chobi: "chobi", sobi: "chobi", cobi: "chobi", picture: "image", pic: "image", img: "image",
};

export function normalize(input: string): { text: string; tokens: string[] } {
  let text = (input ?? "").toLowerCase();
  text = text.replace(/[০-৯]/g, (d) => BN_TO_EN_DIGIT[d] ?? d);
  // Keep Unicode letters, numbers, combining marks (Bengali vowel signs + virama),
  // and whitespace. Combining marks are category Mn — previously they were being
  // stripped, which mangled words like "নাম্বার" → "ন ম ব র" and broke detection.
  text = text.replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const tokens = text
    .split(" ")
    .filter(Boolean)
    .map((t) => SYNONYMS[t] ?? t);
  return { text: ` ${tokens.join(" ")} `, tokens };
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

function fuzzyToken(token: string, keyword: string): boolean {
  if (token === keyword) return true;
  if (keyword.length < 4) return false;
  if (token.length < 3) return false;
  const tolerance = keyword.length >= 7 ? 2 : 1;
  return levenshtein(token, keyword) <= tolerance;
}

/** Matches phrases (substring) or single words (fuzzy, typo tolerant). */
function matches(norm: { text: string; tokens: string[] }, keywords: string[]): number {
  let score = 0;
  for (const kw of keywords) {
    if (kw.includes(" ")) {
      if (norm.text.includes(` ${kw} `)) score += 2.5;
      else if (norm.text.includes(kw)) score += 1.6;
      continue;
    }
    if (norm.text.includes(` ${kw} `)) {
      score += 2;
      continue;
    }
    if (norm.tokens.some((t) => fuzzyToken(t, kw))) score += 1.2;
  }
  return score;
}

/* ------------------------------------------------------------------ */
/* Intents                                                             */
/* ------------------------------------------------------------------ */

export type Intent =
  | "greeting"
  | "price"
  | "odds"
  | "want_multi"
  | "extra_fee"
  | "will_win"
  | "multi_image"
  | "payment_number"
  | "payment_done"
  | "source_commission"
  | "how_to_buy"
  | "order_status"
  | "refund"
  | "recovery"
  | "human_support"
  | "timing"
  | "thanks"
  | "account_help"
  | "affirmative"
  | "fallback";

const INTENT_KEYWORDS: Record<Exclude<Intent, "fallback">, string[]> = {
  greeting: [
    "hi", "hello", "hey", "sup", "yo", "salam", "assalamu", "assalamualaikum", "slm", "নমস্কার",
    "আসসালামু", "সালাম", "হ্যালো", "হাই", "kemon achen", "kemon acho", "kemon achho",
    "kemon aso", "কেমন আছেন", "কেমন আছো", "কেমন আছিস", "কি খবর", "কী খবর", "ki khobor",
    "kii khobor", "khobor", "khobor kemon", "ki obostha", "কি অবস্থা", "bhalo achen",
    "ভালো আছেন", "good morning", "good evening", "how are you",
  ],
  price: [
    "dam", "price", "mullo", "taka koto", "how much", "koto taka",
    "দাম", "মূল্য", "প্রাইস", "কত টাকা", "price koto", "cost",
    "damer kotha",
  ],
  odds: [
    "odds", "odd", "অডস", "রেট", "রেট কত", "rate koto", "odds koto", "rate", "অডস কত",
    "today odds", "multi odds", "কত অডস",
  ],
  want_multi: [
    "মাল্টি নিব", "আজকের মাল্টি নিব", "ajker multi nibo", "multi nibo", "মাল্টি নিতে চাই",
    "multi nite chai", "ajk multi nibo", "nibo", "নিতে চাই", "মাল্টি চাই", "multi chai",
    "ajk nibo", "ajker ta nibo", "আজকেরটা নিব", "মাল্টি দেন", "মাল্টি দাও", "multi den",
    "multi dao", "আজকের মাল্টি দেন", "আজকের মাল্টি চাই",
  ],
  extra_fee: [
    "extra", "additional", "charge", "fee", "hidden", "baroti", "aro kono",
    "অতিরিক্ত", "বাড়তি", "চার্জ", "ফি", "আর কোনো", "অন্য কোনো খরচ", "khoroch", "aro fee",
    "kichu lagbe", "কিছু লাগবে",
  ],
  will_win: [
    "jitbe", "win", "winning", "sure", "guarantee", "confirm", "accuracy", "valo", "vlo",
    "bhalo", "safe", "risk", "জিতবে", "জিতব", "নিশ্চিত", "গ্যারান্টি", "ভালো", "শিওর", "পাস",
    "fix", "confident", "লস হবে", "লস হবে না তো", "loss hobe", "loss hobe na to", "জিতবে কি",
    "লস", "harbe", "হারবে",
  ],
  multi_image: [
    "chobi", "image", "photo", "dekhan", "dekhte", "show", "preview", "slip",
    "ছবি", "দেখান", "দেখতে", "দেখাও", "স্ক্রিনশট", "multi image", "today multi",
    "multir chobi", "মাল্টির ছবি", "দেখা যাবে",
  ],
  payment_number: [
    "number", "bkash", "nagad", "send money", "account", "payment number", "kothay pathabo",
    "নাম্বার", "নম্বর", "বিকাশ", "নগদ", "কোথায় পাঠাব", "পেমেন্ট নাম্বার", "personal", "agent",
    "kothay dibo", "কোথায় দিব", "payment korbo", "pay korbo", "পেমেন্ট করব", "টাকা পাঠাবো",
    "টাকা পাঠাব", "টাকা দিব", "taka pathabo", "dibo", "করে দিব", "বিকাশে", "নগদে", "বিকাশে টাকা পাঠাব",
    "নগদে টাকা পাঠাব",
  ],
  payment_done: [
    "korechi", "kore fellam", "kore felsi", "pathiye", "pathiyechi", "diye disi", "dilam",
    "paid", "sent", "done", "payment done", "টাকা পাঠিয়েছি", "পেমেন্ট করেছি", "পাঠিয়ে দিয়েছি",
    "দিয়ে দিয়েছি", "কমপ্লিট", "complete", "transaction", "pathalam", "pathalam re", "dichhi",
    "পাঠালাম", "পাঠাচ্ছি", "kore disi", "করে দিয়েছি", "payment করেছি", "payment korechi",
    "payment করে দিয়েছি", "পেমেন্ট করে দিয়েছি", "পেমেন্ট পাঠিয়েছি",
  ],
  source_commission: [
    "source", "commission", "kiser taka", "keno dite", "kno", "keno",
    "কমিশন", "সোর্স", "কীসের টাকা", "কেন দিতে হবে", "কেন", "why commission",
  ],
  how_to_buy: [
    "kinbo", "buy", "order", "purchase", "kivabe", "kibhabe", "how to",
    "কিনব", "নিতে চাই", "কিনতে চাই", "অর্ডার", "কীভাবে", "কিভাবে", "নিব", "চাই",
    "kinte", "keno kinbo", "proses ki", "প্রসেস",
  ],
  order_status: [
    "status", "approve", "approved", "check", "koto khon", "kotokkhon", "kotokhon", "hoise",
    "স্ট্যাটাস", "অনুমোদন", "কতক্ষণ", "হয়েছে কি", "আমার অর্ডার", "my order", "pending",
    "hoyeche", "hoyese", "hoice", "verify", "verified", "check hoyeche", "চেক", "চেক হয়েছে",
    "chk", "porikkha", "update", "অনুমোদন হয়েছে", "confirm hoyeche",
  ],
  refund: [
    "refund", "ferot", "money back", "loss", "hare", "harse", "lose", "lost",
    "রিফান্ড", "ফেরত", "লস", "হেরে", "হারছে", "টাকা ফেরত", "refund kivabe",
  ],
  recovery: [
    "recovery", "recover", "next free", "রিকভারি", "রিকোভারি", "ফ্রি মাল্টি", "free multi",
  ],
  human_support: [
    "admin", "support", "human", "customer care", "customer service", "telegram",
    "kotha bolte", "agent", "helpline", "এডমিন", "অ্যাডমিন", "সাপোর্ট", "কথা বলতে",
    "কাস্টমার", "টেলিগ্রাম", "ইব্রাহিম", "manush", "kotha bolbo", "কথা বলব",
    "মানুষের সাথে কথা বলতে চাই", "admin er sathe kotha bolbo", "support chai", "সাপোর্ট চাই",
    "help chai", "হেল্প",
  ],
  timing: [
    "kokhon", "somoy", "time", "countdown", "expire", "koto tar", "deadline", "last time",
    "কখন", "সময়", "কাউন্টডাউন", "শেষ", "মেয়াদ", "publish", "koto baje", "কত বাজে",
  ],
  thanks: [
    "thanks", "thank", "dhonnobad", "tnx", "thx", "ধন্যবাদ", "থ্যাংকস", "shukriya", "thank u",
  ],
  account_help: [
    "password", "login", "signup", "account", "reset", "profile",
    "পাসওয়ার্ড", "লগইন", "একাউন্ট", "অ্যাকাউন্ট", "প্রোফাইল",
  ],
  affirmative: [
    "ok", "okay", "achcha", "acha", "hae", "haa", "hmm", "hm", "yes", "yep", "ji", "jii",
    "আচ্ছা", "হ্যাঁ", "হ্যা", "জি", "ঠিক আছে", "ok bhai", "accha bhai", "thik ache",
  ],
};

export function detectIntent(
  message: string,
  context?: { lastIntent?: Intent | null; hasOrder?: boolean },
): { intent: Intent; scores: Record<string, number> } {
  const norm = normalize(message);
  const scores: Record<string, number> = {};

  (Object.keys(INTENT_KEYWORDS) as Array<Exclude<Intent, "fallback">>).forEach((intent) => {
    scores[intent] = matches(norm, INTENT_KEYWORDS[intent]);
  });

  // Disambiguation boosts
  if (scores.extra_fee > 0 && scores.price > 0) scores.extra_fee += 1.5;
  if (norm.text.includes(" source ") || norm.text.includes("কমিশন")) scores.source_commission += 1.5;
  if (scores.payment_done > 0 && norm.text.includes("transaction")) scores.payment_done += 1.5;
  if (/(^|\s)(number|নাম্বার|নম্বর)(\s|$)/.test(norm.text)) scores.payment_number += 1.2;
  // "status" / "স্ট্যাটাস" strongly implies an order/payment status question,
  // even when the word "অর্ডার" is also present (which otherwise matches buy/order).
  if (norm.text.includes("status") || norm.text.includes("স্ট্যাটাস") || norm.text.includes("statas")) {
    scores.order_status += 2.5;
  }
  if (scores.will_win > 0 && scores.price > 1.5) scores.price += 0.5;
  if (norm.tokens.length <= 2 && scores.affirmative > 0) scores.affirmative += 2;

  // Contextual carry-over: "number den" right after price talk still means payment number.
  if (context?.lastIntent === "price" && scores.payment_number > 0) scores.payment_number += 1;
  if (context?.lastIntent === "payment_number" && scores.payment_done > 0) scores.payment_done += 1;

  let best: Intent = "fallback";
  let bestScore = 1.1;
  for (const [intent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = intent as Intent;
      bestScore = score;
    }
  }
  return { intent: best, scores };
}

/* ------------------------------------------------------------------ */
/* Reply composer                                                      */
/* ------------------------------------------------------------------ */

export type AiReply = {
  intent: Intent;
  body: string;
  attachFileId?: number | null;
  attachLabel?: string | null;
  actions?: Array<{ label: string; action: string }>;
};

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

function bnMoney(amount: number, currency: string) {
  return `${currency}${toBnDigits(amount.toLocaleString("en-US"))}`;
}

function paymentNumbersBlock(s: SettingsMap) {
  return `• বিকাশ (bKash): ${s.bkash_number}\n• নগদ (Nagad): ${s.nagad_number}`;
}

function statusBangla(status: string, s: SettingsMap, ctx: NonNullable<OrderContext>) {
  const price = bnMoney(ctx.priceAmount, s.currency_symbol);
  const source = bnMoney(ctx.sourceCommissionAmount, s.currency_symbol);
  let body: string;
  switch (status) {
    case "PENDING_PAYMENT":
      body = `আপনার অর্ডার ${ctx.code} তৈরি হয়েছে। এখন ${price} পেমেন্ট করে Transaction ID ও Screenshot পাঠান।`;
      break;
    case "MAIN_PAYMENT_PENDING":
      body = "আপনার payment এখনো যাচাই করা হচ্ছে। Admin verification শেষ হলে আপনাকে জানানো হবে।";
      break;
    case "MAIN_PAYMENT_APPROVED":
      body = "আপনার Main Payment Approved হয়েছে ✅ এখন Source Commission Payment সম্পন্ন করুন।";
      break;
    case "MAIN_PAYMENT_REJECTED":
      body = "আপনার payment বর্তমানে Approved হয়নি। অনুগ্রহ করে payment তথ্য আবার যাচাই করুন অথবা Support-এ যোগাযোগ করুন।";
      break;
    case "SOURCE_PAYMENT_PENDING":
      body = "আপনার Source Commission Payment এখনো যাচাই করা হচ্ছে।";
      break;
    case "SOURCE_PAYMENT_REJECTED":
      body = "আপনার payment বর্তমানে Approved হয়নি। অনুগ্রহ করে payment তথ্য আবার যাচাই করুন অথবা Support-এ যোগাযোগ করুন।";
      break;
    case "SOURCE_PAYMENT_APPROVED":
    case "FULL_PAYMENT_APPROVED":
    case "MULTI_DELIVERED":
      body = "আপনার সব payment Approved হয়েছে ✅ আপনার Multi আপনার Orders/Inbox-এ Delivered হয়েছে।";
      break;
    case "REFUND_REVIEW":
      body = `আপনার Refund/Recovery রিকোয়েস্টটি রিভিউ-তে আছে। Admin সিদ্ধান্ত জানালে সাথে সাথে জানানো হবে।`;
      break;
    case "REFUND_APPROVED":
      body = `আপনার Refund অনুমোদিত হয়েছে ✅ ${s.refund_policy}`;
      break;
    case "RECOVERY_APPROVED":
      body = `আপনার Recovery অনুমোদিত হয়েছে ✅ ${s.recovery_policy}`;
      break;
    case "RECOVERY_DELIVERED":
      body = `আপনার Recovery Multi ডেলিভারি হয়ে গেছে ✅`;
      break;
    default:
      body = `আপনার অর্ডার ${ctx.code} — বর্তমান স্ট্যাটাস: ${status}`;
  }

  // Append the actual claim status when the customer has an open/decided request.
  if (ctx.claimStatus) {
    const claimText: Record<string, string> = {
      LOSS_REVIEW_PENDING: "আপনার Refund/Recovery রিকোয়েস্ট রিভিউ-তে আছে।",
      INFO_REQUESTED: "আপনার Refund/Recovery রিকোয়েস্টে আরও তথ্য চাওয়া হয়েছে।",
      REFUND_APPROVED: "আপনার Refund অনুমোদিত হয়েছে ✅",
      RECOVERY_APPROVED: "আপনার Recovery অনুমোদিত হয়েছে ✅",
      REJECTED: "আপনার Refund/Recovery রিকোয়েস্টটি বাতিল করা হয়েছে।",
    };
    const extra = claimText[ctx.claimStatus];
    if (extra) body = `${body}\n\n${extra}`;
  }

  return body;
}

export type AiContext = {
  settings: SettingsMap;
  multiState: MultiState;
  order: OrderContext;
  userName: string;
  isLoggedIn: boolean;
  lastIntent?: Intent | null;
};

export function composeReply(message: string, ctx: AiContext): AiReply {
  const s = ctx.settings;
  const { intent } = detectIntent(message, {
    lastIntent: ctx.lastIntent ?? null,
    hasOrder: Boolean(ctx.order),
  });
  const price = bnMoney(ctx.multiState.priceDiscount, s.currency_symbol);
  const original = bnMoney(ctx.multiState.priceOriginal, s.currency_symbol);
  const source = bnMoney(ctx.multiState.sourceCommission, s.currency_symbol);
  const expired = ctx.multiState.isExpired || !ctx.multiState.isLive;

  const buyAction = { label: "🛒 আজকের মাল্টি নিন", action: "BUY" };
  const payAction = { label: "📤 পেমেন্ট তথ্য জমা দিন", action: "SUBMIT_PAYMENT" };
  const supportAction = { label: "🎧 Admin Support", action: "SUPPORT" };

  switch (intent) {
    case "greeting":
      return {
        intent,
        body: pick([
          `ওয়ালাইকুম আসসালাম${ctx.userName ? ` ${ctx.userName}` : ""}! 😊 আমি ${s.ai_name}। আজকের মাল্টি, দাম, পেমেন্ট বা রিফান্ড — যেকোনো বিষয়ে জিজ্ঞেস করতে পারেন।`,
          `আমি ভালো আছি 😊 আপনাকে কীভাবে সাহায্য করতে পারি? আজকের মাল্টির দাম জানতে চাইলে বলুন।`,
          `জি বলুন! 😊 আজকের মাল্টি, পেমেন্ট বা অর্ডার — যা নিয়ে দরকার বলুন।`,
        ]),
        actions: [],
      };

    case "price":
      return {
        intent,
        body: `আজকের মাল্টির দাম ${price}।${
          ctx.multiState.priceOriginal > ctx.multiState.priceDiscount
            ? ` (রেগুলার প্রাইস ${original}, আজকের ডিসকাউন্টে ${price})`
            : ""
        }\n${s.extra_fee_note}\n\nআপনি চাইলে এখনই আজকের মাল্টি নিতে পারেন।`,
        actions: expired ? [supportAction] : [buyAction, { label: "📱 পেমেন্ট নাম্বার", action: "ASK_NUMBER" }],
      };

    case "want_multi":
      return {
        intent,
        body: `ঠিক আছে ❤️ আজকের Multi-এর দাম ${price}। আপনি চাইলে এখনই অর্ডার করতে পারেন।`,
        actions: expired ? [supportAction] : [buyAction, { label: "📱 পেমেন্ট নাম্বার", action: "ASK_NUMBER" }],
      };

    case "odds": {
      const odds = s.today_odds?.trim();
      return {
        intent,
        body: odds
          ? `আজকের Multi-এর odds: ${odds}। দাম ${price}।`
          : "আজকের Multi-এর odds এখনো আপডেট করা হয়নি।",
        actions: expired ? [supportAction] : [buyAction],
      };
    }

    case "extra_fee":
      return {
        intent,
        body: `${s.extra_fee_note} আজকের মাল্টির দাম ${price}। পরবর্তীতে অর্ডার সম্পন্ন করতে Source Commission ${source} প্রযোজ্য — এর বাইরে কোনো হিডেন চার্জ নেই।`,
        actions: [buyAction],
      };

    case "will_win":
      return {
        intent,
        body: "আমরা আশা করছি আজকের Multi ভালো করবে এবং জিতবে। আপনি চাইলে আজকের Multi নিতে পারেন।",
        actions: expired ? [supportAction] : [buyAction],
      };

    case "multi_image": {
      if (!ctx.multiState.multi) {
        return {
          intent,
          body: "এখনো আজকের মাল্টি পাবলিশ করা হয়নি। পাবলিশ হওয়ার সাথে সাথে এখানে দেখতে পাবেন।",
        };
      }
      const fileId = ctx.multiState.multi.imageUrl?.startsWith("/api/files/")
        ? Number.parseInt(ctx.multiState.multi.imageUrl.split("/").pop() ?? "", 10)
        : null;
      return {
        intent,
        body: `এইটা আজকের মাল্টির প্রিভিউ — ${ctx.multiState.multi.title}।\n🔒 সম্পূর্ণ (Protected) মাল্টিটি পেমেন্ট ভেরিফিকেশন সম্পন্ন হলেই আপনার চ্যাটে অটোমেটিক চলে আসবে।\nদাম ${price}।`,
        attachFileId: Number.isFinite(fileId) ? fileId : null,
        attachLabel: "Today's Multi (preview)",
        actions: expired ? [supportAction] : [buyAction],
      };
    }

    case "payment_number": {
      const lower = message.toLowerCase();
      const isBkash = lower.includes("bkash") || lower.includes("বিকাশ");
      const isNagad = lower.includes("nagad") || lower.includes("নগদ");
      const needSource = ctx.order?.status === "MAIN_PAYMENT_APPROVED" || ctx.order?.status === "SOURCE_PAYMENT_REJECTED";
      const amount = needSource ? source : price;
      const what = needSource ? "Source Commission" : "আজকের মাল্টির";
      const missingMsg = "এই payment method-এর নম্বর বর্তমানে সেট করা নেই। অনুগ্রহ করে Admin Support-এর সাথে যোগাযোগ করুন।";

      const bkashNum = s.bkash_number?.trim();
      const nagadNum = s.nagad_number?.trim();

      if (isBkash && !isNagad) {
        return {
          intent,
          body: bkashNum
            ? `অবশ্যই ❤️ আমাদের bKash নম্বর:\n📱 ${bkashNum}\n\nপেমেন্ট করার পর নিচের ফর্মে Screenshot, Transaction ID এবং যে নাম্বার থেকে টাকা পাঠিয়েছেন সেটি দিন।`
            : missingMsg,
          actions: bkashNum ? [payAction, supportAction] : [supportAction],
        };
      }
      if (isNagad && !isBkash) {
        return {
          intent,
          body: nagadNum
            ? `অবশ্যই ❤️ আমাদের Nagad নম্বর:\n📱 ${nagadNum}\n\nপেমেন্ট করার পর নিচের ফর্মে Screenshot, Transaction ID এবং যে নাম্বার থেকে টাকা পাঠিয়েছেন সেটি দিন।`
            : missingMsg,
          actions: nagadNum ? [payAction, supportAction] : [supportAction],
        };
      }
      return {
        intent,
        body: `অবশ্যই। নিচের নম্বরে ${what} ${amount} পেমেন্ট করুন এবং পেমেন্ট করার পর Transaction ID ও Screenshot এখানে পাঠান।\n\n${paymentNumbersBlock(
          s,
        )}\n\n${s.payment_instructions}`,
        actions: [payAction, supportAction],
      };
    }

    case "payment_done": {
      if (!ctx.isLoggedIn) {
        return {
          intent,
          body: "পেমেন্টের তথ্য জমা দিতে হলে আগে লগইন করতে হবে। লগইন করে চ্যাট থেকে Transaction ID ও Screenshot পাঠান।",
          actions: [{ label: "🔑 লগইন", action: "LOGIN" }],
        };
      }
      if (ctx.order?.status === "MAIN_PAYMENT_PENDING" || ctx.order?.status === "SOURCE_PAYMENT_PENDING") {
        return {
          intent,
          body: `জি, আপনার তথ্য আমরা পেয়েছি ✅ বর্তমানে সেটি প্রসেসিং অবস্থায় আছে (Order ${ctx.order.code})। Admin যাচাই করে খুব দ্রুত জানিয়ে দেবে।`,
          actions: [supportAction],
        };
      }
      return {
        intent,
        body: `ধন্যবাদ! পেমেন্ট ভেরিফাই করতে আমাদের দরকার:\n১) Transaction ID\n২) পেমেন্টের Screenshot\n৩) কোন মাধ্যমে পাঠিয়েছেন (bKash / Nagad)\n\nনিচের বাটনে ক্লিক করে তথ্যগুলো জমা দিন।`,
        actions: [payAction],
      };
    }

    case "source_commission":
      return {
        intent,
        body: `${s.source_commission_explanation}${
          ctx.order?.status === "MAIN_PAYMENT_APPROVED"
            ? `\n\nআপনার অর্ডার ${ctx.order.code}-এর জন্য এখন ${source} ক্লিয়ার করলেই Multi ডেলিভারি হয়ে যাবে।`
            : ""
        }`,
        actions: [{ label: "📱 পেমেন্ট নাম্বার", action: "ASK_NUMBER" }, payAction],
      };

    case "how_to_buy":
      return {
        intent,
        body: `খুব সহজ 👇\n১) "BUY TODAY'S MULTI" বাটনে ক্লিক করে অর্ডার তৈরি করুন\n২) ${price} bKash/Nagad-এ পাঠান\n৩) Transaction ID ও Screenshot চ্যাটে জমা দিন\n৪) Admin যাচাই করে অনুমোদন দেবে\n৫) এরপর Source Commission ${source} ক্লিয়ার করুন\n৬) দুইটি অনুমোদনের পর আপনার Protected Multi অটোমেটিক চ্যাটে চলে আসবে ✅`,
        actions: expired ? [supportAction] : [buyAction],
      };

    case "order_status":
      if (!ctx.order) {
        return {
          intent,
          body: "আপনার এখনো কোনো অ্যাক্টিভ অর্ডার নেই। আজকের মাল্টি নিতে চাইলে অর্ডার তৈরি করুন।",
          actions: expired ? [supportAction] : [buyAction],
        };
      }
      return {
        intent,
        body: statusBangla(ctx.order.status, s, ctx.order),
        actions:
          ctx.order.status === "PENDING_PAYMENT" || ctx.order.status.includes("REJECTED")
            ? [payAction]
            : [supportAction],
      };

    case "refund":
      return {
        intent,
        body: `${s.refund_policy}\n\nরিকোয়েস্ট করতে: My Account → Orders → "Refund / Recovery" থেকে Loss Screenshot সহ সাবমিট করুন। Admin যাচাই করে Refund অথবা Recovery অনুমোদন করবে।`,
        actions: [{ label: "🧾 Refund/Recovery রিকোয়েস্ট", action: "REFUND" }, supportAction],
      };

    case "recovery":
      return {
        intent,
        body: `${s.recovery_policy}\n\nRecovery পেতে হলে Loss Screenshot সহ রিকোয়েস্ট জমা দিন। Admin অনুমোদন করলে Recovery Multi আপনার চ্যাটে অটোমেটিক চলে আসবে।`,
        actions: [{ label: "🧾 Refund/Recovery রিকোয়েস্ট", action: "REFUND" }],
      };

    case "human_support":
      return {
        intent,
        body: `অবশ্যই। আপনি চাইলে Admin/Customer Support-এর সাথে যোগাযোগ করতে পারেন।\n\n👤 ${s.telegram_username}\n🔗 ${s.telegram_link}\n🕘 ${s.support_hours}\n\nএছাড়া এই চ্যাটেই মেসেজ রেখে যেতে পারেন — Admin সরাসরি এখানে রিপ্লাই দেবেন।`,
        actions: [supportAction],
      };

    case "timing": {
      const end = ctx.multiState.expiresAt ? new Date(ctx.multiState.expiresAt) : null;
      const endText = end
        ? new Intl.DateTimeFormat("en-GB", {
            timeZone: s.timezone || "Asia/Dhaka",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }).format(end)
        : "—";
      return {
        intent,
        body: expired
          ? `আজকের মাল্টির সময় শেষ হয়ে গেছে (${s.sold_out_text})। আগামীকালের মাল্টি পাবলিশ হলে এখানে জানিয়ে দেওয়া হবে।`
          : `আজকের মাল্টি ${endText} (বাংলাদেশ সময়) পর্যন্ত পাওয়া যাবে। এরপর অটোমেটিক সোল্ড আউট হয়ে যাবে।`,
        actions: expired ? [supportAction] : [buyAction],
      };
    }

    case "thanks":
      return {
        intent,
        body: pick([
          "আপনাকেও ধন্যবাদ! 🙏 আর কিছু জানার থাকলে বলুন।",
          "স্বাগতম! 😊 যেকোনো দরকারে এখানে মেসেজ দিন।",
        ]),
      };

    case "account_help":
      return {
        intent,
        body: "অ্যাকাউন্ট সংক্রান্ত সাহায্য: Sign Up করে লগইন করুন। পাসওয়ার্ড ভুলে গেলে লগইন পেজের \"Forgot password\" থেকে রিসেট করতে পারবেন। আপনার সব চ্যাট ও অর্ডার হিস্ট্রি অ্যাকাউন্টে সেভ থাকে।",
        actions: [{ label: "👤 My Account", action: "ACCOUNT" }],
      };

    case "affirmative":
      if (ctx.lastIntent === "payment_number" || ctx.order?.status === "PENDING_PAYMENT") {
        return {
          intent,
          body: `ঠিক আছে ✅ পেমেন্ট করার পর Transaction ID ও Screenshot নিচের বাটন থেকে জমা দিন।\n\n${paymentNumbersBlock(
            s,
          )}`,
          actions: [payAction],
        };
      }
      return {
        intent,
        body: "জি, বলুন — আর কীভাবে সাহায্য করতে পারি? 😊",
        actions: expired ? [supportAction] : [buyAction],
      };

    default:
      return {
        intent: "fallback",
        body: pick([
          `একটু অন্যভাবে বলবেন ভাই? 😊 আজকের মাল্টি, দাম, পেমেন্ট, অর্ডার বা রিফান্ড — যেকোনো কিছু নিয়ে জিজ্ঞেস করতে পারেন।`,
          `বুঝতে একটু সমস্যা হচ্ছে 😅 আপনি কি আজকের মাল্টির দাম নাকি পেমেন্ট নিয়ে জানতে চাচ্ছেন?`,
        ]),
        actions: [buyAction, supportAction],
      };
  }
}

/* ------------------------------------------------------------------ */
/* OpenAI integration (server-side only, rule engine is the fallback)  */
/* ------------------------------------------------------------------ */

/**
 * Intents where the rule engine produces a strict, database-grounded answer
 * that must never drift:
 *   - payment_number   : exact configured bKash/Nagad numbers
 *   - order_status     : the customer's REAL order/payment status (never invent)
 *   - multi_image      : the public preview attachment + vault protection rules
 *   - source_commission: exact commission amount + explanation
 *   - will_win         : the no-guarantee compliance phrasing
 *   - payment_done     : DB-aware "processing" vs "please submit trx + screenshot"
 *   - human_support    : exact configured Telegram contact
 *   - extra_fee        : the exact "no extra fee" statement
 *
 * Every other intent is conversational and is answered by the configured OpenAI
 * model (with all business facts injected server-side), falling back to the rule
 * engine when no key is configured or the model call fails.
 */
export const RULE_ONLY_INTENTS: Intent[] = [
  "payment_number",
  "order_status",
  "multi_image",
  "source_commission",
  "will_win",
  "payment_done",
  "human_support",
  "extra_fee",
  "odds",
  "want_multi",
];

export function canUseLlm(intent: Intent): boolean {
  return !RULE_ONLY_INTENTS.includes(intent);
}

export function buildKnowledgePrompt(ctx: AiContext): string {
  const s = ctx.settings;
  const expired = ctx.multiState.isExpired || !ctx.multiState.isLive;

  const customerState = ctx.isLoggedIn
    ? ctx.order
      ? [
          `CUSTOMER'S ACTUAL DATA (from the database — always base answers on this, never guess):`,
          `- Order ID: ${ctx.order.code}`,
          `- Order status: ${ctx.order.status}`,
          `- Main payment: ${ctx.order.mainPaymentStatus}${ctx.order.hasMainSubmission ? " (submitted)" : " (not submitted)"}`,
          `- Source payment: ${ctx.order.sourcePaymentStatus}`,
          `- Multi delivered: ${ctx.order.delivered ? "yes" : "no"}`,
          ctx.order.claimStatus
            ? `- Refund/Recovery request status: ${ctx.order.claimStatus}`
            : `- Refund/Recovery request: none submitted`,
        ].join("\n")
      : `CUSTOMER'S ACTUAL DATA: the customer is logged in but has no order yet.`
    : `CUSTOMER'S ACTUAL DATA: the customer is NOT logged in. If they ask about order/payment status, ask them to log in first.`;

  return [
    `You are "${s.ai_name}", the customer-service assistant of ${s.brand_name}, a daily football multi (accumulator) service in Bangladesh.`,
    `Reply naturally in the customer's language: Bangla, Banglish, English or a mix. Be warm, friendly, short and human — like a real assistant, not a menu of options.`,
    ``,
    `BUSINESS FACTS (use these exact values when relevant):`,
    `- Today's multi price: ${s.currency_symbol}${ctx.multiState.priceDiscount}`,
    `- Original price: ${s.currency_symbol}${ctx.multiState.priceOriginal}`,
    `- Source commission: ${s.currency_symbol}${ctx.multiState.sourceCommission}`,
    `- Extra fee: ${s.extra_fee_note}`,
    `- Payment numbers — bKash: ${s.bkash_number}, Nagad: ${s.nagad_number}`,
    `- Payment instructions: ${s.payment_instructions}`,
    `- Source commission explanation: ${s.source_commission_explanation}`,
    `- Refund policy: ${s.refund_policy}`,
    `- Recovery policy: ${s.recovery_policy}`,
    `- Human support: ${s.telegram_username} (${s.telegram_link}), hours ${s.support_hours}`,
    `- Today's multi is ${expired ? "EXPIRED / sold out" : "available"}. Expiry: ${ctx.multiState.expiresAt ?? "n/a"}`,
    `- Today's multi public preview image is available: ${ctx.multiState.multi?.imageUrl ? "yes" : "no"}`,
    ``,
    customerState,
    ``,
    `STRICT RULES:`,
    `- NEVER promise a guaranteed win or guaranteed profit. If asked whether today's multi will win, say: "${s.ai_win_statement}"`,
    `- NEVER invent payment status, approval, delivery, or refund facts. Only state what appears in the customer's actual data above.`,
    `- NEVER reveal or describe the protected (vault) multi content unless the data above says the multi has been delivered.`,
    `- When asked for the price, state the exact price above. When asked for payment numbers, give the exact configured numbers above.`,
    `- If a message is genuinely unclear, ask one short clarifying question. Do NOT paste lists of options repeatedly.`,
    ``,
    `FAQ (use as needed): ${s.ai_faq}`,
  ].join("\n");
}

export type LlmHistoryItem = { role: "user" | "assistant"; content: string };

export async function tryLlmReply(
  message: string,
  ctx: AiContext,
  history: LlmHistoryItem[] = [],
): Promise<string | null> {
  const apiKey = (process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "").trim();
  if (!apiKey) return null;
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-4o-mini";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 500,
        messages: [
          { role: "system", content: buildKnowledgePrompt(ctx) },
          ...history.slice(-12),
          { role: "user", content: message },
        ],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
