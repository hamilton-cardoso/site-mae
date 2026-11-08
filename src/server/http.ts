import { CATEGORIES, type GiftCategory, type GiftInput } from "@/data/gifts";

export class RequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handle(work: () => unknown) {
  try {
    return json(await work());
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error("Falha ao processar requisição:", error instanceof Error ? error.name : "Unknown");
    return json({ error: "Ocorreu um erro. Tente novamente." }, 500);
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new RequestError(403, "Origem da requisição inválida.");
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new RequestError(415, "Envie os dados em JSON.");
  }
  const body = await request.text();
  if (body.length > 32_000) throw new RequestError(413, "Requisição muito grande.");
  try {
    const data: unknown = JSON.parse(body);
    if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  } catch {}
  throw new RequestError(400, "Dados inválidos.");
}

export function text(value: unknown, max: number, required = false) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (clean.length > max || (required && !clean)) {
    throw new RequestError(400, `Preencha os campos respeitando o limite de ${max} caracteres.`);
  }
  return clean;
}

export function cents(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000) {
    throw new RequestError(400, "Informe um valor entre R$ 0,01 e R$ 10.000,00.");
  }
  return value;
}

export function id(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) {
    throw new RequestError(400, "Identificador inválido.");
  }
  return value;
}

function httpsUrl(value: unknown, shop = false) {
  const address = text(value, 2048);
  if (!address) return null;
  try {
    const url = new URL(address);
    const shopee = url.hostname === "shopee.com.br" || url.hostname.endsWith(".shopee.com.br")
      || url.hostname === "shp.ee" || url.hostname.endsWith(".shp.ee");
    if (url.protocol === "https:" && !url.username && !url.password && (!shop || shopee)) return url.href;
  } catch {}
  throw new RequestError(400, shop ? "Informe um link HTTPS da Shopee." : "Informe um link HTTPS para a foto.");
}

export function giftInput(body: Record<string, unknown>): GiftInput {
  const category = body.category as GiftCategory;
  if (!CATEGORIES.includes(category)) throw new RequestError(400, "Selecione uma categoria válida.");
  const priceCents = cents(body.priceCents);
  const quantity = body.quantity;
  if (quantity !== undefined && (typeof quantity !== "number" || !Number.isInteger(quantity)
    || quantity < 1 || quantity > 2_147_483_647)) {
    throw new RequestError(400, "Informe uma quantidade inteira de pelo menos 1 unidade.");
  }
  const pixEnabled = body.pixEnabled === true;
  const quotaCents = pixEnabled && body.quotaCents != null ? cents(body.quotaCents) : null;
  if (quotaCents != null && quotaCents > priceCents) {
    throw new RequestError(400, "A cota precisa caber no valor-alvo.");
  }
  const storeUrl = httpsUrl(body.storeUrl, true);
  if (!pixEnabled && !storeUrl) throw new RequestError(400, "Ative Pix ou informe um link da Shopee.");
  return {
    name: text(body.name, 100, true),
    category,
    description: text(body.description, 600),
    priceCents, quantity, pixEnabled, quotaCents, storeUrl,
    imageUrl: httpsUrl(body.imageUrl),
  };
}
