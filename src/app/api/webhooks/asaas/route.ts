import { validateWebhook } from "@/server/asaas";
import { handle, readJson } from "@/server/http";
import { processWebhook } from "@/server/payments";

export async function POST(request: Request) {
  const response = await handle(async () => {
    validateWebhook(request);
    await processWebhook(await readJson(request));
    return { ok: true };
  });
  if (!response.ok) console.warn("Webhook do Asaas retornou HTTP", response.status);
  return response;
}
