import { handle, id, RequestError } from "@/server/http";
import { getCard } from "@/server/payments";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ticket = await getCard(id((await context.params).id));
    if (!ticket) throw new RequestError(404, "Contribuição não encontrada.");
    return ticket;
  });
}
