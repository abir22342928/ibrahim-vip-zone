import { destroySession } from "@/lib/auth";
import { assertSameOrigin, fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return fail("Invalid origin", 403);
  await destroySession();
  return ok();
}
