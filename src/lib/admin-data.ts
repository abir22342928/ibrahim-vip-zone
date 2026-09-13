import { db } from "@/db";
import { claims, deliveries, orders, payments, users } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { getMultiState } from "@/lib/multi";
import type { MultiState } from "@/lib/multi";

export type AdminStats = {
  totalCustomers: number;
  newCustomersToday: number;
  todayOrders: number;
  totalOrders: number;
  deliveries: number;
  mainPending: number;
  mainApproved: number;
  sourcePending: number;
  sourceApproved: number;
  pendingClaims: number;
  refundApproved: number;
  recoveryApproved: number;
  revenue: number;
};

export const ZERO_STATS: AdminStats = {
  totalCustomers: 0,
  newCustomersToday: 0,
  todayOrders: 0,
  totalOrders: 0,
  deliveries: 0,
  mainPending: 0,
  mainApproved: 0,
  sourcePending: 0,
  sourceApproved: 0,
  pendingClaims: 0,
  refundApproved: 0,
  recoveryApproved: 0,
  revenue: 0,
};

export type AdminDashboardData = {
  stats: AdminStats;
  multi: MultiState;
};

function emptyMulti(): AdminDashboardData["multi"] {
  return {
    serverNow: new Date().toISOString(),
    multi: null,
    priceOriginal: 0,
    priceDiscount: 0,
    sourceCommission: 0,
    currency: "৳",
    startsAt: null,
    expiresAt: null,
    isLive: false,
    isBeforeStart: false,
    isExpired: false,
    availabilityText: "UNAVAILABLE",
    soldOutText: "",
    todayOdds: null,
  };
}

/**
 * Single server-side source of truth for the Admin Dashboard.
 * Always returns valid data — on any error it returns zero-filled stats and a
 * safe empty multi state so the dashboard can NEVER render blank.
 */
export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const num = (rows: Array<{ c: number }>) => rows[0]?.c ?? 0;
    const c = sql<number>`count(*)::int`;

    const [totalCustomers, newCustomers, todayOrders, totalOrders, deliveriesCount] =
      await Promise.all([
        db.select({ c }).from(users).where(eq(users.role, "customer")),
        db
          .select({ c })
          .from(users)
          .where(and(eq(users.role, "customer"), gte(users.createdAt, startOfDay))),
        db.select({ c }).from(orders).where(gte(orders.createdAt, startOfDay)),
        db.select({ c }).from(orders),
        db.select({ c }).from(deliveries),
      ]);

    const [mainPending, mainApproved, sourcePending, sourceApproved] = await Promise.all([
      db.select({ c }).from(payments).where(and(eq(payments.kind, "MAIN"), eq(payments.status, "PENDING"))),
      db.select({ c }).from(payments).where(and(eq(payments.kind, "MAIN"), eq(payments.status, "APPROVED"))),
      db.select({ c }).from(payments).where(and(eq(payments.kind, "SOURCE"), eq(payments.status, "PENDING"))),
      db.select({ c }).from(payments).where(and(eq(payments.kind, "SOURCE"), eq(payments.status, "APPROVED"))),
    ]);

    const [pendingClaims, refundApproved, recoveryApproved] = await Promise.all([
      db.select({ c }).from(claims).where(eq(claims.status, "LOSS_REVIEW_PENDING")),
      db.select({ c }).from(claims).where(eq(claims.status, "REFUND_APPROVED")),
      db.select({ c }).from(claims).where(eq(claims.status, "RECOVERY_APPROVED")),
    ]);

    const revenueRows = await db
      .select({ total: sql<number>`coalesce(sum(${payments.amount}),0)::int` })
      .from(payments)
      .where(eq(payments.status, "APPROVED"));

    const multi = await getMultiState();

    return {
      stats: {
        totalCustomers: num(totalCustomers),
        newCustomersToday: num(newCustomers),
        todayOrders: num(todayOrders),
        totalOrders: num(totalOrders),
        deliveries: num(deliveriesCount),
        mainPending: num(mainPending),
        mainApproved: num(mainApproved),
        sourcePending: num(sourcePending),
        sourceApproved: num(sourceApproved),
        pendingClaims: num(pendingClaims),
        refundApproved: num(refundApproved),
        recoveryApproved: num(recoveryApproved),
        revenue: revenueRows[0]?.total ?? 0,
      },
      multi,
    };
  } catch (error) {
    console.error("[admin-data] failed", error);
    return { stats: { ...ZERO_STATS }, multi: emptyMulti() };
  }
}
