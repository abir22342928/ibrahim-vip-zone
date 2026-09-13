import PaymentsView from "@/components/admin/PaymentsView";

export const dynamic = "force-dynamic";

export default function SourcePaymentsPage() {
  return <PaymentsView kind="SOURCE" />;
}
