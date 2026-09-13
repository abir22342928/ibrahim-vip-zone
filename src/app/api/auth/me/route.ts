import { getCurrentUser } from "@/lib/auth";
import { getOrderContext } from "@/lib/orders";
import { ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return ok({ user: null, order: null });
  const order = await getOrderContext(user.id);
  return ok({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    order,
  });
}
