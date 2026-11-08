import { requireAdmin } from "@/server/auth";
import { addManualDonation, archiveGift, saveGift, updateReservation } from "@/server/gifts";
import { cents, giftInput, handle, id, readJson, RequestError, text } from "@/server/http";
import { reconcileContribution, reconcileGift } from "@/server/payments";

export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson(request);
    switch (body.action) {
      case "saveGift": {
        const giftId = body.id == null ? undefined : id(body.id);
        const input = giftInput(body);
        if (giftId) await reconcileGift(giftId);
        return { id: await saveGift(input, giftId) };
      }
      case "archiveGift":
        if (typeof body.archived !== "boolean") throw new RequestError(400, "Estado inválido.");
        await archiveGift(id(body.id), body.archived);
        break;
      case "receiveGift":
        await updateReservation(id(body.id), "received", true);
        break;
      case "cancelReservation":
        await updateReservation(id(body.id), "cancelled", true);
        break;
      case "manualDonation":
        await addManualDonation(text(body.guestName, 100, true), cents(body.amountCents), text(body.message, 500));
        break;
      case "reconcilePix":
      case "reconcilePayment":
        await reconcileContribution(id(body.id));
        break;
      default:
        throw new RequestError(400, "Ação inválida.");
    }
    return { ok: true };
  });
}
