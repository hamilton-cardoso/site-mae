import { handle, id } from "@/server/http";
import { getPix } from "@/server/payments";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => getPix(id((await context.params).id)));
}
