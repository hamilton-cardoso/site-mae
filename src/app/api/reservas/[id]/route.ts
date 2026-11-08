import { updateReservation } from "@/server/gifts";
import { handle, id, readJson, RequestError } from "@/server/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { action } = await readJson(request);
    if (action !== "purchased" && action !== "cancelled") {
      throw new RequestError(400, "Ação inválida.");
    }
    return updateReservation(id((await context.params).id), action);
  });
}
