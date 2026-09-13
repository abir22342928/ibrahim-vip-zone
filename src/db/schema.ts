import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Domain unions                                                       */
/* ------------------------------------------------------------------ */

export type UserRole = "customer" | "admin";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "MAIN_PAYMENT_PENDING"
  | "MAIN_PAYMENT_APPROVED"
  | "MAIN_PAYMENT_REJECTED"
  | "SOURCE_PAYMENT_PENDING"
  | "SOURCE_PAYMENT_APPROVED"
  | "SOURCE_PAYMENT_REJECTED"
  | "FULL_PAYMENT_APPROVED"
  | "MULTI_DELIVERED"
  | "REFUND_REVIEW"
  | "REFUND_APPROVED"
  | "REFUND_REJECTED"
  | "RECOVERY_APPROVED"
  | "RECOVERY_DELIVERED";

export type PaymentKind = "MAIN" | "SOURCE";
export type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED" | "INFO_REQUESTED";
export type PaymentMethod = "bkash" | "nagad";
export type FileVisibility = "public" | "private" | "vault";
export type MultiKind = "daily" | "recovery";
export type MultiStatus = "draft" | "active" | "archived";
export type SenderType = "customer" | "ai" | "admin" | "system";
export type ClaimStatus =
  | "LOSS_REVIEW_PENDING"
  | "INFO_REQUESTED"
  | "REFUND_APPROVED"
  | "RECOVERY_APPROVED"
  | "REJECTED";
export type DeliveryKind = "PURCHASE" | "RECOVERY" | "RESEND";

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<UserRole>().notNull().default("customer"),
    isBlocked: boolean("is_blocked").notNull().default(false),
    resetToken: text("reset_token"),
    resetTokenExpiresAt: timestamp("reset_token_expires_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer("updated_by"),
});

/** Binary assets stored inside the DB so nothing is reachable by a raw URL. */
export const files = pgTable(
  "files",
  {
    id: serial("id").primaryKey(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    data: text("data").notNull(), // base64
    visibility: text("visibility").$type<FileVisibility>().notNull().default("private"),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_owner_idx").on(t.ownerUserId)],
);

/** Every Multi (daily or recovery) is an immutable version row. */
export const multis = pgTable(
  "multis",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").$type<MultiKind>().notNull().default("daily"),
    title: text("title").notNull(),
    publicNote: text("public_note"),
    publicImageFileId: integer("public_image_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    publicImagePath: text("public_image_path"),
    protectedImageFileId: integer("protected_image_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    protectedDescription: text("protected_description"),
    status: text("status").$type<MultiStatus>().notNull().default("draft"),
    isAvailable: boolean("is_available").notNull().default(true),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    priceOriginal: integer("price_original"),
    priceDiscount: integer("price_discount"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("multis_kind_status_idx").on(t.kind, t.status)],
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderCode: text("order_code").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    multiId: integer("multi_id").references(() => multis.id, { onDelete: "set null" }),
    recoveryMultiId: integer("recovery_multi_id").references(() => multis.id, {
      onDelete: "set null",
    }),
    status: text("status").$type<OrderStatus>().notNull().default("PENDING_PAYMENT"),
    priceAmount: integer("price_amount").notNull(),
    sourceCommissionAmount: integer("source_commission_amount").notNull(),
    mainPaymentStatus: text("main_payment_status").$type<PaymentStatus>().notNull().default("PENDING"),
    sourcePaymentStatus: text("source_payment_status")
      .$type<PaymentStatus>()
      .notNull()
      .default("PENDING"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_code_unique").on(t.orderCode),
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<PaymentKind>().notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    transactionId: text("transaction_id").notNull(),
    transactionKey: text("transaction_key").notNull(),
    amount: integer("amount").notNull(),
    senderNumber: text("sender_number"),
    screenshotFileId: integer("screenshot_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    status: text("status").$type<PaymentStatus>().notNull().default("PENDING"),
    isFlaggedDuplicate: boolean("is_flagged_duplicate").notNull().default(false),
    adminNote: text("admin_note"),
    reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    index("payments_status_idx").on(t.kind, t.status),
    index("payments_txn_idx").on(t.transactionKey),
  ],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    multiId: integer("multi_id")
      .notNull()
      .references(() => multis.id, { onDelete: "cascade" }),
    kind: text("kind").$type<DeliveryKind>().notNull().default("PURCHASE"),
    deliveredBy: integer("delivered_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("deliveries_unique_grant").on(t.userId, t.orderId, t.multiId, t.kind),
    index("deliveries_user_idx").on(t.userId),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessagePreview: text("last_message_preview"),
    unreadForAdmin: integer("unread_for_admin").notNull().default(0),
    unreadForCustomer: integer("unread_for_customer").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversations_user_unique").on(t.userId)],
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderType: text("sender_type").$type<SenderType>().notNull(),
    senderName: text("sender_name"),
    body: text("body").notNull(),
    attachmentFileId: integer("attachment_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    attachmentLabel: text("attachment_label"),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    index("messages_user_idx").on(t.userId),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    multiId: integer("multi_id").references(() => multis.id, { onDelete: "set null" }),
    message: text("message"),
    screenshotFileId: integer("screenshot_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    status: text("status").$type<ClaimStatus>().notNull().default("LOSS_REVIEW_PENDING"),
    adminNote: text("admin_note"),
    decidedBy: integer("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("claims_status_idx").on(t.status), index("claims_user_idx").on(t.userId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id").references(() => users.id, { onDelete: "set null" }),
    adminName: text("admin_name"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    detail: text("detail"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Multi = typeof multis.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type FileRow = typeof files.$inferSelect;
