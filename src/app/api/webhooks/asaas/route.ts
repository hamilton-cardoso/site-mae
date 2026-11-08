import { validateWebhook } from "@/server/asaas";
import { handle, readJson } from "@/server/http";
import { processWebhook } from "@/server/payments";

export async function POST(request: Request) {
  return handle(async () => {
    validateWebhook(request);
    await processWebhook(await readJson(request));
    return { ok: true };
  });
}
