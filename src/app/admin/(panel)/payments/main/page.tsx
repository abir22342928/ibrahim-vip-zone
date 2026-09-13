import PaymentsView from "@/components/admin/PaymentsView";

export const dynamic = "force-dynamic";

export default function MainPaymentsPage() {
  return <PaymentsView kind="MAIN" />;
}
