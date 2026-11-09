import { consumeLimit } from "@/server/db";
import { reserve } from "@/server/gifts";
import { handle, id, readJson, RequestError, text } from "@/server/http";
import { reconcileGift } from "@/server/payments";

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    const giftId = id(body.giftId);
    const reservationId = id(body.id);
    const name = text(body.guestName, 100, true);
    const message = text(body.message, 500);
    const store = body.store === undefined ? "shopee" : body.store;
    if (store !== "shopee" && store !== "mercado-livre" && store !== "website") {
      throw new RequestError(400, "Selecione uma loja válida.");
    }
    if (!(await consumeLimit("shop-reserve", 60, 60_000))) throw new RequestError(429, "Aguarde um minuto e tente novamente.");
    await reconcileGift(giftId);
    return reserve(reservationId, giftId, name, message, store);
  });
}
