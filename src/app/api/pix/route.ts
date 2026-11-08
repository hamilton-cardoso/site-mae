import { consumeLimit } from "@/server/db";
import { cents, handle, id, readJson, RequestError, text } from "@/server/http";
import { startPix } from "@/server/payments";

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    if (!(await consumeLimit("pix-create", 60, 60_000))) throw new RequestError(429, "Aguarde um minuto e tente novamente.");
    return startPix(
      id(body.id), body.giftId == null ? null : id(body.giftId),
      text(body.guestName, 100, true), text(body.message, 500), cents(body.amountCents),
    );
  });
}
